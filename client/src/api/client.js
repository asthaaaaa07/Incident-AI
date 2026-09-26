// src/api/client.js
// Thin fetch wrapper, kept separate from components. In production the app
// is served by the same Express server as the API, so an empty base URL
// (same-origin relative requests) is correct. In dev, VITE_API_BASE_URL
// points at the Express server on its own port.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

async function request(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    // Some responses (rare) may have no JSON body.
  }
  if (!res.ok) {
    throw new Error(body?.error || `Request failed with status ${res.status}`);
  }
  return body;
}

export const api = {
  health: () => request("/health"),

  getEvents: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    );
    return request(`/events?${query.toString()}`);
  },

  getIncidents: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    );
    return request(`/incidents?${query.toString()}`);
  },

  getIncidentSummary: () => request("/incidents/summary"),

  getIncident: (id) => request(`/incidents/${id}`),

  updateIncidentStatus: (id, status) =>
    request(`/incidents/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }),
};
