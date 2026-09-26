import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../api/client";

const STATUS_OPTIONS = ["open", "investigating", "resolved", "ignored"];

function formatRelativeTime(isoString) {
  if (!isoString) return "unknown time";
  const date = new Date(isoString);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toLocaleString();
}

export default function IncidentModal({ incidentId, onClose, onStatusChanged }) {
  const [incident, setIncident] = useState(null);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(null); // status currently being applied
  const closeButtonRef = useRef(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const resp = await api.getIncident(incidentId);
      setIncident(resp.data);
    } catch (err) {
      setError(err.message);
    }
  }, [incidentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleStatusChange = async (status) => {
    setUpdating(status);
    try {
      await api.updateIncidentStatus(incidentId, status);
      await load();
      onStatusChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close incident details"
          ref={closeButtonRef}
        >
          Close
        </button>

        {!incident && !error && <p className="state-text">Loading…</p>}
        {error && !incident && <p className="state-text state-error">Couldn't load incident: {error}</p>}

        {incident && (
          <>
            <h3 id="modal-title">{incident.title}</h3>
            <div className="incident-meta modal-meta">
              <span className={`sev-label sev-${incident.severity}`}>{incident.severity}</span>
              <span className={`status-label status-${incident.status}`}>{incident.status}</span>
              <span>{incident.repository_name}</span>
            </div>

            <div className="modal-section">
              <h4>Why this was detected</h4>
              <p className="incident-reason">{incident.detection_reason || "No reason recorded."}</p>
              <p className="mono-detail">
                Rule: {incident.detection_rule || "n/a"} · Detected{" "}
                {formatRelativeTime(incident.detected_at)}
              </p>
            </div>

            <div className="modal-section">
              <h4>Related events ({incident.related_events?.length ?? 0})</h4>
              {incident.related_events?.length ? (
                <ul className="related-event-list">
                  {incident.related_events.map((e) => (
                    <li key={e.id} className="mono-detail related-event">
                      #{e.id} · {e.event_type} · {e.commit_message || "no message"} ·{" "}
                      {formatRelativeTime(e.occurred_at)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="state-text" style={{ padding: "8px 0" }}>
                  No linked events.
                </p>
              )}
            </div>

            {incident.resolved_at && (
              <div className="modal-section">
                <h4>Resolved</h4>
                <p className="mono-detail">{formatRelativeTime(incident.resolved_at)}</p>
              </div>
            )}

            <div className="modal-section">
              <h4>Update status</h4>
              <div className="status-controls">
                {STATUS_OPTIONS.map((status) => (
                  <button
                    key={status}
                    className={`btn-status ${status === incident.status ? "btn-status-current" : ""}`}
                    disabled={status === incident.status || updating !== null}
                    onClick={() => handleStatusChange(status)}
                  >
                    {updating === status ? "Updating…" : status}
                  </button>
                ))}
              </div>
              {error && incident && <p className="state-text state-error">{error}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
