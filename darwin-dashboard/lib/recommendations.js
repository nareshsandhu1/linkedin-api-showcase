'use strict';

/**
 * Rule-based recommendation engine for the Darwin dashboard.
 *
 * Each rule is a function that receives (snapshot, history, scoringResult)
 * and returns null or a recommendation object:
 *
 *   { severity: 'critical'|'warning'|'info', title, summary, evidence, recommended_action }
 *
 * Severity order: critical → warning → info
 * The engine de-duplicates, sorts by severity, and returns the top 5.
 */

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const RULES = [

  // 1. No events received at all
  function noEvents(snapshot) {
    if ((snapshot.event_volume || 0) === 0) {
      return {
        severity: 'critical',
        title: 'No CAPI events received',
        summary:
          'LinkedIn has not received any Conversions API events for this advertiser in the selected window.',
        evidence: { event_volume: 0 },
        recommended_action:
          'Verify the CAPI endpoint is reachable, that your access token has not expired, and that events are being dispatched correctly from your server or tag.',
      };
    }
    return null;
  },

  // 2. Sharp volume drop (>30% in last 7 vs prior 7)
  function volumeDrop(snapshot, history) {
    if (history.length < 14) return null;
    const recent = avg(history.slice(-7).map((s) => s.event_volume));
    const prior = avg(history.slice(-14, -7).map((s) => s.event_volume));
    if (prior > 0 && (recent - prior) / prior < -0.30) {
      const pct = Math.abs(Math.round(((recent - prior) / prior) * 100));
      return {
        severity: 'warning',
        title: `Event volume dropped ${pct}% over the last 7 days`,
        summary:
          `Daily event volume averaged ${Math.round(recent)} in the last 7 days, down from ${Math.round(prior)} in the prior 7-day period. This may indicate a tracking gap, deployment issue, or seasonal change.`,
        evidence: { recent_avg: Math.round(recent), prior_avg: Math.round(prior), drop_pct: pct },
        recommended_action:
          'Check for recent deployments, tag changes, or consent policy updates that may have reduced event delivery. Confirm the CAPI integration is still firing for all expected event types.',
      };
    }
    return null;
  },

  // 3. Low match quality overall
  function lowMatchQuality(snapshot) {
    const mq = parseFloat(snapshot.match_quality_score);
    if (!isNaN(mq) && mq < 0.60) {
      return {
        severity: mq < 0.40 ? 'critical' : 'warning',
        title: `Overall match quality is ${(mq * 100).toFixed(1)}%`,
        summary:
          'Low match quality means LinkedIn is unable to link a significant portion of your CAPI events to a LinkedIn member. This reduces attribution accuracy and ad optimization.',
        evidence: { match_quality_score: mq },
        recommended_action:
          'Improve identifier coverage by sending high-quality signals such as li_fat_id (LinkedIn click ID) and email. Ensure identifiers are sent in the correct hashed or normalised format.',
      };
    }
    return null;
  },

  // 4. lifatid (LinkedIn Click ID) missing or low quality
  function lifattIdWeak(snapshot) {
    const signals = Array.isArray(snapshot.signal_breakdown) ? snapshot.signal_breakdown : [];
    const sig = signals.find((s) => s.signal_name === 'lifatid');
    if (!sig) return null;
    if (sig.quality_tier === 'missing') {
      return {
        severity: 'warning',
        title: 'li_fat_id (LinkedIn Click ID) is not being sent',
        summary:
          'The LinkedIn Click ID (li_fat_id / lifatid) is the highest-fidelity identifier available for CAPI matching. It is not appearing in your event payloads.',
        evidence: { sent_count: 0, presence_rate: 0 },
        recommended_action:
          'Capture the li_fat_id URL parameter from LinkedIn ad click URLs and include it in every CAPI event payload. This typically provides the highest match rates.',
      };
    }
    if (sig.match_rate != null && sig.match_rate < 0.70) {
      return {
        severity: 'info',
        title: `li_fat_id match rate is ${(sig.match_rate * 100).toFixed(1)}%`,
        summary:
          `Only ${(sig.presence_rate * 100).toFixed(1)}% of events include a li_fat_id (lifatid), and of those, ${(sig.match_rate * 100).toFixed(1)}% matched a LinkedIn member.`,
        evidence: { sent_count: sig.sent_count, match_rate: sig.match_rate, presence_rate: sig.presence_rate },
        recommended_action:
          'Ensure the li_fat_id parameter is captured from every LinkedIn click URL and persisted until the conversion event fires. Check that it is not being dropped by URL sanitisation or cookie policies.',
      };
    }
    return null;
  },

  // 5. sha256email missing or low quality
  function emailWeak(snapshot) {
    const signals = Array.isArray(snapshot.signal_breakdown) ? snapshot.signal_breakdown : [];
    const sig = signals.find((s) => s.signal_name === 'sha256email');
    if (!sig) return null;
    if (sig.quality_tier === 'missing') {
      return {
        severity: 'warning',
        title: 'SHA-256 email (sha256email) is not being sent',
        summary:
          'Hashed email is a strong match signal for LinkedIn CAPI. It is not appearing in your event payloads, which limits matching for users who clicked from non-tracked sessions.',
        evidence: { sent_count: 0 },
        recommended_action:
          'Include a SHA-256 hashed email address (sha256email) in every CAPI event where a known user is present. Normalise to lowercase before hashing.',
      };
    }
    if (sig.match_rate != null && sig.match_rate < 0.50) {
      return {
        severity: 'info',
        title: `sha256email match rate is low at ${(sig.match_rate * 100).toFixed(1)}%`,
        summary:
          `SHA-256 email is being sent in ${(sig.presence_rate * 100).toFixed(1)}% of events, but only ${(sig.match_rate * 100).toFixed(1)}% are matching a LinkedIn member. This is often caused by normalisation issues or personal vs. work email mismatches.`,
        evidence: { sent_count: sig.sent_count, match_rate: sig.match_rate },
        recommended_action:
          'Normalise emails to lowercase before hashing. Consider collecting work emails at form submission to increase the chance of matching LinkedIn accounts.',
      };
    }
    return null;
  },

  // 6. Low deduplication rate
  function lowDedupe(snapshot) {
    const dr = parseFloat(snapshot.dedupe_rate);
    if (!isNaN(dr) && dr < 0.70) {
      return {
        severity: 'warning',
        title: `Deduplication rate is ${(dr * 100).toFixed(1)}%`,
        summary:
          'A low deduplication rate means LinkedIn is receiving duplicate events — likely a mix of browser (Insight Tag) and server (CAPI) events for the same conversion without a shared event ID.',
        evidence: { dedupe_rate: dr },
        recommended_action:
          'Ensure every CAPI event includes a unique, stable eventId that matches the corresponding Insight Tag event_id. This allows LinkedIn to deduplicate browser and server signals automatically.',
      };
    }
    return null;
  },

  // 7. conversioneventuserpeoplematchinfo missing
  function peopleMatchInfoMissing(snapshot) {
    const signals = Array.isArray(snapshot.signal_breakdown) ? snapshot.signal_breakdown : [];
    const sig = signals.find((s) => s.signal_name === 'conversioneventuserpeoplematchinfo');
    if (!sig || sig.quality_tier !== 'missing') return null;
    return {
      severity: 'info',
      title: 'People match info (name / country / lead) not being sent',
      summary:
        'conversioneventuserpeoplematchinfo is not present in your event payloads. This field carries name, country, and lead ID signals that supplement primary identifiers.',
      evidence: { sent_count: 0 },
      recommended_action:
        'Populate the user data object in your CAPI payload with firstName, lastName, countryCode, and leadId (where available from Lead Gen Forms).',
    };
  },

  // 8. High-confidence ID signals (ligiantid, axiomid, oracleid) not used
  function highConfidenceIdsMissing(snapshot) {
    const signals = Array.isArray(snapshot.signal_breakdown) ? snapshot.signal_breakdown : [];
    const missing = ['ligiantid', 'axiomid', 'oracleid'].filter((name) => {
      const s = signals.find((sig) => sig.signal_name === name);
      return s && s.quality_tier === 'missing';
    });
    // Only surface if all three are absent — if any is present, the advertiser has a data partnership
    if (missing.length < 3) return null;
    return {
      severity: 'info',
      title: 'No LinkedIn data-partner IDs (ligiantid, axiomid, oracleid) in use',
      summary:
        'LinkedIn Giant ID, Axiom ID, and Oracle ID are high-confidence deterministic identifiers available through LinkedIn data partnerships. None are currently being sent.',
      evidence: { missing_ids: missing },
      recommended_action:
        'If you have a LinkedIn data partnership (Axiom, Oracle, or direct Giant ID access), include the relevant ID in your CAPI payloads for the highest match accuracy.',
    };
  },

];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Generate ranked recommendations for a snapshot.
 *
 * @param {object} snapshot  Latest CAPI snapshot.
 * @param {object[]} history  30-day series.
 * @param {object} scoringResult  Output from scoring.scoreSnapshot().
 * @returns {object[]}  Top 5 recommendations, sorted by severity.
 */
function generateRecommendations(snapshot, history, scoringResult) {
  if (!snapshot) return [];

  const results = RULES
    .map((rule) => {
      try {
        return rule(snapshot, history, scoringResult);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // Sort: critical → warning → info, then deduplicate by title
  const seen = new Set();
  return results
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .filter((r) => {
      if (seen.has(r.title)) return false;
      seen.add(r.title);
      return true;
    })
    .slice(0, 5);
}

/**
 * Group recommendations into alerts (critical/warning) and actions (all).
 */
function partitionRecommendations(recommendations) {
  return {
    alerts: recommendations.filter((r) => r.severity === 'critical' || r.severity === 'warning'),
    actions: recommendations,
  };
}

module.exports = { generateRecommendations, partitionRecommendations };
