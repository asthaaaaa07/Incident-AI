// public/app.js
// Plain vanilla JS. No build step, no framework — fetches data from the
// backend API and renders it into the DOM, with loading/empty/error states.

const REFRESH_INTERVAL_MS = 15000;

// ---------- Small utilities ----------

/** Escapes a string for safe insertion into innerHTML, preventing XSS. */
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRelativeTime(isoString) {
  if (!isoString) return "unknown time";
  const date = new Date(isoString);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toLocaleString();
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    // No JSON body — leave as null.
  }
  if (!res.ok) {
    const message = body?.error || `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return body;
}

// ---------- Status bar ----------

async function refreshStatus() {
  const dot = document.getElementById("serverStatusDot");
  const text = document.getElementById("serverStatusText");
  const dbDot = document.getElementById("dbStatusDot");
  const dbText = document.getElementById("dbStatusText");

  try {
    const health = await fetchJson("/health");
    dot.className = "status-dot ok";
    text.textContent = "Server online";

    if (health.database === "connected") {
      dbDot.className = "status-dot ok";
      dbText.textContent = "Database connected";
    } else {
      dbDot.className = "status-dot bad";
      dbText.textContent = "Database unavailable";
    }
  } catch (err) {
    dot.className = "status-dot bad";
    text.textContent = "Server unreachable";
    dbDot.className = "status-dot bad";
    dbText.textContent = "Unknown";
  }

  document.getElementById("lastUpdated").textContent =
    `Last updated: ${new Date().toLocaleTimeString()}`;
}

// ---------- Summary cards ----------

async function refreshSummary() {
  try {
    const [eventsResp, summaryResp] = await Promise.all([
      fetchJson("/events?limit=1"),
      fetchJson("/incidents/summary"),
    ]);

    document.getElementById("statTotalEvents").textContent = eventsResp.pagination.total;
    document.getElementById("statOpen").textContent = summaryResp.data.open;
    document.getElementById("statInvestigating").textContent = summaryResp.data.investigating;
    document.getElementById("statResolved").textContent = summaryResp.data.resolved;
    document.getElementById("statHighSeverity").textContent = summaryResp.data.high_severity_open;
  } catch (err) {
    // Leave placeholders as "—" if the summary can't be fetched; the panels
    // below will show a proper error state.
  }
}

// ---------- Event timeline ----------

function eventRowHtml(event) {
  return `
    <div class="event-row">
      <div class="event-row-top">
        <span>
          <span class="event-type-badge">${escapeHtml(event.event_type)}</span>
          <span class="event-repo">${escapeHtml(event.repository_name)}</span>
        </span>
        <span class="event-time" title="${escapeHtml(event.occurred_at)}">${formatRelativeTime(event.occurred_at)}</span>
      </div>
      ${event.commit_message ? `<div class="event-message">${escapeHtml(event.commit_message)}</div>` : ""}
      <div class="event-meta">
        <span>👤 ${escapeHtml(event.author || "unknown")}</span>
        ${event.branch ? `<span>🌿 ${escapeHtml(event.branch)}</span>` : ""}
        ${event.commit_sha ? `<span>#${escapeHtml(event.commit_sha.slice(0, 7))}</span>` : ""}
      </div>
    </div>
  `;
}

async function refreshEvents() {
  const container = document.getElementById("eventList");
  const repo = document.getElementById("filterEventRepo").value.trim();
  const eventType = document.getElementById("filterEventType").value;
  const branch = document.getElementById("filterEventBranch").value.trim();

  const params = new URLSearchParams({ limit: "30" });
  if (repo) params.set("repository", repo);
  if (eventType) params.set("event_type", eventType);
  if (branch) params.set("branch", branch);

  try {
    const resp = await fetchJson(`/events?${params.toString()}`);
    if (resp.data.length === 0) {
      container.innerHTML = `<p class="empty-text">No events yet. Push a commit to your repository to see it appear here.</p>`;
      return;
    }
    container.innerHTML = resp.data.map(eventRowHtml).join("");
  } catch (err) {
    container.innerHTML = `<p class="error-text">Couldn't load events: ${escapeHtml(err.message)}</p>`;
  }
}

// ---------- Incidents ----------

function incidentRowHtml(incident) {
  return `
    <div class="incident-row" tabindex="0" role="button" data-id="${incident.id}">
      <div class="incident-row-top">
        <span class="incident-title">${escapeHtml(incident.title)}</span>
        <span class="badge badge-sev-${escapeHtml(incident.severity)}">${escapeHtml(incident.severity)}</span>
      </div>
      <div class="incident-reason">${escapeHtml(incident.detection_reason || "")}</div>
      <div class="incident-meta">
        <span class="badge badge-status-${escapeHtml(incident.status)}">${escapeHtml(incident.status)}</span>
        <span>${escapeHtml(incident.repository_name)}</span>
        <span>${formatRelativeTime(incident.detected_at)}</span>
      </div>
    </div>
  `;
}

