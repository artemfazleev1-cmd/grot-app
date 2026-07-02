// =====================================================================
// Безопасность: подписанные токены (HMAC), хеш паролей (scrypt),
// анти-брутфорс, ролевой доступ, белые списки полей. Без зависимостей.
// =====================================================================
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Секрет для подписи токенов ----
// Берём из ENV; иначе генерируем и сохраняем в data/.secret (переживёт рестарт).
function loadSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const file = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), '.secret');
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
    const s = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, s, { mode: 0o600 });
    return s;
  } catch { return crypto.randomBytes(48).toString('hex'); }
}
const SECRET = loadSecret();

// ---- Токены: "<userId>.<hmac>" ----
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
export function makeToken(user) {
  const payload = String(user.id);
  return `${payload}.${sign(payload)}`;
}
export function userIdFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = sign(payload);
  // constant-time сравнение
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const id = Number(payload);
  return Number.isInteger(id) ? id : null;
}

// ---- Пароли: scrypt с солью. Формат "scrypt$<salt>$<hash>" ----
export function hashPassword(plain) {
  if (plain == null) return null;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
export function isHashed(v) { return typeof v === 'string' && v.startsWith('scrypt$'); }
export function verifyPassword(plain, stored) {
  if (!stored || plain == null) return false;
  if (!isHashed(stored)) return String(plain) === String(stored); // на случай немигрированных
  const [, salt, hash] = stored.split('$');
  const calc = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  const a = Buffer.from(calc, 'hex'); const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- Анти-брутфорс: не более `max` попыток за `windowMs` на ключ ----
const buckets = new Map();
export function rateLimit({ max = 8, windowMs = 60_000 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Слишком много попыток, попробуйте позже' });
    arr.push(now); buckets.set(key, arr);
    next();
  };
}

// ---- Ролевой доступ ----
export const requireRole = (...roles) => (req, res, next) =>
  req.user && roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Нет доступа' });

// ---- Белый список полей (защита от mass-assignment / prototype pollution) ----
export function pick(src, allowed) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(src, k) && k !== '__proto__') out[k] = src[k];
  }
  return out;
}
