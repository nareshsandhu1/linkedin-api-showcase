'use strict';

/**
 * darwin-dashboard/scripts/ingest-holdem.js
 *
 * Ingestion job: queries LinkedIn's Holdem (Presto/Trino) data warehouse,
 * aggregates per-advertiser CAPI metrics into daily snapshots, and upserts
 * them into the darwin_snapshots Postgres table.
 *
 * Run on a schedule (e.g. hourly cron) or manually:
 *   node scripts/ingest-holdem.js [accountId]
 *
 * Required environment variables:
 *   DATABASE_URL      — Postgres connection string for the Darwin dashboard DB.
 *   HOLDEM_HOST       — Holdem Presto/Trino HTTP API host (e.g. holdem.corp.linkedin.com).
 *   HOLDEM_PORT       — Holdem port (default: 443).
 *   HOLDEM_CATALOG    — Holdem catalog name (default: hive).
 *   HOLDEM_SCHEMA     — Holdem schema/database (default: default).
 *   HOLDEM_USER       — Holdem username (usually your LinkedIn SSO login).
 *   HOLDEM_AUTH_TOKEN — Bearer token or basic-auth credential for Holdem API.
 *
 * Optional:
 *   HOLDEM_ACCOUNT_IDS — Comma-separated list of ad account IDs to ingest.
 *                        Defaults to ingesting all accounts returned by the query.
 *   INGEST_WINDOW_DAYS — How many trailing days to aggregate (default: 1 for daily runs,
 *                        use 30 for a backfill).
 */

