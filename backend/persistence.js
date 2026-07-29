// =====================================================================
// Слой персистентности: снимок состояния в JSON-файл на диске.
// Данные переживают перезапуск/деплой. В облаке файл лежит на volume.
// Апгрейд на PostgreSQL делается заменой этого модуля без правок API.
// Путь к файлу: ENV DATA_FILE или ./data/store.json
// =====================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'store.json');

// Коллекции-массивы, которые мы сохраняем «как есть»
// tables НЕ персистим — это конфиг зала (берётся из сидов при старте),
// а занятость столов вычисляется по открытым заказам.
const ARRAYS = ['users', 'menu', 'ingredients', 'orders', 'reservations',
  'events', 'promos', 'news', 'calls', 'notifications', 'broadcasts'];
// Объекты-синглтоны
const OBJECTS = ['intro', 'settings'];

function snapshot() {
  const snap = { _id: db.dumpId(), _savedAt: new Date().toISOString() };
  for (const k of ARRAYS) snap[k] = db[k];
  for (const k of OBJECTS) snap[k] = db[k];
  return snap;
}

export function load() {
  try {
    if (!fs.existsSync(FILE)) return false;
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    db.loadId(data._id);
    for (const k of ARRAYS) {
      if (Array.isArray(data[k])) { db[k].length = 0; db[k].push(...data[k]); }
    }
    for (const k of OBJECTS) {
      if (data[k]) Object.assign(db[k], data[k]);
    }
    console.log(`💾 Загружено состояние из ${FILE}`);
    return true;
  } catch (e) {
    console.warn('⚠️ Не удалось загрузить состояние:', e.message);
    return false;
  }
}

// Атомарная запись: пишем во временный файл и переименовываем. rename на одной
// ФС атомарен, поэтому падение/рестарт посреди записи не оставит «обрубок» —
// на диске всегда либо прежний снимок, либо новый целиком.
function writeSnapshot() {
  const dir = path.dirname(FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot()), 'utf8');
  fs.renameSync(tmp, FILE);
  backupDaily(dir);
}

// Резервная копия раз в сутки: store-YYYY-MM-DD.json, храним последние 14.
// Защищает от логической порчи данных (ошибочный сброс, кривая правка).
const BACKUP_KEEP = 14;
let lastBackupDay = null;
function backupDaily(dir) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (day === lastBackupDay) return;
    const bdir = path.join(dir, 'backups');
    fs.mkdirSync(bdir, { recursive: true });
    const target = path.join(bdir, `store-${day}.json`);
    if (!fs.existsSync(target)) fs.copyFileSync(FILE, target);
    lastBackupDay = day;
    const old = fs.readdirSync(bdir).filter((f) => f.startsWith('store-')).sort();
    for (const f of old.slice(0, Math.max(0, old.length - BACKUP_KEEP))) {
      fs.unlinkSync(path.join(bdir, f));
    }
  } catch (e) { console.warn('⚠️ Бэкап не сделан:', e.message); }
}

let timer = null;
export function persist() {
  // debounce: пишем не чаще раза в 800мс
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try { writeSnapshot(); }
    catch (e) { console.warn('⚠️ Ошибка записи состояния:', e.message); }
  }, 800);
}

// Сохранение при штатном завершении
export function installShutdownHooks() {
  const flush = () => {
    try { writeSnapshot(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', flush);
  process.on('SIGTERM', flush);
}
