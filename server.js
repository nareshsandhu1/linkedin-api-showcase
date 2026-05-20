/**
 * LinkedIn API Showcase - OAuth 2.0 Authorization Code Flow
 *
 * Implements the 3-legged OAuth flow documented at:
 * https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
 *
 * Endpoints:
 *   GET  /                       Landing page
 *   GET  /auth/linkedin          Redirects user to LinkedIn's authorization page
 *   GET  /auth/linkedin/callback Handles LinkedIn's redirect, exchanges code -> token
 *   GET  /profile                Shows access token + calls /v2/userinfo (OpenID)
 *   POST /logout                 Clears the session
 */

require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const session = require('express-session');
const SCOPE_CATALOG = require('./lib/scope-catalog');
const PRODUCT_EXAMPLES = require('./lib/product-examples');
const ENDPOINT_DEFAULTS = require('./lib/endpoint-defaults');
const { pool, ensureSchema, hasDatabase } = require('./lib/db');
const { saveToken, getValidAccessToken } = require('./lib/tokens');

const {
  LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET,
  LINKEDIN_REDIRECT_URI = 'http://localhost:3000/auth/linkedin/callback',
  LINKEDIN_SCOPES = 'openid profile email',
  SESSION_SECRET = 'change-me-in-production',
  PORT = 3000,
} = process.env;

const AUTHORIZATION_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

const app = express();

// Render (and most PaaS) terminate TLS at a load balancer. We need to trust the
// proxy so req.protocol reflects the original HTTPS scheme and secure cookies work.
app.set('trust proxy', 1);

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Use Postgres-backed session store when DATABASE_URL is configured;
// otherwise fall back to express-session's in-memory store (local dev).
let sessionStore;
if (hasDatabase) {
  const PgSession = require('connect-pg-simple')(session);
  sessionStore = new PgSession({ pool, tableName: 'session', createTableIfMissing: false });
}

