// =====================================================================
// GROT Bar & Grill — REST API (Express, in-memory)
// Запуск: npm install && npm start  ->  http://localhost:4000
// Архитектура подготовлена к замене слоёв (БД, SMS, Push, оплата).
// =====================================================================
import './env.js'; // ВАЖНО: первым — загружает .env до инициализации интеграций
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from './db.js';
import { load, persist, installShutdownHooks } from './persistence.js';
import * as sms from './integrations/sms.js';
import * as push from './integrations/push.js';
import * as maps from './integrations/maps.js';
import { makeToken, userIdFromToken, hashPassword, isHashed, verifyPassword, rateLimit, requireRole, pick } from './security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1); // за облачным прокси (Render/туннель) — корректный req.ip

// CORS: в проде разрешаем только указанные источники (или single-origin без CORS),
// в dev — всё, для удобства. ALLOWED_ORIGINS="https://site1,https://site2"
const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors(process.env.NODE_ENV === 'production'
  ? { origin: allowed.length ? allowed : false }
  : {}));

app.use(express.json({ limit: '256kb' }));

// Базовые security-заголовки (без зависимостей)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '0');
  next();
});

const PORT = process.env.PORT || 4000;

// Загружаем сохранённое состояние с диска (если есть)
load();
installShutdownHooks();

// Миграция: хешируем все пароли, оставшиеся в открытом виде (демо-сид, старые данные)
for (const u of db.users) { if (u.password && !isHashed(u.password)) u.password = hashPassword(u.password); }

// После любого изменяющего запроса — сохраняем состояние на диск
app.use((req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) persist(); });
  next();
});

// Реальная доставка Web Push поверх in-app очереди: при каждом уведомлении
// с конкретным userId шлём наружу в его подписки (если push настроен).
db.hooks.onNotify = (n) => {
  if (n.userId) push.sendPush(n.userId, { title: 'GROT Bar & Grill', body: n.text }).catch(() => {});
};

// ---- Авторизация: подписанный HMAC-токен (см. security.js) ----
const tokenFor = (u) => makeToken(u);
const auth = (req, res, next) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const uid = userIdFromToken(t);
  const u = uid && db.users.find((x) => x.id === uid);
  if (!u) return res.status(401).json({ error: 'Не авторизован' });
  if (u.active === false) return res.status(403).json({ error: 'Доступ отключён' });
  req.user = u;
  next();
};
const sanitize = (u) => { const { password, ...rest } = u; return rest; };
const STAFF = ['waiter', 'cook', 'courier', 'admin', 'owner'];

// ================= AUTH =================
const authLimiter = rateLimit({ max: 10, windowMs: 60_000 });

// Регистрация: телефон подтверждается кодом из SMS + задаётся пароль.
// Требовать ли SMS-код при регистрации. По умолчанию ВЫКЛ (простая регистрация имя+телефон+пароль).
// Чтобы включить проверку кода (когда Twilio боевой) — задать REQUIRE_OTP=true в окружении.
const REQUIRE_OTP = process.env.REQUIRE_OTP === 'true';

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { phone, code, password, name } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'Телефон и пароль обязательны' });
  if (String(password).length < 4) return res.status(400).json({ error: 'Пароль слишком короткий' });
  if (db.users.find((u) => u.phone === phone)) return res.status(409).json({ error: 'Пользователь с этим номером уже есть' });
  if (REQUIRE_OTP && !(await sms.verifyCode(phone, code))) return res.status(401).json({ error: 'Неверный или просроченный код из SMS' });
  const u = { id: db.id(), phone: String(phone), password: hashPassword(password), name: String(name || 'Гость').slice(0, 60), role: 'client',
    createdAt: db.now(), stats: { totalSpent: 0, ordersCount: 0, visits: 0, lastVisit: null }, favDishes: [], favDrinks: [] };
  db.users.push(u);
  res.json({ token: tokenFor(u), user: sanitize(u) });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { phone, password } = req.body;
  const u = db.users.find((x) => x.phone === phone);
  if (!u || !verifyPassword(password, u.password)) return res.status(401).json({ error: 'Неверный телефон или пароль' });
  if (u.active === false) return res.status(403).json({ error: 'Доступ отключён владельцем' });
  res.json({ token: tokenFor(u), user: sanitize(u) });
});

