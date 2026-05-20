/**
 * Token storage + refresh logic.
 *
 * - Persists tokens in Postgres when DATABASE_URL is set.
 * - Refreshes via OAuth refresh_token grant when LinkedIn issued one
 *   (LinkedIn only issues refresh_tokens for partner-program apps).
 * - Returns a helper `getValidAccessToken(req)` that auto-refreshes if
 *   the access token is within 60 seconds of expiry.
 */
const { pool, hasDatabase } = require('./db');

const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

async function saveToken(userId, tokenData) {
  const accessExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
  const refreshExpiresAt = tokenData.refresh_token_expires_in
    ? new Date(Date.now() + tokenData.refresh_token_expires_in * 1000)
    : null;

  if (!hasDatabase) return; // in-memory fallback handled by caller via session

  await pool.query(
    `INSERT INTO linkedin_tokens (user_id, access_token, refresh_token, scope, access_expires_at, refresh_expires_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (user_id) DO UPDATE SET
       access_token       = EXCLUDED.access_token,
       refresh_token      = COALESCE(EXCLUDED.refresh_token, linkedin_tokens.refresh_token),
       scope              = EXCLUDED.scope,
       access_expires_at  = EXCLUDED.access_expires_at,
       refresh_expires_at = COALESCE(EXCLUDED.refresh_expires_at, linkedin_tokens.refresh_expires_at),
       updated_at         = now()`,
    [
      userId,
      tokenData.access_token,
      tokenData.refresh_token || null,
      tokenData.scope || null,
      accessExpiresAt,
      refreshExpiresAt,
    ]
  );
}

async function loadToken(userId) {
  if (!hasDatabase) return null;
  const { rows } = await pool.query(
    `SELECT access_token, refresh_token, scope, access_expires_at, refresh_expires_at
     FROM linkedin_tokens WHERE user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(`Token refresh failed: ${JSON.stringify(data)}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * Returns a fresh access token for the request's session, refreshing
 * automatically if the persisted token is near expiry. Throws an error
 * if the user has no stored token or the refresh fails.
 */
async function getValidAccessToken(req, { clientId, clientSecret, skewSeconds = 60 } = {}) {
  // Path 1: in-memory session token (no DB configured).
  if (!hasDatabase) {
    if (!req.session.token) throw Object.assign(new Error('No token in session'), { code: 'NO_TOKEN' });
    return req.session.token.access_token;
  }

  // Path 2: persisted token, look up by userId stashed in the session.
  const userId = req.session.userId;
  if (!userId) throw Object.assign(new Error('Not authenticated'), { code: 'NO_USER' });

  const stored = await loadToken(userId);
  if (!stored) throw Object.assign(new Error('No stored token for user'), { code: 'NO_TOKEN' });

  const now = Date.now();
  const expiresMs = new Date(stored.access_expires_at).getTime();

  if (expiresMs - now > skewSeconds * 1000) {
    return stored.access_token;
  }

  // Try to refresh if we have a refresh_token.
  if (stored.refresh_token) {
    const refreshed = await refreshAccessToken({
      refreshToken: stored.refresh_token,
      clientId,
      clientSecret,
    });
    await saveToken(userId, refreshed);
    return refreshed.access_token;
  }

  // No refresh_token (typical for non-partner LinkedIn apps): caller must
  // re-authorize the user via the OAuth flow.
  throw Object.assign(new Error('Access token expired and no refresh_token available'), {
    code: 'NEEDS_REAUTH',
  });
}

module.exports = { saveToken, loadToken, refreshAccessToken, getValidAccessToken };
