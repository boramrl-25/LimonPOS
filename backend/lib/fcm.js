/**
 * Hibrit mimari: FCM ile cihazlara catalog_updated push gönderimi.
 * GOOGLE_APPLICATION_CREDENTIALS veya FCM_SERVICE_ACCOUNT_PATH ortam değişkeni ile yapılandırın.
 * Yapılandırılmazsa FCM gönderilmez (WebSocket broadcast yeterli).
 */
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

let messaging = null;

function initFcm() {
  if (messaging) return messaging;
  if (getApps().length > 0) {
    messaging = getMessaging();
    return messaging;
  }
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FCM_SERVICE_ACCOUNT_PATH;
  const credJson = process.env.FCM_SERVICE_ACCOUNT_JSON; // base64 encoded JSON
  if (!credPath && !credJson) {
    return null;
  }
  try {
    let app;
    if (credJson) {
      const decoded = Buffer.from(credJson, "base64").toString("utf-8");
      const cred = JSON.parse(decoded);
      app = initializeApp({ credential: cert(cred) });
    } else {
      app = initializeApp({ credential: cert(credPath) });
    }
    messaging = getMessaging(app);
    console.log("[fcm] Firebase Admin initialized");
    return messaging;
  } catch (e) {
    console.error("[fcm] Init failed:", e?.message || e);
    return null;
  }
}

/**
 * Tüm cihazlara catalog_updated data mesajı gönderir.
 * @param {Array<{id: string, fcm_token?: string}>} devices
 * @returns {{ sent: number, failed: number }}
 */
export async function sendCatalogUpdatedToDevices(devices) {
  const msg = initFcm();
  if (!msg) return { sent: 0, failed: 0 };
  const tokens = (devices || [])
    .map((d) => d.fcm_token)
    .filter((t) => t && typeof t === "string" && t.length > 20);
  if (tokens.length === 0) return { sent: 0, failed: 0 };
  const dedup = [...new Set(tokens)];
  let sent = 0;
  let failed = 0;
  for (const token of dedup) {
    try {
      await msg.send({
        token,
        data: { type: "catalog_updated" },
        android: { priority: "high" },
        apns: { headers: { "apns-priority": "10" }, payload: { aps: { "content-available": 1 } } },
      });
      sent++;
    } catch (e) {
      failed++;
      if (e?.code === "messaging/invalid-registration-token" || e?.code === "messaging/registration-token-not-registered") {
        console.warn("[fcm] Invalid/expired token, device should re-register");
      } else {
        console.error("[fcm] Send failed:", e?.message || e);
      }
    }
  }
  return { sent, failed };
}
