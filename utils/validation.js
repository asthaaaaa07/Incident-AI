// utils/validation.js
// Small, dependency-free validation helpers used across routes.

const ALLOWED_INCIDENT_STATUSES = ["open", "investigating", "resolved", "ignored"];
const ALLOWED_SEVERITIES = ["low", "medium", "high"];

/**
 * Parses pagination query params safely, with sane defaults and bounds.
 */
function parsePagination(query) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100; // guard against someone requesting huge pages

  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function isValidStatus(status) {
  return ALLOWED_INCIDENT_STATUSES.includes(status);
}

function isValidSeverity(severity) {
  return ALLOWED_SEVERITIES.includes(severity);
}

/**
 * Validates a GitHub push payload has the minimum fields we need.
 * GitHub payloads can vary, so we check defensively with optional chaining
 * rather than assuming every field exists.
 */
function isUsableGithubPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  // A push event should at least reference a repository.
  return Boolean(payload.repository?.full_name);
}

/**
 * Basic sanitization: strips control characters and caps length.
 * Real HTML-escaping happens on the frontend when rendering into the DOM,
 * but trimming/limiting here avoids storing absurdly large junk strings.
 */
function sanitizeText(value, maxLength = 2000) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return cleaned.slice(0, maxLength);
}

module.exports = {
  ALLOWED_INCIDENT_STATUSES,
  ALLOWED_SEVERITIES,
  parsePagination,
  isValidStatus,
  isValidSeverity,
  isUsableGithubPayload,
  sanitizeText,
};
