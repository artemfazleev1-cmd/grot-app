// Синхронизация меню GROT с актуальным прайсом.
// Добавляет недостающие позиции, обновляет цену/категорию/англ. название у существующих.
// Ничего не удаляет. Техкарты (recipe) и картинки существующих позиций сохраняются.
//
// Запуск:
//   node scripts/sync-menu.mjs                          # локально (localhost:4000)
//   node scripts/sync-menu.mjs https://grot-app.onrender.com
//   node scripts/sync-menu.mjs <API> <phone> <password>
//   node scripts/sync-menu.mjs <API> <phone> <password> --dry   # только показать план

const API = (process.argv[2] || 'http://localhost:4000').replace(/\/$/, '');
const PHONE = process.argv[3] || '+66800000000';
const PASS = process.argv[4] || 'owner';
const DRY = process.argv.includes('--dry');

const FOOD = 'Горячие блюда', SNACKS = 'Закуски к пиву', DRAFT = 'Разливное пиво', BOTTLE = 'Бутылочное пиво', SOFT = 'Безалкогольные';

// match — как позиция называется сейчас в базе (если отличается от нового названия)
const TARGET = [
  // 🔥 ГОРЯЧИЕ БЛЮДА
  { name: 'Smash Burger', nameEn: 'Smash Burger', price: 300, category: FOOD, group: 'food', match: 'Smash Burger (говядина)' },
  { name: 'Плов из австралийской говядины', nameEn: 'Australian Beef Pilaf', price: 350, category: FOOD, group: 'food' },
  { name: 'Плов из новозеландской баранины', nameEn: 'New Zealand Lamb Pilaf', price: 350, category: FOOD, group: 'food' },
  { name: 'Шашлык из свинины (200 г)', nameEn: 'Pork Shashlik (200 g)', price: 250, category: FOOD, group: 'food', match: 'Свиной шашлык' },
  { name: 'Шашлык из утки (200 г)', nameEn: 'Duck Shashlik (200 g)', price: 300, category: FOOD, group: 'food', match: 'Утиный шашлык' },
  { name: 'Куриные крылышки (6 шт.)', nameEn: 'Chicken Wings (6 pcs)', price: 250, category: FOOD, group: 'food', match: 'Куриные крылышки' },
  { name: 'Купаты из курицы', nameEn: 'Chicken Sausages', price: 250, category: FOOD, group: 'food', match: 'Купаты' },
  { name: 'Купаты из курицы и свинины', nameEn: 'Chicken & Pork Sausages', price: 250, category: FOOD, group: 'food' },
  { name: 'Куриное бедро в сливочном соусе', nameEn: 'Chicken Thigh in Cream Sauce', price: 300, category: FOOD, group: 'food' },

  // 🥩 ЗАКУСКИ К ПИВУ
  { name: 'Свиные уши', nameEn: 'Pork Ears', price: 200, category: SNACKS, group: 'food' },
  { name: 'Домашние ржаные гренки', nameEn: 'Homemade Rye Croutons', price: 120, category: SNACKS, group: 'food' },
  { name: 'Домашняя вяленая говядина (50 г)', nameEn: 'Homemade Beef Jerky (50 g)', price: 200, category: SNACKS, group: 'food' },
  { name: 'Картошка фри', nameEn: 'French Fries', price: 100, category: SNACKS, group: 'food' },

  // 🍺 РАЗЛИВНОЕ ПИВО
  { name: 'Erdinger Weissbier (0.4 L)', nameEn: 'Erdinger Weissbier (0.4 L)', price: 230, category: DRAFT, group: 'drinks' },
  { name: 'Erdinger Dunkel (0.4 L)', nameEn: 'Erdinger Dunkel (0.4 L)', price: 230, category: DRAFT, group: 'drinks' },
  { name: 'Arcobrau Weissbier (0.5 L)', nameEn: 'Arcobrau Weissbier (0.5 L)', price: 230, category: DRAFT, group: 'drinks' },
  { name: 'Paulaner Hefe Weissbier (0.5 L)', nameEn: 'Paulaner Hefe Weissbier (0.5 L)', price: 240, category: DRAFT, group: 'drinks' },
  { name: 'Paulaner Dunkel (0.5 L)', nameEn: 'Paulaner Dunkel (0.5 L)', price: 240, category: DRAFT, group: 'drinks' },
  { name: 'Бельгийское нефильтрованное (0.4 L)', nameEn: 'Belgian Unfiltered Wheat Ale (0.4 L)', price: 190, category: DRAFT, group: 'drinks' },
  { name: 'Жигулёвское (0.4 L)', nameEn: 'Zhigulevskoe Lager (0.4 L)', price: 160, category: DRAFT, group: 'drinks' },
  { name: 'Ирландский эль (0.4 L)', nameEn: 'Irish Ale (0.4 L)', price: 180, category: DRAFT, group: 'drinks' },

  // 🍾 БУТЫЛОЧНОЕ ПИВО
  { name: 'Weihenstephaner Original Helles', nameEn: 'Weihenstephaner Original Helles', price: 190, category: BOTTLE, group: 'drinks' },
  { name: 'Weihenstephaner Hefe Weissbier', nameEn: 'Weihenstephaner Hefe Weissbier', price: 190, category: BOTTLE, group: 'drinks' },
  { name: 'Weihenstephaner Hefeweissbier Dunkel', nameEn: 'Weihenstephaner Hefeweissbier Dunkel', price: 190, category: BOTTLE, group: 'drinks' },
  { name: 'Paulaner Hefe Weissbier', nameEn: 'Paulaner Hefe Weissbier', price: 230, category: BOTTLE, group: 'drinks' },
  { name: 'Paulaner Münchner Hell Lager', nameEn: 'Paulaner Münchner Hell Lager', price: 230, category: BOTTLE, group: 'drinks' },
  { name: 'Paulaner Weissbier Dunkel', nameEn: 'Paulaner Weissbier Dunkel', price: 230, category: BOTTLE, group: 'drinks' },
  { name: 'Erdinger Weissbier', nameEn: 'Erdinger Weissbier', price: 220, category: BOTTLE, group: 'drinks' },
  { name: 'Erdinger Dunkel', nameEn: 'Erdinger Dunkel', price: 220, category: BOTTLE, group: 'drinks' },
  { name: 'Hofbräu Münchner Weisse', nameEn: 'Hofbräu Münchner Weisse', price: 210, category: BOTTLE, group: 'drinks' },
  { name: 'Hofbräu Schwarze Weisse', nameEn: 'Hofbräu Schwarze Weisse', price: 210, category: BOTTLE, group: 'drinks' },
  { name: 'Franziskaner Weissbier', nameEn: 'Franziskaner Weissbier', price: 190, category: BOTTLE, group: 'drinks' },
  { name: 'Franziskaner Dunkel', nameEn: 'Franziskaner Dunkel', price: 190, category: BOTTLE, group: 'drinks' },
  { name: 'Arcobrau Urfass Lager', nameEn: 'Arcobrau Urfass Lager', price: 210, category: BOTTLE, group: 'drinks' },
  { name: 'Moose Craft Cider', nameEn: 'Moose Craft Cider', price: 100, category: BOTTLE, group: 'drinks' },
  { name: 'Bitburger Beer 0.0%', nameEn: 'Bitburger Beer 0.0%', price: 180, category: BOTTLE, group: 'drinks' },

  // 🥤 БЕЗАЛКОГОЛЬНЫЕ
  { name: 'Сода', nameEn: 'Sparkling Water', price: 20, category: SOFT, group: 'drinks' },
  { name: 'Вода', nameEn: 'Drinking Water', price: 15, category: SOFT, group: 'drinks' },
  { name: 'Coca-Cola', nameEn: 'Coca-Cola', price: 50, category: SOFT, group: 'drinks' },
  { name: 'Cream Soda', nameEn: 'Cream Soda', price: 70, category: SOFT, group: 'drinks' },
  { name: 'Домашний клюквенный морс 0.33 L', nameEn: 'Homemade Cranberry Morse (0.33 L)', price: 60, category: SOFT, group: 'drinks', match: 'Домашний клюквенный морс 0.33 л' },
  { name: 'Домашний клюквенный морс 0.22 L', nameEn: 'Homemade Cranberry Morse (0.22 L)', price: 40, category: SOFT, group: 'drinks', match: 'Домашний клюквенный морс 0.2 л' },
];

