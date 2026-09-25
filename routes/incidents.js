// routes/incidents.js
const express = require("express");
const router = express.Router();

const {
  getIncidents,
  getIncidentById,
  updateIncidentStatus,
  getIncidentSummary,
} = require("../services/incidentService");
const { parsePagination, isValidStatus, isValidSeverity } = require("../utils/validation");

// GET /incidents/summary  (used by the dashboard summary cards)
// Declared before /:id so "summary" isn't parsed as an incident id.
router.get("/summary", async (req, res) => {
  try {
    const summary = await getIncidentSummary();
    res.json({ data: summary });
  } catch (err) {
    console.error("❌ GET /incidents/summary failed:", err.message);
    res.status(500).json({ error: "Failed to fetch incident summary." });
  }
});

// GET /incidents?page=&limit=&repository=&severity=&status=
router.get("/", async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { repository, severity, status } = req.query;

    if (severity && !isValidSeverity(severity)) {
      return res.status(400).json({ error: "Invalid severity filter." });
    }
    if (status && !isValidStatus(status)) {
      return res.status(400).json({ error: "Invalid status filter." });
    }

    const result = await getIncidents({
      page,
      limit,
      offset,
      repository: repository || null,
      severity: severity || null,
      status: status || null,
    });

    res.json({
      data: result.incidents,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      },
    });
  } catch (err) {
    console.error("❌ GET /incidents failed:", err.message);
    res.status(500).json({ error: "Failed to fetch incidents." });
  }
});

// GET /incidents/:id
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Incident id must be an integer." });
    }

    const incident = await getIncidentById(id);
    if (!incident) {
      return res.status(404).json({ error: "Incident not found." });
    }

    res.json({ data: incident });
  } catch (err) {
    console.error("❌ GET /incidents/:id failed:", err.message);
    res.status(500).json({ error: "Failed to fetch incident." });
  }
});

// PATCH /incidents/:id/status  { "status": "investigating" }
router.patch("/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Incident id must be an integer." });
    }

    const { status } = req.body ?? {};
    if (!status || !isValidStatus(status)) {
      return res.status(400).json({
        error: "Invalid status. Must be one of: open, investigating, resolved, ignored.",
      });
    }

    const updated = await updateIncidentStatus(id, status);
    if (!updated) {
      return res.status(404).json({ error: "Incident not found." });
    }

    res.json({ data: updated });
  } catch (err) {
    console.error("❌ PATCH /incidents/:id/status failed:", err.message);
    res.status(500).json({ error: "Failed to update incident status." });
  }
});

module.exports = router;
