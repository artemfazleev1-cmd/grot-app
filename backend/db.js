// =====================================================================
// GROT Bar & Grill — In-memory database (seed data)
// Заменяется на реальную БД (Postgres/Mongo) без изменения API-слоя.
// =====================================================================

let _id = 1;
const id = () => _id++;
const now = () => new Date().toISOString();

// ---------- Пользователи (все роли) ----------
export const users = [
  { id: id(), phone: '+66800000000', password: 'owner',  name: 'Владелец GROT', role: 'owner',   createdAt: now() },
  { id: id(), phone: '+66811111111', password: 'admin',  name: 'Администратор', role: 'admin',   createdAt: now() },
  { id: id(), phone: '+66822222222', password: 'waiter', name: 'Сомчай (офиц.)', role: 'waiter', createdAt: now() },
  { id: id(), phone: '+66833333333', password: 'cook',   name: 'Пхрак (повар)',  role: 'cook',   createdAt: now() },
  { id: id(), phone: '+66844444444', password: 'courier',name: 'Нанг (курьер)',  role: 'courier',createdAt: now() },
  { id: id(), phone: '+66855555555', password: 'client', name: 'Артём',          role: 'client', createdAt: '2024-11-02T10:00:00Z',
    stats: { totalSpent: 48200, ordersCount: 37, visits: 41, lastVisit: '2026-06-18T19:30:00Z' },
    favDishes: ['Smash Burger (говядина)', 'Свиной шашлык'], favDrinks: ['Erdinger Weissbier'] },
  { id: id(), phone: '+66866666666', password: 'client', name: 'Елена (VIP)',    role: 'client', createdAt: '2024-06-10T10:00:00Z',
    stats: { totalSpent: 127500, ordersCount: 88, visits: 95, lastVisit: '2026-06-21T20:10:00Z' },
    favDishes: ['Купаты'], favDrinks: ['Moose Craft Cider'] },
];

// Демо-аккаунты для входа (формат +66, совпадает с формой логина).
// Вызывается при старте ПОСЛЕ загрузки состояния с диска: если такого телефона
// в базе нет — аккаунт добавляется. Реальные/существующие данные не трогаются.
export const DEMO_USERS = [
  { phone: '+66800000000', password: 'owner',   name: 'Владелец GROT',   role: 'owner'   },
  { phone: '+66822222222', password: 'waiter',  name: 'Официант (демо)', role: 'waiter'  },
  { phone: '+66833333333', password: 'cook',    name: 'Повар (демо)',    role: 'cook'    },
  { phone: '+66844444444', password: 'courier', name: 'Курьер (демо)',   role: 'courier' },
];
export function ensureDemoUsers() {
  let added = 0;
  for (const d of DEMO_USERS) {
    if (!users.find((u) => u.phone === d.phone)) {
      users.push({ id: id(), phone: d.phone, password: d.password, name: d.name, role: d.role, active: true, createdAt: now() });
      added++;
    }
  }
  return added;
}

// ---------- Категории и меню ----------
// Категории по группам: еда / напитки
export const categories = ['Горячие блюда', 'Разливное пиво', 'Бутылочное пиво', 'Безалкогольные'];
export const categoryGroups = {
  food: ['Горячие блюда'],
  drinks: ['Разливное пиво', 'Бутылочное пиво', 'Безалкогольные'],
};

