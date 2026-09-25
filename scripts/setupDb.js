// scripts/setupDb.js
// Applies db/schema.sql to the database configured in DATABASE_URL.
// Run with: npm run db:setup

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is not set. Copy .env.example to .env first.");
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log("🔧 Applying schema.sql...");
    await pool.query(schemaSql);
    console.log("✅ Schema applied successfully. Tables: events, incidents, incident_events.");
  } catch (err) {
    console.error("❌ Failed to apply schema:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
