// =====================================================================
// GROT Bar & Grill — In-memory database (seed data)
// Заменяется на реальную БД (Postgres/Mongo) без изменения API-слоя.
// =====================================================================

let _id = 1;
const id = () => _id++;
const now = () => new Date().toISOString();

// ---------- Пользователи (все роли) ----------
// БЕЗОПАСНОСТЬ: пароли ниже лежат в открытом виде в публичном репозитории,
// поэтому это ТОЛЬКО демо-данные для локальной разработки. В продакшене список
// стартует пустым: реальные пользователи приходят с диска (persistence),
// а первый владелец заводится из OWNER_PHONE / OWNER_PASSWORD (см. ensureDemoUsers).
const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_SEED_USERS = [
  { id: id(), phone: '+66800000000', password: 'owner',  name: 'Владелец GROT', role: 'owner',   createdAt: now() },
  { id: id(), phone: '+66811111111', password: 'admin',  name: 'Администратор', role: 'admin',   createdAt: now() },
  { id: id(), phone: '+66822222222', password: 'waiter', name: 'Сомчай (офиц.)', role: 'waiter', createdAt: now() },
  { id: id(), phone: '+66833333333', password: 'cook',   name: 'Пхрак (повар)',  role: 'cook',   createdAt: now() },
  { id: id(), phone: '+66844444444', password: 'courier',name: 'Нанг (курьер)',  role: 'courier',createdAt: now() },
  { id: id(), phone: '+66855555555', password: 'client', name: 'Артём',          role: 'client', createdAt: '2024-11-02T10:00:00Z',
    stats: { totalSpent: 48200, ordersCount: 37, visits: 41, lastVisit: '2026-06-18T19:30:00Z' },
    favDishes: ['Бургер Smash с говядиной', 'Шашлык из свинины'], favDrinks: ['Erdinger Weissbier'] },
  { id: id(), phone: '+66866666666', password: 'client', name: 'Елена (VIP)',    role: 'client', createdAt: '2024-06-10T10:00:00Z',
    stats: { totalSpent: 127500, ordersCount: 88, visits: 95, lastVisit: '2026-06-21T20:10:00Z' },
    favDishes: ['Купаты'], favDrinks: ['Moose Craft Cider'] },
];
export const users = IS_PROD ? [] : DEV_SEED_USERS;

// Демо-аккаунты для входа (формат +66, совпадает с формой логина).
// Вызывается при старте ПОСЛЕ загрузки состояния с диска: если такого телефона
// в базе нет — аккаунт добавляется. Реальные/существующие данные не трогаются.
export const DEMO_USERS = [
  { phone: '+66800000000', password: 'owner',   name: 'Владелец GROT',   role: 'owner'   },
  { phone: '+66822222222', password: 'waiter',  name: 'Официант (демо)', role: 'waiter'  },
  { phone: '+66833333333', password: 'cook',    name: 'Повар (демо)',    role: 'cook'    },
  { phone: '+66844444444', password: 'courier', name: 'Курьер (демо)',   role: 'courier' },
];

// Роли, доступ к которым НИКОГДА не открывается публично известным паролем:
// они меняют меню, цены, персонал и настройки заведения.
const PRIVILEGED_ROLES = ['owner', 'admin'];

// Публичный стенд может пускать ревьюера, но только на уровне персонала смены.
// Включается переменной DEMO_LOGIN=true; по умолчанию выключено.
const DEMO_LOGIN = process.env.DEMO_LOGIN === 'true';
const REVIEWER_DEMO_USERS = DEMO_USERS.filter((d) => !PRIVILEGED_ROLES.includes(d.role));

// Все пароли, опубликованные в этом репозитории. Любой аккаунт с таким паролем
// считается публично доступным, кем бы он ни был заведён.
const PUBLIC_PASSWORDS = [...new Set([...DEV_SEED_USERS, ...DEMO_USERS].map((u) => u.password))];

// ВАЖНО (безопасность): пароли демо-аккаунтов лежат в открытом коде публичного
// репозитория, поэтому в продакшене привилегированные демо-аккаунты не создаются.
// Владелец заводится из OWNER_PHONE / OWNER_PASSWORD (задать в дашборде хостинга)
// и только если активного владельца ещё нет.
export function ensureDemoUsers() {
  let added = 0;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    const phone = process.env.OWNER_PHONE, password = process.env.OWNER_PASSWORD;
    // Отключённый владелец не считается: иначе после блокировки демо-аккаунта
    // система осталась бы совсем без владельца.
    const hasOwner = users.some((u) => u.role === 'owner' && u.active !== false);
    if (!hasOwner && phone && password) {
      users.push({ id: id(), phone: String(phone), password: String(password), name: 'Владелец', role: 'owner', active: true, createdAt: now() });
      added++;
    } else if (!hasOwner) {
      console.warn('⚠️ Активного владельца нет. Задайте OWNER_PHONE и OWNER_PASSWORD в переменных окружения.');
    }

    if (DEMO_LOGIN) {
      for (const d of REVIEWER_DEMO_USERS) {
        if (!users.find((u) => u.phone === d.phone)) {
          users.push({ id: id(), phone: d.phone, password: d.password, name: d.name, role: d.role, active: true, createdAt: now() });
          added++;
        }
      }
    }
    return added;
  }

  for (const d of DEMO_USERS) {
    if (!users.find((u) => u.phone === d.phone)) {
      users.push({ id: id(), phone: d.phone, password: d.password, name: d.name, role: d.role, active: true, createdAt: now() });
      added++;
    }
  }
  return added;
}

// Аккаунты, чей пароль опубликован в этом репозитории.
export function weakDemoAccounts(verify) {
  return users.filter((u) => PUBLIC_PASSWORDS.some((p) => verify(p, u.password)))
    .map((u) => `${u.role}:${u.phone}`);
}

// Закрывает доступ, открытый публично известным паролем.
//
// Одной проверки на старте мало: массив `users` в проде стартует пустым, но
// persistence поднимает с диска состояние, записанное когда-то в dev-режиме,
// вместе с демо-владельцем. Поэтому чистим не сид, а фактическое состояние.
//
// Аккаунты не удаляются — только отключаются (active: false) и им сбрасывается
// пароль на случайный, чтобы копия диска тоже была бесполезна. Владелец может
// включить учётку обратно, задав нормальный пароль.
export function lockDownPublicDemoAccounts(verify, randomSecret) {
  if (process.env.NODE_ENV !== 'production') return [];
  const locked = [];

  for (const u of users) {
    if (u.active === false) continue;
    if (!PUBLIC_PASSWORDS.some((p) => verify(p, u.password))) continue;

    // Персонал смены можно оставить как витрину, если стенд её явно разрешает.
    const isReviewerDemo = DEMO_LOGIN
      && !PRIVILEGED_ROLES.includes(u.role)
      && REVIEWER_DEMO_USERS.some((d) => d.phone === u.phone);
    if (isReviewerDemo) continue;

    u.active = false;
    u.password = randomSecret();
    locked.push(`${u.role}:${u.phone}`);
  }
  return locked;
}

