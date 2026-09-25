-- Incident-AI database schema
-- Run with: psql -U <user> -d incident_ai -f db/schema.sql

-- ============================================================
-- EVENTS TABLE
-- Stores every normalized event received from GitHub webhooks.
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id              SERIAL PRIMARY KEY,
  event_type      TEXT NOT NULL,              -- e.g. 'push' (kept generic so other GitHub events can be added later)
  repository_name TEXT NOT NULL,
  repository_url  TEXT,
  author          TEXT,
  branch          TEXT,
  commit_sha      TEXT,
  commit_message  TEXT,
  commit_count    INTEGER DEFAULT 0,
  delivery_id     TEXT,                       -- GitHub's X-GitHub-Delivery header, used for de-duplication
  occurred_at     TIMESTAMPTZ,                 -- when the event happened on GitHub's side
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(), -- when our server received it
  raw_payload     JSONB,                       -- full original payload for debugging / future use
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A GitHub webhook delivery can be retried by GitHub if our server times out
-- or returns a non-2xx response. delivery_id (X-GitHub-Delivery) is unique
-- per attempt group, so we use it to avoid storing the same event twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_delivery_id
  ON events (delivery_id)
  WHERE delivery_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_repository_name ON events (repository_name);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events (occurred_at DESC);

-- ============================================================
-- INCIDENTS TABLE
-- Stores incidents produced by the rule-based detection engine.
-- ============================================================
CREATE TABLE IF NOT EXISTS incidents (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  severity        TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high')),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'ignored')),
  repository_name TEXT NOT NULL,
  first_event_id  INTEGER REFERENCES events(id) ON DELETE SET NULL,
  detection_rule  TEXT,                        -- which rule triggered, e.g. 'RULE_A_FAILURE_KEYWORD'
  detection_reason TEXT,                        -- human-readable explanation
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents (severity);
CREATE INDEX IF NOT EXISTS idx_incidents_repository_name ON incidents (repository_name);

-- Join table linking incidents to every event that contributed to them
-- (an incident can be caused by more than one related event, e.g. Rule C).
CREATE TABLE IF NOT EXISTS incident_events (
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  PRIMARY KEY (incident_id, event_id)
);