// Фото позиций (файлы лежат в frontend/public/menu/<slug>.jpg)
const SLUGS = {
  'Smash Burger': 'smash-burger',
  'Плов из австралийской говядины': 'pilaf-beef',
  'Плов из новозеландской баранины': 'pilaf-lamb',
  'Шашлык из свинины (200 г)': 'pork-skewer',
  'Шашлык из утки (200 г)': 'duck-skewer',
  'Куриные крылышки (6 шт.)': 'chicken-wings',
  'Купаты из курицы': 'kupaty-chicken',
  'Купаты из курицы и свинины': 'kupaty-chicken-pork',
  'Куриное бедро в сливочном соусе': 'chicken-thigh-cream',
  'Erdinger Weissbier (0.4 L)': 'erdinger-weissbier-draft',
  'Erdinger Dunkel (0.4 L)': 'erdinger-dunkel-draft',
  'Arcobrau Weissbier (0.5 L)': 'arcobrau-weissbier-draft',
  'Paulaner Hefe Weissbier (0.5 L)': 'paulaner-hefe-draft',
  'Paulaner Dunkel (0.5 L)': 'paulaner-dunkel-draft',
  'Бельгийское нефильтрованное (0.4 L)': 'belgian-unfiltered',
  'Жигулёвское (0.4 L)': 'zhigulevskoe',
  'Ирландский эль (0.4 L)': 'irish-ale',
  'Weihenstephaner Original Helles': 'weihenstephaner-helles',
  'Weihenstephaner Hefe Weissbier': 'weihenstephaner-hefe',
  'Weihenstephaner Hefeweissbier Dunkel': 'weihenstephaner-hefe-dunkel',
  'Paulaner Hefe Weissbier': 'paulaner-hefe-bottle',
  'Paulaner Münchner Hell Lager': 'paulaner-munchner-hell',
  'Paulaner Weissbier Dunkel': 'paulaner-weissbier-dunkel',
  'Erdinger Weissbier': 'erdinger-weissbier-bottle',
  'Erdinger Dunkel': 'erdinger-dunkel-bottle',
  'Hofbräu Münchner Weisse': 'hofbrau-munchner-weisse',
  'Hofbräu Schwarze Weisse': 'hofbrau-schwarze-weisse',
  'Franziskaner Weissbier': 'franziskaner-weissbier',
  'Franziskaner Dunkel': 'franziskaner-dunkel',
  'Arcobrau Urfass Lager': 'arcobrau-urfass-lager',
  'Moose Craft Cider': 'moose-craft-cider',
  'Bitburger Beer 0.0%': 'bitburger-00',
  'Сода': 'soda',
  'Вода': 'water',
  'Coca-Cola': 'coca-cola',
  'Cream Soda': 'cream-soda',
  'Домашний клюквенный морс 0.33 L': 'mors-033',
  'Домашний клюквенный морс 0.22 L': 'mors-022',
};
for (const t of TARGET) if (SLUGS[t.name]) t.image = `/menu/${SLUGS[t.name]}.jpg`;

