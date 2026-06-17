'use strict';

/**
 * Deterministic health scoring for a Darwin dashboard advertiser.
 *
 * Inputs: a CAPI snapshot record.
 * Outputs: { score (0–100), grade, contributors }
 *
 * Score composition:
 *   30 pts — match quality (match_quality_score, 0–1 scale)
 *   25 pts — event volume (non-zero, stable over 30 days)
 *   25 pts — deduplication rate (dedupe_rate, 0–1 scale)
 *   20 pts — usage/adoption (usage_count vs event_volume)
 *
 * Each component is clamped to its maximum before summing.
 */

/**
 * Score a single snapshot.
 *
 * @param {object} snapshot  Latest CAPI snapshot record.
 * @param {object[]} history  30-day series (oldest → newest).
 * @returns {{ score: number, grade: string, contributors: object[] }}
 */
function scoreSnapshot(snapshot, history = []) {
  if (!snapshot) return { score: 0, grade: 'N/A', contributors: [] };

  const contributors = [];

  // -- Match quality (30 pts) -----------------------------------------------
  const mq = parseFloat(snapshot.match_quality_score) || 0;
  const mqPts = clamp(Math.round(mq * 30), 0, 30);
  contributors.push({
    key: 'match_quality',
    label: 'Match quality',
    value: pct(mq),
    points: mqPts,
    max: 30,
    tier: tier(mq, 0.70, 0.45),
  });

  // -- Event volume (25 pts) ------------------------------------------------
  // Full 25 if volume > 0 and no sharp drop in the last 7 days vs prior 7.
  const vol = snapshot.event_volume || 0;
  let volPts = vol > 0 ? 25 : 0;
  let volNote = null;
  if (history.length >= 14) {
    const recent7 = avg(history.slice(-7).map((s) => s.event_volume));
    const prior7 = avg(history.slice(-14, -7).map((s) => s.event_volume));
    if (prior7 > 0) {
      const change = (recent7 - prior7) / prior7;
      if (change < -0.30) {
        volPts = Math.round(volPts * 0.5);
        volNote = `Volume dropped ${pct(Math.abs(change))} over the last 7 days`;
      }
    }
  }
  contributors.push({
    key: 'event_volume',
    label: 'Event volume',
    value: vol.toLocaleString() + ' events',
    note: volNote,
    points: volPts,
    max: 25,
    tier: vol === 0 ? 'poor' : volNote ? 'fair' : 'good',
  });

  // -- Deduplication rate (25 pts) ------------------------------------------
  const dr = parseFloat(snapshot.dedupe_rate) || 0;
  const drPts = clamp(Math.round(dr * 25), 0, 25);
  contributors.push({
    key: 'dedupe_rate',
    label: 'Deduplication rate',
    value: pct(dr),
    points: drPts,
    max: 25,
    tier: tier(dr, 0.80, 0.50),
  });

  // -- Usage / adoption (20 pts) --------------------------------------------
  const usageFrac = vol > 0 ? clamp((snapshot.usage_count || 0) / vol, 0, 1) : 0;
  const usagePts = clamp(Math.round(usageFrac * 20), 0, 20);
  contributors.push({
    key: 'usage',
    label: 'Usage / adoption',
    value: pct(usageFrac),
    points: usagePts,
    max: 20,
    tier: tier(usageFrac, 0.80, 0.50),
  });

  const score = contributors.reduce((sum, c) => sum + c.points, 0);
  const grade = gradeFromScore(score);

  return { score, grade, contributors };
}

/**
 * Derive signal-level health for the breakdown panel.
 * Returns each signal annotated with a healthy/warning/poor CSS tone.
 */
function annotateSignals(signals = []) {
  return signals.map((s) => ({
    ...s,
    tone: signalTone(s),
    match_rate_display: s.match_rate != null ? pct(s.match_rate) : '—',
    presence_rate_display: pct(s.presence_rate),
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function pct(v) {
  if (v == null) return '—';
  return (parseFloat(v) * 100).toFixed(1) + '%';
}

function tier(v, goodThreshold, fairThreshold) {
  if (v >= goodThreshold) return 'good';
  if (v >= fairThreshold) return 'fair';
  return 'poor';
}

function signalTone(s) {
  if (s.quality_tier === 'good') return 'good';
  if (s.quality_tier === 'fair') return 'warn';
  if (s.quality_tier === 'missing') return 'missing';
  return 'poor';
}

function gradeFromScore(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

module.exports = { scoreSnapshot, annotateSignals };