// ---------- Категории и меню ----------
// Категории по группам: еда / напитки
export const categories = ['Горячие блюда', 'Бургеры', 'Тайская кухня', 'Салаты', 'Закуски к пиву', 'Разливное пиво', 'Бутылочное пиво', 'Вино', 'Крепкий алкоголь', 'Безалкогольные'];
export const categoryGroups = {
  food: ['Горячие блюда', 'Бургеры', 'Тайская кухня', 'Салаты', 'Закуски к пиву'],
  drinks: ['Разливное пиво', 'Бутылочное пиво', 'Вино', 'Крепкий алкоголь', 'Безалкогольные'],
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
  // ----- ЕДА · Шашлык и гриль -----
  // Вес, состав и цены — по печатному меню бара (EN-карта, версия 2026-08).
  m('Шашлык из свинины', 'Горячие блюда', 250, 'Сочный и нежный свиной шашлык, идеально приготовленный на гриле.', {
    nameEn: 'Pork Shashlik', weight: '250 г', composition: 'свинина, маринованный лук, фирменный томатный соус со специями', calories: 540, popular: true, image: '/menu/pork-skewer.jpg',
    recipe: { [ING.pork]: 250, [ING.onion]: 60 } }),
  m('Шашлык из утки', 'Горячие блюда', 300, 'Премиальная утка с хрустящей корочкой и насыщенным вкусом.', {
    nameEn: 'Duck Shashlik', weight: '200 г', composition: 'утиная грудка, маринованный лук, горчичный соус', calories: 560, popular: true, image: '/menu/duck-skewer.jpg',
    recipe: { [ING.duck]: 250, [ING.onion]: 30 } }),
  m('Куриные крылышки', 'Горячие блюда', 250, 'Сочные куриные крылышки, приготовленные на гриле до идеальной корочки.', {
    nameEn: 'Charcoal-Grilled Chicken Wings', weight: '6 шт.', composition: 'куриные крылья, маринованный лук, фирменный томатный соус со специями', calories: 620, popular: true, image: '/menu/chicken-wings.jpg',
    recipe: { [ING.chicken_wings]: 360 } }),
  m('Шашлык из куриного филе', 'Горячие блюда', 250, '', {
    nameEn: 'Chicken Fillet Shashlik', weight: '250 г', composition: 'куриное филе, маринованный лук, фирменный томатный соус со специями', image: null }),
  m('Шашлык из куриного крыла', 'Горячие блюда', 300, '', {
    nameEn: 'Chicken Wing Shashlik', weight: '300 г', composition: 'целое куриное крыло, маринованный лук, фирменный томатный соус со специями', image: null }),
  m('Свиные рёбрышки в пивном маринаде', 'Горячие блюда', 250, '', {
    nameEn: 'Pork Ribs in Beer Marinade', weight: '250 г', composition: 'свиные рёбра, маринованный лук, горчичный соус', image: null }),
  m('Шашлык из свинины на кости', 'Горячие блюда', 250, '', {
    nameEn: 'Bone-In Pork Shashlik', weight: '250 г', composition: 'свинина на кости, маринованный лук, горчичный соус', image: null }),
  m('Шашлык из баранины (мякоть)', 'Горячие блюда', 450, '', {
    nameEn: 'Lamb Shashlik', weight: '200 г', composition: 'баранина, маринованный лук, фирменный томатный соус со специями', image: null }),
  m('Шашлык из скумбрии', 'Горячие блюда', 300, '', {
    nameEn: 'Mackerel Shashlik', weight: '250 г', composition: 'скумбрия, маринованный лук, картофельные дольки, белый соус, лимон', image: null }),
  m('Куриное бедро в сливочном соусе', 'Горячие блюда', 300, '', {
    nameEn: 'Chicken Thigh in Cream Sauce', weight: '350 г', composition: 'молодое куриное бедро, соус из сливочного сыра, масло с травами, кинза', image: null }),
  // Позиций ниже нет в печатной карте — оставлены как есть до решения по ним.
  m('Утка конфи', 'Горячие блюда', 320, '', { nameEn: 'Duck Confit', image: null }),
  m('Стейк сёмги (300 г)', 'Горячие блюда', 320, '', { nameEn: 'Salmon Steak (300 g)', image: null }),

  // ----- ЕДА · Купаты -----
  // Куриные купаты сняты с меню решением кухни (см. MENU_RETIRED ниже).
  m('Купаты свиные', 'Горячие блюда', 250, '', {
    nameEn: 'Pork Kupaty Sausages', weight: '200 г', composition: 'свинина, свиной шпик, натуральная оболочка, овощной салат, мини-вафельный драник, маринованный лук, горчичный соус', image: null }),
  m('Купаты из курицы и свинины', 'Горячие блюда', 250, '', {
    nameEn: 'Chicken and Pork Kupaty Sausages', weight: '200 г', composition: 'свинина, курица, натуральная оболочка, овощной салат, мини-вафельный драник, маринованный лук, горчичный соус', image: null }),

  // ----- ЕДА · Бургеры -----
  // Отдельный раздел печатной карты: говяжьи по 300 бат, куриные по 250.
  // Все на булочке бриошь с фирменным соусом.
  m('Бургер Smash с говядиной', 'Бургеры', 300, 'Фирменный рецепт нашего шеф-повара: две говяжьи котлеты Smash, расплавленный чеддер, фирменный соус, мягкая булочка бриошь.', {
    nameEn: 'Beef Smash Burger', weight: '300 г', composition: 'булочка бриошь, две говяжьи котлеты smash, сыр чеддер, маринованные огурцы, свежий красный лук, чипсы, фирменный соус', calories: 920, popular: true, image: '/menu/smash-burger.jpg',
    recipe: { [ING.beef]: 180, [ING.bun]: 1, [ING.cheddar]: 40, [ING.red_onion]: 15 } }),
  m('Бургер Smash с говядиной и беконом', 'Бургеры', 300, '', {
    nameEn: 'Beef Smash Burger with Bacon', weight: '300 г', composition: 'булочка бриошь, две говяжьи котлеты smash, сыр чеддер, копчёный бекон, маринованные огурцы, красный лук, фирменный соус', image: null }),
  m('Бургер Smash с говядиной и халапеньо', 'Бургеры', 300, '', {
    nameEn: 'Beef Smash Burger with Jalapeño', weight: '300 г', composition: 'булочка бриошь, две говяжьи котлеты smash, сыр чеддер, халапеньо, фирменный соус', image: null }),
  m('Бургер с говядиной и грибами', 'Бургеры', 300, '', {
    nameEn: 'Beef Mushroom Burger', weight: '300 г', composition: 'булочка бриошь, две говяжьи котлеты smash, сыр чеддер, сливочный сыр, грибы, фирменный соус', image: null }),
  m('Бургер с говядиной', 'Бургеры', 300, '', {
    nameEn: 'Beef Burger', weight: '300 г', composition: 'булочка бриошь, говяжья котлета, помидор, карамелизованный лук, копчёный бекон, салат айсберг, фирменный соус', image: null }),
  m('Чизбургер с говядиной', 'Бургеры', 300, '', {
    nameEn: 'Beef Cheeseburger', weight: '300 г', composition: 'булочка бриошь, говяжья котлета, сыр чеддер, помидор, солёный огурец, салат айсберг, фирменный соус', image: null }),
  m('Бургер с томлёной свининой', 'Бургеры', 300, '', {
    nameEn: 'Pulled Pork Burger', weight: '300 г', composition: 'булочка бриошь, томлёная свинина, сыр чеддер, пармезан, солёный огурец, фирменный соус', image: null }),
  m('Бургер с курицей и грибами', 'Бургеры', 250, '', {
    nameEn: 'Chicken Mushroom Burger', weight: '270 г', composition: 'булочка бриошь, курица, сыр чеддер, сливочный сыр, грибы, красный лук, салат айсберг, фирменный соус', image: null }),
  m('Бургер с курицей и халапеньо', 'Бургеры', 250, '', {
    nameEn: 'Chicken Burger with Jalapeño', weight: '270 г', composition: 'булочка бриошь, курица, сыр чеддер, солёный огурец, салат айсберг, халапеньо, фирменный соус', image: null }),
  m('Чизбургер с курицей', 'Бургеры', 250, '', {
    nameEn: 'Chicken Cheese Burger', weight: '270 г', composition: 'булочка бриошь, курица, сыр чеддер, моцарелла, салат айсберг, солёный огурец, фирменный соус', image: null }),

  // ----- ЕДА · Тайская кухня -----
  // Вес вынесен в поле weight (в печатной карте он отдельной колонкой),
  // поэтому из названий убран — см. MENU_RENAME_TO.
  m('Гребешки на гриле с чесночно-сливочным соусом', 'Тайская кухня', 350, '', {
    nameEn: 'Grilled Scallops with Creamy Garlic Sauce', weight: '150 г', composition: 'гребешки, спаржа, мини-кукуруза, болгарский перец, сливочное масло, чеснок, сливки, оливковое масло, соль, перец, съедобные цветы и травы', image: null }),
  m('Креветки и морепродукты на горячей сковороде', 'Тайская кухня', 340, '', {
    nameEn: 'Prawns and Seafood on a Sizzling Skillet', weight: '400 г', composition: 'речные креветки, кальмар, мидии, сладкая кукуруза, болгарский перец, лимон, сливочное масло, чеснок, оливковое масло, соль, чёрный перец, кинза', image: null }),
  m('Хор Мок Талай — карри с морепродуктами в кокосе', 'Тайская кухня', 280, 'Подаётся в молодом кокосе.', {
    nameEn: 'Hor Mok Talay — Seafood Curry in a Young Coconut', weight: '220 г', composition: 'креветки, кальмар, филе рыбы, мякоть молодого кокоса, кокосовое молоко, яйцо, красная паста карри, рыбный соус, пальмовый сахар, листья каффир-лайма, красный чили, тайский базилик, кокосовые сливки', image: null }),
  m('Пла Кунг — острый тайский салат с креветками', 'Тайская кухня', 280, '', {
    nameEn: 'Pla Goong — Spicy Thai Shrimp Salad', weight: '300 г', composition: 'креветки, лемонграсс, шалот, чили птичий глаз, кулантро, зелёный лук, мята; заправка: рыбный соус, сок лайма, сахар, паста чили', image: null }),
  m('Намток Кор Му — острый салат из свиной шеи', 'Тайская кухня', 240, '', {
    nameEn: 'Nam Tok Kor Moo — Spicy Grilled Pork Neck Salad', weight: '200 г', composition: 'свиная шея на гриле, кулантро, шалот, зелёный лук; заправка: рыбный соус, сок лайма, молотый чили, обжаренная рисовая мука, глутамат натрия', image: null }),
  m('Сом Там Тай', 'Тайская кухня', 250, '', {
    nameEn: 'Som Tam Thai', weight: '300 г', composition: 'зелёная папайя, сушёные креветки, молотый арахис, помидоры черри, чили, съедобные цветы; соус: тамариндовая паста, рыбный соус, пальмовый сахар, сок лайма', image: null }),
  m('Том Ям Кунг', 'Тайская кухня', 230, '', {
    nameEn: 'Tom Yum Kung', weight: '400 г', composition: 'белые креветки, речные креветки, соломенные грибы, галангал, лемонграсс, листья каффир-лайма, шалот; соус: тамариндовая паста, рыбный соус, пальмовый сахар, сок лайма, чили-масло, сгущённое молоко', image: null }),
  m('Пад Тай с креветками', 'Тайская кухня', 200, '', {
    nameEn: 'Pad Thai with Shrimp', weight: '300 г', composition: 'креветки, рисовая лапша, яйцо, тофу, сладкая маринованная редька, дроблёный арахис, китайский лук, ростки фасоли; соус: тамаринд, рыбный соус, пальмовый сахар, сладкий чили, чили-масло', image: null }),
  m('Жареный рис с ананасом', 'Тайская кухня', 180, '', {
    nameEn: 'Pineapple Fried Rice', weight: '350 г', composition: 'креветки, охлаждённый рис, ананас, яйцо, лук, зелёный лук, изюм, кешью, масло; приправы: куркума, устричный соус, светлый соевый соус, рыбный соус', image: null }),
  m('Капуста с рыбным соусом', 'Тайская кухня', 120, '', {
    nameEn: 'Cabbage with Fish Sauce', weight: '250 г', composition: 'капуста, рыбный соус, чеснок', image: null }),
  // Позиции нет в печатной карте — оставлена как есть до решения по ней.
  m('Мидии в белом вине с чесноком и травами (560 г)', 'Тайская кухня', 170, '', { nameEn: 'Mussels in White Wine, Garlic & Herbs (560 g)', image: null }),

  // ----- ЕДА · Салаты -----
  m('Салат Луи с креветками', 'Салаты', 260, 'Фирменный салат шефа.', {
    nameEn: 'Shrimp Louie — GROT Chef’s Special', weight: '300 г', composition: 'отварные креветки, микс салатных листьев, авокадо, спаржа, помидоры черри, огурец, редис, яйцо, лимон; соус Луи: майонез, кетчуп, чили-соус, лимонный сок, вустерский соус, рубленый корнишон, паприка', image: null }),
  m('Плейбой', 'Салаты', 240, '', {
    nameEn: 'Playboy Salad', weight: '350 г', composition: 'куриные сердечки, солёные огурцы, лук, майонез, растительное масло', image: null }),
  m('Нисуаз с тунцом и анчоусами', 'Салаты', 220, '', {
    nameEn: 'Niçoise Salad with Tuna & Anchovies', weight: '200 г', composition: 'салат, консервированный тунец, помидоры черри, перепелиные яйца, стручковая фасоль, молодой картофель, оливки, красный лук; заправка: оливковое масло, дижонская горчица, бальзамический уксус, анчоусы', image: null }),
  m('Аджапсандал', 'Салаты', 220, '', {
    nameEn: 'Ajapsandali', weight: '250 г', composition: 'баклажан, болгарский перец, помидоры, чеснок, зелень (кинза, петрушка)', image: null }),
  m('Вальдорф', 'Салаты', 190, '', {
    nameEn: 'Waldorf Salad', weight: '220 г', composition: 'куриное филе, виноград без косточек, грецкие орехи, яблоки, стебли сельдерея, салат; заправка: майонез, лимонный сок, чёрный перец', image: null }),
  m('Цезарь', 'Салаты', 180, '', {
    nameEn: 'Caesar Salad', weight: '300 г', composition: 'салат айсберг, куриное филе, помидоры черри, сухарики, пармезан, чеснок; заправка: оливковое масло, пармезан, яйцо, горчица, чеснок, сахар', image: null }),
  m('Салат из свежей тыквы', 'Салаты', 140, '', {
    nameEn: 'Fresh Pumpkin Salad', weight: '160 г', composition: 'тыква, морковь, салат, яблоко, гранат; заправка: оливковое масло, красный винный уксус, мёд', image: null }),
  m('Салат огурец, помидор, болгарский перец', 'Салаты', 120, '', {
    nameEn: 'Cucumber, Tomato & Bell Pepper Salad', weight: '250 г', composition: 'помидор, огурец, болгарский перец, лук, оливки, зелень (укроп, петрушка, зелёный лук), оливковое масло, сушёные специи', image: null }),
  m('Битые огурцы', 'Салаты', 100, '', {
    nameEn: 'Smashed Cucumber Salad', weight: '200 г', composition: 'огурец, зелёный лук, кинза; маринад: чеснок, имбирь, чёрный перец, соевый соус, сахар, растительное масло, яблочный уксус', image: null }),
  m('Витаминный', 'Салаты', 100, '', {
    nameEn: 'Vitamin Salad', weight: '150 г', composition: 'капуста, морковь, сахар, соль, уксус, растительное масло', image: null }),

  // ----- ЕДА · Закуски к пиву -----
  // Раздела нет в присланной печатной карте — вес и состав как были.
  m('Свиные уши', 'Закуски к пиву', 300, 'Хрустящие свиные уши со специями — классическая закуска к пиву.', {
    nameEn: 'Pork Ears', composition: 'свиные уши, специи', image: null }),
  m('Домашние ржаные гренки', 'Закуски к пиву', 60, 'Ароматные ржаные гренки с чесноком, приготовленные по домашнему рецепту.', {
    nameEn: 'Homemade Rye Croutons', composition: 'ржаной хлеб, чеснок, масло, специи', image: null }),
  m('Домашняя вяленая говядина (50 г)', 'Закуски к пиву', 200, 'Домашняя вяленая говядина — насыщенный вкус, идеально к пиву.', {
    nameEn: 'Homemade Beef Jerky (50 g)', weight: '50 г', composition: 'говядина, соль, специи', image: null }),
  m('Картошка фри', 'Закуски к пиву', 100, 'Хрустящая золотистая картошка фри с солью.', {
    nameEn: 'French Fries', composition: 'картофель, масло, соль', image: null }),
  m('Креветки варёные в пиве (250 г)', 'Закуски к пиву', 350, '', { nameEn: 'Beer-Boiled Shrimp (250 g)', image: null }),
  m('Лепёшка', 'Закуски к пиву', 60, 'Свежая лепёшка, выпеченная до румяной корочки.', {
    nameEn: 'Flatbread', composition: 'мука, вода, дрожжи, соль', image: null }),

  // ----- НАПИТКИ · Бутылочное пиво -----
  m('Weihenstephaner Original Helles', 'Бутылочное пиво', 190, 'Мягкое, лёгкое и освежающее.', { group: 'drinks', weight: '0.5 л', style: 'Pale Lager', composition: 'светлый солод, хмель', popular: true, image: '/menu/weihenstephaner-helles.jpg' }),
  m('Weihenstephaner Hefe Weissbier', 'Бутылочное пиво', 190, 'Натурально мутное с фруктовым ароматом.', { group: 'drinks', weight: '0.5 л', style: 'Wheat Beer', composition: 'пшеничный солод, хмель', image: '/menu/weihenstephaner-hefe.jpg' }),
  m('Weihenstephaner Hefeweissbier Dunkel', 'Бутылочное пиво', 190, 'Тёмное нефильтрованное пшеничное.', { group: 'drinks', weight: '0.5 л', style: 'Dark Wheat Beer', composition: 'тёмный пшеничный солод, хмель', image: null }),
  m('Erdinger Weissbier', 'Бутылочное пиво', 220, 'Освежающее, фруктовое и насыщенное.', { group: 'drinks', weight: '0.5 л', style: 'Wheat Beer', composition: 'пшеничный солод, хмель', popular: true, image: '/menu/erdinger-weissbier-bottle.jpg' }),
  m('Erdinger Dunkel', 'Бутылочное пиво', 220, 'Солодовое и мягкое, с богатым вкусом.', { group: 'drinks', weight: '0.5 л', style: 'Dark Wheat Beer', composition: 'тёмный солод, хмель', image: '/menu/erdinger-dunkel-bottle.jpg' }),
  m('Paulaner Weissbier Dunkel', 'Бутылочное пиво', 230, 'Солодовое, мягкое, с нотами карамели.', { group: 'drinks', weight: '0.5 л', style: 'Dark Wheat Beer', composition: 'тёмный пшеничный солод, хмель', image: '/menu/paulaner-weissbier-dunkel.jpg' }),
  m('Paulaner Hefe Weissbier', 'Бутылочное пиво', 230, 'Лёгкое, фруктовое и натурально мутное.', { group: 'drinks', weight: '0.5 л', style: 'Wheat Beer', composition: 'пшеничный солод, хмель', image: '/menu/paulaner-hefe-bottle.jpg' }),
  m('Paulaner Münchner Hell Lager', 'Бутылочное пиво', 230, 'Светлый мюнхенский лагер.', { group: 'drinks', weight: '0.5 л', style: 'Pale Lager', composition: 'светлый солод, хмель', image: null }),
  m('Hofbräu Münchner Weisse', 'Бутылочное пиво', 230, 'Яркое, мягкое и идеально сбалансированное.', { group: 'drinks', weight: '0.5 л', style: 'Wheat Beer', composition: 'пшеничный солод, хмель', image: '/menu/hofbrau-munchner-weisse.jpg' }),
  m('Hofbräu Schwarze Weisse', 'Бутылочное пиво', 210, 'Полнотелое, со вкусом солода и карамели.', { group: 'drinks', weight: '0.5 л', style: 'Dark Wheat Beer', composition: 'тёмный пшеничный солод, хмель', image: '/menu/hofbrau-schwarze-weisse.jpg' }),
  m('Arcobrau Urfass Lager', 'Бутылочное пиво', 210, 'Светлый немецкий лагер.', { group: 'drinks', weight: '0.5 л', style: 'Pale Lager', composition: 'светлый солод, хмель', image: null }),
  m('Franziskaner Dunkel', 'Бутылочное пиво', 190, 'Солодовое, мягкое и насыщенное.', { group: 'drinks', weight: '0.5 л', style: 'Dark Wheat Beer', composition: 'тёмный солод, хмель', image: '/menu/franziskaner-dunkel.jpg' }),
  m('Bitburger Beer 0.0%', 'Бутылочное пиво', 180, 'Немецкий безалкогольный пилснер.', { group: 'drinks', weight: '0.33 л', style: 'Alcohol-Free Pilsner', composition: 'светлый солод, хмель', image: null }),
  // Позиций ниже нет в печатной карте — оставлены как есть до решения по ним.
  m('Franziskaner Weissbier', 'Бутылочное пиво', 190, 'Классическое немецкое пшеничное — мягкое и фруктовое.', { group: 'drinks', style: 'Wheat Beer', composition: 'пшеничный солод, хмель', image: '/menu/franziskaner-weissbier.jpg' }),
  m('Guinness Draught Stout (банка)', 'Бутылочное пиво', 280, '', { group: 'drinks', nameEn: 'Guinness Draught Stout (can)', image: null }),
  // ----- НАПИТКИ · Сидр -----
  m('Moose Craft Cider', 'Бутылочное пиво', 100, 'Хрустящий, освежающий и натурально вкусный.', { group: 'drinks', weight: '0.33 л', style: 'Apple Cider', composition: 'тайский яблочный сидр', popular: true, image: '/menu/moose-craft-cider.jpg' }),

  // ----- НАПИТКИ · Разливное пиво -----
  m('Weihenstephaner Original Helles (разливное)', 'Разливное пиво', 230, 'Светлый немецкий лагер.', { group: 'drinks', nameEn: 'Weihenstephaner Original Helles (draft)', weight: '0.5 л', style: 'Pale Lager', image: null }),
  m('Arcobrau Urfass (разливное)', 'Разливное пиво', 230, 'Светлое немецкое пиво.', { group: 'drinks', nameEn: 'Arcobrau Urfass (draft)', weight: '0.5 л', style: 'Pale Beer', image: null }),
  m('Hofbräu Original Münchner Hell (разливное)', 'Разливное пиво', 230, 'Светлый немецкий лагер.', { group: 'drinks', nameEn: 'Hofbräu Original Münchner Hell (draft)', weight: '0.5 л', style: 'Pale Lager', image: null }),
  m('Paulaner Hefe Weissbier (разливное)', 'Разливное пиво', 240, 'Немецкое светлое нефильтрованное пшеничное.', { group: 'drinks', nameEn: 'Paulaner Hefe Weissbier (draft)', weight: '0.5 л', style: 'Wheat Beer', image: null }),
  m('Erdinger Dunkel (разливное)', 'Разливное пиво', 230, 'Немецкое тёмное пшеничное.', { group: 'drinks', nameEn: 'Erdinger Dunkel (draft)', weight: '0.4 л', style: 'Dark Wheat Beer', image: null }),
  m('Бельгийское нефильтрованное (разливное)', 'Разливное пиво', 190, 'Светлое нефильтрованное.', { group: 'drinks', nameEn: 'Belgian Unfiltered Beer (draft)', weight: '0.4 л', style: 'Pale Unfiltered', image: null }),
  m('Ирландский эль (разливное)', 'Разливное пиво', 180, 'Традиционный ирландский эль.', { group: 'drinks', nameEn: 'Irish Ale (draft)', weight: '0.4 л', style: 'Ale', image: null }),
  m('Жигулёвское (разливное)', 'Разливное пиво', 160, 'Светлый лагер.', { group: 'drinks', nameEn: 'Zhigulevskoye (draft)', weight: '0.4 л', style: 'Pale Lager', image: null }),

  // ----- НАПИТКИ · Винная карта -----
  // Раздела нет в присланной печатной карте — прайс как был.
  // Названия — марки, поэтому name и nameEn совпадают (как у пива).
  m('Prosecco', 'Вино', 1500, 'Игристое сухое — лёгкое, с тонкими пузырьками.', { group: 'drinks', nameEn: 'Prosecco', style: 'Sparkling', image: null }),
  m('Riesling', 'Вино', 1200, 'Белое — ароматное, со свежей кислотностью.', { group: 'drinks', nameEn: 'Riesling', style: 'White', image: null }),
  m('Moscato d’Asti', 'Вино', 1500, 'Игристое сладкое — лёгкое, с ароматом муската.', { group: 'drinks', nameEn: 'Moscato d’Asti', style: 'Sparkling Sweet', image: null }),
  m('Contarini Prosecco DOC Treviso Millesimato Extra Dry', 'Вино', 1450, 'Игристое экстра-драй из Тревизо.', { group: 'drinks', nameEn: 'Contarini Prosecco DOC Treviso Millesimato Extra Dry', style: 'Sparkling', image: null }),
  m('Les Pins d’Aubane Rosé de France', 'Вино', 700, 'Розовое сухое — свежее и лёгкое.', { group: 'drinks', nameEn: 'Les Pins d’Aubane Rosé de France', style: 'Rosé', image: null }),
  m('Les Solstices Blanc de France', 'Вино', 750, 'Белое сухое — мягкое и сбалансированное.', { group: 'drinks', nameEn: 'Les Solstices Blanc de France', style: 'White', image: null }),
  m('Immortale Blanc de Blancs Organic Wine', 'Вино', 1950, 'Органическое белое — чистый вкус и долгое послевкусие.', { group: 'drinks', nameEn: 'Immortale Blanc de Blancs Organic Wine', style: 'White Organic', image: null }),
  m('Fournier Cidre de Normandie Doux 2.5%', 'Вино', 550, 'Нормандский сидр — сладкий, лёгкий, 2.5%.', { group: 'drinks', nameEn: 'Fournier Cidre de Normandie Doux 2.5%', style: 'Cider', image: null }),
  m('Grande Alberone Rosso Vino d’Italia', 'Вино', 1300, 'Красное — насыщенное, с бархатистым телом.', { group: 'drinks', nameEn: 'Grande Alberone Rosso Vino d’Italia', style: 'Red', image: null }),
  m('Les Solstices Rouge de France Cuvée Tradition', 'Вино', 750, 'Красное сухое — мягкие танины, ягодный тон.', { group: 'drinks', nameEn: 'Les Solstices Rouge de France Cuvée Tradition', style: 'Red', image: null }),
  m('Correa Familia Lisoni Sauvignon Blanc Estate Bottled', 'Вино', 750, 'Белое сухое — цитрусовое и освежающее.', { group: 'drinks', nameEn: 'Correa Familia Lisoni Sauvignon Blanc Estate Bottled', style: 'White', image: null }),
  m('Birchgrove Bird’s Block Cuvée Inspiring Red', 'Вино', 650, 'Красное — фруктовое, питкое.', { group: 'drinks', nameEn: 'Birchgrove Bird’s Block Cuvée Inspiring Red', style: 'Red', image: null }),
  m('4 Diablos Carménère Central Valley', 'Вино', 650, 'Красное чилийское карменер — пряное и плотное.', { group: 'drinks', nameEn: '4 Diablos Carménère Central Valley', style: 'Red', image: null }),
  m('Puntí Ferrer Limited Edition Sauvignon Blanc', 'Вино', 750, 'Белое сухое — яркое, с травяными нотами.', { group: 'drinks', nameEn: 'Puntí Ferrer Limited Edition Sauvignon Blanc', style: 'White', image: null }),
  m('Grande Alberone Moscato Spumante Dolce', 'Вино', 1600, 'Игристое сладкое москато — десертное.', { group: 'drinks', nameEn: 'Grande Alberone Moscato Spumante Dolce', style: 'Sparkling Sweet', image: null }),

  // Вино на розлив (wine on tap) — та же категория «Вино», формат вынесен в название.
  m('Mont Clair White Celebration (розлив)', 'Вино', 150, '', { group: 'drinks', nameEn: 'Mont Clair White Celebration (on tap)', image: null }),
  m('Mont Clair Red Celebration (розлив)', 'Вино', 150, '', { group: 'drinks', nameEn: 'Mont Clair Red Celebration (on tap)', image: null }),

  // ----- НАПИТКИ · Крепкий алкоголь -----
  // В печатной карте у каждой марки две цены: шот 30 мл и бутылка.
  // Позиция в системе одна цена = одна строка, поэтому формат вынесен в название.
  m('Sang Som Rum (шот 30 мл)', 'Крепкий алкоголь', 80, 'Тайский ром.', { group: 'drinks', nameEn: 'Sang Som Rum (shot 30 ml)', weight: '30 мл', image: null }),
  m('Sang Som Rum (бутылка 0.3 л)', 'Крепкий алкоголь', 350, 'Тайский ром.', { group: 'drinks', nameEn: 'Sang Som Rum (bottle 0.3 L)', weight: '0.3 л', image: null }),
  m('Vodka ABSOLUT (шот 30 мл)', 'Крепкий алкоголь', 120, 'Шведская водка.', { group: 'drinks', nameEn: 'Vodka ABSOLUT (shot 30 ml)', weight: '30 мл', image: null }),
  m('Vodka ABSOLUT (бутылка 0.7 л)', 'Крепкий алкоголь', 1900, 'Шведская водка.', { group: 'drinks', nameEn: 'Vodka ABSOLUT (bottle 0.7 L)', weight: '0.7 л', image: null }),
  m('Vodka ABSOLUT (бутылка 1 л)', 'Крепкий алкоголь', 2500, 'Шведская водка.', { group: 'drinks', nameEn: 'Vodka ABSOLUT (bottle 1 L)', weight: '1 л', image: null }),
  m('Persha Hildiia (шот 30 мл)', 'Крепкий алкоголь', 160, 'Украинская водка.', { group: 'drinks', nameEn: 'Persha Hildiia (shot 30 ml)', weight: '30 мл', image: null }),
  m('Persha Hildiia (бутылка 0.7 л)', 'Крепкий алкоголь', 2600, 'Украинская водка.', { group: 'drinks', nameEn: 'Persha Hildiia (bottle 0.7 L)', weight: '0.7 л', image: null }),
  m('Black Label (шот 30 мл)', 'Крепкий алкоголь', 200, 'Купажированный шотландский виски.', { group: 'drinks', nameEn: 'Black Label (shot 30 ml)', weight: '30 мл', image: null }),
  m('Black Label (бутылка 1 л)', 'Крепкий алкоголь', 4500, 'Купажированный шотландский виски.', { group: 'drinks', nameEn: 'Black Label (bottle 1 L)', weight: '1 л', image: null }),
  m('GILBEY’S Vodka (шот 30 мл)', 'Крепкий алкоголь', 80, 'Водка.', { group: 'drinks', nameEn: 'GILBEY’S Vodka (shot 30 ml)', weight: '30 мл', image: null }),
  m('GILBEY’S Vodka (бутылка 0.7 л)', 'Крепкий алкоголь', 900, 'Водка.', { group: 'drinks', nameEn: 'GILBEY’S Vodka (bottle 0.7 L)', weight: '0.7 л', image: null }),
  m('GILBEY’S Gin (шот 30 мл)', 'Крепкий алкоголь', 80, 'Джин в стиле London Dry.', { group: 'drinks', nameEn: 'GILBEY’S Gin (shot 30 ml)', weight: '30 мл', image: null }),
  m('GILBEY’S Gin (бутылка 0.7 л)', 'Крепкий алкоголь', 900, 'Джин в стиле London Dry.', { group: 'drinks', nameEn: 'GILBEY’S Gin (bottle 0.7 L)', weight: '0.7 л', image: null }),

  // ----- НАПИТКИ · Морс -----
  m('Домашний клюквенный морс 0.33 л', 'Безалкогольные', 60, 'Натуральный, освежающий и полезный напиток.', { group: 'drinks', nameEn: 'Homemade Cranberry Juice 0.33 L', style: 'Клюквенный морс', weight: '0.33 л', composition: 'клюква, вода, сахар', image: '/menu/mors-033.jpg' }),
  m('Домашний клюквенный морс 0.2 л', 'Безалкогольные', 40, 'Натуральный, освежающий и полезный напиток.', { group: 'drinks', nameEn: 'Homemade Cranberry Juice 0.2 L', style: 'Клюквенный морс', weight: '0.2 л', composition: 'клюква, вода, сахар', image: '/menu/mors-022.jpg' }),
];

