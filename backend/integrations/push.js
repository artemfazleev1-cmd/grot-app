// =====================================================================
// Push-уведомления. Web Push (VAPID) — бесплатно, без сторонних сервисов,
// работает в установленном PWA на Android и iOS 16.4+.
// ENV: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (mailto:...)
// Если ENV нет — пуши не отправляются «наружу», но in-app очередь
// (polling /api/notifications) продолжает работать как раньше.
//
// Для реальной отправки нужна библиотека web-push (npm i web-push) —
// импорт делается лениво, чтобы приложение запускалось и без неё.
// =====================================================================
const enabled = !!(process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE);
export const pushEnabled = enabled;
export const vapidPublicKey = process.env.VAPID_PUBLIC || null;

const subs = new Map(); // userId -> [subscription...]
let webpush = null;

async function ensureLib() {
  if (!enabled) return null;
  if (webpush) return webpush;
  try {
    const mod = await import('web-push');
    webpush = mod.default || mod;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@grot.app',
      process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
    return webpush;
  } catch {
    console.warn('⚠️ Пакет web-push не установлен — реальные пуши отключены (npm i web-push)');
    return null;
  }
}

export function saveSubscription(userId, subscription) {
  const list = subs.get(userId) || [];
  if (!list.find((s) => s.endpoint === subscription.endpoint)) list.push(subscription);
  subs.set(userId, list);
}

export async function sendPush(userId, payload) {
  const lib = await ensureLib();
  const list = subs.get(userId);
  if (!lib || !list?.length) return { skipped: true };
  await Promise.allSettled(list.map((s) => lib.sendNotification(s, JSON.stringify(payload))));
  return { sent: true };
}
