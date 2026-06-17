# Darwin Dashboard Implementation Plan

## 1. Objective

Implement a separate Darwin dashboard for a single advertiser's LinkedIn CAPI integration, focused on the last 30 days of delivery health, usage, and actionable recommendations.

The first version must show:

- Health summary.
- 30-day trends.
- Alerts by severity.
- Ranked action list.
- Event breakdown.
- Signal breakdown with per-parameter match rates for fields such as `li_fat_id`, `email`, `first_name`, `last_name`, `country_code`, and `lead_id`.

## 2. Delivery Strategy

Build this in small slices so the dashboard can be validated end to end without waiting for the full product to land.

Recommended order:

1. Data model and snapshot storage.
2. Health scoring and signal breakdown logic.
3. Backend API endpoints for the dashboard.
4. UI layout and read-only dashboard rendering.
5. Alerts, ranked actions, and empty/error states.
6. Validation, cleanup, and documentation.

## 3. Workstream 1: Data Model and Storage

### Tasks

- Define advertiser, snapshot, recommendation, and signal breakdown record shapes.
- Choose the storage location for CAPI snapshots and historical series.
- Add persistence helpers for current snapshot reads and 30-day window queries.
- Add seed or fixture data for one advertiser to support local development.

### Acceptance criteria

- The app can load one advertiser's latest data.
- The app can fetch a 30-day history for the same advertiser.
- Signal-level fields are available in the stored payload.

### Validation

- Query the stored data shape with a local test fixture.
- Confirm the 30-day series can be read without browser logic.

## 4. Workstream 2: Scoring and Signal Breakdown

### Tasks

- Implement deterministic health scoring using event volume, match quality, dedupe rate, and usage/adoption.
- Add per-field signal metrics for sent count, match count, match rate, and presence rate.
- Encode rules for high-value identifiers such as `li_fat_id` and `email`.
- Add secondary handling for supporting fields such as `first_name`, `last_name`, and `country_code`.
- Generate ranked recommendations from the same signal inputs.

### Acceptance criteria

- The score changes predictably when any core metric worsens or improves.
- Each supported signal has a visible match rate and presence breakdown.
- The recommendation output explains which fields are healthy, missing, or weak.

### Validation

- Unit test score direction for positive and negative cases.
- Unit test signal-level recommendations for the named identifiers.
- Verify the output is deterministic for the same input snapshot.

## 5. Workstream 3: Backend API

### Tasks

- Add an advertiser summary endpoint.
- Add a 30-day history endpoint.
- Add a signal breakdown endpoint or embed the signal data into the summary payload.
- Add missing-data and stale-data handling.
- Add backend error responses that are safe for the UI.

### Acceptance criteria

- The frontend can request one advertiser's current summary and 30-day series.
- The API returns signal breakdown rows with the expected fields.
- Empty-state and partial-data responses are explicit.

### Validation

- API smoke test for a healthy advertiser record.
- API smoke test for a missing advertiser record.
- API smoke test for stale snapshot warnings.

## 6. Workstream 4: Dashboard UI

### Tasks

- Create the separate dashboard entry point and route structure.
- Render the health summary at the top of the page.
- Add 30-day trend charts for event volume and match quality.
- Add alerts grouped by severity.
- Add a ranked action list with short explanations.
- Add event breakdown and signal breakdown sections.

### Acceptance criteria

- The dashboard renders one advertiser cleanly by default.
- The signal breakdown shows per-field rows for identifiers and supporting parameters.
- The page stays read-only and does not recalculate health in the browser.

### Validation

- Visual smoke test with fixture data.
- Verify the signal breakdown includes the named parameters.
- Verify the dashboard still renders when one section has no data.

## 7. Workstream 5: Alerts and Recommendations

### Tasks

- Map score inputs to severity levels.
- Produce the top 3-5 action items from the rule engine.
- Add explanatory text for why each action matters.
- Ensure alerts and action list do not duplicate the same message verbatim.

### Acceptance criteria

- Severe issues appear in the alerts panel before lower-priority items.
- The action list is ranked and concise.
- Guidance is clear enough for a non-engineer to act on.

### Validation

- Test alert ordering.
- Test recommendation ranking.
- Review sample copy for clarity and duplication.

## 8. Workstream 6: Edge Cases and UX Polish

### Tasks

- Add an empty state for advertisers with no snapshots.
- Add a partial-data state when some metrics are missing.
- Add a stale-data warning.
- Add a generic backend failure state with retry guidance.

### Acceptance criteria

- The UI never fails silently.
- Missing data is visible to the user.
- Error states are simple and non-technical.

### Validation

- Render the dashboard with no data.
- Render the dashboard with incomplete data.
- Force a backend error and confirm the fallback UI.

## 9. Workstream 7: Testing and Documentation

### Tasks

- Add unit tests for scoring and signal breakdown logic.
- Add API tests for summary and 30-day history.
- Add a UI smoke test for the main dashboard path.
- Document the dashboard data model and how the score is interpreted.

### Acceptance criteria

- The key logic is covered by deterministic tests.
- The dashboard can be reviewed without reading implementation details.

### Validation

- Run the narrowest test set for the touched slice.
- Confirm the spec and implementation plan remain aligned.

## 10. Suggested Milestones

### Milestone 1: Data foundation

Complete storage, fixtures, and data loading for one advertiser.

### Milestone 2: Scoring engine

Complete health scoring, signal breakdown, and recommendation generation.

### Milestone 3: API contract

Expose the dashboard-ready payloads from the backend.

### Milestone 4: UI shell

Render the main dashboard layout with fixture-backed data.

### Milestone 5: Refinement

Handle missing data, stale data, errors, and polish.

## 11. Risks and Decisions

- The authoritative source for advertiser CAPI snapshots still needs to be confirmed.
- Refresh cadence is still undecided: hourly or daily.
- The initial match quality formula should be explicit and deterministic.
- Access control requirements may change if this dashboard is used outside the current internal audience.

## 12. Exit Criteria

The implementation is ready when:

- A single advertiser can be loaded and reviewed for the last 30 days.
- Health score, alerts, actions, event breakdown, and signal breakdown all render from backend data.
- Per-field signals show sent count, match count, match rate, and presence rate.
- Empty, partial, stale, and error states are handled cleanly.
- The core logic has passing tests.