'use strict';

/**
 * Sample fixture data for local development when no DATABASE_URL is configured.
 *
 * Represents a real advertiser "Ashby, Inc." over the last 30 days.
 * Signal breakdown covers the six key CAPI identifiers.
 */

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n) {
  return new Date(NOW - n * DAY_MS).toISOString();
}

// ---------------------------------------------------------------------------
// Advertiser
// ---------------------------------------------------------------------------

const FIXTURE_ADVERTISER = {
  advertiser_id: 'ashby-508833998',
  advertiser_name: 'Ashby, Inc.',
  external_account_id: '508833998',
  status: 'active',
  created_at: daysAgo(90),
  updated_at: daysAgo(1),
};

// ---------------------------------------------------------------------------
// Signal breakdown helper — field names match Holdem columns exactly:
//   lifatid, sha256email, ligiantid, axiomid, oracleid,
//   conversioneventuserpeoplematchinfo (contains firstName, lastName,
//   countryCode, leadId — shape TBC from real schema)
//
// Signal quality tiers: 'good' (≥70%), 'fair' (40–69%), 'poor' (<40%), 'missing' (0 sent)
// ---------------------------------------------------------------------------

function signalRow(holdemCol, label, sentPct, matchRate) {
  // sentPct = fraction of events that include this signal (0–1)
  // matchRate = fraction of sent events that matched a LinkedIn member (0–1)
  const sent = Math.round(sentPct * 1000);
  const matched = matchRate != null ? Math.round(sent * matchRate) : 0;
  const presence_rate = sentPct;
  const match_rate = sent > 0 && matchRate != null ? matchRate : null;

  let quality_tier;
  if (sent === 0) quality_tier = 'missing';
  else if (match_rate == null) quality_tier = 'unknown';
  else if (match_rate >= 0.70) quality_tier = 'good';
  else if (match_rate >= 0.40) quality_tier = 'fair';
  else quality_tier = 'poor';

  return { signal_name: holdemCol, label, sent_count: sent, match_count: matched, match_rate, presence_rate, quality_tier };
}

// Typical signal breakdown for a mid-quality CAPI integration.
// Holdem column names are used as signal_name so the ingestion script
// can map directly without any renaming.
const SIGNAL_BREAKDOWN = [
  // lifatid present 61% of events, but match rate only 58% — triggers recommendation
  signalRow('lifatid',                              'LinkedIn Click ID (li_fat_id)',            0.61, 0.58),
  // sha256email present 94% of events, match rate 43% — triggers low email match rule
  signalRow('sha256email',                          'Email (SHA-256)',                          0.94, 0.43),
  signalRow('ligiantid',                            'LinkedIn Giant ID',                        0.28, 0.97),
  signalRow('axiomid',                              'Axiom ID',                                 0.15, 0.91),
  signalRow('oracleid',                             'Oracle ID',                                0.09, 0.89),
  signalRow('conversioneventuserpeoplematchinfo',   'People match info (name / country / lead)', 0.91, null),
];

// ---------------------------------------------------------------------------
// Conversion rules with campaign associations
// ---------------------------------------------------------------------------

const FIXTURE_CONVERSIONS = [
  {
    conversionid: '101234567',
    name: 'HubSpot-Opportunity',
    type: 'PURCHASE',
    conversionmethod: 'CONVERSIONS_API',
    isenabled: true,
    event_count: 183,
    last_signal_at: daysAgo(1),
    associated_campaigns: [
      { id: '456789', name: 'Brand Awareness Q2 2026', status: 'ACTIVE' },
      { id: '456790', name: 'Demand Gen — Enterprise', status: 'ACTIVE' },
    ],
  },
  {
    conversionid: '101234568',
    name: 'Demo Request',
    type: 'LEAD',
    conversionmethod: 'CONVERSIONS_API',
    isenabled: true,
    event_count: 412,
    last_signal_at: daysAgo(0),
    associated_campaigns: [
      { id: '456791', name: 'Content Syndication — Mid-Market', status: 'ACTIVE' },
      { id: '456792', name: 'Retargeting Q2', status: 'PAUSED' },
    ],
  },
  {
    conversionid: '101234569',
    name: 'Page View — Pricing',
    type: 'PAGE_VIEW',
    conversionmethod: 'CONVERSIONS_API',
    isenabled: true,
    event_count: 2847,
    last_signal_at: daysAgo(0),
    associated_campaigns: [],   // ⚠ no campaign associations
  },
  {
    conversionid: '101234570',
    name: 'Free Trial Start',
    type: 'LEAD',
    conversionmethod: 'CONVERSIONS_API',
    isenabled: true,
    event_count: 94,
    last_signal_at: daysAgo(3),
    associated_campaigns: [
      { id: '456793', name: 'Product-Led Growth', status: 'ACTIVE' },
    ],
  },
  {
    conversionid: '101234571',
    name: 'Legacy Lead Capture',
    type: 'LEAD',
    conversionmethod: 'CONVERSIONS_API',
    isenabled: false,
    event_count: 0,
    last_signal_at: null,
    associated_campaigns: [],   // disabled + no campaigns
  },
];

// ---------------------------------------------------------------------------
// 30-day snapshot series
// We generate a realistic trend: volume dips around day 15, match quality is
// slightly lower at the start of the window, then stabilises.
// ---------------------------------------------------------------------------

function buildSnapshot(daysBack, opts = {}) {
  const base = 900;
  const jitter = () => Math.round((Math.random() - 0.5) * 120);
  const volume = Math.max(200, base + jitter() + (daysBack > 15 ? -150 : 0));
  const mqBase = daysBack > 20 ? 0.61 : 0.69;
  const match_quality_score = parseFloat((mqBase + (Math.random() - 0.5) * 0.06).toFixed(3));
  const dedupe_rate = parseFloat((0.82 + (Math.random() - 0.5) * 0.04).toFixed(3));

  return {
    id: 30 - daysBack + 1,
    advertiser_id: FIXTURE_ADVERTISER.advertiser_id,
    captured_at: daysAgo(daysBack),
    window_start: daysAgo(daysBack + 1),
    window_end: daysAgo(daysBack),
    event_volume: volume,
    match_quality_score,
    dedupe_rate,
    usage_count: Math.round(volume * 0.95),
    usage_sources: { server: Math.round(volume * 0.6), browser: Math.round(volume * 0.4) },
    error_count: Math.round(volume * 0.02),
    warning_count: Math.round(volume * 0.04),
    event_breakdown: {
      PageView: Math.round(volume * 0.55),
      Lead: Math.round(volume * 0.20),
      Purchase: Math.round(volume * 0.15),
      Other: Math.round(volume * 0.10),
    },
    signal_breakdown: opts.includeSignals ? SIGNAL_BREAKDOWN : null,
    diagnostic_flags: [],
  };
}

// Build 30 daily snapshots, most recent last
const SNAPSHOT_HISTORY = Array.from({ length: 30 }, (_, i) => buildSnapshot(29 - i));
// Latest snapshot gets full signal detail
const LATEST_SNAPSHOT = { ...buildSnapshot(0, { includeSignals: true }), id: 31, captured_at: daysAgo(0) };

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  FIXTURE_ADVERTISER,
  SNAPSHOT_HISTORY,
  LATEST_SNAPSHOT,
  SIGNAL_BREAKDOWN,
  FIXTURE_CONVERSIONS,
  FIXTURE_ADVERTISERS: [FIXTURE_ADVERTISER],
};
