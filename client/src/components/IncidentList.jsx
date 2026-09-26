import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";

function formatRelativeTime(isoString) {
  if (!isoString) return "unknown time";
  const date = new Date(isoString);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toLocaleString();
}

function IncidentRow({ incident, onOpen }) {
  return (
    <li
      className={`incident-row sev-border-${incident.severity}`}
      tabIndex={0}
      role="button"
      onClick={() => onOpen(incident.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(incident.id);
        }
      }}
      aria-label={`Open incident: ${incident.title}`}
    >
      <div className="incident-row-top">
        <span className="incident-title">{incident.title}</span>
        <span className={`sev-label sev-${incident.severity}`}>{incident.severity}</span>
      </div>
      <p className="incident-reason">{incident.detection_reason}</p>
      <div className="incident-meta">
        <span className={`status-label status-${incident.status}`}>{incident.status}</span>
        <span>{incident.repository_name}</span>
        <span className="mono-detail">{formatRelativeTime(incident.detected_at)}</span>
      </div>
    </li>
  );
}

export default function IncidentList({ onOpenIncident, refreshSignal }) {
  const [incidents, setIncidents] = useState(null);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ severity: "", status: "" });

  const load = useCallback(async (activeFilters) => {
    setError(null);
    try {
      const resp = await api.getIncidents({ limit: 30, ...activeFilters });
      setIncidents(resp.data);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load(filters);
    const interval = setInterval(() => load(filters), 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, refreshSignal]);

  return (
    <section className="panel" aria-labelledby="incidents-heading">
      <div className="panel-header">
        <h2 id="incidents-heading">Incidents</h2>
      </div>

      <div className="filter-row">
        <select
          className="filter-select"
          aria-label="Filter by severity"
          value={filters.severity}
          onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
        >
          <option value="">All severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <select
          className="filter-select"
          aria-label="Filter by status"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
          <option value="ignored">Ignored</option>
        </select>
      </div>

      {incidents === null && !error && <p className="state-text">Loading incidents…</p>}

      {error && <p className="state-text state-error">Couldn't load incidents: {error}</p>}

      {incidents && incidents.length === 0 && !error && (
        <p className="state-text">No incidents detected. Nothing to review right now.</p>
      )}

      {incidents && incidents.length > 0 && (
        <ul className="incident-list">
          {incidents.map((incident) => (
            <IncidentRow key={incident.id} incident={incident} onOpen={onOpenIncident} />
          ))}
        </ul>
      )}
    </section>
  );
}
