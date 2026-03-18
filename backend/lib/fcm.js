/**
 * Hibrit mimari: FCM ile cihazlara catalog_updated push gönderimi.
 * GOOGLE_APPLICATION_CREDENTIALS veya FCM_SERVICE_ACCOUNT_PATH ortam değişkeni ile yapılandırın.
 * Yapılandırılmazsa FCM gönderilmez (WebSocket broadcast yeterli).
 *
 * NOT: firebase-admin paketi opsiyoneldir. Yüklü değilse FCM sessizce devre dışı kalır.
 */

let messaging = null;
let _initAttempted = false;

async function initFcm() {
  if (_initAttempted) return messaging;
  _initAttempted = true;

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FCM_SERVICE_ACCOUNT_PATH;
  const credJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!credPath && !credJson) return null; // FCM yapılandırılmamış — sessizce atla

  try {
    const { getApps, initializeApp, cert } = await import("firebase-admin/app");
    const { getMessaging } = await import("firebase-admin/messaging");

    if (getApps().length > 0) {
      messaging = getMessaging();
      return messaging;
    }
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
    if (e?.code === "ERR_MODULE_NOT_FOUND" || e?.code === "ERR_PACKAGE_IMPORT_NOT_DEFINED") {
      console.warn("[fcm] firebase-admin paketi yüklü değil — FCM devre dışı (npm install firebase-admin ile yüklenebilir)");
    } else {
      console.error("[fcm] Init failed:", e?.message || e);
    }
    return null;
  }
}

/**
 * Tüm cihazlara catalog_updated data mesajı gönderir.
 * @param {Array<{id: string, fcm_token?: string}>} devices
 * @returns {{ sent: number, failed: number }}
 */
export async function sendCatalogUpdatedToDevices(devices) {
  const msg = await initFcm();
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
