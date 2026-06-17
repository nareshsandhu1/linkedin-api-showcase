'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const { hasDatabase, ensureSchema, getLatestSnapshot, getSnapshotHistory, getAdvertiser, listAdvertisers } = require('./lib/db');
const { FIXTURE_ADVERTISER, SNAPSHOT_HISTORY, LATEST_SNAPSHOT, FIXTURE_CONVERSIONS, FIXTURE_ADVERTISERS } = require('./lib/fixtures');
const { scoreSnapshot, annotateSignals } = require('./lib/scoring');
const { generateRecommendations, partitionRecommendations } = require('./lib/recommendations');

const PORT = process.env.PORT || 3001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Data helpers — fall back to fixture data when no DB is configured
// ---------------------------------------------------------------------------

function normaliseAccountId(raw) {
  const trimmed = String(raw || '').trim();
  const urnMatch = /urn:li:sponsoredAccount:(\d+)/.exec(trimmed);
  if (urnMatch) return urnMatch[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return trimmed; // already a slug or other format
}

function isFixtureId(id) {
  return (
    id === FIXTURE_ADVERTISER.advertiser_id ||
    id === FIXTURE_ADVERTISER.external_account_id
  );
}

async function resolveAdvertiser(advertiserId) {
  if (hasDatabase) return getAdvertiser(advertiserId);
  if (isFixtureId(advertiserId)) return FIXTURE_ADVERTISER;
  return null;
}

async function resolveLatestSnapshot(advertiserId) {
  if (hasDatabase) return getLatestSnapshot(advertiserId);
  if (isFixtureId(advertiserId)) return LATEST_SNAPSHOT;
  return null;
}

async function resolveHistory(advertiserId) {
  if (hasDatabase) return getSnapshotHistory(advertiserId, 30);
  if (isFixtureId(advertiserId)) return SNAPSHOT_HISTORY;
  return [];
}

async function resolveConversions(advertiserId) {
  // In a real deployment, query a conversions table populated by the ingest job.
  // For fixture / demo mode, return the static fixture list.
  if (isFixtureId(advertiserId)) return FIXTURE_CONVERSIONS;
  return [];
}

async function resolveAdvertiserList() {
  if (hasDatabase) return listAdvertisers();
  return FIXTURE_ADVERTISERS;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Landing: account ID search form
app.get('/', (req, res) => {
  res.render('index', { error: null, prefill: '' });
});

// Handle search form submission: GET /dashboard?accountId=...
app.get('/dashboard', (req, res) => {
  const raw = String(req.query.accountId || '').trim();
  if (!raw) {
    return res.render('index', { error: 'Please enter an account ID.', prefill: '' });
  }
  const id = normaliseAccountId(raw);
  return res.redirect(`/dashboard/${encodeURIComponent(id)}`);
});

// Per-advertiser dashboard
app.get('/dashboard/:advertiserId', async (req, res) => {
  const { advertiserId } = req.params;

  try {
    const [advertiser, latestSnapshot, history, conversions] = await Promise.all([
      resolveAdvertiser(advertiserId),
      resolveLatestSnapshot(advertiserId),
      resolveHistory(advertiserId),
      resolveConversions(advertiserId),
    ]);

    if (!advertiser) {
      return res.render('index', {
        error: `No advertiser found for account ID "${advertiserId}". Check the ID and try again.`,
        prefill: advertiserId,
      });
    }

    // Determine data freshness
    let isStale = false;
    if (latestSnapshot) {
      const ageMs = Date.now() - new Date(latestSnapshot.captured_at).getTime();
      isStale = ageMs > 25 * 60 * 60 * 1000; // >25 hours old
    }

    // Score and annotate
    const scoringResult = scoreSnapshot(latestSnapshot, history);
    const signals = annotateSignals(
      (latestSnapshot && Array.isArray(latestSnapshot.signal_breakdown))
        ? latestSnapshot.signal_breakdown
        : []
    );
    const recommendations = generateRecommendations(latestSnapshot, history, scoringResult, conversions);
    const { alerts, actions } = partitionRecommendations(recommendations);

    // Build chart series for the last 30 days
    const chartLabels = history.map((s) => formatDay(s.captured_at));
    const chartVolume = history.map((s) => s.event_volume || 0);
    const chartMatchQuality = history.map((s) =>
      s.match_quality_score != null ? parseFloat((s.match_quality_score * 100).toFixed(1)) : null
    );
    const chartDedupeRate = history.map((s) =>
      s.dedupe_rate != null ? parseFloat((s.dedupe_rate * 100).toFixed(1)) : null
    );

    res.render('dashboard', {
      advertiser,
      latestSnapshot,
      scoringResult,
      signals,
      alerts,
      actions,
      isStale,
      hasData: Boolean(latestSnapshot),
      chartLabels: JSON.stringify(chartLabels),
      chartVolume: JSON.stringify(chartVolume),
      chartMatchQuality: JSON.stringify(chartMatchQuality),
      chartDedupeRate: JSON.stringify(chartDedupeRate),
      eventBreakdown: latestSnapshot ? (latestSnapshot.event_breakdown || {}) : {},
      conversions,
    });
  } catch (err) {
    renderError(res, err);
  }
});

// JSON API — summary
app.get('/api/advertiser/:advertiserId', async (req, res) => {
  const { advertiserId } = req.params;
  try {
    const [advertiser, latestSnapshot, history] = await Promise.all([
      resolveAdvertiser(advertiserId),
      resolveLatestSnapshot(advertiserId),
      resolveHistory(advertiserId),
    ]);
    if (!advertiser) return res.status(404).json({ error: 'Not found' });
    const scoringResult = scoreSnapshot(latestSnapshot, history);
    const recommendations = generateRecommendations(latestSnapshot, history, scoringResult);
    res.json({ advertiser, latestSnapshot, scoringResult, recommendations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// JSON API — 30-day history series
app.get('/api/advertiser/:advertiserId/history', async (req, res) => {
  const { advertiserId } = req.params;
  try {
    const history = await resolveHistory(advertiserId);
    res.json({ advertiser_id: advertiserId, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDay(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderError(res, err) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).render('error', {
    title: 'Something went wrong',
    message: IS_PRODUCTION ? 'An unexpected error occurred. Please try again.' : String(err.message),
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function start() {
  if (hasDatabase) {
    await ensureSchema();
  }
  app.listen(PORT, () => {
    console.log(`Darwin Dashboard running on http://localhost:${PORT}`);
    if (!hasDatabase) {
      console.log('  ℹ  No DATABASE_URL — using fixture data for demo advertiser "Ashby, Inc."');
    }
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