// Каждый напиток — складская позиция; 1 заказанная единица = -1 бутылка или шот.
for (const d of menu.filter((x) => x.group === 'drinks')) {
  const item = { id: id(), slug: 'drink_' + d.id, name: d.name, unit: /мл$|шот/.test(String(d.weight || '')) ? 'шот' : 'бут', qty: 48, min: 24,
    supplier: d.category === 'Сидр' ? 'Cider Import' : 'Bavaria Import', alcohol: true };
  ingredients.push(item);
  d.recipe = { [item.id]: 1 };
}

// Снимок сида меню — делается ДО того, как persistence заменит массив данными
// с диска. Нужен, чтобы новые позиции из кода доезжали на сервер обычным деплоем.
const MENU_SEED = menu.slice();

// Досев меню при старте: добавляет позиции, которых нет в базе (сверка по названию).
// Существующие НЕ трогает — цены и правки, сделанные владельцем в приложении,
// остаются как есть. Удаления позиций в системе нет, поэтому «воскрешения»
// удалённого блюда произойти не может.
// Позиции, переименованные на боевом сервере скриптом синхронизации:
// «имя в сиде» → «имя в базе». Без этой карты досев создал бы дубли.
const MENU_RENAMES = {
  'Домашний клюквенный морс 0.33 л': 'Домашний клюквенный морс 0.33 L',
  'Домашний клюквенный морс 0.2 л': 'Домашний клюквенный морс 0.22 L',
};