// ---------- Склад / ингредиенты (ДО меню — рецепты ссылаются по id) ----------
// ING: slug -> id, чтобы рецепты блюд ссылались на ингредиенты надёжно.
const ING = {};
const ing = (slug, name, unit, qty, min, supplier, extra = {}) => {
  const o = { id: id(), slug, name, unit, qty, min, supplier, ...extra };
  ING[slug] = o.id;
  return o;
};
export const ingredients = [
  ing('pork',         'Свиная шея',               'г',  25000, 6000, 'Pattaya Meat Co.'),
  ing('chicken_filet','Куриное филе',             'г',  18000, 5000, 'Chonburi Farm'),
  ing('chicken_thigh','Куриное бедро (без кости)','г',  16000, 5000, 'Chonburi Farm'),
  ing('chicken_wings','Куриные крылышки',         'г',  14000, 4000, 'Chonburi Farm'),
  ing('duck',         'Утиное филе бедра',        'г',  9000,  3000, 'Bangkok Poultry'),
  ing('beef',         'Говядина 80/20',           'г',  20000, 6000, 'Pattaya Meat Co.'),
  ing('bun',          'Булочка бриошь',           'шт', 120,   40,   'German Bakery'),
  ing('cheddar',      'Сыр Чеддер',               'г',  6000,  2000, 'Import EU'),
  ing('onion',        'Лук репчатый',             'г',  12000, 3000, 'Local Market'),
  ing('red_onion',    'Лук красный',              'г',  6000,  2000, 'Local Market'),
  ing('cabbage',      'Капуста белокочанная',     'г',  10000, 3000, 'Local Market'),
  ing('carrot',       'Морковь',                  'г',  6000,  2000, 'Local Market'),
  ing('fries',        'Картофель фри «Решётка»',  'шт', 600,   150,  'Food Service TH'),
];

const m = (name, category, price, description, opts = {}) => ({
  id: id(), name, nameEn: opts.nameEn ?? null, category, group: opts.group || 'food', price, description,
  available: opts.available !== false,
  weight: opts.weight ?? null,        // вес/объём порции
  style: opts.style ?? null,          // стиль (для пива)
  calories: opts.calories ?? null,
  composition: opts.composition ?? '',
  popular: !!opts.popular,
  isNew: !!opts.isNew,
  image: opts.image ?? `https://source.unsplash.com/600x400/?${encodeURIComponent(opts.q || name)}`,
  // технологическая карта: расход ингредиентов на 1 порцию (ingredientId -> кол-во)
  recipe: opts.recipe ?? {},
});

