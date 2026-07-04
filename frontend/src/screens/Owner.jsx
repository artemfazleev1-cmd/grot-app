import { useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../context/store.jsx';
import { Loader, useFetch, money, Empty } from '../components/ui.jsx';

const TABS = ['Аналитика', 'CRM', 'Персонал', 'Склад', 'Рассылки', 'Контент'];

export default function Owner() {
  const [tab, setTab] = useState('Аналитика');
  return (
    <div className="screen">
      <h1>Панель владельца</h1>
      <div className="chips" style={{ marginTop: 10 }}>
        {TABS.map((t) => <button key={t} className={`chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <div style={{ marginTop: 16 }}>
        {tab === 'Аналитика' && <Analytics />}
        {tab === 'CRM' && <CRM />}
        {tab === 'Персонал' && <Staff />}
        {tab === 'Склад' && <Inventory />}
        {tab === 'Рассылки' && <Broadcasts />}
        {tab === 'Контент' && <Content />}
      </div>
    </div>
  );
}

function Staff() {
  const { toast } = useStore();
  const { data, loading, reload } = useFetch(() => api.get('/staff'));
  const [form, setForm] = useState({ name: '', phone: '', role: 'waiter', password: '' });
  const [myPass, setMyPass] = useState('');
  const [myPhone, setMyPhone] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  if (loading || !data) return <Loader />;

  const add = async () => {
    if (!form.name || !form.phone || !form.password) return toast('Заполните имя, телефон и пароль');
    try {
      await api.post('/staff', form);
      toast(`Сотрудник ${form.name} добавлен`);
      setForm({ name: '', phone: '', role: 'waiter', password: '' });
      reload();
    } catch (e) { toast(e.message); }
  };
  const toggle = async (s) => { await api.patch(`/staff/${s.id}`, { active: !s.active }); toast(s.active ? 'Доступ отключён' : 'Доступ включён'); reload(); };
  const resetPass = async (s) => {
    const p = prompt(`Новый пароль для ${s.name}:`);
    if (!p) return;
    try { await api.patch(`/staff/${s.id}`, { password: p }); toast('Пароль изменён'); } catch (e) { toast(e.message); }
  };
  const remove = async (s) => {
    if (!confirm(`Удалить сотрудника ${s.name}?`)) return;
    try { await api.del(`/staff/${s.id}`); toast('Сотрудник удалён'); reload(); }
    catch (e) { toast(e.message); }
  };
  const changeMyPassword = async () => {
    if (myPass.length < 4) return toast('Пароль минимум 4 символа');
    try { await api.post('/me/password', { password: myPass }); toast('Ваш пароль изменён'); setMyPass(''); } catch (e) { toast(e.message); }
  };
  const changeMyPhone = async () => {
    if (!myPhone.trim()) return toast('Введите номер');
    try { await api.post('/me/phone', { phone: myPhone.trim() }); toast('Ваш номер изменён — используйте его для входа'); setMyPhone(''); } catch (e) { toast(e.message); }
  };

  return (
    <>
      <div className="card">
        <b>Добавить сотрудника</b>
        <label>Имя</label><input value={form.name} onChange={set('name')} placeholder="Имя сотрудника" />
        <label>Телефон (логин)</label><input value={form.phone} onChange={set('phone')} placeholder="+66..." inputMode="tel" />
        <label>Роль</label>
        <select value={form.role} onChange={set('role')}>
          <option value="waiter">Официант</option>
          <option value="cook">Кухня</option>
          <option value="courier">Курьер</option>
          <option value="admin">Администратор</option>
        </select>
        <label>Пароль</label><input value={form.password} onChange={set('password')} placeholder="Пароль для входа" />
        <button className="btn block" style={{ marginTop: 14 }} onClick={add}>Добавить</button>
      </div>

      <div className="section-title"><h2>Сотрудники</h2></div>
      <div className="list">
        {data.map((s) => (
          <div key={s.id} className={`card tight ${s.active ? '' : 'unavailable'}`}>
            <div className="between">
              <div><b>{s.name}</b> <span className="badge gold">{s.roleLabel}</span>{s.isOwner && <span className="badge green" style={{ marginLeft: 6 }}>вы / владелец</span>}</div>
              {!s.active && <span className="badge fire">отключён</span>}
            </div>
            <div className="muted" style={{ margin: '4px 0' }}>{s.phone}</div>
            {!s.isOwner && (
              <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
                <button className="chip" onClick={() => toggle(s)}>{s.active ? 'Отключить' : 'Включить'}</button>
                <button className="chip" onClick={() => resetPass(s)}>Сменить пароль</button>
                <button className="chip" onClick={() => remove(s)}>Удалить</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="section-title"><h2>Мой вход</h2></div>
      <div className="card">
        <div className="muted" style={{ marginBottom: 8 }}>Номер (логин) — вводите в международном формате, например +66994407765.</div>
        <div className="row" style={{ gap: 8 }}>
          <input value={myPhone} onChange={(e) => setMyPhone(e.target.value)} placeholder="+66..." inputMode="tel" style={{ flex: 1 }} />
          <button className="btn sm" onClick={changeMyPhone}>Сменить номер</button>
        </div>
        <div className="muted" style={{ margin: '12px 0 8px' }}>Пароль — задайте свой секретный.</div>
        <div className="row" style={{ gap: 8 }}>
          <input value={myPass} onChange={(e) => setMyPass(e.target.value)} placeholder="Новый пароль" style={{ flex: 1 }} />
          <button className="btn sm" onClick={changeMyPassword}>Сменить пароль</button>
        </div>
      </div>
    </>
  );
}

function Analytics() {
  const { data, loading } = useFetch(() => api.get('/analytics'));
  if (loading || !data) return <Loader />;
  const maxTop = Math.max(...data.topDishes.map((d) => d[1]), 1);
  return (<>
    <div className="kpi-grid">
      <div className="kpi"><div className="v">{money(data.revenue)}</div><div className="l">Выручка (сегодня)</div></div>
      <div className="kpi"><div className="v">{money(data.avgCheck)}</div><div className="l">Средний чек</div></div>
      <div className="kpi"><div className="v">{data.guests}</div><div className="l">Гостей в базе</div></div>
      <div className="kpi"><div className="v">{data.deliveries}</div><div className="l">Доставок</div></div>
      <div className="kpi"><div className="v">{data.reservations}</div><div className="l">Броней</div></div>
      <div className="kpi"><div className="v">{data.tableLoad}%</div><div className="l">Загрузка столов</div></div>
    </div>

    <div className="section-title"><h2>Выручка</h2></div>
    <div className="card">
      {Object.entries(data.revenueByDay).map(([k, v]) => (
        <div key={k} className="between" style={{ padding: '6px 0' }}><span className="muted">{k}</span><b className="gold">{money(v)}</b></div>
      ))}
    </div>

    <div className="section-title"><h2>Топ блюд</h2></div>
    <div className="card">
      {data.topDishes.map(([name, qty]) => (
        <div key={name} className="bar-row"><span className="lab">{name}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(qty / maxTop) * 100}%` }} /></div>
          <b>{qty}</b></div>
      ))}
    </div>
    <div className="card tight between" style={{ marginTop: 12 }}><span className="muted">Возврат клиентов</span><b>{data.returningClients}</b></div>
  </>);
}

