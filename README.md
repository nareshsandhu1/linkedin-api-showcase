# LinkedIn API Showcase

A small Node.js + Express web app that demonstrates LinkedIn's APIs, starting with the **3-legged OAuth 2.0 Authorization Code Flow**.

Reference: [Authorization Code Flow (Microsoft Learn)](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)

## Important security note

Members **do not** type their LinkedIn email/password into this app. That would violate LinkedIn's terms and OAuth best practice. Instead, this app redirects the user to `https://www.linkedin.com/oauth/v2/authorization`, where LinkedIn collects the credentials on its own domain and returns an authorization code to our callback URL. We then exchange that code for an access token server-side.

## Prerequisites

1. Node.js **18+** (we use the built-in `fetch`).
2. A LinkedIn developer application:
   - Create one at <https://www.linkedin.com/developers/apps>.
   - Under the **Auth** tab, add `http://localhost:3000/auth/linkedin/callback` to **Authorized redirect URLs**.
   - Under **Products**, add **Sign In with LinkedIn using OpenID Connect** (free, instantly approved). This grants the `openid profile email` scopes used by default.
   - Copy the **Client ID** and **Client Secret**.

## Setup

```bash
cd linkedin-api-showcase
cp .env.example .env        # then edit .env and paste your client ID/secret
npm install
npm start
```

Open <http://localhost:3000> and click **Sign in with LinkedIn**.

## Flow implemented

| Step | Endpoint in this app | LinkedIn endpoint |
| --- | --- | --- |
| 2. Request authorization code | `GET /auth/linkedin` | `https://www.linkedin.com/oauth/v2/authorization` |
| 3. Exchange code for access token | `GET /auth/linkedin/callback` | `POST https://www.linkedin.com/oauth/v2/accessToken` |
| 4. Make authenticated request | `GET /profile` | `GET https://api.linkedin.com/v2/userinfo` |

CSRF protection is implemented via a per-session `state` parameter, as required by the spec.

## Project layout

```
linkedin-api-showcase/
├── server.js              # Express server + OAuth flow
├── views/
│   ├── index.ejs          # Landing page with "Sign in with LinkedIn"
│   ├── profile.ejs        # Shows access token + userinfo
│   └── error.ejs
├── public/
│   └── styles.css
├── .env.example
└── package.json
```

## Next steps (ideas for the showcase)

- Add `/api/posts` to publish a UGC post using the `w_member_social` scope.
- Add `/api/organizations` to list pages the member admins (`r_organization_admin`).
- Wire up a token refresh route using the returned `refresh_token` (where granted).
- Persist tokens in a database instead of the session.