// Смена собственного пароля (любой авторизованный)
app.post('/api/me/password', auth, (req, res) => {
  const { password } = req.body;
  if (!password || String(password).length < 4) return res.status(400).json({ error: 'Пароль слишком короткий' });
  req.user.password = hashPassword(password);
  res.json({ ok: true });
});

// Смена собственного номера телефона (логина)
app.post('/api/me/phone', auth, (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Укажите номер' });
  if (db.users.find((u) => u.phone === String(phone) && u.id !== req.user.id)) return res.status(409).json({ error: 'Этот номер уже используется' });
  req.user.phone = String(phone);
  res.json({ ok: true, phone: req.user.phone });
});

// SMS / OTP. В демо-режиме (без Twilio) код возвращается в ответе — для теста.
// devCode отдаётся только вне продакшена.
app.post('/api/auth/request-otp', authLimiter, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Укажите телефон' });
  try {
    // requestOtp сам выбирает режим (Verify / Messaging / демо). В демо вернёт devCode.
    const r = await sms.requestOtp(phone);
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('OTP send failed:', e.message);
    res.status(502).json({ error: 'Не удалось отправить SMS' });
  }
});

// Сброс пароля только с подтверждением кодом из SMS (OTP).
app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  const { phone, code, password } = req.body;
  if (!password || String(password).length < 4) return res.status(400).json({ error: 'Пароль слишком короткий' });
  if (!(await sms.verifyCode(phone, code))) return res.status(401).json({ error: 'Неверный или просроченный код подтверждения' });
  const u = db.users.find((x) => x.phone === phone);
  if (!u) return res.status(404).json({ error: 'Не найден' });
  u.password = hashPassword(password);
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json(sanitize(req.user)));

// ================= КОНТЕНТ ГЛАВНОГО ЭКРАНА =================
app.get('/api/intro', (req, res) => res.json(db.intro));
app.put('/api/intro', auth, requireRole('owner', 'admin'), (req, res) => {
  Object.assign(db.intro, pick(req.body, ['badge', 'badgeEn', 'title', 'titleEn', 'subtitle', 'subtitleEn', 'text', 'textEn', 'cta', 'ctaEn', 'durationMs']));
  res.json(db.intro);
});

app.get('/api/home', (req, res) => {
  res.json({
    intro: db.intro,
    promos: db.promos,
    news: db.news,
    popularDishes: db.menu.filter((x) => x.popular && x.group === 'food'),
    popularDrinks: db.menu.filter((x) => x.popular && x.group === 'drinks'),
    events: db.events.slice(0, 4),
  });
});
app.get('/api/news', (req, res) => res.json(db.news));
app.get('/api/promos', (req, res) => res.json(db.promos));
const NEWS_FIELDS = ['title', 'titleEn', 'date', 'text', 'textEn'];
app.put('/api/news/:id', auth, requireRole('owner', 'admin'), (req, res) => {
  const n = db.news.find((x) => x.id === Number(req.params.id));
  if (!n) return res.status(404).json({ error: 'Нет новости' });
  Object.assign(n, pick(req.body, NEWS_FIELDS));
  res.json(n);
});

