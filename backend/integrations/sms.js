// =====================================================================
// SMS / OTP. Три режима (по приоритету):
//  1) Twilio Verify   — TWILIO_SID + TWILIO_TOKEN + TWILIO_VERIFY_SID.
//     Рекомендуется для кодов подтверждения: Twilio сам подбирает
//     отправителя/маршрут под страну получателя (включая Таиланд +66),
//     сам генерирует и проверяет код. Номер-отправитель не нужен.
//  2) Twilio Messaging — TWILIO_SID + TWILIO_TOKEN + TWILIO_FROM.
//     Свой код + отправка SMS с купленного номера (не работает в страны
//     с ограничением отправителя, напр. Таиланд → ошибка 21612).
//  3) Демо (нет ENV)  — код возвращается в ответе и пишется в консоль.
// =====================================================================
const SID = process.env.TWILIO_SID;
const TOKEN = process.env.TWILIO_TOKEN;
const FROM = process.env.TWILIO_FROM;
const VERIFY_SID = process.env.TWILIO_VERIFY_SID;

const verifyEnabled = !!(SID && TOKEN && VERIFY_SID);
const messagingEnabled = !!(SID && TOKEN && FROM);

// Для клиента (config): реальные SMS активны, если работает Verify ИЛИ Messaging.
export const smsEnabled = verifyEnabled || messagingEnabled;
export const smsMode = verifyEnabled ? 'verify' : messagingEnabled ? 'messaging' : 'demo';

const authHeader = () => 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64');

async function twilioPost(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${data.message || 'error'} (code ${data.code || '?'})`);
  return data;
}

// ---- Локальный OTP (демо и messaging-режим): хранение в памяти, TTL 5 мин ----
const codes = new Map(); // phone -> { code, exp }
export function issueOtp(phone) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  codes.set(phone, { code, exp: Date.now() + 5 * 60 * 1000 });
  return code;
}
function verifyLocal(phone, code) {
  const rec = codes.get(phone);
  if (!rec || rec.exp < Date.now()) return false;
  const ok = rec.code === String(code);
  if (ok) codes.delete(phone);
  return ok;
}

// ---- Публичный API ----
// Запросить код. Возвращает { demo:boolean, devCode?:string }. Кидает ошибку при сбое провайдера.
export async function requestOtp(phone) {
  if (verifyEnabled) {
    await twilioPost(`https://verify.twilio.com/v2/Services/${VERIFY_SID}/Verifications`, { To: phone, Channel: 'sms' });
    return { demo: false };
  }
  if (messagingEnabled) {
    const code = issueOtp(phone);
    await twilioPost(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`,
      { To: phone, From: FROM, Body: `GROT: код подтверждения ${code}` });
    return { demo: false };
  }
  const code = issueOtp(phone);
  console.log(`[SMS demo] -> ${phone}: код ${code}`);
  return { demo: true, devCode: code };
}

// Проверить код. Возвращает boolean.
export async function verifyCode(phone, code) {
  if (verifyEnabled) {
    try {
      const data = await twilioPost(`https://verify.twilio.com/v2/Services/${VERIFY_SID}/VerificationCheck`,
        { To: phone, Code: String(code) });
      return data.status === 'approved';
    } catch { return false; }
  }
  return verifyLocal(phone, code);
}