/**
 * Переименования, которые делает КОД: «имя в базе» → «новое имя».
 *
 * Название — ключ, по которому досев узнаёт позицию, поэтому переименование
 * должно случиться ДО досева: иначе рядом со старой строкой появится новая
 * с тем же блюдом. Сама позиция не пересоздаётся — id сохраняется, и вся
 * история заказов, техкарта и статистика остаются привязанными к ней.
 *
 * Применяется один раз по факту: если позиции с таким именем уже нет
 * (или имя занято), шаг просто пропускается — повторный старт безопасен.
 *
 * Повод: сверка с печатной картой бара (EN, версия 2026-08). Вес и объём
 * там отдельной колонкой, поэтому из названий они убраны в поле weight.
 */
const MENU_RENAME_TO = {
  'Шашлык из свинины (200 г)': 'Шашлык из свинины',
  'Шашлык из утки (200 г)': 'Шашлык из утки',
  'Куриные крылышки (6 шт.)': 'Куриные крылышки',
  'Гребешки на гриле с чесночно-сливочным соусом (150 г)': 'Гребешки на гриле с чесночно-сливочным соусом',
  'Креветки и морепродукты на горячей сковороде (400 г)': 'Креветки и морепродукты на горячей сковороде',
  'Хор Мок Талай — карри с морепродуктами в кокосе (220 г)': 'Хор Мок Талай — карри с морепродуктами в кокосе',
  'Том Ям Кунг (120 г)': 'Том Ям Кунг',
  'Пла Кунг — острый тайский салат с креветками (350 г)': 'Пла Кунг — острый тайский салат с креветками',
  'Жареный рис с ананасом (350 г)': 'Жареный рис с ананасом',
  'Сом Там Тай (180 г)': 'Сом Там Тай',
  'Пад Тай с креветками (120 г)': 'Пад Тай с креветками',
  'Намток Кор Му — острый салат из свиной шеи (160 г)': 'Намток Кор Му — острый салат из свиной шеи',
  // В карте салат с креветками, а не с крабом — название было неверным.
  'Краб Луи': 'Салат Луи с креветками',
  // Бургеры вынесены в собственный раздел карты.
  'Smash Burger': 'Бургер Smash с говядиной',
  // ⚠️ Допущение: в карте единственный свиной бургер — Pulled Pork Burger.
  'Бургер со свининой': 'Бургер с томлёной свининой',
  // У крепкого алкоголя формат (шот/бутылка) теперь в названии: цен две, а
  // позиция в системе хранит одну — значит и строк должно быть две.
  'Vodka ABSOLUT (1 шот)': 'Vodka ABSOLUT (шот 30 мл)',
  'Sang Som Rum (бутылка)': 'Sang Som Rum (бутылка 0.3 л)',
  // Разливное: у бутылочного те же марки, поэтому формат остаётся в названии,
  // а объём уходит в weight — как в остальном меню.
  'Paulaner Hefe Weissbier (0.5 L)': 'Paulaner Hefe Weissbier (разливное)',
  'Erdinger Dunkel (0.4 L)': 'Erdinger Dunkel (разливное)',
  'Бельгийское нефильтрованное (0.4 L)': 'Бельгийское нефильтрованное (разливное)',
  'Ирландский эль (0.4 L)': 'Ирландский эль (разливное)',
  'Жигулёвское (0.4 L)': 'Жигулёвское (разливное)',
};