// Реальное меню GROT (Pattaya) + техкарты (расход сырья на порцию по картам шефа)
export const menu = [
  // ----- ЕДА · Шашлык на вынос -----
  m('Свиной шашлык', 'Горячие блюда', 250, 'Сочный и нежный свиной шашлык, идеально приготовленный на гриле.', {
    nameEn: 'Pork Skewer', weight: '200 г', composition: 'свиная шея, лук, специи', calories: 540, popular: true, image: '/menu/pork-skewer.jpg',
    recipe: { [ING.pork]: 250, [ING.onion]: 60 } }),
  m('Утиный шашлык', 'Горячие блюда', 300, 'Премиальная утка с хрустящей корочкой и насыщенным вкусом.', {
    nameEn: 'Duck Skewer', weight: '200 г', composition: 'утиное филе бедра, лук, соевый соус, специи', calories: 560, popular: true, image: '/menu/duck-skewer.jpg',
    recipe: { [ING.duck]: 250, [ING.onion]: 30 } }),
  m('Куриные крылышки', 'Горячие блюда', 300, 'Сочные куриные крылышки, приготовленные на гриле до идеальной корочки.', {
    nameEn: 'Chicken Wings', weight: '6 шт.', composition: 'куриные крылышки, специи, соус', calories: 620, popular: true, image: '/menu/chicken-wings.jpg',
    recipe: { [ING.chicken_wings]: 360 } }),

  // ----- ЕДА · Купаты -----
  m('Купаты', 'Горячие блюда', 300, 'Домашние купаты из свинины и курицы. Сочные и ароматные.', {
    nameEn: 'Kupaty Sausages', weight: '200 г', composition: 'свиная шея, куриное бедро, специи', calories: 600, image: '/menu/kupaty-chicken.jpg',
    recipe: { [ING.pork]: 150, [ING.chicken_thigh]: 100 } }),

  // ----- ЕДА · Бургеры -----
  m('Smash Burger (говядина)', 'Горячие блюда', 300, 'Фирменный рецепт нашего шеф-повара: две говяжьи котлеты Smash, расплавленный сыр, фирменный соус, мягкая булочка бриошь.', {
    nameEn: 'Smash Burger (Beef)', weight: '380–420 г', composition: 'говядина 80/20, булочка бриошь, чеддер, фирменный соус, лук, огурцы', calories: 920, popular: true, image: '/menu/smash-burger.jpg',
    recipe: { [ING.beef]: 180, [ING.bun]: 1, [ING.cheddar]: 40, [ING.red_onion]: 15 } }),

  // ----- НАПИТКИ · Немецкое пиво -----
  m('Weihenstephaner Original Helles', 'Бутылочное пиво', 190, 'Мягкое, лёгкое и освежающее.', { group: 'drinks', style: 'Pale Lager', composition: 'светлый солод, хмель', popular: true, image: '/menu/weihenstephaner-helles.jpg' }),
  m('Weihenstephaner Hefe Weissbier', 'Бутылочное пиво', 190, 'Натурально мутное с фруктовым ароматом.', { group: 'drinks', style: 'Wheat Beer', composition: 'пшеничный солод, хмель', image: '/menu/weihenstephaner-hefe.jpg' }),
  m('Erdinger Weissbier', 'Бутылочное пиво', 220, 'Освежающее, фруктовое и насыщенное.', { group: 'drinks', style: 'Wheat Beer', composition: 'пшеничный солод, хмель', popular: true, image: '/menu/erdinger-weissbier-bottle.jpg' }),
  m('Paulaner Weissbier Dunkel', 'Бутылочное пиво', 230, 'Солодовое, мягкое, с нотами карамели.', { group: 'drinks', style: 'Dark Wheat Beer', composition: 'тёмный пшеничный солод, хмель', image: '/menu/paulaner-weissbier-dunkel.jpg' }),
  m('Erdinger Dunkel', 'Бутылочное пиво', 220, 'Солодовое и мягкое, с богатым вкусом.', { group: 'drinks', style: 'Dark Lager', composition: 'тёмный солод, хмель', image: '/menu/erdinger-dunkel-bottle.jpg' }),
  m('Hofbräu Münchner Weisse', 'Бутылочное пиво', 190, 'Яркое, мягкое и идеально сбалансированное.', { group: 'drinks', style: 'Wheat Beer', composition: 'пшеничный солод, хмель', image: '/menu/hofbrau-munchner-weisse.jpg' }),
  m('Hofbräu Schwarze Weisse', 'Бутылочное пиво', 190, 'Полнотелое, со вкусом солода и карамели.', { group: 'drinks', style: 'Dark Wheat Beer', composition: 'тёмный пшеничный солод, хмель', image: '/menu/hofbrau-schwarze-weisse.jpg' }),
  m('Franziskaner Weissbier', 'Бутылочное пиво', 190, 'Классическое немецкое пшеничное — мягкое и фруктовое.', { group: 'drinks', style: 'Wheat Beer', composition: 'пшеничный солод, хмель', image: '/menu/franziskaner-weissbier.jpg' }),
  m('Paulaner Hefe Weissbier', 'Бутылочное пиво', 230, 'Лёгкое, фруктовое и натурально мутное.', { group: 'drinks', style: 'Wheat Beer', composition: 'пшеничный солод, хмель', image: '/menu/paulaner-hefe-bottle.jpg' }),
  m('Franziskaner Dunkel', 'Бутылочное пиво', 190, 'Солодовое, мягкое и насыщенное.', { group: 'drinks', style: 'Dark Lager', composition: 'тёмный солод, хмель', image: '/menu/franziskaner-dunkel.jpg' }),
  // ----- НАПИТКИ · Сидр -----
  m('Moose Craft Cider', 'Бутылочное пиво', 100, 'Хрустящий, освежающий и натурально вкусный.', { group: 'drinks', style: 'Apple Cider', composition: 'яблочный сидр', popular: true, image: '/menu/moose-craft-cider.jpg' }),
  // ----- НАПИТКИ · Морс -----
  m('Домашний клюквенный морс 0.33 л', 'Безалкогольные', 60, 'Натуральный, освежающий и полезный напиток.', { group: 'drinks', nameEn: 'Homemade Cranberry Juice 0.33 L', style: 'Клюквенный морс', weight: '0.33 л', composition: 'клюква, вода, сахар', image: '/menu/mors-033.jpg' }),
  m('Домашний клюквенный морс 0.2 л', 'Безалкогольные', 40, 'Натуральный, освежающий и полезный напиток.', { group: 'drinks', nameEn: 'Homemade Cranberry Juice 0.2 L', style: 'Клюквенный морс', weight: '0.2 л', composition: 'клюква, вода, сахар', image: '/menu/mors-022.jpg' }),
];

