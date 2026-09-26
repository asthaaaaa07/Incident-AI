import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";

export default function SummaryStats({ refreshSignal }) {
  const [stats, setStats] = useState(null);

  const load = useCallback(async () => {
    try {
      const [eventsResp, summaryResp] = await Promise.all([
        api.getEvents({ limit: 1 }),
        api.getIncidentSummary(),
      ]);
      setStats({
        totalEvents: eventsResp.pagination.total,
        ...summaryResp.data,
      });
    } catch (_) {
      // Leave stats as-is; the panels below surface their own errors.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  const items = [
    { label: "Total events", value: stats?.totalEvents },
    { label: "Open incidents", value: stats?.open },
    { label: "Investigating", value: stats?.investigating },
    { label: "Resolved", value: stats?.resolved },
    { label: "High severity, open", value: stats?.high_severity_open, alert: true },
  ];

  return (
    <section className="stat-line" aria-label="Summary metrics">
      {items.map((item) => (
        <div className="stat-item" key={item.label}>
          <span className={`stat-value ${item.alert ? "stat-value-alert" : ""}`}>
            {item.value ?? "—"}
          </span>
          <span className="stat-label">{item.label}</span>
        </div>
      ))}
    </section>
  );
}