/** Переименовывает позиции по MENU_RENAME_TO. Возвращает список изменений. */
export function renameMenuItems() {
  const renamed = [];
  for (const [from, to] of Object.entries(MENU_RENAME_TO)) {
    const item = menu.find((x) => String(x.name).trim() === from);
    if (!item) continue;                                        // уже переименована
    if (menu.some((x) => String(x.name).trim() === to)) continue; // имя занято — не плодим дубль
    item.name = to;
    renamed.push(`${from} → ${to}`);
  }
  return renamed;
}

/**
 * Позиции, снятые с меню.
 *
 * Удаления позиций в системе нет СОЗНАТЕЛЬНО: заказ хранит копию названия
 * и цены, но отчёты, техкарты и статистика ссылаются на саму позицию —
 * удаление порвало бы историю. Поэтому блюдо не стирается, а становится
 * недоступным: официант его больше не пробьёт, а прошлые заказы целы.
 *
 * Применяется при каждом старте: решение о снятии живёт в коде, а не
 * в разовом клике по базе, и переживает пересоздание стенда.
 */
const MENU_RETIRED = [
  'Купаты из курицы', // сняты: остаются свиные и свинина+курица
  'Erdinger Weissbier (0.4 L)', // разливной снят; бутылочный Erdinger Weissbier остаётся
];

