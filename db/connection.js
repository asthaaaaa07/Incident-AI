// db/connection.js
// Central PostgreSQL connection pool. Every other file that needs the
// database imports { pool, query } from here instead of creating its own
// connection, so we only ever have one pool for the whole app.

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  // Fail loudly and early rather than letting every query fail mysteriously.
  console.error(
    "❌ DATABASE_URL is not set. Copy .env.example to .env and fill in your PostgreSQL connection string."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Log unexpected errors on idle clients instead of crashing the process.
pool.on("error", (err) => {
  console.error("❌ Unexpected PostgreSQL pool error:", err.message);
});

/**
 * Run a parameterized query against the pool.
 * Always use $1, $2, ... placeholders — never string-concatenate values
 * into SQL, to avoid SQL injection.
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Simple connectivity check used by GET /health.
 * Returns true/false instead of throwing, so /health never crashes the server.
 */
async function checkConnection() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (err) {
    console.error("❌ Database connectivity check failed:", err.message);
    return false;
  }
}

module.exports = { pool, query, checkConnection };
