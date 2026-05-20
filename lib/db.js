/**
 * Postgres connection pool + schema bootstrap.
 *
 * Falls back gracefully when DATABASE_URL is not set (local dev): the app
 * keeps working with in-memory session storage and no token persistence.
 */
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || null;

let pool = null;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    // Render's managed Postgres requires SSL; local Postgres usually doesn't.
    ssl: DATABASE_URL.includes('render.com') || process.env.PGSSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
  });

  pool.on('error', (err) => {
    console.error('Unexpected Postgres error:', err);
  });
}

async function ensureSchema() {
  if (!pool) return;
  // Sessions table (managed by connect-pg-simple).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid"    varchar      NOT NULL COLLATE "default",
      "sess"   json         NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);

  // Token storage keyed by LinkedIn member sub (or random UUID for legacy scopes).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS linkedin_tokens (
      user_id          text PRIMARY KEY,
      access_token     text        NOT NULL,
      refresh_token    text,
      scope            text,
      access_expires_at  timestamptz NOT NULL,
      refresh_expires_at timestamptz,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    );
  `);
}

module.exports = { pool, ensureSchema, hasDatabase: Boolean(pool) };