/**
 * Цены, которые задаёт КОД, а не приложение.
 *
 * Обычный досев цены не трогает — и это правильно: владелец правит их прямо
 * в кабинете, и деплой не должен затирать его работу. Но у части позиций цена
 * согласована отдельно и должна доезжать до боевой базы вместе с кодом, иначе
 * утверждённый прайс живёт в переписке, а не в приложении.
 *
 * ⚠️ ПЛАТА ЗА ЭТО: цену позиции из этого списка нельзя поменять в приложении
 * «навсегда» — следующий деплой вернёт значение отсюда. Меняя цену такой
 * позиции, меняйте её ЗДЕСЬ. Держите список коротким по этой же причине.
 */
const MENU_PRICES = {
  // Салаты — прайс утверждён владельцем 2026-08-27
  'Салат из свежей тыквы': 140,
  'Битые огурцы': 100,
  'Салат огурец, помидор, болгарский перец': 120,
  'Витаминный': 100,
  'Цезарь': 180,
  'Нисуаз с тунцом и анчоусами': 220,
  'Вальдорф': 190,
  'Аджапсандал': 220,
  // Расхождения с печатной картой бара (EN, версия 2026-08) — карта старше базы.
  'Плейбой': 240,                                          // было 140
  'Салат Луи с креветками': 260,
  'Шашлык из куриного филе': 250,                          // было 200
  'Намток Кор Му — острый салат из свиной шеи': 240,       // было 130
  'Пад Тай с креветками': 200,                             // было 160
  'Сом Там Тай': 250,                                      // было 180
  'Пла Кунг — острый тайский салат с креветками': 280,     // было 210
  'Том Ям Кунг': 230,                                      // было 280
  'Sang Som Rum (бутылка 0.3 л)': 350,                     // было 300
};

