// ─────────────────────────────────────────────────────────────────────────────
// GROT · Печать чеков на термопринтер 58мм (ESC/POS) из аккаунта официанта.
//
// Транспорт: Bluetooth Classic (SPP) через плагин cordova-plugin-bluetooth-serial,
// который в нативной Android-сборке (Capacitor) отдаёт объект window.bluetoothSerial.
// В обычном вебе (dev, без обёртки) плагина нет — тогда работает ПРЕВЬЮ: чек
// показывается текстом, чтобы можно было проверить формат без железа.
//
// Принтер из поставки: имя Printer001, PIN 0000, протокол ESC/POS, ширина 58мм
// (шрифт 12×24 → 32 символа в строке). QR-код принтер поддерживает (проверено
// самотестом). iOS этот принтер по Bluetooth Classic не увидит — только Android.
// ─────────────────────────────────────────────────────────────────────────────

// Реквизиты чека — правится под заведение. Чек печатается латиницей (USA charset
// принтера) — для Паттайи это ок. Для тайского/кириллицы нужно переключение
// кодовой страницы принтера (см. заметку внизу файла).
export const RECEIPT_CONFIG = {
  name: 'GROT BAR & GRILL',
  address: 'Pattaya, Thailand',
  phone: '+66 00 000 0000',
  footer: 'THANK YOU! SEE YOU AGAIN',
  qrUrl: 'https://grot.bar',   // QR внизу чека (меню / отзыв / лояльность)
  serviceChargePct: 0,          // 0 = без сервисного сбора; напр. 10 = +10%
  currency: 'THB',
};

const WIDTH = 32;                 // символов в строке для 58мм
const STORE_KEY = 'grot_printer'; // сохранённый принтер {address,name}

// ── ESC/POS: низкоуровневые команды ────────────────────────────────────────────
const ESC = 0x1b, GS = 0x1d;
const CMD = {
  init: [ESC, 0x40],                       // сброс
  alignL: [ESC, 0x61, 0], alignC: [ESC, 0x61, 1], alignR: [ESC, 0x61, 2],
  boldOn: [ESC, 0x45, 1], boldOff: [ESC, 0x45, 0],
  sizeNormal: [GS, 0x21, 0x00],            // обычный
  sizeTall: [GS, 0x21, 0x01],              // двойная высота
  sizeBig: [GS, 0x21, 0x11],               // двойная высота+ширина
  feed: (n = 1) => [ESC, 0x64, n],         // прогон n строк
  cut: [GS, 0x56, 0x42, 0x00],             // обрез (если есть резак; иначе игнор)
  // Открыть денежный ящик (kick). Бьём по ОБОИМ пинам (2 и 5) с усиленным импульсом —
  // так срабатывает почти любой ящик, независимо от распайки кабеля.
  drawer: [
    ESC, 0x70, 0x00, 0x40, 0xfa,   // ESC p 0 — пин 2
    ESC, 0x70, 0x01, 0x40, 0xfa,   // ESC p 1 — пин 5
  ],
};

// Строку → байты (латиница/цифры). Всё, что вне ASCII, → '?', чтобы не было мусора.
function textBytes(str) {
  const out = [];
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    out.push(c > 0x7f ? 0x3f : c);
  }
  return out;
}

// QR-код (модель 2) — стандартная ESC/POS последовательность GS ( k.
function qrBytes(data) {
  const d = textBytes(data);
  const len = d.length + 3;
  const pL = len & 0xff, pH = (len >> 8) & 0xff;
  return [
    GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00, // модель 2
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06,       // размер модуля = 6
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30,       // коррекция ошибок L
    GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...d,      // данные
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,       // печать
  ];
}

