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

let timer = null;
export function persist() {
  // debounce: пишем не чаще раза в 800мс
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(snapshot()), 'utf8');
    } catch (e) { console.warn('⚠️ Ошибка записи состояния:', e.message); }
  }, 800);
}

// Сохранение при штатном завершении
export function installShutdownHooks() {
  const flush = () => {
    try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(snapshot()), 'utf8'); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', flush);
  process.on('SIGTERM', flush);
}