function CRM() {
  const { data, loading } = useFetch(() => api.get('/crm/clients'));
  if (loading || !data) return <Loader />;
  return (
    <div className="list">
      {data.map((c) => (
        <div key={c.id} className="card">
          <div><b>{c.name}</b></div>
          <div className="muted">{c.phone} · с {new Date(c.createdAt).toLocaleDateString('ru-RU')}</div>
          <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
            <span className="badge gold">Покупки {money(c.totalSpent || 0)}</span>
            <span className="badge gold">Заказов {c.ordersCount || 0}</span>
            <span className="badge gold">Визитов {c.visits || 0}</span>
          </div>
          {c.favDishes?.length > 0 && <div className="muted" style={{ marginTop: 6 }}>Любимое: {c.favDishes.join(', ')}</div>}
          {c.lastVisit && <div className="muted">Последний визит: {new Date(c.lastVisit).toLocaleDateString('ru-RU')}</div>}
        </div>
      ))}
    </div>
  );
}

function StockRow({ g, reload }) {
  const { toast } = useStore();
  const [val, setVal] = useState('');
  const low = g.qty <= g.min;
  const addStock = async () => {
    const n = Number(val);
    if (!n || n <= 0) return;
    await api.patch(`/inventory/${g.id}`, { addQty: n });
    toast(`Приход: +${n} ${g.unit} · ${g.name}`); setVal(''); reload();
  };
  const setExact = async () => {
    const n = Number(val);
    if (val === '' || n < 0) return;
    await api.patch(`/inventory/${g.id}`, { qty: n });
    toast(`Остаток установлен: ${n} ${g.unit}`); setVal(''); reload();
  };
  return (
    <div className="card tight">
      <div className="between">
        <b>{g.name}</b>
        <span className={`badge ${low ? 'fire' : 'green'}`}>{low ? 'низкий остаток' : 'в норме'}</span>
      </div>
      <div className="bar-track" style={{ marginTop: 8 }}>
        <div className="bar-fill" style={{ width: `${Math.min(100, (g.qty / (g.min * 4)) * 100)}%`, background: low ? 'var(--grad-fire)' : 'var(--grad-gold)' }} />
      </div>
      <div className="muted" style={{ marginTop: 6 }}>Остаток: <b className="gold">{g.qty} {g.unit}</b> · мин {g.min} · {g.supplier}</div>
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <input type="number" inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} placeholder={`кол-во, ${g.unit}`} style={{ flex: 1 }} />
        <button className="btn sm" onClick={addStock}>＋ Приход</button>
        <button className="btn ghost sm" onClick={setExact}>Задать</button>
      </div>
    </div>
  );
}

