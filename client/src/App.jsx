import { useState, useCallback } from "react";
import "./styles/tokens.css";
import "./styles/panel.css";
import "./styles/layout.css";
import StatusBar from "./components/StatusBar";
import SummaryStats from "./components/SummaryStats";
import EventTimeline from "./components/EventTimeline";
import IncidentList from "./components/IncidentList";
import IncidentModal from "./components/IncidentModal";

export default function App() {
  const [openIncidentId, setOpenIncidentId] = useState(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const bumpRefresh = useCallback(() => setRefreshSignal((n) => n + 1), []);

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Incident-AI</h1>
          <p className="topbar-subtitle">Repository event monitoring and incident review</p>
        </div>
        <StatusBar onRefresh={bumpRefresh} />
      </header>

      <main>
        <SummaryStats refreshSignal={refreshSignal} />

        <div className="columns">
          <EventTimeline />
          <IncidentList onOpenIncident={setOpenIncidentId} refreshSignal={refreshSignal} />
        </div>
      </main>

      {openIncidentId && (
        <IncidentModal
          incidentId={openIncidentId}
          onClose={() => setOpenIncidentId(null)}
          onStatusChanged={bumpRefresh}
        />
      )}

      <footer className="app-footer">
        Rule-based detection. Every incident records why it was flagged.
      </footer>
    </div>
  );
}