// Каждый напиток — складская позиция в бутылках; 1 заказанная единица = -1 бутылка
for (const d of menu.filter((x) => x.group === 'drinks')) {
  const item = { id: id(), slug: 'drink_' + d.id, name: d.name, unit: 'бут', qty: 48, min: 24,
    supplier: d.category === 'Сидр' ? 'Cider Import' : 'Bavaria Import', alcohol: true };
  ingredients.push(item);
  d.recipe = { [item.id]: 1 };
}

// ---------- Столы (с QR) ----------
export const tables = Array.from({ length: 12 }, (_, i) => ({
  id: id(),
  number: i + 1,
  seats: [2, 2, 4, 4, 4, 6, 6, 2, 4, 8, 4, 6][i],
  qr: `GROT-TABLE-${i + 1}`,
  status: i === 5 ? 'occupied' : i === 8 ? 'reserved' : 'free', // free|reserved|occupied
  x: (i % 4) * 25 + 8,   // позиция на карте зала, %
  y: Math.floor(i / 4) * 30 + 10,
}));

// ---------- Настройки заведения ----------
// Кухня работает по графику (местное время бара). Вне графика официант может
// заказывать только напитки (бар). kitchenForceClosed — ручное закрытие сейчас.
export const settings = {
  kitchenOpen: '11:00',
  kitchenClose: '23:00',
  kitchenForceClosed: false,
  tz: 'Asia/Bangkok',
};

// ---------- Заказы ----------
// status: new -> accepted -> cooking -> ready -> handed | delivering -> delivered
export const orders = [
  { id: id(), userId: 6, items: [{ menuId: 1, name: 'Smash Burger Double', qty: 2, price: 320 }, { menuId: 7, name: 'Weissbier 0.5', qty: 2, price: 180 }],
    type: 'dinein', tableNumber: 6, total: 1000, status: 'cooking', comment: 'Без лука', createdAt: now(), waiterId: 3 },
  { id: id(), userId: 7, items: [{ menuId: 3, name: 'Шашлык из свинины', qty: 3, price: 290 }],
    type: 'delivery', address: 'Soi Buakhao 12/3, Pattaya', total: 870, status: 'new', comment: '', createdAt: now() },
];

// ---------- Бронирования ----------
export const reservations = [
  { id: id(), userId: 7, tableNumber: 9, date: '2026-06-24', time: '19:30', guests: 4, comment: 'У окна', status: 'confirmed', preorder: [{ menuId: 3, name: 'Шашлык из свинины', qty: 2, price: 290 }], createdAt: now() },
];

