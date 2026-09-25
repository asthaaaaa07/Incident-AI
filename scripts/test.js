// scripts/test.js
// A practical integration test script (no test framework dependency).
// It starts the real server as a child process against your configured
// DATABASE_URL, exercises the API with real HTTP requests, and reports
// pass/fail for each check. Run with: npm test
//
// Requirements: PostgreSQL must be running and reachable via DATABASE_URL,
// and the schema must already be applied (npm run db:setup).

require("dotenv").config();
const { spawn } = require("child_process");
const path = require("path");

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;

function report(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`✅ ${name}`);
  } else {
    failed++;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) return true;
    } catch (_) {
      // not up yet
    }
    await wait(300);
  }
  return false;
}

async function run() {
  console.log(`\nStarting server for tests on ${BASE_URL} ...\n`);
  const server = spawn("node", [path.join(__dirname, "..", "servers.js")], {
    env: process.env,
    stdio: "pipe",
  });

  server.stdout.on("data", () => {}); // silence server logs during tests
  server.stderr.on("data", () => {});

  const up = await waitForServer();
  report("1. Server starts", up);
  if (!up) {
    console.log("\nServer did not start in time — aborting remaining tests.");
    server.kill();
    process.exit(1);
  }

  try {
    // 2. GET /
    const rootRes = await fetch(`${BASE_URL}/`);
    report("2. GET / returns a response", rootRes.ok);

    // 3. GET /health
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthBody = await healthRes.json();
    report("3. GET /health works", healthRes.status === 200 || healthRes.status === 503, `status ${healthRes.status}`);
    const dbUp = healthBody.database === "connected";
    if (!dbUp) {
      console.log("⚠️  Database not connected — skipping DB-dependent tests.\n");
    }

    // 4 & 5. POST /webhook/github with a valid test payload -> stored
    const testDeliveryId = `test-delivery-${Date.now()}`;
    const testPayload = {
      ref: "refs/heads/main",
      repository: { full_name: "test/repo", html_url: "https://github.com/test/repo" },
      pusher: { name: "test-user" },
      sender: { login: "test-user" },
      head_commit: {
        id: "abc123def456",
        message: "test commit message",
        timestamp: new Date().toISOString(),
      },
      commits: [{}],
    };

    const webhookRes = await fetch(`${BASE_URL}/webhook/github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "push",
        "X-GitHub-Delivery": testDeliveryId,
      },
      body: JSON.stringify(testPayload),
    });
    const webhookBody = await webhookRes.json().catch(() => ({}));
    report("4. POST /webhook/github accepts a valid test payload", webhookRes.status === 201, `status ${webhookRes.status}`);

    if (dbUp) {
      const eventId = webhookBody.event_id;
      report("5. Event is stored in PostgreSQL", Boolean(eventId));

      // 6. GET /events returns stored events
      const eventsRes = await fetch(`${BASE_URL}/events?limit=5`);
      const eventsBody = await eventsRes.json();
      const found = eventsBody.data?.some((e) => e.id === eventId);
      report("6. GET /events returns stored events", eventsRes.ok && found);

      // 7. Duplicate webhook delivery handled
      const dupRes = await fetch(`${BASE_URL}/webhook/github`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GitHub-Event": "push",
          "X-GitHub-Delivery": testDeliveryId, // same delivery id
        },
        body: JSON.stringify(testPayload),
      });
      const dupBody = await dupRes.json().catch(() => ({}));
      report("7. Duplicate webhook behavior is handled", dupRes.status === 200 && dupBody.duplicate === true);

      // 8. Invalid payload handled safely
      const invalidRes = await fetch(`${BASE_URL}/webhook/github`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GitHub-Event": "push",
          "X-GitHub-Delivery": `test-invalid-${Date.now()}`,
        },
        body: JSON.stringify({ not: "a real payload" }),
      });
      report("8. Invalid payload is handled safely", invalidRes.status === 400);

      // 9. Incident detection rule works with a test event
      const failureDeliveryId = `test-failure-${Date.now()}`;
      const failurePayload = {
        ...testPayload,
        head_commit: { ...testPayload.head_commit, id: "failcommit01", message: "hotfix: patch broken build" },
      };
      await fetch(`${BASE_URL}/webhook/github`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GitHub-Event": "push",
          "X-GitHub-Delivery": failureDeliveryId,
        },
        body: JSON.stringify(failurePayload),
      });
      await wait(300);
      const incidentsRes = await fetch(`${BASE_URL}/incidents?repository=test/repo&limit=5`);
      const incidentsBody = await incidentsRes.json();
      const ruleATriggered = incidentsBody.data?.some((i) => i.detection_rule === "RULE_A_FAILURE_KEYWORD");
      report("9. Incident detection rule works with a test event", ruleATriggered);

      // 10. Incident status can be updated
      if (ruleATriggered) {
        const incident = incidentsBody.data.find((i) => i.detection_rule === "RULE_A_FAILURE_KEYWORD");
        const patchRes = await fetch(`${BASE_URL}/incidents/${incident.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "investigating" }),
        });
        const patchBody = await patchRes.json();
        report("10. Incident status can be updated", patchRes.ok && patchBody.data?.status === "investigating");
      } else {
        report("10. Incident status can be updated", false, "skipped, no incident to update");
      }
    } else {
      report("5. Event is stored in PostgreSQL", false, "database unavailable");
      report("6. GET /events returns stored events", false, "database unavailable");
      report("7. Duplicate webhook behavior is handled", false, "database unavailable");
      report("8. Invalid payload is handled safely", false, "database unavailable");
      report("9. Incident detection rule works with a test event", false, "database unavailable");
      report("10. Incident status can be updated", false, "database unavailable");
    }

    // 11. Frontend loads data from the backend (check static file + API reachability)
    const frontendRes = await fetch(`${BASE_URL}/`);
    const frontendText = await frontendRes.text();
    report("11. Frontend is served by the backend", frontendText.includes("Incident-AI"));

    // 12. Empty state check (filter to a repo that has no events)
    const emptyRes = await fetch(`${BASE_URL}/events?repository=definitely-not-a-real-repo`);
    const emptyBody = await emptyRes.json();
    report("12. Empty filter returns empty array (not an error)", emptyRes.ok && Array.isArray(emptyBody.data) && emptyBody.data.length === 0);
  } catch (err) {
    console.error("Unexpected error during tests:", err);
    failed++;
  } finally {
    server.kill();
  }

  console.log(`\n${passed} passed, ${failed} failed.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
