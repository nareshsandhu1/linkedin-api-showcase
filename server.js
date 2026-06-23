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
    const entries = SCOPE_CATALOG[scope];
    if (!entries || entries.length === 0) {
      unknownScopes.push(scope);
      continue;
    }
    for (const entry of entries) {
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
      // Avoid duplicate scope rows when one scope maps to multiple products
      // and the same scope is granted multiple times in the token.
      if (!product.scopes.some((s) => s.name === scope && s.description === entry.description)) {
        product.scopes.push({ name: scope, description: entry.description });
      }
      for (const ep of entry.endpoints) {
        product.endpoints.set(`${ep.method} ${ep.path}`, ep);
      }
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

async function resolveAccessToken(req) {
  try {
    return await getValidAccessToken(req, {
      clientId: LINKEDIN_CLIENT_ID,
      clientSecret: LINKEDIN_CLIENT_SECRET,
    });
  } catch (err) {
    if (req.session.token && req.session.token.access_token) {
      return req.session.token.access_token;
    }
    throw err;
  }
}

async function linkedinRequest(req, url, options = {}) {
  const accessToken = await resolveAccessToken(req);
  const parsed = new URL(url);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
    ...(options.headers || {}),
  };

  if (parsed.pathname.startsWith('/rest/') && !headers['LinkedIn-Version']) {
    headers['LinkedIn-Version'] = process.env.LINKEDIN_API_VERSION || '202506';
  }

  const response = await fetch(parsed.toString(), {
    method: options.method || 'GET',
    headers,
    body: options.body,
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const error = new Error(`LinkedIn API request failed with ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

async function fetchAccessibleAdAccounts(req) {
  const body = await linkedinRequest(
    req,
    'https://api.linkedin.com/rest/adAccounts?q=search&search=(status:(values:List(ACTIVE,CANCELED,DRAFT,PENDING_DELETION,REMOVED)))'
  );
  return Array.isArray(body && body.elements) ? body.elements : [];
}

async function fetchAccountConversions(req, accountUrn) {
  const url =
    'https://api.linkedin.com/rest/conversions?q=account' +
    `&account=${encodeURIComponent(accountUrn)}`;
  const body = await linkedinRequest(req, url);
  return Array.isArray(body && body.elements) ? body.elements : [];
}

async function fetchCampaignMap(req, accountId, campaignUrns) {
  const uniqueIds = Array.from(
    new Set(
      campaignUrns
        .map((urn) => {
          const match = /urn:li:sponsoredCampaign:(\d+)/.exec(String(urn || ''));
          return match ? match[1] : null;
        })
        .filter(Boolean)
    )
  );

  if (uniqueIds.length === 0) return new Map();

  const url =
    `https://api.linkedin.com/rest/adAccounts/${encodeURIComponent(accountId)}/adCampaigns` +
    `?ids=List(${uniqueIds.map((id) => encodeURIComponent(id)).join(',')})`;
  const body = await linkedinRequest(req, url);
  const results = (body && body.results) || {};
  return new Map(
    Object.entries(results).map(([id, campaign]) => [
      `urn:li:sponsoredCampaign:${id}`,
      campaign,
    ])
  );
}

function normalizeAccountFilter(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('urn:li:sponsoredAccount:')) return trimmed;
  if (/^\d+$/.test(trimmed)) return `urn:li:sponsoredAccount:${trimmed}`;
  return trimmed;
}

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function deriveConversionStatus(conversion) {
  const hasCampaigns = Array.isArray(conversion.associatedCampaigns) && conversion.associatedCampaigns.length > 0;
  const lastSignalAt = conversion.lastCallbackAt || conversion.latestFirstPartyCallbackAt || null;

  if (conversion.enabled === false) {
    return {
      label: 'Inactive',
      tone: 'inactive',
      reason: 'This conversion rule is disabled in LinkedIn, so it is not currently eligible to track or attribute activity.',
    };
  }

  if (!lastSignalAt) {
    return {
      label: 'No Activity Detected',
      tone: 'no-activity',
      reason: hasCampaigns
        ? 'The conversion is enabled and connected to campaign activity, but LinkedIn has not returned a recent callback or activity timestamp for this rule yet.'
        : 'The conversion is enabled, but LinkedIn has not returned any campaign association or callback activity for this rule yet.',
    };
  }

  return {
    label: 'Active',
    tone: 'active',
    reason: hasCampaigns
      ? 'The conversion is enabled, linked to at least one campaign, and LinkedIn has recorded recent activity for the rule.'
      : 'The conversion is enabled and LinkedIn has recorded activity for the rule.',
  };
}

async function fetchAccountCampaigns(req, accountId) {
  const url =
    `https://api.linkedin.com/rest/adAccounts/${encodeURIComponent(accountId)}/adCampaigns` +
    '?q=search' +
    '&search=(status:(values:List(ACTIVE,PAUSED,DRAFT,ARCHIVED,COMPLETED,CANCELED,PENDING_DELETION,REMOVED)))';
  const body = await linkedinRequest(req, url);
  return Array.isArray(body && body.elements) ? body.elements : [];
}

async function fetchCampaignGroupMap(req, accountId, groupUrns) {
  const uniqueIds = Array.from(
    new Set(
      groupUrns
        .map((urn) => {
          const match = /urn:li:sponsoredCampaignGroup:(\d+)/.exec(String(urn || ''));
          return match ? match[1] : null;
        })
        .filter(Boolean)
    )
  );
  if (uniqueIds.length === 0) return new Map();

  const url =
    `https://api.linkedin.com/rest/adAccounts/${encodeURIComponent(accountId)}/adCampaignGroups` +
    `?ids=List(${uniqueIds.map((id) => encodeURIComponent(id)).join(',')})`;
  const body = await linkedinRequest(req, url);
  const results = (body && body.results) || {};
  return new Map(
    Object.entries(results).map(([id, group]) => [
      `urn:li:sponsoredCampaignGroup:${id}`,
      group,
    ])
  );
}

function formatMoney(money) {
  if (!money || money.amount == null) return null;
  const code = money.currencyCode || 'USD';
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return `${money.amount} ${code}`;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

const CAMPAIGN_HOLD_STATUSES = new Set([
  'ACCOUNT_SERVING_HOLD',
  'CAMPAIGN_SERVING_HOLD',
  'CAMPAIGN_GROUP_SERVING_HOLD',
  'BILLING_HOLD',
  'STOPPED',
]);

function deriveCampaignStatus(campaign) {
  const status = String(campaign.status || '').toUpperCase();
  const servingStatuses = Array.isArray(campaign.servingStatuses) ? campaign.servingStatuses : [];

  if (status === 'DRAFT') {
    return {
      label: 'Draft',
      tone: 'draft',
      reason: 'Campaign is in draft and is not yet eligible to serve. Activate it from Campaign Manager to begin delivery.',
    };
  }
  if (status === 'PAUSED') {
    return {
      label: 'Paused',
      tone: 'paused',
      reason: 'Campaign is paused. It will resume serving once status is set back to ACTIVE.',
    };
  }
  if (status === 'ARCHIVED') {
    return {
      label: 'Archived',
      tone: 'inactive',
      reason: 'Campaign is archived and no longer serves impressions.',
    };
  }
  if (status === 'COMPLETED') {
    return {
      label: 'Completed',
      tone: 'inactive',
      reason: 'Campaign has finished its run and is no longer eligible to serve.',
    };
  }
  if (status === 'CANCELED') {
    return {
      label: 'Canceled',
      tone: 'inactive',
      reason: 'Campaign was canceled before its run completed.',
    };
  }
  if (status === 'REMOVED' || status === 'PENDING_DELETION') {
    return {
      label: status === 'REMOVED' ? 'Removed' : 'Pending deletion',
      tone: 'inactive',
      reason: 'Campaign has been removed (or is queued for deletion) and is not visible in Campaign Manager.',
    };
  }

  // status === 'ACTIVE' (or unknown — treat like active for diagnostics)
  const holds = servingStatuses.filter((s) => CAMPAIGN_HOLD_STATUSES.has(s));
  if (holds.length > 0) {
    return {
      label: 'On hold',
      tone: 'no-activity',
      reason: `Campaign is marked ACTIVE but LinkedIn is not serving it due to: ${holds.join(', ')}.`,
    };
  }
  if (servingStatuses.includes('RUNNABLE')) {
    return {
      label: 'Running',
      tone: 'active',
      reason: 'Campaign is ACTIVE and LinkedIn reports it is currently eligible to serve impressions.',
    };
  }
  return {
    label: 'Active',
    tone: 'scheduled',
    reason: servingStatuses.length
      ? `Campaign is ACTIVE. Current serving statuses: ${servingStatuses.join(', ')}.`
      : 'Campaign is ACTIVE but LinkedIn has not reported a serving status yet.',
  };
}

function buildCampaignSummary(campaign, groupMap) {
  const status = deriveCampaignStatus(campaign);
  const runSchedule = campaign.runSchedule || {};
  const group = campaign.campaignGroup ? groupMap.get(campaign.campaignGroup) || null : null;

  return {
    id: campaign.id,
    urn: `urn:li:sponsoredCampaign:${campaign.id}`,
    name: campaign.name || `Campaign ${campaign.id}`,
    type: campaign.type || 'Unknown',
    format: campaign.format || null,
    objective: campaign.objectiveType || null,
    optimizationTarget: campaign.optimizationTargetType || null,
    costType: campaign.costType || null,
    dailyBudget: formatMoney(campaign.dailyBudget),
    totalBudget: formatMoney(campaign.totalBudget),
    unitCost: formatMoney(campaign.unitCost),
    locale:
      campaign.locale && campaign.locale.language
        ? `${campaign.locale.language}_${campaign.locale.country || ''}`.replace(/_$/, '')
        : null,
    rawStatus: campaign.status || null,
    servingStatuses: Array.isArray(campaign.servingStatuses) ? campaign.servingStatuses : [],
    status,
    createdAt: formatDateTime(campaign.created),
    updatedAt: formatDateTime(campaign.lastModified),
    runStart: formatDateTime(runSchedule.start),
    runEnd: formatDateTime(runSchedule.end),
    group: {
      urn: campaign.campaignGroup || null,
      name: (group && group.name) || campaign.campaignGroup || null,
      status: (group && group.status) || null,
    },
    audienceExpansion: campaign.audienceExpansionEnabled === true,
    offsiteDelivery: campaign.offsiteDeliveryEnabled === true,
  };
}

function summarizeCampaignList(rows) {
  return {
    total: rows.length,
    running: rows.filter((r) => r.status.label === 'Running').length,
    paused: rows.filter((r) => r.status.label === 'Paused').length,
    draft: rows.filter((r) => r.status.label === 'Draft').length,
    onHold: rows.filter((r) => r.status.label === 'On hold').length,
    inactive: rows.filter((r) => r.status.tone === 'inactive').length,
  };
}

function buildConversionSummary(conversion, campaignMap) {
  const status = deriveConversionStatus(conversion);
  const associatedCampaigns = Array.isArray(conversion.associatedCampaigns)
    ? conversion.associatedCampaigns
    : [];

  const campaignRows = associatedCampaigns.map((association) => {
    const campaignUrn = association.campaign;
    const campaign = campaignMap.get(campaignUrn) || null;
    return {
      urn: campaignUrn,
      name: (campaign && campaign.name) || campaignUrn,
      status: (campaign && campaign.status) || null,
      servingStatuses: (campaign && campaign.servingStatuses) || [],
      associatedAt: formatDateTime(association.associatedAt),
    };
  });

  return {
    id: conversion.id,
    urn: `urn:lla:llaPartnerConversion:${conversion.id}`,
    name: conversion.name || `Conversion ${conversion.id}`,
    type: conversion.type || 'Unknown',
    conversionMethod: conversion.conversionMethod || 'INSIGHT_TAG',
    enabled: conversion.enabled !== false,
    status,
    campaignRows,
    campaignCount: campaignRows.length,
    createdAt: formatDateTime(conversion.created),
    updatedAt: formatDateTime(conversion.lastModified),
    lastSignalAt: formatDateTime(conversion.lastCallbackAt || conversion.latestFirstPartyCallbackAt),
    urlRules: Array.isArray(conversion.urlRules) ? conversion.urlRules : [],
  };
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

    // Exchange the code with a couple of retries on 5xx, since LinkedIn's
    // token endpoint occasionally returns transient gateway errors with an
    // empty body. Retries are safe: the authorization code is unchanged and is
    // only consumed once the exchange actually succeeds. We also retry on 429
    // (rate limiting), which LinkedIn returns intermittently with an empty body.
    let tokenRes;
    let rawToken;
    for (let attempt = 1; attempt <= 3; attempt++) {
      tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      // Read the raw text first so we can surface a useful message instead of
      // throwing "Unexpected end of JSON input" on an empty/non-JSON body.
      rawToken = await tokenRes.text();
      const retryable = tokenRes.status >= 500 || tokenRes.status === 429;
      if (!retryable || attempt === 3) break;
      // Honor a small Retry-After hint when present, else exponential-ish backoff.
      const retryAfter = Number(tokenRes.headers.get('retry-after'));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 5
          ? retryAfter * 1000
          : 500 * attempt;
      await new Promise((r) => setTimeout(r, waitMs));
    }

    let tokenData;
    try {
      tokenData = rawToken ? JSON.parse(rawToken) : {};
    } catch (_) {
      return res.status(502).render('error', {
        title: 'Token exchange failed',
        message:
          `LinkedIn returned a ${tokenRes.status} response that was not valid JSON.\n\n` +
          `This usually means the authorization code was already used (codes are ` +
          `single-use — don't refresh the callback page) or LinkedIn had a ` +
          `temporary error. Please start the sign-in flow again.\n\n` +
          `Raw response:\n${rawToken || '(empty body)'}`,
      });
    }
    if (tokenRes.status === 429) {
      return res.status(429).render('error', {
        title: 'LinkedIn is rate limiting sign-in',
        message:
          'LinkedIn returned HTTP 429 (Too Many Requests) for the token ' +
          'exchange. This is a temporary rate limit on LinkedIn’s side — it is ' +
          'not a configuration problem with this app.\n\n' +
          'Please wait a few seconds and click “Sign in with LinkedIn” again.',
      });
    }
    if (!tokenRes.ok || !tokenData.access_token) {
      const contentType = tokenRes.headers.get('content-type') || '(none)';
      return res.status(tokenRes.status || 502).render('error', {
        title: 'Token exchange failed',
        message:
          `HTTP status: ${tokenRes.status} ${tokenRes.statusText}\n` +
          `Content-Type: ${contentType}\n` +
          `Redirect URI sent: ${LINKEDIN_REDIRECT_URI}\n\n` +
          `Response body:\n${rawToken || '(empty body)'}\n\n` +
          `An empty body with a 400/401 status almost always means the ` +
          `redirect_uri sent above does not exactly match an Authorized redirect ` +
          `URL on your LinkedIn app, or the client ID/secret are wrong. A 2xx ` +
          `with no token means the authorization code was already used — start ` +
          `sign-in again.`,
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

app.get('/conversion-status', async (req, res) => {
  if (!req.session.token && !req.session.userId) return res.redirect('/');

  const selectedAccount = normalizeAccountFilter(req.query.accountId);

  if (!selectedAccount) {
    return res.render('conversion-status', {
      token: req.session.token,
      profile: req.session.profile,
      selectedAccount: null,
      accountGroups: [],
      warnings: [],
    });
  }

  const accountId = selectedAccount.replace('urn:li:sponsoredAccount:', '');

  try {
    const warnings = [];
    let conversions = [];

    try {
      conversions = await fetchAccountConversions(req, selectedAccount);
    } catch (err) {
      throw err;
    }

    const campaignUrns = conversions.flatMap((conversion) =>
      Array.isArray(conversion.associatedCampaigns)
        ? conversion.associatedCampaigns.map((association) => association.campaign)
        : []
    );

    let campaignMap = new Map();
    try {
      campaignMap = await fetchCampaignMap(req, accountId, campaignUrns);
    } catch (err) {
      warnings.push(
        `Could not load campaign names for account ${accountId}: ${JSON.stringify(err.body || err.message)}`
      );
    }

    const rows = conversions
      .map((conversion) => buildConversionSummary(conversion, campaignMap))
      .sort((left, right) => left.name.localeCompare(right.name));

    const accountGroups = [
      {
        account: {
          id: accountId,
          urn: selectedAccount,
          name: `Account ${accountId}`,
          status: null,
          currency: null,
        },
        summary: {
          total: rows.length,
          active: rows.filter((row) => row.status.label === 'Active').length,
          inactive: rows.filter((row) => row.status.label === 'Inactive').length,
          noActivity: rows.filter((row) => row.status.label === 'No Activity Detected').length,
        },
        conversions: rows,
      },
    ];

    res.render('conversion-status', {
      token: req.session.token,
      profile: req.session.profile,
      selectedAccount,
      accountGroups,
      warnings,
    });
  } catch (err) {
    if (err.code === 'NEEDS_REAUTH') {
      return res.redirect('/auth/linkedin');
    }

    res.status(err.status || 500).render('error', {
      title: 'Conversion status unavailable',
      message: typeof err.body === 'string' ? err.body : JSON.stringify(err.body || err.message, null, 2),
    });
  }
});

app.get('/campaigns', async (req, res) => {
  if (!req.session.token && !req.session.userId) return res.redirect('/');

  const selectedAccount = normalizeAccountFilter(req.query.accountId);

  if (!selectedAccount) {
    return res.render('campaigns', {
      token: req.session.token,
      profile: req.session.profile,
      selectedAccount: null,
      accountGroups: [],
      warnings: [],
    });
  }

  const accountId = selectedAccount.replace('urn:li:sponsoredAccount:', '');

  try {
    const warnings = [];
    const campaigns = await fetchAccountCampaigns(req, accountId);

    const groupUrns = campaigns
      .map((c) => c.campaignGroup)
      .filter(Boolean);

    let groupMap = new Map();
    try {
      groupMap = await fetchCampaignGroupMap(req, accountId, groupUrns);
    } catch (err) {
      warnings.push(
        `Could not load campaign group names for account ${accountId}: ${JSON.stringify(err.body || err.message)}`
      );
    }

    const rows = campaigns
      .map((campaign) => buildCampaignSummary(campaign, groupMap))
      .sort((left, right) => left.name.localeCompare(right.name));

    const accountGroups = [
      {
        account: {
          id: accountId,
          urn: selectedAccount,
          name: `Account ${accountId}`,
        },
        summary: summarizeCampaignList(rows),
        campaigns: rows,
      },
    ];

    res.render('campaigns', {
      token: req.session.token,
      profile: req.session.profile,
      selectedAccount,
      accountGroups,
      warnings,
    });
  } catch (err) {
    if (err.code === 'NEEDS_REAUTH') {
      return res.redirect('/auth/linkedin');
    }

    res.status(err.status || 500).render('error', {
      title: 'Campaigns unavailable',
      message: typeof err.body === 'string' ? err.body : JSON.stringify(err.body || err.message, null, 2),
    });
  }
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
      paramSchema: defaults.paramSchema || null,
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
    accessToken = await resolveAccessToken(req);
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
