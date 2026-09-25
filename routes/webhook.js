// routes/webhook.js
const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const { normalizePushEvent, normalizeGenericEvent, saveEvent } = require("../services/eventService");
const { detectIncidentsForEvent } = require("../services/incidentService");
const { isUsableGithubPayload } = require("../utils/validation");

/**
 * Verifies the GitHub webhook signature (X-Hub-Signature-256) using the
 * raw request body and WEBHOOK_SECRET from the environment.
 *
 * IMPORTANT: this only actually verifies anything if WEBHOOK_SECRET is set
 * AND GitHub is configured with the same secret. If WEBHOOK_SECRET is not
 * set, we do NOT pretend the request is verified — we log a clear warning
 * and accept the request anyway (useful for local dev with ngrok before
 * you've configured a secret), so nobody is misled into thinking
 * unverified requests are secure.
 */
function verifySignature(req) {
  const secret = process.env.WEBHOOK_SECRET;
  const signature = req.headers["x-hub-signature-256"];

  if (!secret) {
    return { verified: false, skipped: true };
  }

  if (!signature || !req.rawBody) {
    return { verified: false, skipped: false };
  }

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");

  // Use timingSafeEqual to avoid leaking timing information about the secret.
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return { verified: false, skipped: false };
  }

  const verified = crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  return { verified, skipped: false };
}

router.post("/github", async (req, res) => {
  try {
    const { verified, skipped } = verifySignature(req);

    if (!skipped && !verified) {
      console.warn("⚠️  Webhook signature verification failed. Rejecting request.");
      return res.status(401).json({ error: "Invalid webhook signature." });
    }
    if (skipped) {
      console.warn(
        "⚠️  WEBHOOK_SECRET is not set — accepting webhook WITHOUT signature verification. Set WEBHOOK_SECRET in .env for real use."
      );
    }

    const eventType = req.headers["x-github-event"];
    const deliveryId = req.headers["x-github-delivery"];
    const payload = req.body;

    if (!eventType) {
      return res.status(400).json({ error: "Missing X-GitHub-Event header." });
    }

    if (!isUsableGithubPayload(payload)) {
      console.warn(`⚠️  Received ${eventType} event with an unusable payload. Ignoring.`);
      return res.status(400).json({ error: "Payload missing required repository information." });
    }

    // Structured so other event types can be added later without rewriting
    // this handler — just add another `case`.
    let normalizedEvent;
    switch (eventType) {
      case "push":
        normalizedEvent = normalizePushEvent(payload, deliveryId);
        break;
      case "ping":
        // GitHub sends a 'ping' event when the webhook is first configured.
        console.log("✅ Received GitHub ping event. Webhook is configured correctly.");
        return res.status(200).json({ message: "Pong! Webhook configured successfully." });
      default:
        // We don't crash or misclassify unknown events — we store them
        // generically so nothing is silently dropped, but we don't invent
        // fields we don't actually have.
        normalizedEvent = normalizeGenericEvent(eventType, payload, deliveryId);
        break;
    }

    const { event, wasDuplicate } = await saveEvent(normalizedEvent);

    if (wasDuplicate) {
      console.log(`ℹ️  Duplicate delivery ${deliveryId} ignored (already stored as event #${event?.id}).`);
      return res.status(200).json({ message: "Duplicate delivery, already recorded.", duplicate: true });
    }

    console.log(`✅ Stored ${event.event_type} event #${event.id} for ${event.repository_name}`);

    // Run detection rules. Detection failures should never fail the webhook
    // response — GitHub only cares that we acknowledged receipt.
    try {
      const incident = await detectIncidentsForEvent(event);
      if (incident) {
        console.log(`🚨 Incident #${incident.id} (${incident.detection_rule}): ${incident.title}`);
      }
    } catch (detectionErr) {
      console.error("❌ Incident detection failed (event was still saved):", detectionErr.message);
    }

    return res.status(201).json({ message: "Event received and stored.", event_id: event.id });
  } catch (err) {
    console.error("❌ Error handling GitHub webhook:", err.message);
    return res.status(500).json({ error: "Internal server error while processing webhook." });
  }
});

module.exports = router;
