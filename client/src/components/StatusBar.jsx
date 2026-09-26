import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";

export default function StatusBar({ onRefresh }) {
  const [status, setStatus] = useState({ server: "checking", database: "checking" });
  const [lastChecked, setLastChecked] = useState(null);

  const check = useCallback(async () => {
    try {
      const health = await api.health();
      setStatus({
        server: "online",
        database: health.database === "connected" ? "connected" : "unavailable",
      });
    } catch (_) {
      setStatus({ server: "unreachable", database: "unknown" });
    }
    setLastChecked(new Date());
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, [check]);

  const handleRefresh = () => {
    check();
    onRefresh?.();
  };

  return (
    <div className="status-bar">
      <StatusItem label="Server" value={status.server} ok={status.server === "online"} />
      <StatusItem
        label="Database"
        value={status.database}
        ok={status.database === "connected"}
      />
      <span className="status-time">
        {lastChecked ? `Checked ${lastChecked.toLocaleTimeString()}` : "Checking…"}
      </span>
      <button className="btn-refresh" onClick={handleRefresh}>
        Refresh
      </button>
    </div>
  );
}

function StatusItem({ label, value, ok }) {
  return (
    <span className="status-item">
      <span className={`status-dot ${ok ? "status-dot-ok" : "status-dot-bad"}`} />
      {label}: {value}
    </span>
  );
}