// ── Формат чека ────────────────────────────────────────────────────────────────
const rule = () => '-'.repeat(WIDTH);
const money = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
// Строка «слева … справа» по ширине чека (левая часть при нужде обрезается).
function lr(left, right) {
  left = String(left); right = String(right);
  const space = WIDTH - right.length;
  if (left.length > space - 1) left = left.slice(0, space - 1);
  return left + ' '.repeat(Math.max(1, space - left.length)) + right;
}
const fmtDate = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Собрать чек: возвращает { bytes:[…ESC/POS], text:'превью' }.
// opts.cash — сумма наличных (для строки «Сдача»); opts.openDrawer — открыть ящик.
export function buildReceipt(order, opts = {}) {
  const cfg = RECEIPT_CONFIG;
  const items = order.items || [];
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const service = cfg.serviceChargePct ? Math.round(subtotal * cfg.serviceChargePct / 100) : 0;
  const total = order.total != null && !cfg.serviceChargePct ? order.total : subtotal + service;

  const bytes = [];
  const text = [];
  const put = (arr) => bytes.push(...arr);
  const line = (str = '') => { put(textBytes(str)); put([0x0a]); text.push(str); };
  const center = (str) => { put(CMD.alignC); line(str); put(CMD.alignL); };

  put(CMD.init);

  // Шапка
  put(CMD.alignC);
  put(CMD.boldOn); put(CMD.sizeTall); line(cfg.name); put(CMD.sizeNormal); put(CMD.boldOff);
  line(cfg.address);
  if (cfg.phone) line('Tel: ' + cfg.phone);
  put(CMD.alignL);
  line(rule());

  // Мета: стол/тип + номер заказа + дата
  const where = order.type === 'delivery' ? 'Delivery'
    : order.tableNumber ? `Table ${order.tableNumber}`
    : order.type === 'pickup' ? 'Pickup' : 'Dine-in';
  line(lr(where, `Order #${order.id}`));
  line(fmtDate(order.createdAt));
  line(rule());

  // Позиции
  for (const i of items) {
    const name = i.nameEn || i.name;
    line(lr(`${i.qty}x ${name}`, money(i.price * i.qty)));
  }
  line(rule());

  // Итоги
  line(lr('Subtotal', money(subtotal)));
  if (service) line(lr(`Service ${cfg.serviceChargePct}%`, money(service)));
  put(CMD.boldOn); put(CMD.sizeTall);
  line(lr('TOTAL', `${money(total)} ${cfg.currency}`));
  put(CMD.sizeNormal); put(CMD.boldOff);
  if (opts.cash != null) {
    line(rule());
    line(lr('Cash', money(opts.cash)));
    line(lr('Change', money(opts.cash - total)));
  }
  line(rule());

  // Подвал + QR
  center(cfg.footer);
  if (cfg.qrUrl) {
    put([0x0a]);
    put(CMD.alignC);
    put(qrBytes(`${cfg.qrUrl}?o=${order.id}`));
    put([0x0a]);
    put(CMD.alignL);
    text.push('[QR] ' + cfg.qrUrl);
  }

  // Отступ + обрез (+ ящик по запросу)
  put(CMD.feed(3));
  put(CMD.cut);
  if (opts.openDrawer) put(CMD.drawer);

  return { bytes, text: text.join('\n') };
}

// ── Транспорт: Bluetooth Serial (Capacitor/Cordova) ─────────────────────────────
const BT = () => (typeof window !== 'undefined' ? window.bluetoothSerial : null);
export const isNativePrintingAvailable = () => !!BT();

const wrap = (fn) => new Promise((resolve, reject) => fn(resolve, reject));

export const printerStore = {
  get: () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; } },
  set: (d) => localStorage.setItem(STORE_KEY, JSON.stringify(d)),
  clear: () => localStorage.removeItem(STORE_KEY),
};

// Список спаренных Bluetooth-устройств (только в приложении).
export async function listPrinters() {
  const bt = BT();
  if (!bt) return [];
  return wrap((ok, err) => bt.list(ok, err)); // [{name, address, id, class}]
}

// Подключиться и запомнить принтер.
export async function connectPrinter(device) {
  const bt = BT();
  if (!bt) throw new Error('NO_NATIVE');
  await wrap((ok, err) => bt.connect(device.address, ok, err));
  printerStore.set({ address: device.address, name: device.name });
  return true;
}

export async function disconnectPrinter() {
  const bt = BT();
  if (bt) await wrap((ok, err) => bt.disconnect(ok, err)).catch(() => {});
}

// Готов ли принтер к печати прямо сейчас.
export async function isConnected() {
  const bt = BT();
  if (!bt) return false;
  try { return await wrap((ok) => bt.isConnected(ok, () => ok(false))); } catch { return false; }
}

// Отправить сырые байты, при необходимости — переподключиться к сохранённому.
async function writeBytes(bytes) {
  const bt = BT();
  if (!bt) throw new Error('NO_NATIVE');
  if (!(await isConnected())) {
    const saved = printerStore.get();
    if (!saved) throw new Error('NO_PRINTER');
    await wrap((ok, err) => bt.connect(saved.address, ok, err));
  }
  const buf = new Uint8Array(bytes).buffer;
  await wrap((ok, err) => bt.write(buf, ok, err));
}

// Главная точка: напечатать чек по заказу.
// В приложении с принтером → печатает. Без принтера → бросает NO_PRINTER,
// но кладёт в ошибку .preview (текст чека), чтобы UI показал превью.
export async function printReceipt(order, opts = {}) {
  const { bytes, text } = buildReceipt(order, opts);
  if (!isNativePrintingAvailable()) {
    const e = new Error('NO_PRINTER'); e.preview = text; throw e;
  }
  try {
    await writeBytes(bytes);
    return { ok: true, text };
  } catch (err) {
    err.preview = text;
    throw err;
  }
}

// Открыть денежный ящик (kick через принтер).
export async function openDrawer() {
  await writeBytes(CMD.drawer);
}

// ─────────────────────────────────────────────────────────────────────────────
// ЗАМЕТКА по кириллице/тайскому:
// Принтер печатает латиницу из коробки. Для тайского — переключить кодовую
// страницу (ESC t n, где n = индекс Thai) и слать текст в TIS-620; для кириллицы —
// n для WPC1251/CP866 и кодировать соответствующе. Названия блюд берём из nameEn,
// поэтому по умолчанию всё печатается корректно без переключения кодировок.
// ─────────────────────────────────────────────────────────────────────────────