require('dotenv').config();
const { Pool } = require('pg');
const { ensureSchema } = require('../lib/db');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HOLDEM_HOST       = process.env.HOLDEM_HOST;
const HOLDEM_PORT       = parseInt(process.env.HOLDEM_PORT || '443', 10);
const HOLDEM_CATALOG    = process.env.HOLDEM_CATALOG || 'hive';
const HOLDEM_SCHEMA     = process.env.HOLDEM_SCHEMA  || 'default';
const HOLDEM_USER       = process.env.HOLDEM_USER;
const HOLDEM_AUTH_TOKEN = process.env.HOLDEM_AUTH_TOKEN;
const DATABASE_URL      = process.env.DATABASE_URL;
const WINDOW_DAYS       = parseInt(process.env.INGEST_WINDOW_DAYS || '1', 10);
const CLI_ACCOUNT_IDS   = (process.argv[2] || '').split(',').map((s) => s.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Holdem query
//
// This query is the canonical Darwin CAPI health query.  It joins:
//   prod_conversiontracking.conversionbyid  — conversion rule metadata
//   tracking.advertiserreportedconversionevent — raw CAPI events
//   prod_foundation_tables.dim_f_sas_member_advertiser_v2 — advertiser names
//
// The date window is parameterised via :windowStart and :windowEnd.
// ---------------------------------------------------------------------------

function buildHoldemQuery(windowStart, windowEnd, accountIds) {
  const accountFilter = accountIds.length
    ? `cast(split_part(value.accounturn, ':', 4) as bigint) IN (${accountIds.map((id) => `${parseInt(id, 10)}`).join(', ')})`
    : `cast(split_part(value.accounturn, ':', 4) as bigint) > 0`;

  return `
SELECT
  a.account_id,
  c.advertiser_name,
  a.conversionid,
  a.name                         AS conversion_name,
  a.isenabled,
  a.type,
  a.conversionmethod,
  b.eventid,
  b.conversiontime,
  b.conversionvalue,
  b.axiomid,
  b.oracleid,
  b.lifatid,
  b.ligiantid,
  b.sha256email,
  b.conversioneventuserpeoplematchinfo,
  b.datepartition
FROM (
  SELECT DISTINCT
    key.conversionid,
    cast(split_part(value.accounturn, ':', 4) AS bigint) AS account_id,
    value.isenabled,
    value.name,
    value.type,
    value.conversionmethod
  FROM prod_conversiontracking.conversionbyid
  WHERE ${accountFilter}
    AND value.conversionmethod = 'CONVERSIONS_API'
) a
LEFT JOIN (
  SELECT
    CAST(SPLIT_PART(conversionurn, ':', 4) AS BIGINT) AS conversionid,
    eventid,
    conversiontime,
    conversionvalue,
    axiomid,
    oracleid,
    lifatid,
    ligiantid,
    sha256email,
    conversioneventuserpeoplematchinfo,
    CAST(datepartition AS VARCHAR(10)) AS datepartition
  FROM tracking.advertiserreportedconversionevent
  WHERE datepartition BETWEEN '${windowStart}' AND '${windowEnd}'
) b ON a.conversionid = b.conversionid
JOIN (
  SELECT DISTINCT account_name AS advertiser_name, advertiser_id
  FROM prod_foundation_tables.dim_f_sas_member_advertiser_v2
) c ON a.account_id = c.advertiser_id
WHERE a.conversionmethod = 'CONVERSIONS_API'
  `.trim();
}

// ---------------------------------------------------------------------------
// Holdem HTTP client (Presto/Trino REST API)
// ---------------------------------------------------------------------------

async function runHoldemQuery(sql) {
  if (!HOLDEM_HOST) {
    throw new Error('HOLDEM_HOST is not set. Cannot connect to Holdem.');
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Presto-User': HOLDEM_USER || 'darwin-ingest',
    'X-Presto-Catalog': HOLDEM_CATALOG,
    'X-Presto-Schema': HOLDEM_SCHEMA,
  };
  if (HOLDEM_AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${HOLDEM_AUTH_TOKEN}`;
  }

  const baseUrl = `https://${HOLDEM_HOST}:${HOLDEM_PORT}`;

  // Submit statement
  const submitRes = await fetch(`${baseUrl}/v1/statement`, {
    method: 'POST',
    headers,
    body: sql,
  });
  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`Holdem submit failed ${submitRes.status}: ${text}`);
  }

  let state = await submitRes.json();
  const allRows = [];
  let columns = null;

  // Poll until query completes
  while (state.nextUri) {
    await sleep(500);
    const pollRes = await fetch(state.nextUri, { headers });
    if (!pollRes.ok) {
      const text = await pollRes.text();
      throw new Error(`Holdem poll failed ${pollRes.status}: ${text}`);
    }
    state = await pollRes.json();

    if (state.columns && !columns) {
      columns = state.columns.map((c) => c.name);
    }
    if (Array.isArray(state.data)) {
      for (const row of state.data) {
        allRows.push(row);
      }
    }
    if (state.error) {
      throw new Error(`Holdem query error: ${state.error.message}`);
    }
  }

  if (!columns && allRows.length === 0) return [];

  return allRows.map((row) => {
    const obj = {};
    (columns || []).forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Aggregation — turn raw event rows into a per-advertiser snapshot
// ---------------------------------------------------------------------------

function aggregateRows(rows, windowStart, windowEnd) {
  const byAdvertiser = new Map();

  for (const row of rows) {
    const key = String(row.account_id);
    if (!byAdvertiser.has(key)) {
      byAdvertiser.set(key, {
        advertiser_id: key,
        advertiser_name: row.advertiser_name || key,
        external_account_id: key,
        events: [],
      });
    }
    byAdvertiser.get(key).events.push(row);
  }

  const snapshots = [];

  for (const [, adv] of byAdvertiser) {
    const evts = adv.events;
    const total = evts.length;

    // Signal presence counts
    const signalCols = ['lifatid', 'sha256email', 'ligiantid', 'axiomid', 'oracleid', 'conversioneventuserpeoplematchinfo'];
    const signalBreakdown = signalCols.map((col) => {
      const sent = evts.filter((e) => e[col] != null && e[col] !== '').length;
      const presence_rate = total > 0 ? sent / total : 0;
      const label = {
        lifatid: 'LinkedIn Click ID (li_fat_id)',
        sha256email: 'Email (SHA-256)',
        ligiantid: 'LinkedIn Giant ID',
        axiomid: 'Axiom ID',
        oracleid: 'Oracle ID',
        conversioneventuserpeoplematchinfo: 'People match info (name / country / lead)',
      }[col] || col;

      // Match rate: fraction of sent events where a ligiantid resolved (proxy for match)
      // For primary id signals, estimate match rate as presence_rate of ligiantid for same rows
      let match_rate = null;
      if (col === 'lifatid' || col === 'sha256email') {
        const sentRows = evts.filter((e) => e[col] != null && e[col] !== '');
        if (sentRows.length > 0) {
          const matched = sentRows.filter((e) => e.ligiantid != null && e.ligiantid !== '').length;
          match_rate = matched / sentRows.length;
        }
      }

      let quality_tier;
      if (sent === 0) quality_tier = 'missing';
      else if (match_rate == null) quality_tier = 'unknown';
      else if (match_rate >= 0.70) quality_tier = 'good';
      else if (match_rate >= 0.40) quality_tier = 'fair';
      else quality_tier = 'poor';

      return { signal_name: col, label, sent_count: sent, match_rate, presence_rate, quality_tier };
    });

    // Overall match quality: fraction of all events with a ligiantid
    const matchedTotal = evts.filter((e) => e.ligiantid != null && e.ligiantid !== '').length;
    const match_quality_score = total > 0 ? matchedTotal / total : null;

    // Dedupe rate: fraction of events with a unique eventid
    const eventIds = evts.map((e) => e.eventid).filter(Boolean);
    const uniqueIds = new Set(eventIds);
    const dedupe_rate = eventIds.length > 0 ? uniqueIds.size / eventIds.length : null;

    // Event breakdown by conversion type
    const event_breakdown = {};
    for (const e of evts) {
      const key = e.type || 'Unknown';
      event_breakdown[key] = (event_breakdown[key] || 0) + 1;
    }

    snapshots.push({
      advertiser_id: adv.advertiser_id,
      advertiser_name: adv.advertiser_name,
      external_account_id: adv.external_account_id,
      captured_at: new Date().toISOString(),
      window_start: windowStart,
      window_end: windowEnd,
      event_volume: total,
      match_quality_score,
      dedupe_rate,
      usage_count: total,
      usage_sources: { server: total, browser: 0 },
      error_count: 0,
      warning_count: 0,
      event_breakdown,
      signal_breakdown: signalBreakdown,
      diagnostic_flags: [],
    });
  }

  return snapshots;
}

// ---------------------------------------------------------------------------
// Postgres upsert
// ---------------------------------------------------------------------------

async function upsertAdvertiser(pgPool, snap) {
  await pgPool.query(
    `INSERT INTO darwin_advertisers (advertiser_id, advertiser_name, external_account_id, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'active', NOW(), NOW())
     ON CONFLICT (advertiser_id) DO UPDATE
       SET advertiser_name = EXCLUDED.advertiser_name,
           external_account_id = EXCLUDED.external_account_id,
           updated_at = NOW()`,
    [snap.advertiser_id, snap.advertiser_name, snap.external_account_id]
  );
}

async function insertSnapshot(pgPool, snap) {
  await pgPool.query(
    `INSERT INTO darwin_snapshots
       (advertiser_id, captured_at, window_start, window_end,
        event_volume, match_quality_score, dedupe_rate,
        usage_count, usage_sources, error_count, warning_count,
        event_breakdown, signal_breakdown, diagnostic_flags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      snap.advertiser_id,
      snap.captured_at,
      snap.window_start,
      snap.window_end,
      snap.event_volume,
      snap.match_quality_score,
      snap.dedupe_rate,
      snap.usage_count,
      JSON.stringify(snap.usage_sources),
      snap.error_count,
      snap.warning_count,
      JSON.stringify(snap.event_breakdown),
      JSON.stringify(snap.signal_breakdown),
      JSON.stringify(snap.diagnostic_flags),
    ]
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is required to run the ingestion job.');
    process.exit(1);
  }

  const pgPool = new Pool({ connectionString: DATABASE_URL });
  await ensureSchema();

  const now = new Date();
  const windowEnd = isoDate(now);
  const windowStart = isoDate(new Date(now - WINDOW_DAYS * 24 * 60 * 60 * 1000));

  const accountIds = CLI_ACCOUNT_IDS.length
    ? CLI_ACCOUNT_IDS
    : (process.env.HOLDEM_ACCOUNT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

  console.log(`Ingest window: ${windowStart} → ${windowEnd}`);
  if (accountIds.length) console.log(`Filtering to accounts: ${accountIds.join(', ')}`);

  const sql = buildHoldemQuery(windowStart, windowEnd, accountIds);

  console.log('Querying Holdem…');
  const rows = await runHoldemQuery(sql);
  console.log(`Received ${rows.length} event rows from Holdem.`);

  const snapshots = aggregateRows(rows, windowStart, windowEnd);
  console.log(`Aggregated into ${snapshots.length} advertiser snapshot(s).`);

  for (const snap of snapshots) {
    await upsertAdvertiser(pgPool, snap);
    await insertSnapshot(pgPool, snap);
    console.log(`  ✓  ${snap.advertiser_name} (${snap.advertiser_id}) — ${snap.event_volume} events, match quality ${snap.match_quality_score != null ? (snap.match_quality_score * 100).toFixed(1) + '%' : 'n/a'}`);
  }

  await pgPool.end();
  console.log('Ingestion complete.');
}

main().catch((err) => {
  console.error('Ingestion failed:', err.message);
  process.exit(1);
});