app.use(
  session({
    store: sessionStore, // undefined => MemoryStore
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PRODUCTION,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

// -- Helpers ----------------------------------------------------------------

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build the list of products granted by the current session's access token.
 */
function buildGrantedProducts(token) {
  const grantedScopes = (token.scope || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const productsBySlug = new Map();
  const unknownScopes = [];

  for (const scope of grantedScopes) {
    const entry = SCOPE_CATALOG[scope];
    if (!entry) {
      unknownScopes.push(scope);
      continue;
    }
    const slug = slugify(entry.product);
    if (!productsBySlug.has(slug)) {
      productsBySlug.set(slug, {
        slug,
        name: entry.product,
        scopes: [],
        endpoints: new Map(),
      });
    }
    const product = productsBySlug.get(slug);
    product.scopes.push({ name: scope, description: entry.description });
    for (const ep of entry.endpoints) {
      product.endpoints.set(`${ep.method} ${ep.path}`, ep);
    }
  }

  const products = Array.from(productsBySlug.values())
    .map((p) => ({ ...p, endpoints: Array.from(p.endpoints.values()) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { products, grantedScopes, unknownScopes };
}

function requireConfig(res) {
  if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
    res.status(500).render('error', {
      title: 'Configuration missing',
      message:
        'LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must be set in your .env file. ' +
        'Create an app at https://www.linkedin.com/developers/apps and copy the credentials from the Auth tab.',
    });
    return false;
  }
  return true;
}

// -- Routes -----------------------------------------------------------------

app.get('/', (req, res) => {
  res.render('index', {
    clientIdConfigured: Boolean(LINKEDIN_CLIENT_ID),
    redirectUri: LINKEDIN_REDIRECT_URI,
    scopes: LINKEDIN_SCOPES,
    token: req.session.token || null,
    profile: req.session.profile || null,
  });
});

/**
 * Step 2: Request an Authorization Code
 * Redirects the browser to LinkedIn's OAuth 2.0 authorization page.
 * LinkedIn handles the credential entry — we never see the password.
 */
app.get('/auth/linkedin', (req, res) => {
  if (!requireConfig(res)) return;

  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINKEDIN_CLIENT_ID,
    redirect_uri: LINKEDIN_REDIRECT_URI,
    state,
    scope: LINKEDIN_SCOPES,
  });

  res.redirect(`${AUTHORIZATION_URL}?${params.toString()}`);
});

/**
 * Step 3: Exchange Authorization Code for an Access Token
 */
app.get('/auth/linkedin/callback', async (req, res) => {
  if (!requireConfig(res)) return;

  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    return res.status(400).render('error', {
      title: 'LinkedIn returned an error',
      message: `${error}: ${errorDescription || 'No description provided.'}`,
    });
  }

  // CSRF protection: state must match what we generated.
  if (!state || state !== req.session.oauthState) {
    return res.status(401).render('error', {
      title: 'Invalid state parameter',
      message:
        'The state value returned by LinkedIn does not match the one issued by this app. ' +
        'This may indicate a CSRF attack. Aborting.',
    });
  }
  delete req.session.oauthState;

  if (!code) {
    return res.status(400).render('error', {
      title: 'Missing authorization code',
      message: 'LinkedIn did not return a `code` parameter.',
    });
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
      redirect_uri: LINKEDIN_REDIRECT_URI,
    });

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(tokenRes.status).render('error', {
        title: 'Token exchange failed',
        message: JSON.stringify(tokenData, null, 2),
      });
    }

    req.session.token = {
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
      refresh_token: tokenData.refresh_token || null,
      refresh_token_expires_in: tokenData.refresh_token_expires_in || null,
      issued_at: Date.now(),
    };

    // If openid scope was granted, fetch the userinfo immediately for a nicer demo.
    let profile = null;
    if ((tokenData.scope || '').includes('openid') || (tokenData.scope || '').includes('profile')) {
      try {
        const userRes = await fetch(USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (userRes.ok) {
          profile = await userRes.json();
          req.session.profile = profile;
        }
      } catch (_) {
        /* non-fatal */
      }
    }

    // Persist the token in Postgres (when configured) keyed by a stable user id.
    // Use the LinkedIn `sub` from userinfo when available; otherwise fall back
    // to a per-session UUID so the same browser keeps refreshing the same row.
    const userId =
      (profile && profile.sub) ||
      req.session.userId ||
      crypto.randomUUID();
    req.session.userId = userId;
    if (hasDatabase) {
      try {
        await saveToken(userId, tokenData);
      } catch (e) {
        console.error('Failed to persist token:', e.message);
      }
    }

    res.redirect('/products');
  } catch (err) {
    res.status(500).render('error', {
      title: 'Unexpected error',
      message: err.message,
    });
  }
});

/**
 * Step 4: Make Authenticated Requests
 */
app.get('/profile', async (req, res) => {
  if (!req.session.token) return res.redirect('/');

  // Refresh the userinfo on demand (in case it wasn't fetched at callback time).
  if (!req.session.profile) {
    try {
      const userRes = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${req.session.token.access_token}` },
      });
      if (userRes.ok) req.session.profile = await userRes.json();
    } catch (_) {
      /* non-fatal */
    }
  }

  res.render('profile', {
    token: req.session.token,
    profile: req.session.profile,
  });
});

/**
 * Post-auth landing page: a clickable list of the LinkedIn Developer Portal
 * products this app has access to (derived from the granted OAuth scopes).
 */
app.get('/products', (req, res) => {
  if (!req.session.token) return res.redirect('/');

  const { products, grantedScopes, unknownScopes } = buildGrantedProducts(
    req.session.token
  );

  res.render('products', {
    products,
    grantedScopes,
    unknownScopes,
    token: req.session.token,
    profile: req.session.profile,
  });
});

/**
 * Product detail page: shows all scopes, descriptions, and API endpoints
 * unlocked by a single product.
 */
app.get('/products/:slug', (req, res) => {
  if (!req.session.token) return res.redirect('/');

  const { products } = buildGrantedProducts(req.session.token);
  const product = products.find((p) => p.slug === req.params.slug);

  if (!product) {
    return res.status(404).render('error', {
      title: 'Product not found',
      message:
        'No product matched that URL, or your access token does not grant any scopes for it.',
    });
  }

  const example = PRODUCT_EXAMPLES[product.name] || null;
  const fallbackBody = extractSampleJsonBody(example && example.request);
  const enrichedEndpoints = product.endpoints.map((ep) => {
    const key = `${ep.method} ${ep.path}`;
    const defaults = ENDPOINT_DEFAULTS[key] || {};
    return {
      ...ep,
      tryUrl: defaults.tryUrl || ep.path,
      tryBody: defaults.tryBody
        ? JSON.stringify(defaults.tryBody, null, 2)
        : ep.method !== 'GET'
        ? fallbackBody
        : null,
    };
  });
  res.render('product-detail', {
    product: { ...product, endpoints: enrichedEndpoints },
    example,
    token: req.session.token,
    profile: req.session.profile,
  });
});

/**
 * Extract the first JSON object/array literal from an example request
 * string. Returns a re-formatted string, or null if none found.
 */
function extractSampleJsonBody(text) {
  if (!text) return null;
  const start = text.search(/[\{\[]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        const raw = text.slice(start, i + 1);
        try { return JSON.stringify(JSON.parse(raw), null, 2); }
        catch { return raw; }
      }
    }
  }
  return null;
}

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

/**
 * Live API proxy: forwards a request to api.linkedin.com using the user's
 * persisted access token (auto-refreshed if near expiry). Returns the raw
 * status + JSON/text body so the UI can render it.
 *
 * Body: { method: 'GET'|'POST'|..., url: 'https://api.linkedin.com/...', body?: object|string }
 */
app.post('/api/call', async (req, res) => {
  if (!req.session.token && !req.session.userId) {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  const { method = 'GET', url, body } = req.body || {};

  // SSRF guard: only allow LinkedIn hosts.
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'invalid_url' });
  }
  if (parsed.hostname !== 'api.linkedin.com') {
    return res.status(400).json({ error: 'host_not_allowed', allowed: 'api.linkedin.com' });
  }
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
    return res.status(400).json({ error: 'method_not_allowed' });
  }

  let accessToken;
  try {
    accessToken = await getValidAccessToken(req, {
      clientId: LINKEDIN_CLIENT_ID,
      clientSecret: LINKEDIN_CLIENT_SECRET,
    });
  } catch (err) {
    if (err.code === 'NEEDS_REAUTH') {
      return res.status(401).json({ error: 'needs_reauth', reauthUrl: '/auth/linkedin' });
    }
    if (req.session.token && req.session.token.access_token) {
      // Fall back to the in-session token (no DB).
      accessToken = req.session.token.access_token;
    } else {
      return res.status(401).json({ error: err.code || 'token_unavailable', message: err.message });
    }
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
  };
  // Versioned /rest/* endpoints require a LinkedIn-Version header.
  if (parsed.pathname.startsWith('/rest/')) {
    headers['LinkedIn-Version'] = process.env.LINKEDIN_API_VERSION || '202506';
  }

  let fetchBody;
  if (body !== undefined && body !== null && method.toUpperCase() !== 'GET') {
    if (typeof body === 'string') {
      fetchBody = body;
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    } else {
      fetchBody = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
  }

  try {
    const apiRes = await fetch(url, { method: method.toUpperCase(), headers, body: fetchBody });
    const text = await apiRes.text();
    let parsedJson = null;
    try { parsedJson = JSON.parse(text); } catch { /* leave as text */ }

    res.status(200).json({
      request: { method: method.toUpperCase(), url, headers: { ...headers, Authorization: 'Bearer ***' } },
      response: {
        status: apiRes.status,
        statusText: apiRes.statusText,
        headers: Object.fromEntries(apiRes.headers.entries()),
        body: parsedJson !== null ? parsedJson : text,
      },
    });
  } catch (err) {
    res.status(502).json({ error: 'upstream_error', message: err.message });
  }
});

(async () => {
  if (hasDatabase) {
    try {
      await ensureSchema();
      console.log('✅ Postgres connected, schema ready.');
    } catch (e) {
      console.error('❌ Postgres bootstrap failed:', e.message);
    }
  } else {
    console.log('ℹ️  No DATABASE_URL set — using in-memory session store. Tokens will not persist across restarts.');
  }

  app.listen(PORT, () => {
    console.log(`LinkedIn API Showcase running at http://localhost:${PORT}`);
    if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
      console.warn(
        '⚠️  LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET not set. Copy .env.example to .env and fill them in.'
      );
    }
  });
})();
