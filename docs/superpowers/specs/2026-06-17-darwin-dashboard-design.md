# Darwin Dashboard Design

## 1. Goal

Build a separate dashboard for a single advertiser's LinkedIn CAPI integration that shows the last 30 days of delivery health, usage, and recommended actions.

The dashboard should answer three questions quickly:

- Is the integration healthy right now?
- What has happened over the last 30 days?
- What should we do next to improve it?

## 2. Scope

### In scope

- One advertiser per dashboard view.
- Default time window: last 30 days.
- Health summary, 30-day trend, alerts panel, ranked action list, and event breakdown.
- Back end storage for daily or hourly CAPI snapshots.
- Deterministic health scoring and recommendation rules.
- Mixed suggestions: rule-based alerts plus short explanatory guidance.

### Out of scope

- Portfolio-level reporting across many advertisers.
- Cross-advertiser benchmarking.
- Real-time streaming analytics.
- Write paths that mutate LinkedIn data.
- Interactive request execution against LinkedIn APIs.

## 3. Product Shape

The dashboard should be a separate application, not a page inside the existing LinkedIn API showcase.

The primary route should load one advertiser by identifier and render a 30-day view with these sections:

- Health summary at the top.
- 30-day trend chart(s).
- Alerts panel grouped by severity.
- Ranked action list with next steps.
- Event breakdown for source, type, and dedupe details.

The dashboard should default to a read-only explanatory experience. The backend is responsible for computing the score and recommendations so the UI stays simple and consistent.

## 4. Core Concepts

### Advertiser

The unit of analysis is one advertiser account. All metrics, scores, and recommendations belong to that account.

### Snapshot

A snapshot is a point-in-time record of CAPI health for the advertiser. Snapshots are stored daily or hourly, with the UI defaulting to the last 30 days.

### Health score

The health score is a server-side derived metric that summarizes the integration's current state. It should be based primarily on:

- Event volume.
- Match quality.
- Deduplication rate.
- Usage/adoption.

### Recommendation

A recommendation is a human-readable next step derived from one or more signals. Recommendations should be deterministic and explainable.

## 5. Architecture

The system should have three layers:

### Ingestion layer

Accepts advertiser CAPI metrics from a stored feed or database source. This layer normalizes raw inputs into a common snapshot shape.

### Scoring layer

Computes the health score, alert conditions, and prioritized recommendations from the stored snapshot data.

### Presentation layer

Renders the dashboard UI, charts, alerts, and recommendations using read-only API responses from the backend.

This separation keeps data logic server-side and makes the UI easier to reason about.

## 6. Data Model

### Advertiser record

- `advertiser_id`
- `advertiser_name`
- `external_account_id`
- `status`
- `created_at`
- `updated_at`

### CAPI snapshot record

- `advertiser_id`
- `captured_at`
- `window_start`
- `window_end`
- `event_volume`
- `match_quality_score`
- `dedupe_rate`
- `usage_count`
- `usage_sources`
- `error_count`
- `warning_count`
- `event_breakdown`
- `diagnostic_flags`

### Recommendation record

- `advertiser_id`
- `generated_at`
- `severity`
- `title`
- `summary`
- `evidence`
- `recommended_action`

The model should support both current-state reads and historical trend views without requiring expensive joins at render time.

## 7. UI Components

### Health summary

Shows the overall status, the latest health score, and the main contributors to that score.

### 30-day trend

Shows event volume and match quality as the default chart set. It may also include dedupe rate or usage/adoption if space allows.

### Alerts panel

Lists the highest-severity issues first. Examples include missing data, sharp event drops, low match quality, or dedupe anomalies.

### Action list

Shows the top 3-5 recommendations in priority order, each with a short explanation and the signal that triggered it.

### Event breakdown

Shows the last 30 days of event details by source, type, and dedupe outcome so users can understand where the score comes from.

## 8. Data Flow

1. A scheduled job or ingest process loads advertiser CAPI metrics from the source system.
2. The backend normalizes the metrics into snapshot records.
3. The scoring layer calculates the current health score and derived alerts.
4. The recommendation engine maps alerts and signal combinations to ranked actions.
5. The UI requests the advertiser's latest summary and the 30-day series.
6. The page renders the score, trends, alerts, action list, and event breakdown.

The dashboard should not recalculate health in the browser.

## 9. Scoring and Recommendation Rules

The initial scoring system should be deterministic and explainable.

Suggested starting rules:

- Low match quality lowers the score and produces a recommendation to improve identifiers and match keys.
- Falling event volume over the 30-day window lowers the score and produces a recommendation to check coverage and delivery.
- Low dedupe rate produces a recommendation to verify browser/server deduplication behavior and event IDs.
- Weak usage/adoption produces a recommendation to increase event coverage or expand implementation sources.

Recommendations should be mixed:

- Rule-based alerts for clearly defined issues.
- Short advisory guidance that explains why the issue matters and what to check next.

The first version does not need machine learning or anomaly detection.

## 10. Error Handling

The dashboard should fail gracefully when data is incomplete or stale.

### Missing advertiser data

Show an empty-state message that explains no CAPI snapshots are available yet.

### Partial data

Render the sections that are available and flag missing metrics in the alerts panel.

### Stale data

If the latest snapshot is older than the expected refresh interval, surface a warning that the dashboard may be out of date.

### Backend failure

Render a simple error state with a retry path and a short explanation. The UI should not expose raw stack traces.

## 11. Testing

### Data logic tests

- Verify the health score changes in the expected direction when individual signals worsen or improve.
- Verify recommendations are emitted for the intended threshold conditions.
- Verify severity ordering is stable and deterministic.

### API tests

- Verify the advertiser summary endpoint returns the expected shape.
- Verify the 30-day series endpoint includes the requested time window.
- Verify missing-data states are returned cleanly.

### UI smoke tests

- Verify the dashboard renders for an advertiser with data.
- Verify the empty state renders when no snapshots exist.
- Verify alerts and action list content match the backend response.

## 12. Open Questions

- What is the authoritative source for advertiser CAPI snapshots?
- How often should snapshots be refreshed: hourly or daily?
- Which exact match quality formula should the first version use?
- Do we need access control beyond a shared internal dashboard login?

## 13. Implementation Notes

- Keep the backend scoring logic isolated from the UI layer.
- Use a snapshot model that supports both current-state reads and 30-day history.
- Prefer explicit thresholds over opaque scoring rules in the first version.
- Treat the dashboard as read-only until the data model and scoring are stable.