/**
 * Поля, которые задаёт КОД, а не приложение: категория, вес, состав,
 * описание, английское название, стиль.
 *
 * Цену и наличие владелец правит в кабинете — их здесь нет намеренно.
 * Всё остальное приходит из карточек кухни и печатной карты, живёт в сиде
 * и должно доезжать до боевой базы деплоем: иначе состав блюда, по которому
 * официант отвечает гостю на вопрос «что внутри», навсегда останется пустым
 * у позиций, заведённых до того, как состав появился в коде.
 *
 * Фото (image) сюда не входит: картинки грузятся отдельно и затирать их
 * значением из сида нельзя.
 */
const MENU_SYNC_FIELDS = ['category', 'weight', 'composition', 'description', 'nameEn', 'style'];

/** Приводит поля из MENU_SYNC_FIELDS к значениям сида. Возвращает список изменений. */
export function syncMenuFields() {
  const seedByName = new Map(MENU_SEED.map((s) => [String(s.name).trim(), s]));
  const changed = [];
  for (const item of menu) {
    const seed = seedByName.get(String(item.name).trim());
    if (!seed) continue; // позиции, заведённой только в приложении, сид не касается
    const fields = MENU_SYNC_FIELDS.filter((f) => (item[f] ?? null) !== (seed[f] ?? null));
    if (!fields.length) continue;
    for (const f of fields) item[f] = seed[f] ?? null;
    changed.push(`${item.name}: ${fields.join(', ')}`);
  }
  return changed;
}

