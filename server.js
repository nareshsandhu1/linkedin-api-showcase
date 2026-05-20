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
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PRODUCTION, // requires HTTPS in production
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
    if ((tokenData.scope || '').includes('openid') || (tokenData.scope || '').includes('profile')) {
      try {
        const userRes = await fetch(USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (userRes.ok) {
          req.session.profile = await userRes.json();
        }
      } catch (_) {
        /* non-fatal */
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

  res.render('product-detail', {
    product,
    example: PRODUCT_EXAMPLES[product.name] || null,
    token: req.session.token,
    profile: req.session.profile,
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.listen(PORT, () => {
  console.log(`LinkedIn API Showcase running at http://localhost:${PORT}`);
  if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
    console.warn(
      '⚠️  LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET not set. Copy .env.example to .env and fill them in.'
    );
  }
});
