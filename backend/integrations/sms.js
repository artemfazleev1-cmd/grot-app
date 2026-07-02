// =====================================================================
// SMS / OTP. Активируется при наличии ENV (Twilio). Иначе — демо-режим:
// код возвращается в ответе и пишется в консоль (для разработки/теста).
// ENV: TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM
// =====================================================================
const enabled = !!(process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_FROM);

export const smsEnabled = enabled;

export async function sendSms(to, text) {
  if (!enabled) {
    console.log(`[SMS demo] -> ${to}: ${text}`);
    return { demo: true };
  }
  // Реальная отправка через Twilio REST API (без SDK, чтобы не тянуть зависимость).
  const auth = Buffer.from(`${process.env.TWILIO_SID}:${process.env.TWILIO_TOKEN}`).toString('base64');
  const body = new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: text });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('SMS provider error: ' + (await res.text()));
  return { sent: true };
}

// Генерация и проверка OTP (хранение в памяти, TTL 5 мин)
const codes = new Map(); // phone -> { code, exp }

export function issueOtp(phone) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  codes.set(phone, { code, exp: Date.now() + 5 * 60 * 1000 });
  return code;
}
export function verifyOtp(phone, code) {
  const rec = codes.get(phone);
  if (!rec || rec.exp < Date.now()) return false;
  const ok = rec.code === String(code);
  if (ok) codes.delete(phone);
  return ok;
}
