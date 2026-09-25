// services/incidentService.js
// Transparent, rule-based incident detection. No ML, no fake "confidence
// scores" — every incident records exactly which rule triggered it and why,
// so a human can review and judge it.

const { query } = require("../db/connection");
const { getRecentEventsForRepository } = require("./eventService");

// --- Configuration (kept simple and readable rather than over-engineered) ---
const FAILURE_KEYWORDS = [
  "fix crash",
  "hotfix",
  "rollback",
  "production issue",
  "outage",
  "revert",
];
const REPEATED_FAILURE_WINDOW_MINUTES = 60;
const REPEATED_FAILURE_THRESHOLD = 3; // 3+ failure-keyword commits in the window
const REPEATED_CHANGES_WINDOW_MINUTES = 15;
const REPEATED_CHANGES_THRESHOLD = 5; // 5+ pushes to the same repo in the window

/**
 * Rule A: does the commit message contain a failure-related keyword?
 * This is an indicator, not proof — it just means a human used language
 * that often correlates with fixing something broken.
 */
function matchesFailureKeyword(commitMessage) {
  if (!commitMessage) return null;
  const lower = commitMessage.toLowerCase();
  const hit = FAILURE_KEYWORDS.find((kw) => lower.includes(kw));
  return hit ?? null;
}

/**
 * Runs all detection rules against a newly-saved event and creates an
 * incident if a rule triggers. Returns the created incident, or null if
 * nothing triggered.
 */
async function detectIncidentsForEvent(event) {
  if (!event) return null;

  // Only push events carry commit messages today; other event types will
  // plug into Rule D once deployment/CI events are integrated.
  if (event.event_type === "push") {
    // Rule A: failure keyword in this specific commit.
    const keyword = matchesFailureKeyword(event.commit_message);
    if (keyword) {
      return createIncidentIfNotDuplicate({
        title: `Possible failure-related commit in ${event.repository_name}`,
        description: `Commit message matched the keyword "${keyword}".`,
        severity: "medium",
        repository_name: event.repository_name,
        first_event_id: event.id,
        detection_rule: "RULE_A_FAILURE_KEYWORD",
        detection_reason: `Rule A triggered: commit message contains failure-indicator keyword "${keyword}". This is an indicator, not confirmed proof of an incident — please review.`,
        relatedEventIds: [event.id],
      });
    }

    // Rule B: repeated failure-keyword commits within a short time window.
    const recentEvents = await getRecentEventsForRepository(
      event.repository_name,
      REPEATED_FAILURE_WINDOW_MINUTES
    );
    const recentFailureEvents = recentEvents.filter((e) =>
      matchesFailureKeyword(e.commit_message)
    );
    if (recentFailureEvents.length >= REPEATED_FAILURE_THRESHOLD) {
      return createIncidentIfNotDuplicate({
        title: `Repeated failure indicators in ${event.repository_name}`,
        description: `${recentFailureEvents.length} commits with failure-related keywords in the last ${REPEATED_FAILURE_WINDOW_MINUTES} minutes.`,
        severity: "high",
        repository_name: event.repository_name,
        first_event_id: recentFailureEvents[recentFailureEvents.length - 1].id,
        detection_rule: "RULE_B_REPEATED_FAILURES",
        detection_reason: `Rule B triggered: ${recentFailureEvents.length} failure-keyword commits within ${REPEATED_FAILURE_WINDOW_MINUTES} minutes (threshold: ${REPEATED_FAILURE_THRESHOLD}). This is an indicator of instability, not a confirmed incident — please review.`,
        relatedEventIds: recentFailureEvents.map((e) => e.id),
      });
    }

    // Rule C: unusually frequent pushes to the same repo, regardless of message.
    const recentPushes = recentEvents.filter((e) => e.event_type === "push");
    const windowRecentPushes = await getRecentEventsForRepository(
      event.repository_name,
      REPEATED_CHANGES_WINDOW_MINUTES
    );
    const pushesInShortWindow = windowRecentPushes.filter((e) => e.event_type === "push");
    if (pushesInShortWindow.length >= REPEATED_CHANGES_THRESHOLD) {
      return createIncidentIfNotDuplicate({
        title: `Unusually frequent changes in ${event.repository_name}`,
        description: `${pushesInShortWindow.length} pushes within the last ${REPEATED_CHANGES_WINDOW_MINUTES} minutes.`,
        severity: "low",
        repository_name: event.repository_name,
        first_event_id: pushesInShortWindow[pushesInShortWindow.length - 1].id,
        detection_rule: "RULE_C_REPEATED_CHANGES",
        detection_reason: `Rule C triggered: ${pushesInShortWindow.length} pushes within ${REPEATED_CHANGES_WINDOW_MINUTES} minutes (threshold: ${REPEATED_CHANGES_THRESHOLD}). This only flags an unusual rate of change — it is not evidence of a failure on its own.`,
        relatedEventIds: pushesInShortWindow.map((e) => e.id),
      });
    }
  }

  // Rule D placeholder: once 'deployment_status' events are integrated, check
  // their actual `state` field (e.g. 'failure', 'error') here rather than
  // guessing from push data.

  return null;
}