// ================= МЕНЮ =================
app.get('/api/menu', (req, res) => res.json({ categories: db.categories, categoryGroups: db.categoryGroups, items: db.menu }));
const MENU_FIELDS = ['name', 'nameEn', 'category', 'group', 'price', 'description', 'available', 'weight', 'style', 'calories', 'composition', 'popular', 'isNew', 'image', 'recipe'];
app.post('/api/menu', auth, requireRole('owner', 'admin'), (req, res) => {
  const item = { id: db.id(), available: true, recipe: {}, group: 'food', ...pick(req.body, MENU_FIELDS) };
  db.menu.push(item); res.json(item);
});
app.put('/api/menu/:id', auth, requireRole('owner', 'admin'), (req, res) => {
  const item = db.menu.find((x) => x.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Нет позиции' });
  Object.assign(item, pick(req.body, MENU_FIELDS));
  res.json(item);
});
// Стоп-лист: наличие позиции (кухня/админ/владелец)
app.patch('/api/menu/:id/availability', auth, requireRole('owner', 'admin', 'cook'), (req, res) => {
  const item = db.menu.find((x) => x.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Нет позиции' });
  item.available = !!req.body.available;
  res.json(item);
});

// ================= СТОЛЫ / QR =================
app.get('/api/tables', (req, res) => res.json(db.tables));
app.get('/api/tables/qr/:qr', (req, res) => {
  const t = db.tables.find((x) => x.qr === req.params.qr);
  if (!t) return res.status(404).json({ error: 'Стол не найден' });
  res.json(t);
});
app.patch('/api/tables/:id', auth, requireRole('owner', 'admin', 'waiter'), (req, res) => {
  const t = db.tables.find((x) => x.id === Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Нет стола' });
  Object.assign(t, pick(req.body, ['status', 'seats']));
  res.json(t);
});

// Вызов официанта / счёт — только авторизованный гость, с анти-спамом
app.post('/api/calls', auth, rateLimit({ max: 6, windowMs: 60_000 }), (req, res) => {
  const tableNumber = Number(req.body.tableNumber) || null;
  const type = req.body.type === 'bill' ? 'bill' : 'waiter';
  const c = { id: db.id(), tableNumber, type, status: 'open', userId: req.user.id, createdAt: db.now() };
  db.calls.push(c);
  db.pushNotify({ role: 'waiter', text: type === 'bill'
    ? `💳 Стол №${tableNumber} просит счёт`
    : `🔔 Стол №${tableNumber} вызывает официанта` });
  res.json(c);
});
app.get('/api/calls', auth, requireRole(...STAFF), (req, res) => res.json(db.calls.filter((c) => c.status === 'open')));
app.patch('/api/calls/:id', auth, requireRole(...STAFF), (req, res) => {
  const c = db.calls.find((x) => x.id === Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Нет вызова' });
  c.status = req.body.status || 'done';
  res.json(c);
});

// ================= ЗАКАЗЫ =================
app.post('/api/orders', auth, (req, res) => {
  const { items: reqItems, type, address, comment, tableNumber, geo } = req.body;
  if (!Array.isArray(reqItems) || !reqItems.length) return res.status(400).json({ error: 'Корзина пуста' });
  // ВАЖНО: цены и названия берём из меню на сервере, НЕ доверяем клиенту.
  const items = []; let total = 0;
  for (const it of reqItems) {
    const dish = db.menu.find((m) => m.id === Number(it.menuId));
    if (!dish) return res.status(400).json({ error: 'Позиция не найдена' });
    if (!dish.available) return res.status(409).json({ error: `«${dish.name}» сейчас недоступна` });
    const qty = Math.min(50, Math.max(1, Math.floor(Number(it.qty) || 1)));
    items.push({ menuId: dish.id, name: dish.name, nameEn: dish.nameEn || null, price: dish.price, qty });
    total += dish.price * qty;
  }
  const allowedTypes = ['delivery', 'pickup', 'dinein'];
  const order = { id: db.id(), userId: req.user.id, items,
    type: allowedTypes.includes(type) ? type : 'dinein',
    address: address ? String(address).slice(0, 300) : null,
    geo: (geo && typeof geo.lat === 'number' && typeof geo.lng === 'number') ? { lat: geo.lat, lng: geo.lng, mapUrl: String(geo.mapUrl || '').slice(0, 300) } : null,
    comment: comment ? String(comment).slice(0, 500) : '',
    tableNumber: tableNumber ? Number(tableNumber) : null, total, status: 'new', createdAt: db.now() };
  db.orders.push(order);
  if (req.user.stats) { req.user.stats.totalSpent += total; req.user.stats.ordersCount += 1; req.user.stats.lastVisit = db.now(); }
  db.pushNotify({ role: 'waiter', text: `🆕 Новый заказ #${order.id} (${type})` });
  db.pushNotify({ userId: req.user.id, text: `Заказ #${order.id} принят`, key: 'ntf_order_placed', data: { id: order.id } });
  res.json(order);
});

app.get('/api/orders', auth, (req, res) => {
  // клиент видит свои; персонал — все
  const list = ['client'].includes(req.user.role)
    ? db.orders.filter((o) => o.userId === req.user.id)
    : db.orders;
  res.json(list.slice().reverse());
});
app.get('/api/orders/active', auth, (req, res) =>
  res.json(db.orders.filter((o) => o.userId === req.user.id && !['delivered', 'handed'].includes(o.status))));

const STATUS_MSG = {
  accepted: 'принят', cooking: 'готовится', ready: 'готов',
  delivering: 'передан курьеру', delivered: 'доставлен', handed: 'выдан',
};

// списание ингредиентов по тех. картам при завершении
const writeOffStock = (order) => {
  for (const it of order.items) {
    const dish = db.menu.find((m) => m.id === it.menuId);
    if (!dish?.recipe) continue;
    for (const [ingId, perPortion] of Object.entries(dish.recipe)) {
      const ing = db.ingredients.find((g) => g.id === Number(ingId));
      if (ing) {
        ing.qty -= perPortion * it.qty;
        if (ing.qty <= ing.min) db.pushNotify({ role: 'owner', text: `⚠️ Низкий остаток: ${ing.name}${ing.alcohol ? ' (алкоголь заканчивается)' : ''}` });
      }
    }
  }
};

const ORDER_STATUSES = ['new', 'accepted', 'cooking', 'ready', 'delivering', 'delivered', 'handed'];
app.patch('/api/orders/:id/status', auth, requireRole(...STAFF), (req, res) => {
  const o = db.orders.find((x) => x.id === Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'Нет заказа' });
  const { status } = req.body;
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Недопустимый статус' });
  o.status = status;
  // Привязка к конкретному сотруднику по его роли (для личной статистики).
  if (req.user.role === 'waiter' && !o.waiterId) o.waiterId = req.user.id;
  if (req.user.role === 'courier') o.courierId = req.user.id;
  if (status === 'ready') db.pushNotify({ role: 'waiter', text: `✅ Заказ #${o.id} готов` });
  if (['delivered', 'handed'].includes(status)) writeOffStock(o);
  if (STATUS_MSG[status]) db.pushNotify({ userId: o.userId, text: `Заказ #${o.id} ${STATUS_MSG[status]}`, key: 'ntf_status_' + status, data: { id: o.id } });
  res.json(o);
});

// ================= БРОНИРОВАНИЕ =================
app.get('/api/reservations', auth, (req, res) => {
  const list = req.user.role === 'client' ? db.reservations.filter((r) => r.userId === req.user.id) : db.reservations;
  res.json(list);
});
app.post('/api/reservations', auth, (req, res) => {
  const { tableNumber, date, time, guests, comment, preorder } = req.body;
  const r = { id: db.id(), userId: req.user.id, tableNumber, date, time, guests, comment: comment || '',
    preorder: preorder || [], status: 'pending', createdAt: db.now() };
  db.reservations.push(r);
  const t = db.tables.find((x) => x.number === tableNumber);
  if (t) t.status = 'reserved';
  db.pushNotify({ role: 'waiter', text: `📅 Новая бронь: стол №${tableNumber}, ${date} ${time}` });
  res.json(r);
});
app.patch('/api/reservations/:id', auth, (req, res) => {
  const r = db.reservations.find((x) => x.id === Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Нет брони' });
  // клиент может менять только свою бронь; персонал — любую
  const staff = STAFF.includes(req.user.role);
  if (!staff && r.userId !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
  const fields = staff ? ['status', 'date', 'time', 'guests', 'comment', 'tableNumber'] : ['date', 'time', 'guests', 'comment'];
  Object.assign(r, pick(req.body, fields));
  res.json(r);
});

// ================= СОБЫТИЯ =================
const EVENT_FIELDS = ['day', 'emoji', 'title', 'titleEn', 'time', 'description', 'descriptionEn', 'banner'];
app.get('/api/events', (req, res) => res.json(db.events));
app.post('/api/events', auth, requireRole('owner', 'admin'), (req, res) => {
  const e = { id: db.id(), reminders: [], ...pick(req.body, EVENT_FIELDS) }; db.events.push(e); res.json(e);
});
app.put('/api/events/:id', auth, requireRole('owner', 'admin'), (req, res) => {
  const e = db.events.find((x) => x.id === Number(req.params.id));
  if (!e) return res.status(404).json({ error: 'Нет события' });
  Object.assign(e, pick(req.body, EVENT_FIELDS)); res.json(e);
});
app.post('/api/events/:id/remind', auth, (req, res) => {
  const e = db.events.find((x) => x.id === Number(req.params.id));
  if (!e) return res.status(404).json({ error: 'Нет события' });
  if (!e.reminders.includes(req.user.id)) e.reminders.push(req.user.id);
  db.pushNotify({ userId: req.user.id, text: `🔔 Напомним о событии «${e.title}» в ${e.time}`, key: 'ntf_event_reminder', data: { title: e.title, time: e.time } });
  res.json({ ok: true });
});

// ================= CRM =================
app.get('/api/crm/clients', auth, (req, res) => {
  if (!['owner', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
  res.json(db.users.filter((u) => u.role === 'client').map((u) => ({
    id: u.id, name: u.name, phone: u.phone,
    createdAt: u.createdAt, ...u.stats, favDishes: u.favDishes, favDrinks: u.favDrinks,
  })));
});

// ================= ПЕРСОНАЛ (аккаунты сотрудников) =================
const STAFF_ROLES = ['waiter', 'cook', 'courier', 'admin'];
const ROLE_LABEL = { owner: 'Владелец', admin: 'Администратор', waiter: 'Официант', cook: 'Кухня', courier: 'Курьер' };

const handledBy = (u) => u.role === 'courier'
  ? db.orders.filter((o) => o.courierId === u.id)
  : db.orders.filter((o) => o.waiterId === u.id);

app.get('/api/staff', auth, requireRole('owner', 'admin'), (req, res) => {
  res.json(db.users.filter((u) => u.role !== 'client').map((u) => ({
    id: u.id, name: u.name, phone: u.phone, role: u.role, roleLabel: ROLE_LABEL[u.role] || u.role,
    active: u.active !== false, isOwner: u.role === 'owner', isSelf: u.id === req.user.id,
    ordersHandled: (u.role === 'waiter' || u.role === 'courier') ? handledBy(u).length : null,
  })));
});

// Личная статистика сотрудника (какие заказы вёл, сколько, на какую сумму)
app.get('/api/staff/:id/stats', auth, requireRole('owner', 'admin'), (req, res) => {
  const u = db.users.find((x) => x.id === Number(req.params.id));
  if (!u || u.role === 'client') return res.status(404).json({ error: 'Не найден' });
  const orders = handledBy(u);
  const delivered = orders.filter((o) => ['delivered', 'handed'].includes(o.status));
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  res.json({
    id: u.id, name: u.name, role: u.role, roleLabel: ROLE_LABEL[u.role] || u.role,
    ordersHandled: orders.length,
    completed: delivered.length,
    revenue,
    orders: orders.slice().reverse().slice(0, 40).map((o) => ({
      id: o.id, status: o.status, total: o.total, type: o.type, createdAt: o.createdAt,
      items: o.items.map((i) => `${i.name} ×${i.qty}`).join(', '),
    })),
  });
});

app.post('/api/staff', auth, requireRole('owner', 'admin'), (req, res) => {
  const { name, phone, role, password } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'Заполните имя, телефон и пароль' });
  if (!STAFF_ROLES.includes(role)) return res.status(400).json({ error: 'Выберите роль' });
  if (String(password).length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });
  if (db.users.find((u) => u.phone === phone)) return res.status(409).json({ error: 'Этот телефон уже используется' });
  const u = { id: db.id(), phone: String(phone), password: hashPassword(password), name: String(name).slice(0, 60),
    role, active: true, createdAt: db.now() };
  db.users.push(u);
  res.json({ id: u.id, name: u.name, phone: u.phone, role: u.role, active: true });
});

app.patch('/api/staff/:id', auth, requireRole('owner', 'admin'), (req, res) => {
  const u = db.users.find((x) => x.id === Number(req.params.id));
  if (!u || u.role === 'client') return res.status(404).json({ error: 'Сотрудник не найден' });
  const { name, role, password, active } = req.body;
  if (name) u.name = String(name).slice(0, 60);
  if (role && STAFF_ROLES.includes(role) && u.role !== 'owner') u.role = role;
  if (typeof active === 'boolean' && u.role !== 'owner' && u.id !== req.user.id) u.active = active;
  if (password && String(password).length >= 4) u.password = hashPassword(password);
  res.json({ ok: true });
});

app.delete('/api/staff/:id', auth, requireRole('owner', 'admin'), (req, res) => {
  const i = db.users.findIndex((x) => x.id === Number(req.params.id));
  if (i === -1) return res.status(404).json({ error: 'Не найден' });
  if (db.users[i].role === 'client' || db.users[i].role === 'owner') return res.status(400).json({ error: 'Нельзя удалить' });
  if (db.users[i].id === req.user.id) return res.status(400).json({ error: 'Нельзя удалить себя' });
  db.users.splice(i, 1);
  res.json({ ok: true });
});

// ================= РАССЫЛКИ =================
app.post('/api/broadcasts', auth, (req, res) => {
  if (!['owner', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
  const { segment, text } = req.body;
  const b = { id: db.id(), segment, text, createdAt: db.now() };
  db.broadcasts.push(b);
  // выбор сегмента
  let targets = db.users.filter((u) => u.role === 'client');
  if (segment === 'vip') targets = targets.filter((u) => (u.stats?.totalSpent || 0) >= 50000);
  if (segment === 'inactive') targets = targets.filter((u) => (u.stats?.lastVisit ? (Date.now() - new Date(u.stats.lastVisit)) > 30 * 864e5 : true));
  targets.forEach((u) => db.pushNotify({ userId: u.id, text }));
  res.json({ ...b, delivered: targets.length });
});
app.get('/api/broadcasts', auth, (req, res) => res.json(db.broadcasts.slice().reverse()));

// ================= СКЛАД =================
app.get('/api/inventory', auth, (req, res) => res.json(db.ingredients));

// Изменение остатка. {qty} — установить точное значение (инвентаризация),
// {addQty} — прибавить (приход/закупка). Для владельца/админа.
app.patch('/api/inventory/:id', auth, (req, res) => {
  if (!['owner', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
  const ing = db.ingredients.find((x) => x.id === Number(req.params.id));
  if (!ing) return res.status(404).json({ error: 'Нет ингредиента' });
  const { qty, addQty, min, supplier } = req.body;
  if (typeof addQty === 'number') ing.qty += addQty;
  if (typeof qty === 'number') ing.qty = qty;
  if (typeof min === 'number') ing.min = min;
  if (typeof supplier === 'string') ing.supplier = supplier;
  res.json(ing);
});

// Автоподсчёт: сколько порций каждого блюда можно приготовить из текущих остатков.
// portions = min по ингредиентам floor(остаток / расход_на_порцию). Для владельца/админа.
app.get('/api/inventory/production', auth, (req, res) => {
  if (!['owner', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
  const byId = Object.fromEntries(db.ingredients.map((g) => [g.id, g]));
  const result = db.menu
    .filter((dish) => dish.recipe && Object.keys(dish.recipe).length)
    .map((dish) => {
      let portions = Infinity; let limiting = null;
      for (const [ingId, per] of Object.entries(dish.recipe)) {
        const g = byId[Number(ingId)];
        const canMake = g ? Math.floor(g.qty / per) : 0;
        if (canMake < portions) { portions = canMake; limiting = g?.name || '—'; }
      }
      return { id: dish.id, name: dish.name, group: dish.group, category: dish.category,
        portions: portions === Infinity ? 0 : Math.max(0, portions), limiting };
    })
    .sort((a, b) => a.portions - b.portions);
  res.json(result);
});

// ================= АНАЛИТИКА =================
app.get('/api/analytics', auth, (req, res) => {
  if (!['owner', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
  const all = db.orders;
  const revenue = all.reduce((s, o) => s + o.total, 0);
  const avgCheck = all.length ? Math.round(revenue / all.length) : 0;
  const byDish = {};
  all.forEach((o) => o.items.forEach((i) => { byDish[i.name] = (byDish[i.name] || 0) + i.qty; }));
  const topDishes = Object.entries(byDish).sort((a, b) => b[1] - a[1]).slice(0, 5);
  res.json({
    revenue, avgCheck,
    revenueByDay: { 'Сегодня': revenue, 'Неделя': Math.round(revenue * 6.4), 'Месяц': Math.round(revenue * 27) },
    guests: db.users.filter((u) => u.role === 'client').length,
    deliveries: all.filter((o) => o.type === 'delivery').length,
    reservations: db.reservations.length,
    topDishes,
    tableLoad: Math.round((db.tables.filter((t) => t.status !== 'free').length / db.tables.length) * 100),
    returningClients: db.users.filter((u) => (u.stats?.ordersCount || 0) > 1).length,
  });
});

// ================= УВЕДОМЛЕНИЯ (polling) =================
app.get('/api/notifications', auth, (req, res) => {
  const mine = db.notifications.filter((n) => (n.userId && n.userId === req.user.id) || (n.role && n.role === req.user.role));
  res.json(mine.slice().reverse());
});
app.patch('/api/notifications/read', auth, (req, res) => {
  db.notifications.forEach((n) => { if ((n.userId === req.user.id) || (n.role === req.user.role)) n.read = true; });
  res.json({ ok: true });
});

// ================= PUSH (Web Push) =================
app.post('/api/push/subscribe', auth, (req, res) => {
  if (!req.body?.subscription) return res.status(400).json({ error: 'Нет подписки' });
  push.saveSubscription(req.user.id, req.body.subscription);
  res.json({ ok: true });
});

// ================= КАРТЫ / ДОСТАВКА =================
app.post('/api/delivery/check', auth, rateLimit({ max: 30, windowMs: 60_000 }), async (req, res) => {
  const { address, lat, lng } = req.body;
  try { res.json(await maps.checkDelivery({ address, lat, lng })); }
  catch { res.status(400).json({ error: 'Не удалось проверить адрес' }); }
});

// ================= ПУБЛИЧНЫЙ КОНФИГ ДЛЯ ФРОНТЕНДА =================
app.get('/api/config', (req, res) => res.json({
  smsEnabled: sms.smsEnabled,
  otpRequired: REQUIRE_OTP,
  pushEnabled: push.pushEnabled,
  vapidPublicKey: push.vapidPublicKey,
  mapsEnabled: maps.mapsEnabled,
  mapsBrowserKey: maps.mapsBrowserKey,
}));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'GROT API' }));

// Неизвестные /api — 404 JSON (а не HTML фронтенда)
app.use('/api', (req, res) => res.status(404).json({ error: 'Не найдено' }));

// Глобальный обработчик ошибок — без утечки стека наружу
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Слишком большой запрос' });
  if (err) { console.error('Ошибка:', err.message); return res.status(400).json({ error: 'Некорректный запрос' }); }
  next();
});

// ================= ПРОДАКШЕН: раздача собранного фронтенда =================
// При NODE_ENV=production backend отдаёт статику фронта (single-origin),
// поэтому ссылка одна и тот же домен и для UI, и для API.
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`🔥 GROT API на http://localhost:${PORT}`));
