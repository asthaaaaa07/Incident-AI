// routes/events.js
const express = require("express");
const router = express.Router();

const { getEvents, getEventById } = require("../services/eventService");
const { parsePagination } = require("../utils/validation");

// GET /events?page=1&limit=20&repository=&event_type=&branch=&from=&to=
router.get("/", async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { repository, event_type: eventType, branch, from, to } = req.query;

    const result = await getEvents({
      page,
      limit,
      offset,
      repository: repository || null,
      eventType: eventType || null,
      branch: branch || null,
      from: from || null,
      to: to || null,
    });

    res.json({
      data: result.events,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      },
    });
  } catch (err) {
    console.error("❌ GET /events failed:", err.message);
    res.status(500).json({ error: "Failed to fetch events." });
  }
});

// GET /events/:id
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Event id must be an integer." });
    }

    const event = await getEventById(id);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    res.json({ data: event });
  } catch (err) {
    console.error("❌ GET /events/:id failed:", err.message);
    res.status(500).json({ error: "Failed to fetch event." });
  }
});

module.exports = router;
