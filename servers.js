// servers.js
// Entry point. Keeps this file thin — routing logic lives in routes/,
// business logic lives in services/, so this file just wires everything up.

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const { checkConnection } = require("./db/connection");
const webhookRoutes = require("./routes/webhook");
const eventRoutes = require("./routes/events");
const incidentRoutes = require("./routes/incidents");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// We need the RAW request body (not just the parsed JSON) to verify GitHub's
// X-Hub-Signature-256 header, so we capture it here via a verify callback
// before express.json() parses it into an object.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Serve the frontend dashboard.
app.use(express.static(path.join(__dirname, "public")));

// --- Health ---
app.get("/", (req, res) => {
  res.send("Incident-AI server is running.");
});

app.get("/health", async (req, res) => {
  const dbConnected = await checkConnection();
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "degraded",
    database: dbConnected ? "connected" : "unavailable",
    timestamp: new Date().toISOString(),
  });
});

// --- Feature routes ---
app.use("/webhook", webhookRoutes);
app.use("/events", eventRoutes);
app.use("/incidents", incidentRoutes);

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// --- Error handling middleware ---
// Catches JSON parsing errors (malformed request bodies) and anything else
// that gets passed to next(err), so the server never crashes on bad input.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    console.warn("⚠️  Received malformed JSON body.");
    return res.status(400).json({ error: "Malformed JSON in request body." });
  }
  console.error("❌ Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`🚀 Incident-AI server running on http://localhost:${PORT}`);
  console.log(`   Dashboard: http://localhost:${PORT}`);
  console.log(`   Webhook endpoint: POST http://localhost:${PORT}/webhook/github`);
});

// Prevent unhandled promise rejections (e.g. a stray DB error) from
// silently crashing the process without a log message.
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled promise rejection:", reason);
});