/**
 * Avoids creating duplicate open incidents for the same rule + repository.
 * If a matching open/investigating incident already exists, we link the new
 * event to it instead of creating a fresh incident.
 */
async function createIncidentIfNotDuplicate(incidentData) {
  const existing = await query(
    `SELECT * FROM incidents
     WHERE repository_name = $1
       AND detection_rule = $2
       AND status IN ('open', 'investigating')
     ORDER BY created_at DESC
     LIMIT 1`,
    [incidentData.repository_name, incidentData.detection_rule]
  );

  if (existing.rows.length > 0) {
    const incident = existing.rows[0];
    await linkEventsToIncident(incident.id, incidentData.relatedEventIds);
    return incident;
  }

  const result = await query(
    `INSERT INTO incidents (
       title, description, severity, status, repository_name,
       first_event_id, detection_rule, detection_reason
     ) VALUES ($1,$2,$3,'open',$4,$5,$6,$7)
     RETURNING *`,
    [
      incidentData.title,
      incidentData.description,
      incidentData.severity,
      incidentData.repository_name,
      incidentData.first_event_id,
      incidentData.detection_rule,
      incidentData.detection_reason,
    ]
  );

  const incident = result.rows[0];
  await linkEventsToIncident(incident.id, incidentData.relatedEventIds);
  return incident;
}

async function linkEventsToIncident(incidentId, eventIds = []) {
  for (const eventId of eventIds) {
    await query(
      `INSERT INTO incident_events (incident_id, event_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [incidentId, eventId]
    );
  }
}

async function getIncidents({ page, limit, offset, repository, severity, status }) {
  const conditions = [];
  const params = [];

  if (repository) {
    params.push(repository);
    conditions.push(`repository_name = $${params.length}`);
  }
  if (severity) {
    params.push(severity);
    conditions.push(`severity = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM incidents ${whereClause}`,
    params
  );

  params.push(limit);
  params.push(offset);
  const rowsResult = await query(
    `SELECT * FROM incidents ${whereClause}
     ORDER BY detected_at DESC, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    incidents: rowsResult.rows,
    total: countResult.rows[0].total,
    page,
    limit,
  };
}

async function getIncidentById(id) {
  const incidentResult = await query("SELECT * FROM incidents WHERE id = $1", [id]);
  const incident = incidentResult.rows[0];
  if (!incident) return null;

  const eventsResult = await query(
    `SELECT e.* FROM events e
     JOIN incident_events ie ON ie.event_id = e.id
     WHERE ie.incident_id = $1
     ORDER BY e.occurred_at DESC`,
    [id]
  );

  return { ...incident, related_events: eventsResult.rows };
}

async function updateIncidentStatus(id, status) {
  const resolvedAt = status === "resolved" ? new Date() : null;
  const result = await query(
    `UPDATE incidents
     SET status = $1,
         resolved_at = CASE WHEN $1 = 'resolved' THEN now() ELSE resolved_at END,
         updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );
  return result.rows[0] ?? null;
}

async function getIncidentSummary() {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'open')::int AS open,
       COUNT(*) FILTER (WHERE status = 'investigating')::int AS investigating,
       COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
       COUNT(*) FILTER (WHERE status = 'ignored')::int AS ignored,
       COUNT(*) FILTER (WHERE severity = 'high' AND status IN ('open','investigating'))::int AS high_severity_open
     FROM incidents`
  );
  return result.rows[0];
}

module.exports = {
  detectIncidentsForEvent,
  getIncidents,
  getIncidentById,
  updateIncidentStatus,
  getIncidentSummary,
};