async function refreshIncidents() {
  const container = document.getElementById("incidentList");
  const severity = document.getElementById("filterIncidentSeverity").value;
  const status = document.getElementById("filterIncidentStatus").value;

  const params = new URLSearchParams({ limit: "30" });
  if (severity) params.set("severity", severity);
  if (status) params.set("status", status);

  try {
    const resp = await fetchJson(`/incidents?${params.toString()}`);
    if (resp.data.length === 0) {
      container.innerHTML = `<p class="empty-text">No incidents detected. That's a good sign.</p>`;
      return;
    }
    container.innerHTML = resp.data.map(incidentRowHtml).join("");

    container.querySelectorAll(".incident-row").forEach((row) => {
      row.addEventListener("click", () => openIncidentModal(row.dataset.id));
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openIncidentModal(row.dataset.id);
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<p class="error-text">Couldn't load incidents: ${escapeHtml(err.message)}</p>`;
  }
}

// ---------- Incident detail modal ----------

const STATUS_OPTIONS = ["open", "investigating", "resolved", "ignored"];

async function openIncidentModal(id) {
  const modal = document.getElementById("incidentModal");
  const body = document.getElementById("modalBody");
  modal.classList.remove("hidden");
  body.innerHTML = `<p class="loading-text">Loading…</p>`;

  try {
    const resp = await fetchJson(`/incidents/${id}`);
    renderIncidentModal(resp.data);
  } catch (err) {
    body.innerHTML = `<p class="error-text">Couldn't load incident: ${escapeHtml(err.message)}</p>`;
  }
}

function renderIncidentModal(incident) {
  const body = document.getElementById("modalBody");

  const relatedEventsHtml = (incident.related_events || [])
    .map(
      (e) =>
        `<div class="related-event">#${e.id} · ${escapeHtml(e.event_type)} · ${escapeHtml(e.commit_message || "no message")} · ${formatRelativeTime(e.occurred_at)}</div>`
    )
    .join("") || `<p class="empty-text">No linked events.</p>`;

  const statusButtons = STATUS_OPTIONS.map(
    (s) =>
      `<button class="btn ${s === incident.status ? "" : "btn-ghost"}" data-status="${s}" ${s === incident.status ? "disabled" : ""}>${s}</button>`
  ).join("");

  body.innerHTML = `
    <h3>${escapeHtml(incident.title)}</h3>
    <div class="incident-meta">
      <span class="badge badge-sev-${escapeHtml(incident.severity)}">${escapeHtml(incident.severity)}</span>
      <span class="badge badge-status-${escapeHtml(incident.status)}">${escapeHtml(incident.status)}</span>
      <span>${escapeHtml(incident.repository_name)}</span>
    </div>

    <div class="modal-section">
      <h4>Why this was detected</h4>
      <p class="incident-reason">${escapeHtml(incident.detection_reason || "No reason recorded.")}</p>
      <p class="incident-meta">Rule: ${escapeHtml(incident.detection_rule || "n/a")} · Detected ${formatRelativeTime(incident.detected_at)}</p>
    </div>

    <div class="modal-section">
      <h4>Related events</h4>
      ${relatedEventsHtml}
    </div>

    ${incident.resolved_at ? `<div class="modal-section"><h4>Resolved</h4><p class="incident-meta">${formatRelativeTime(incident.resolved_at)}</p></div>` : ""}

    <div class="modal-section">
      <h4>Update status</h4>
      <div class="status-controls" id="statusControls">${statusButtons}</div>
    </div>
  `;

  document.getElementById("statusControls").querySelectorAll("button[data-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await fetchJson(`/incidents/${incident.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: btn.dataset.status }),
        });
        const refreshed = await fetchJson(`/incidents/${incident.id}`);
        renderIncidentModal(refreshed.data);
        refreshIncidents();
        refreshSummary();
      } catch (err) {
        alert(`Couldn't update status: ${err.message}`);
        btn.disabled = false;
      }
    });
  });
}

function closeModal() {
  document.getElementById("incidentModal").classList.add("hidden");
}

// ---------- Wiring ----------

function refreshAll() {
  refreshStatus();
  refreshSummary();
  refreshEvents();
  refreshIncidents();
}

document.getElementById("refreshBtn").addEventListener("click", refreshAll);
document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
document.getElementById("incidentModal").addEventListener("click", (e) => {
  if (e.target.id === "incidentModal") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

["filterEventRepo", "filterEventType", "filterEventBranch"].forEach((id) => {
  document.getElementById(id).addEventListener("input", debounce(refreshEvents, 300));
});
["filterIncidentSeverity", "filterIncidentStatus"].forEach((id) => {
  document.getElementById(id).addEventListener("change", refreshIncidents);
});

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

refreshAll();
setInterval(refreshAll, REFRESH_INTERVAL_MS);
