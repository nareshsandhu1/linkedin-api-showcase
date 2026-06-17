'use strict';

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

let pool = null;
const hasDatabase = Boolean(DATABASE_URL);

if (hasDatabase) {
  pool = new Pool({ connectionString: DATABASE_URL });
}

/**
 * Bootstrap the Darwin dashboard schema.
 * Safe to call on every start — uses IF NOT EXISTS throughout.
 */
async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS darwin_advertisers (
      advertiser_id     TEXT PRIMARY KEY,
      advertiser_name   TEXT NOT NULL,
      external_account_id TEXT,
      status            TEXT NOT NULL DEFAULT 'active',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS darwin_snapshots (
      id                BIGSERIAL PRIMARY KEY,
      advertiser_id     TEXT NOT NULL REFERENCES darwin_advertisers(advertiser_id),
      captured_at       TIMESTAMPTZ NOT NULL,
      window_start      TIMESTAMPTZ NOT NULL,
      window_end        TIMESTAMPTZ NOT NULL,
      event_volume      INTEGER NOT NULL DEFAULT 0,
      match_quality_score NUMERIC(5,2),
      dedupe_rate       NUMERIC(5,2),
      usage_count       INTEGER NOT NULL DEFAULT 0,
      usage_sources     JSONB,
      error_count       INTEGER NOT NULL DEFAULT 0,
      warning_count     INTEGER NOT NULL DEFAULT 0,
      event_breakdown   JSONB,
      signal_breakdown  JSONB,
      diagnostic_flags  JSONB
    );

    CREATE INDEX IF NOT EXISTS darwin_snapshots_advertiser_time
      ON darwin_snapshots (advertiser_id, captured_at DESC);

    CREATE TABLE IF NOT EXISTS darwin_recommendations (
      id                BIGSERIAL PRIMARY KEY,
      advertiser_id     TEXT NOT NULL REFERENCES darwin_advertisers(advertiser_id),
      generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      severity          TEXT NOT NULL,
      title             TEXT NOT NULL,
      summary           TEXT NOT NULL,
      evidence          JSONB,
      recommended_action TEXT NOT NULL
    );
  `);
}

/**
 * Load the latest snapshot for one advertiser.
 */
async function getLatestSnapshot(advertiserId) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT * FROM darwin_snapshots
     WHERE advertiser_id = $1
     ORDER BY captured_at DESC
     LIMIT 1`,
    [advertiserId]
  );
  return rows[0] || null;
}

/**
 * Load the last N days of daily snapshots for one advertiser.
 */
async function getSnapshotHistory(advertiserId, days = 30) {
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT * FROM darwin_snapshots
     WHERE advertiser_id = $1
       AND captured_at >= NOW() - INTERVAL '${parseInt(days, 10)} days'
     ORDER BY captured_at ASC`,
    [advertiserId]
  );
  return rows;
}

/**
 * Load one advertiser record.
 */
async function getAdvertiser(advertiserId) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT * FROM darwin_advertisers WHERE advertiser_id = $1`,
    [advertiserId]
  );
  return rows[0] || null;
}

/**
 * List all known advertisers (for the index page).
 */
async function listAdvertisers() {
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT advertiser_id, advertiser_name, external_account_id, status
     FROM darwin_advertisers
     ORDER BY advertiser_name`
  );
  return rows;
}

module.exports = { pool, hasDatabase, ensureSchema, getLatestSnapshot, getSnapshotHistory, getAdvertiser, listAdvertisers };
