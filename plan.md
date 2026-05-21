# LinkedIn API Showcase — Project Plan

## 1. Purpose

Build an internal demo tool that lets our team walk clients through LinkedIn's
Marketing & Member APIs in a live, interactive way. The goal is to make it
obvious to a non-developer audience:

- **What each product/API does** (in plain language).
- **Which OAuth scopes it requires** and how a member grants them.
- **What a real request and response look like** for each endpoint.
- **What data the client can send and receive** for each product.

The app is a living artifact: as LinkedIn ships new products/APIs, we extend
the catalog so the demo stays current.

## 2. Audience & use cases

- **Client-facing teams** (sales engineering, partner managers) running live
  product walk-throughs on a call or in a meeting.
- **New hires / internal enablement** — a single place to learn what each
  product surfaces.
- **Prospective integration partners** evaluating which products they need to
  request in the LinkedIn Developer Portal.

Primary scenarios:

1. "Show me what data the Conversions API accepts." → open product detail,
   show example payload + response.
2. "Walk me through what a member sees when they sign in." → run the live
   3-legged OAuth flow against a sandbox LinkedIn app.
3. "Which scope do I need to read organization follower stats?" → search the
   product catalog by capability/endpoint.

## 3. Current state (baseline)

Already shipped:

- Node.js + Express app, EJS views, deployed to Render.
- 3-legged OAuth 2.0 Authorization Code flow with CSRF-protected `state`.
- Postgres-backed session + token storage (`connect-pg-simple`, `lib/tokens.js`).
- Product catalog driven by [lib/scope-catalog.js](lib/scope-catalog.js)
  (scope → product → endpoints) with example request/response pairs in
  [lib/product-examples.js](lib/product-examples.js).
- Views: landing, profile, products list, per-product detail, error.
- Deprecated products removed (e.g. Conversions API (Offline)).

## 4. Guiding principles

- **Demo-first**: every change is judged by "does this make the next client
  call clearer?"
- **Data-driven catalog**: products, scopes, endpoints, and examples live in
  flat data files so non-engineers can submit PRs.
- **Safe by default**: never ask the member for credentials; never log tokens;
  redact secrets in the UI.
- **Iterative**: small, frequent updates as LinkedIn releases new products.

## 5. Roadmap

### Phase 1 — Solidify the baseline (in progress)

- [x] OAuth flow + token persistence.
- [x] Scope-driven product catalog with example payloads.
- [x] Deploy to Render with Postgres.
- [ ] Write a short "how to demo this" runbook for the team.
- [ ] Add a `CONTRIBUTING.md` describing how to add a new product (edit
  `scope-catalog.js` + `product-examples.js`, open PR).

### Phase 2 — Live request playground

Goal: let presenters fire real requests against LinkedIn from the UI, with
sensible defaults, while a client watches.

- [ ] Per-endpoint "Try it" panel that uses the granted access token.
- [ ] Editable JSON body with defaults sourced from
  [lib/endpoint-defaults.js](lib/endpoint-defaults.js).
- [ ] Pretty-printed response with status, headers, and timing.
- [ ] Token-scope guard: disable endpoints whose scope wasn't granted, with a
  tooltip explaining which product is missing.
- [ ] Rate-limit + error handling with friendly messages (e.g. 401 → "token
  expired, click refresh").

### Phase 3 — Broader product coverage

Add the remaining LinkedIn products our team demos most:

- [ ] Marketing: Campaign Management, Ad Analytics, Lead Sync, Audiences.
- [ ] Community Management: Posts, Social Actions, Reactions, Follower stats.
- [ ] Talent Solutions (where applicable to our partners).
- [ ] Member-level: Share on LinkedIn, Profile, Connections size.

For each new product:

1. Add scope row(s) to [lib/scope-catalog.js](lib/scope-catalog.js).
2. Add a request/response example to
   [lib/product-examples.js](lib/product-examples.js).
3. Add default request bodies to
   [lib/endpoint-defaults.js](lib/endpoint-defaults.js).
4. Smoke-test end-to-end with a sandbox app.

### Phase 4 — Presenter UX polish

- [ ] "Demo mode" toggle that hides internal/debug info and enlarges fonts for
  screen-share.
- [ ] Copy-to-clipboard for every request/response block.
- [ ] Search/filter on the products page (by scope, product name, endpoint).
- [ ] Side-by-side diff view for legacy vs. current endpoints (e.g. UGC Posts
  vs. Posts API).
- [ ] Deep links per product (`/products/<slug>`) for sharing in follow-ups.

### Phase 5 — Maintenance & lifecycle

- [ ] Lightweight CI: lint + a smoke test that boots the server and renders
  `/products`.
- [ ] Quarterly review checklist: confirm `LinkedIn-Version` header, retire
  deprecated products, add new ones.
- [ ] Changelog (`CHANGELOG.md`) so the team can see what changed before each
  client call.

## 6. Non-goals

- Not a production integration template. Token storage, error handling, and
  security choices are good enough for an internal demo, not for customer
  workloads.
- Not a replacement for LinkedIn's official documentation — we link to it,
  we don't mirror it.
- No multi-tenant user management; everyone using the app authenticates
  against a shared sandbox LinkedIn developer app.

## 7. Architecture snapshot

```
Browser ── EJS views ── Express (server.js)
                         │
                         ├── lib/scope-catalog.js     (scope → product → endpoints)
                         ├── lib/product-examples.js  (request/response samples)
                         ├── lib/endpoint-defaults.js (default request bodies)
                         ├── lib/tokens.js            (access/refresh token persistence)
                         └── lib/db.js                (Postgres pool + schema bootstrap)

Hosting: Render (web service + managed Postgres), config in render.yaml.
```

## 8. How we add a new LinkedIn product (the iteration loop)

1. **Identify** the product in the LinkedIn Developer Portal and note the
   scopes it grants.
2. **Catalog** each scope in `lib/scope-catalog.js` with the product name, a
   one-line description, and the endpoints it unlocks.
3. **Example** a realistic request + response in `lib/product-examples.js`.
4. **Default body** (if applicable) in `lib/endpoint-defaults.js` so the
   playground has something useful pre-filled.
5. **Scopes env**: add the new scope to `LINKEDIN_SCOPES` in `render.yaml`
   and `.env.example`.
6. **Demo it** end-to-end against the sandbox app, then merge.

## 9. Open questions

- Do we want per-presenter LinkedIn apps, or one shared sandbox app with a
  rotating set of test members?
- Should request/response examples be generated from real captured traffic
  (with redaction) instead of hand-written?
- How do we surface deprecation timelines from LinkedIn (e.g. UGC Posts) in
  the UI so presenters don't demo something on the way out?