/** Приводит цены из списка к значениям из кода. Возвращает список изменений. */
export function enforceMenuPrices() {
  const changes = [];
  for (const item of menu) {
    const want = MENU_PRICES[String(item.name).trim()];
    if (want != null && item.price !== want) {
      changes.push(`${item.name}: ${item.price} → ${want}`);
      item.price = want;
    }
  }
  return changes;
}

export function retireMenuItems() {
  let retiredCount = 0;
  for (const item of menu) {
    if (MENU_RETIRED.includes(String(item.name).trim()) && item.available !== false) {
      item.available = false;
      retiredCount++;
    }
  }
  return retiredCount;
}

export function ensureMenuItems() {
  const have = new Set(menu.map((m) => String(m.name).trim()));
  let added = 0;
  for (const s of MENU_SEED) {
    const name = String(s.name).trim();
    if (have.has(name) || have.has(MENU_RENAMES[name])) continue;
    menu.push({ ...s, id: id() });
    have.add(name);
    added++;
  }
  return added;
}

// ---------- Столы (с QR) ----------
// 8 столов в зале (number 1..8, zone 'table') + барная стойка на 8 мест
// (number 101..108, zone 'bar', отображается как «Бар 1..8»).
export const tables = [
  ...Array.from({ length: 8 }, (_, i) => ({
    id: id(), number: i + 1, zone: 'table', seats: [2, 2, 4, 4, 4, 6, 6, 4][i],
    qr: `GROT-TABLE-${i + 1}`, status: 'free',
    x: (i % 4) * 22 + 8, y: Math.floor(i / 4) * 26 + 10,
  })),
  ...Array.from({ length: 8 }, (_, i) => ({
    id: id(), number: 101 + i, zone: 'bar', seats: 1,
    qr: `GROT-BAR-${i + 1}`, status: 'free',
    x: (i % 8) * 11 + 6, y: 78,
  })),
];

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
