// services/eventService.js
// Turns raw GitHub webhook payloads into a normalized shape and persists them.

const { query } = require("../db/connection");
const { sanitizeText } = require("../utils/validation");

/**
 * Normalizes a GitHub 'push' event payload into our internal event shape.
 * Uses optional chaining throughout because GitHub payloads can be missing
 * fields (e.g. a branch delete push has no head_commit).
 */
function normalizePushEvent(payload, deliveryId) {
  const commitCount = Array.isArray(payload.commits) ? payload.commits.length : 0;

  return {
    event_type: "push",
    repository_name: payload.repository?.full_name ?? "unknown/unknown",
    repository_url: payload.repository?.html_url ?? null,
    author: payload.pusher?.name ?? payload.sender?.login ?? "unknown",
    branch: payload.ref ? payload.ref.replace("refs/heads/", "") : null,
    commit_sha: payload.head_commit?.id ?? payload.after ?? null,
    commit_message: sanitizeText(payload.head_commit?.message ?? ""),
    commit_count: commitCount,
    delivery_id: deliveryId ?? null,
    occurred_at: payload.head_commit?.timestamp
      ? new Date(payload.head_commit.timestamp)
      : new Date(),
    raw_payload: payload,
  };
}

/**
 * Normalizes any other supported GitHub event type generically.
 * This keeps the door open for 'deployment', 'deployment_status',
 * 'pull_request', etc. without hardcoding push-only assumptions.
 */
function normalizeGenericEvent(eventType, payload, deliveryId) {
  return {
    event_type: eventType,
    repository_name: payload.repository?.full_name ?? "unknown/unknown",
    repository_url: payload.repository?.html_url ?? null,
    author: payload.sender?.login ?? "unknown",
    branch: payload.ref ? String(payload.ref).replace("refs/heads/", "") : null,
    commit_sha: null,
    commit_message: null,
    commit_count: 0,
    delivery_id: deliveryId ?? null,
    occurred_at: new Date(),
    raw_payload: payload,
  };
}

/**
 * Inserts an event, skipping insertion if we've already stored this exact
 * GitHub delivery (handles GitHub's automatic webhook retries).
 * Returns { event, wasDuplicate }.
 */
async function saveEvent(normalizedEvent) {
  // If GitHub retries a delivery, delivery_id will already exist in the
  // unique partial index, so ON CONFLICT DO NOTHING silently skips the
  // duplicate insert instead of throwing.
  const result = await query(
    `INSERT INTO events (
       event_type, repository_name, repository_url, author, branch,
       commit_sha, commit_message, commit_count, delivery_id,
       occurred_at, raw_payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (delivery_id) WHERE delivery_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [
      normalizedEvent.event_type,
      normalizedEvent.repository_name,
      normalizedEvent.repository_url,
      normalizedEvent.author,
      normalizedEvent.branch,
      normalizedEvent.commit_sha,
      normalizedEvent.commit_message,
      normalizedEvent.commit_count,
      normalizedEvent.delivery_id,
      normalizedEvent.occurred_at,
      normalizedEvent.raw_payload,
    ]
  );

  if (result.rows.length === 0) {
    // Conflict happened -> duplicate delivery. Fetch the existing row so
    // callers (e.g. incident detection) still have something to work with.
    const existing = await query(
      "SELECT * FROM events WHERE delivery_id = $1",
      [normalizedEvent.delivery_id]
    );
    return { event: existing.rows[0] ?? null, wasDuplicate: true };
  }

  return { event: result.rows[0], wasDuplicate: false };
}

async function getEvents({ page, limit, offset, repository, eventType, branch, from, to }) {
  const conditions = [];
  const params = [];

  if (repository) {
    params.push(repository);
    conditions.push(`repository_name = $${params.length}`);
  }
  if (eventType) {
    params.push(eventType);
    conditions.push(`event_type = $${params.length}`);
  }
  if (branch) {
    params.push(branch);
    conditions.push(`branch = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conditions.push(`occurred_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`occurred_at <= $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM events ${whereClause}`,
    params
  );

  params.push(limit);
  params.push(offset);
  const rowsResult = await query(
    `SELECT * FROM events ${whereClause}
     ORDER BY occurred_at DESC, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    events: rowsResult.rows,
    total: countResult.rows[0].total,
    page,
    limit,
  };
}

async function getEventById(id) {
  const result = await query("SELECT * FROM events WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

/**
 * Returns recent events for a repository within a time window (minutes),
 * used by the incident detection rules to look for repeated failures.
 */
async function getRecentEventsForRepository(repositoryName, windowMinutes) {
  const result = await query(
    `SELECT * FROM events
     WHERE repository_name = $1
       AND occurred_at >= now() - ($2 || ' minutes')::interval
     ORDER BY occurred_at DESC`,
    [repositoryName, windowMinutes]
  );
  return result.rows;
}

module.exports = {
  normalizePushEvent,
  normalizeGenericEvent,
  saveEvent,
  getEvents,
  getEventById,
  getRecentEventsForRepository,
};