// ---------- События (календарь недели) ----------
export const events = [
  { id: id(), day: 'ПН', emoji: '🔥', title: 'День шашлыка',         titleEn: 'Skewer Day',          time: '18:00', description: 'Все виды шашлыка со скидкой 20%',            descriptionEn: 'All skewers 20% off', banner: 'grill', reminders: [] },
  { id: id(), day: 'ВТ', emoji: '🍺', title: 'Немецкий вечер',       titleEn: 'German Night',        time: '19:00', description: 'Дегустация немецкого пива',                   descriptionEn: 'German beer tasting', banner: 'beer', reminders: [] },
  { id: id(), day: 'СР', emoji: '🎲', title: 'Настольные игры',      titleEn: 'Board Games',         time: '19:00', description: 'Турниры и призы',                             descriptionEn: 'Tournaments & prizes', banner: 'games', reminders: [] },
  { id: id(), day: 'ЧТ', emoji: '🔥', title: 'Гриль-вечер',          titleEn: 'Grill Night',         time: '18:00', description: 'Гриль-меню и живой огонь',                    descriptionEn: 'Grill menu & live fire', banner: 'bbq', reminders: [] },
  { id: id(), day: 'ПТ', emoji: '⚽', title: 'Спорт-вечер',          titleEn: 'Sports Night',        time: '20:00', description: 'Трансляции матчей на большом экране',         descriptionEn: 'Match broadcasts on the big screen', banner: 'sport', reminders: [] },
  { id: id(), day: 'СБ', emoji: '♟', title: 'Турнир по шахматам',   titleEn: 'Chess Tournament',    time: '17:00', description: 'Регистрация открыта',                         descriptionEn: 'Registration open', banner: 'chess', reminders: [] },
  { id: id(), day: 'ВС', emoji: '🎯', title: 'Турнир по нардам',     titleEn: 'Backgammon Tournament', time: '17:00', description: 'Призовой фонд 5000 бат',                    descriptionEn: 'Prize pool 5000 THB', banner: 'backgammon', reminders: [] },
];

// ---------- Интро (управляется владельцем) ----------
export const intro = {
  badge: 'СОБЫТИЕ НЕДЕЛИ', badgeEn: 'EVENT OF THE WEEK',
  title: 'Неделя шашлыка', titleEn: 'Skewer Week',
  subtitle: 'ПН–ЧТ', subtitleEn: 'Mon–Thu',
  text: 'Специальные предложения. Доставка по Паттайе.', textEn: 'Special offers. Delivery across Pattaya.',
  cta: 'Подробнее', ctaEn: 'Learn more',
  durationMs: 3000,
};

// ---------- Акции / новости ----------
export const promos = [
  { id: id(), title: 'Скидка 20% на шашлык', text: 'Каждый понедельник', emoji: '🔥' },
  { id: id(), title: 'Немецкое пиво 2+1',    text: 'По вторникам',       emoji: '🍺' },
];
export const news = [
  { id: id(), title: 'Открыли летнюю террасу', titleEn: 'Summer terrace now open', date: '2026-06-20', text: 'Теперь +20 мест на свежем воздухе.', textEn: 'Now +20 seats outdoors.' },
  { id: id(), title: 'Новинка: Гриль-бургер острый', titleEn: 'New: Spicy Grill Burger', date: '2026-06-22', text: 'Попробуйте новинку недели.', textEn: "Try this week's new item." },
];

// ---------- Вызовы официанта / запросы счёта ----------
export const calls = []; // { id, tableNumber, type:'waiter'|'bill', status:'open'|'done', createdAt }

// ---------- Push-уведомления (in-app очередь) ----------
export const notifications = []; // { id, userId, role, text, key, data, createdAt, read }

// Необязательный хук для реальной доставки (Web Push). Ставится из server.js.
export const hooks = { onNotify: null };

// text — русский фолбэк (Web Push / старые клиенты). key+data — для перевода на клиенте (i18n).
export const pushNotify = ({ userId = null, role = null, text, key = null, data = null }) => {
  const n = { id: id(), userId, role, text, key, data, createdAt: now(), read: false };
  notifications.push(n);
  if (hooks.onNotify) { try { hooks.onNotify(n); } catch {} }
  return n;
};

// ---------- Рассылки ----------
export const broadcasts = []; // { id, segment, text, createdAt }

// Доступ к счётчику id для слоя персистентности (persistence.js)
export const dumpId = () => _id;
export const loadId = (v) => { if (typeof v === 'number' && v > _id) _id = v; };

export { id, now };
