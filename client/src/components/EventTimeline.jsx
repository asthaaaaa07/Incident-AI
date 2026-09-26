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

function EventRow({ event }) {
  return (
    <li className="event-row">
      <div className="event-row-top">
        <span className="event-row-heading">
          <span className="event-type">{event.event_type}</span>
          <span className="event-repo">{event.repository_name}</span>
        </span>
        <time className="mono-detail" dateTime={event.occurred_at}>
          {formatRelativeTime(event.occurred_at)}
        </time>
      </div>
      {event.commit_message && <p className="event-message">{event.commit_message}</p>}
      <div className="event-meta">
        <span>{event.author || "unknown author"}</span>
        {event.branch && <span className="mono-detail">{event.branch}</span>}
        {event.commit_sha && (
          <span className="mono-detail">{event.commit_sha.slice(0, 7)}</span>
        )}
      </div>
    </li>
  );
}

export default function EventTimeline() {
  const [events, setEvents] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ repository: "", event_type: "", branch: "" });

  const load = useCallback(async (activeFilters) => {
    setError(null);
    try {
      const resp = await api.getEvents({ limit: 30, ...activeFilters });
      setEvents(resp.data);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load(filters);
    const interval = setInterval(() => load(filters), 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  return (
    <section className="panel" aria-labelledby="timeline-heading">
      <div className="panel-header">
        <h2 id="timeline-heading">Event timeline</h2>
      </div>

      <div className="filter-row">
        <input
          type="text"
          placeholder="Repository"
          aria-label="Filter by repository"
          className="filter-input"
          value={filters.repository}
          onChange={(e) => setFilters((f) => ({ ...f, repository: e.target.value }))}
        />
        <input
          type="text"
          placeholder="Branch"
          aria-label="Filter by branch"
          className="filter-input"
          value={filters.branch}
          onChange={(e) => setFilters((f) => ({ ...f, branch: e.target.value }))}
        />
      </div>

      {events === null && !error && <p className="state-text">Loading events…</p>}

      {error && (
        <p className="state-text state-error">
          Couldn't load events: {error}
        </p>
      )}

      {events && events.length === 0 && !error && (
        <p className="state-text">
          No events yet. Push a commit to your repository to see it appear here.
        </p>
      )}

      {events && events.length > 0 && (
        <ul className="event-list">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </ul>
      )}
    </section>
  );
}