const j = async (url, opts = {}) => {
  const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${data.error || ''} @ ${url}`);
  return data;
};

const run = async () => {
  const { token } = await j(`${API}/api/auth/login`, { method: 'POST', body: JSON.stringify({ phone: PHONE, password: PASS }) });
  const auth = { Authorization: `Bearer ${token}` };
  const menu = await j(`${API}/api/menu`);
  const byName = new Map(menu.items.map((m) => [m.name.trim(), m]));

  const added = [], updated = [], same = [];
  for (const t of TARGET) {
    // Сначала ищем по новому имени (повторный запуск), затем по старому (первый запуск).
    // Иначе после переименования скрипт создаёт дубли.
    const cur = byName.get(t.name.trim()) || (t.match ? byName.get(t.match.trim()) : null);
    const body = { name: t.name, nameEn: t.nameEn, category: t.category, group: t.group, price: t.price, ...(t.image ? { image: t.image } : {}) };
    if (!cur) {
      added.push(`${t.category} | ${t.name} — ${t.price}฿`);
      if (!DRY) await j(`${API}/api/menu`, { method: 'POST', headers: auth, body: JSON.stringify({ ...body, available: true, description: '' }) });
    } else {
      const diffs = [];
      if (cur.price !== t.price) diffs.push(`цена ${cur.price}→${t.price}`);
      if (cur.category !== t.category) diffs.push(`категория ${cur.category}→${t.category}`);
      if ((cur.name || '') !== t.name) diffs.push(`имя «${cur.name}»→«${t.name}»`);
      if ((cur.nameEn || '') !== t.nameEn) diffs.push('англ. название');
      if (t.image && cur.image !== t.image) diffs.push('фото');
      if (!diffs.length) { same.push(t.name); continue; }
      updated.push(`${t.name}: ${diffs.join(', ')}`);
      if (!DRY) await j(`${API}/api/menu/${cur.id}`, { method: 'PUT', headers: auth, body: JSON.stringify(body) });
    }
  }

  const targetNames = new Set(TARGET.flatMap((t) => [t.name.trim(), ...(t.match ? [t.match.trim()] : [])]));
  const extra = menu.items.filter((m) => !targetNames.has(m.name.trim())).map((m) => `${m.name} — ${m.price}฿`);

  console.log(`\n${DRY ? '[ПЛАН, ничего не менялось]' : '[ПРИМЕНЕНО]'}  ${API}`);
  console.log(`\n➕ ДОБАВЛЕНО (${added.length}):`); added.forEach((s) => console.log('   ' + s));
  console.log(`\n✏️  ОБНОВЛЕНО (${updated.length}):`); updated.forEach((s) => console.log('   ' + s));
  console.log(`\n✅ БЕЗ ИЗМЕНЕНИЙ: ${same.length}`);
  if (extra.length) { console.log(`\n⚠️  ЕСТЬ В БАЗЕ, НО НЕТ В НОВОМ СПИСКЕ (${extra.length}) — не тронуты:`); extra.forEach((s) => console.log('   ' + s)); }
  console.log(`\nИтого в меню должно стать: ${TARGET.length} позиций\n`);
};

run().catch((e) => { console.error('Ошибка:', e.message); process.exit(1); });