function Inventory() {
  const stock = useFetch(() => api.get('/inventory'));
  const prod = useFetch(() => api.get('/inventory/production'));
  if (stock.loading || !stock.data) return <Loader />;
  const reloadAll = () => { stock.reload(); prod.reload(); };

  return (
    <>
      <div className="section-title"><h2>Можно приготовить из остатков</h2></div>
      <div className="list">
        {(prod.data || []).map((p) => {
          const out = p.portions <= 0;
          const lowp = p.portions > 0 && p.portions <= 10;
          return (
            <div key={p.id} className="card tight between">
              <div>
                <b>{p.name}</b>
                <div className="muted">ограничивает: {p.limiting}</div>
              </div>
              <span className={`badge ${out ? 'fire' : lowp ? 'gold' : 'green'}`}>{p.portions} порц.</span>
            </div>
          );
        })}
      </div>

      <div className="section-title"><h2>Склад · остатки и закупки</h2></div>
      <div className="list">
        {stock.data.map((g) => <StockRow key={g.id} g={g} reload={reloadAll} />)}
      </div>
      <div className="muted center" style={{ fontSize: 12, marginTop: 10 }}>
        Списание происходит автоматически при завершении заказа по тех. картам.
        «Приход» прибавляет к остатку, «Задать» — выставляет точное значение (инвентаризация).
      </div>
    </>
  );
}

function Broadcasts() {
  const { toast } = useStore();
  const [seg, setSeg] = useState('all');
  const [text, setText] = useState('');
  const { data, reload } = useFetch(() => api.get('/broadcasts'));
  const segs = [['all', 'Все'], ['vip', 'VIP'], ['delivery', 'Доставка'], ['bar', 'Бар'], ['inactive', 'Неактивные']];
  const presets = ['🔥 Неделя шашлыка началась', '🍺 Скидка на немецкое пиво', '♟ Турнир через час', '🎸 Сегодня живая музыка'];
  const send = async () => {
    if (!text) return;
    const r = await api.post('/broadcasts', { segment: seg, text });
    toast(`Отправлено ${r.delivered} клиентам`); setText(''); reload();
  };
  return (<>
    <label>Сегмент</label>
    <div className="chips">{segs.map(([v, l]) => <button key={v} className={`chip ${seg === v ? 'active' : ''}`} onClick={() => setSeg(v)}>{l}</button>)}</div>
    <label>Сообщение</label>
    <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Текст рассылки" />
    <div className="chips wrap" style={{ flexWrap: 'wrap', marginTop: 8 }}>
      {presets.map((p) => <button key={p} className="chip" onClick={() => setText(p)}>{p}</button>)}
    </div>
    <button className="btn block" style={{ marginTop: 14 }} onClick={send}>Отправить push</button>
    <div className="section-title"><h2>История</h2></div>
    <div className="list">
      {(data || []).map((b) => <div key={b.id} className="card tight"><b>{b.text}</b><div className="muted">сегмент: {b.segment}</div></div>)}
      {(!data || !data.length) && <Empty icon="📭" text="Рассылок ещё не было" />}
    </div>
  </>);
}

function Content() {
  const { toast } = useStore();
  const intro = useFetch(() => api.get('/intro'));
  const menu = useFetch(() => api.get('/menu'));
  if (intro.loading || menu.loading) return <Loader />;
  const I = intro.data;
  const saveIntro = async () => { await api.put('/intro', I); toast('Интро обновлено'); };
  const setI = (k) => (e) => intro.setData({ ...I, [k]: e.target.value });
  const setPrice = async (m, price) => { await api.put(`/menu/${m.id}`, { price: +price }); menu.reload(); };

  return (<>
    <div className="card">
      <h2>Интро-экран</h2>
      <label>Бейдж</label><input value={I.badge} onChange={setI('badge')} />
      <label>Заголовок</label><input value={I.title} onChange={setI('title')} />
      <label>Подзаголовок</label><input value={I.subtitle} onChange={setI('subtitle')} />
      <label>Текст</label><input value={I.text} onChange={setI('text')} />
      <button className="btn block" style={{ marginTop: 14 }} onClick={saveIntro}>Сохранить интро</button>
    </div>
    <div className="section-title"><h2>Цены меню</h2></div>
    <div className="list">
      {menu.data.items.map((m) => (
        <div key={m.id} className="card tight between">
          <span>{m.name}</span>
          <input style={{ width: 100 }} type="number" defaultValue={m.price} onBlur={(e) => setPrice(m, e.target.value)} />
        </div>
      ))}
    </div>
    <div className="muted center" style={{ fontSize: 11, marginTop: 10 }}>Полное редактирование меню/фото/событий/столов/пользователей — в этом же слое API</div>
  </>);
}
