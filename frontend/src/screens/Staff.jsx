import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useStore } from '../context/store.jsx';
import { Loader, useFetch, money, Empty } from '../components/ui.jsx';
import OrderChat from '../components/OrderChat.jsx';

// ---------------- ОФИЦИАНТ ----------------
export function WaiterPanel() {
  const { toast, t } = useStore();
  const orders = useFetch(() => api.get('/orders'));
  const calls = useFetch(() => api.get('/calls'));
  const resv = useFetch(() => api.get('/reservations'));
  if (orders.loading) return <Loader />;

  const setStatus = async (o, status) => { await api.patch(`/orders/${o.id}/status`, { status }); toast(`№${o.id}: ${t('st_' + status)}`); orders.reload(); };
  const closeCall = async (c) => { await api.patch(`/calls/${c.id}`, { status: 'done' }); calls.reload(); };
  const confirmResv = async (r) => { await api.patch(`/reservations/${r.id}`, { status: 'confirmed' }); toast('OK'); resv.reload(); };

  const active = orders.data.filter((o) => !['delivered', 'handed'].includes(o.status));

  return (
    <div className="screen">
      <h1>{t('waiter_panel')}</h1>

      <div className="section-title"><h2>{t('calls')}</h2></div>
      <div className="list">
        {(calls.data || []).map((c) => (
          <div key={c.id} className="card tight between">
            <span>{t('table')} №{c.tableNumber} — {c.type === 'bill' ? t('asks_bill') : t('calls_waiter')}</span>
            <button className="btn sm" onClick={() => closeCall(c)}>{t('got_it')}</button>
          </div>
        ))}
        {(!calls.data || calls.data.length === 0) && <Empty icon="🔕" text={t('no_calls')} />}
      </div>

      <div className="section-title"><h2>{t('orders')}</h2></div>
      <div className="list">
        {active.map((o) => (
          <div key={o.id} className="card">
            <div className="between"><b>#{o.id} · {o.type === 'delivery' ? t('delivery') : o.tableNumber ? `${t('table')} №${o.tableNumber}` : o.type}</b>
              <span className="badge gold">{t('st_' + o.status)}</span></div>
            <div className="muted">{o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}</div>
            {o.comment && <div className="muted">{t('comment')}: {o.comment}</div>}
            <div className="row" style={{ marginTop: 10 }}>
              {o.status === 'new' && <button className="btn sm" onClick={() => setStatus(o, 'accepted')}>{t('accept')}</button>}
              {o.status === 'accepted' && <button className="btn sm" onClick={() => setStatus(o, 'cooking')}>{t('to_kitchen')}</button>}
              {o.status === 'cooking' && <button className="btn sm" onClick={() => setStatus(o, 'ready')}>{t('ready')}</button>}
              {o.status === 'ready' && o.type === 'delivery' && <button className="btn sm" onClick={() => setStatus(o, 'delivering')}>{t('to_courier')}</button>}
              {o.status === 'ready' && o.type !== 'delivery' && <button className="btn sm" onClick={() => setStatus(o, 'handed')}>{t('hand_over')}</button>}
            </div>
          </div>
        ))}
        {active.length === 0 && <Empty icon="✨" text={t('no_active')} />}
      </div>

      <div className="section-title"><h2>{t('bookings')}</h2></div>
      <div className="list">
        {(resv.data || []).map((r) => (
          <div key={r.id} className="card tight between">
            <div>{t('table')} №{r.tableNumber} · {r.date} {r.time} · {r.guests} {t('guests')}
              {r.preorder?.length > 0 && <div className="muted">{t('preorder')}: {r.preorder.map((i) => i.name).join(', ')}</div>}</div>
            {r.status !== 'confirmed' ? <button className="btn sm" onClick={() => confirmResv(r)}>✓</button> : <span className="badge green">OK</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- КУХНЯ ----------------
const K_STATUS = { new: 'новый', accepted: 'принят', cooking: 'готовится', ready: 'готов', delivering: 'у курьера', delivered: 'доставлен', handed: 'выдан' };
const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();
const fmtTime = (iso) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function KitchenPanel() {
  const { toast, logout } = useStore();
  const orders = useFetch(() => api.get('/orders'));
  const menu = useFetch(() => api.get('/menu'));
  const [view, setView] = useState('queue');
  // авто-обновление табло заказов каждые 5 сек
  useEffect(() => { const iv = setInterval(orders.reload, 5000); return () => clearInterval(iv); }, []);
  if (orders.loading || menu.loading) return <Loader />;

  const queue = orders.data.filter((o) => ['cooking', 'accepted'].includes(o.status));
  const history = orders.data.filter((o) => ['ready', 'delivering', 'delivered', 'handed'].includes(o.status));
  const toggle = async (m) => { await api.patch(`/menu/${m.id}/availability`, { available: !m.available }); toast(`${m.name}: ${!m.available ? 'в наличии' : 'отключено'}`); menu.reload(); };

  // отчёт по приготовленным заказам
  const prepared = history;
  const todayOrders = prepared.filter((o) => isToday(o.createdAt));
  const byDish = {};
  let dishesToday = 0;
  todayOrders.forEach((o) => o.items.forEach((i) => { byDish[i.name] = (byDish[i.name] || 0) + i.qty; dishesToday += i.qty; }));
  const topDishes = Object.entries(byDish).sort((a, b) => b[1] - a[1]);
  const maxDish = Math.max(...topDishes.map((d) => d[1]), 1);

  const TABS = [['queue', 'Заказы'], ['stop', 'Стоп-лист'], ['history', 'История'], ['report', 'Отчёт']];

  return (
    <div className="screen">
      <div className="between"><h1>Кухня</h1><button className="btn ghost sm" onClick={logout}>Выйти</button></div>
      <div className="chips" style={{ marginTop: 10 }}>
        {TABS.map(([v, l]) => <button key={v} className={`chip ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>{l}</button>)}
      </div>

      {view === 'queue' && (
        <div className="list" style={{ marginTop: 16 }}>
          {queue.map((o) => (
            <div key={o.id} className="card">
              <b style={{ fontSize: 18 }}>Заказ #{o.id}{o.tableNumber ? ` · Стол №${o.tableNumber}` : ''}</b>
              <div style={{ margin: '8px 0' }}>
                {o.items.map((i) => <div key={i.menuId} style={{ fontSize: 16, padding: '3px 0' }}>{i.name} <b className="gold">×{i.qty}</b></div>)}
              </div>
              {o.comment && <div className="muted">Комментарий: {o.comment}</div>}
            </div>
          ))}
          {queue.length === 0 && <Empty icon="🍽" text="Нет заказов в работе" />}
        </div>
      )}

      {view === 'stop' && (<>
        <div className="muted" style={{ margin: '14px 0 10px' }}>Отключайте позиции, которых сейчас нет — они станут недоступны для заказа</div>
        <div className="list">
          {menu.data.items.map((m) => (
            <div key={m.id} className="card tight between">
              <span className={m.available ? '' : 'unavailable'}>{m.name}</span>
              <button className={`chip ${m.available ? 'active' : ''}`} onClick={() => toggle(m)}>{m.available ? 'В наличии' : 'Нет'}</button>
            </div>
          ))}
        </div>
      </>)}

      {view === 'history' && (
        <div className="list" style={{ marginTop: 16 }}>
          {history.slice().reverse().map((o) => (
            <div key={o.id} className="card tight">
              <div className="between">
                <b>Заказ #{o.id}</b>
                <span className="badge green">{K_STATUS[o.status]}</span>
              </div>
              <div className="muted" style={{ margin: '2px 0' }}>{fmtTime(o.createdAt)}</div>
              <div>{o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}</div>
            </div>
          ))}
          {history.length === 0 && <Empty icon="🕓" text="История пуста" />}
        </div>
      )}

      {view === 'report' && (<>
        <div className="kpi-grid" style={{ marginTop: 16 }}>
          <div className="kpi"><div className="v">{todayOrders.length}</div><div className="l">Заказов сегодня</div></div>
          <div className="kpi"><div className="v">{dishesToday}</div><div className="l">Позиций приготовлено</div></div>
          <div className="kpi"><div className="v">{prepared.length}</div><div className="l">Всего заказов</div></div>
          <div className="kpi"><div className="v">{topDishes.length}</div><div className="l">Видов блюд</div></div>
        </div>
        <div className="section-title"><h2>Приготовлено сегодня по позициям</h2></div>
        <div className="card">
          {topDishes.length === 0 && <div className="muted">Сегодня ещё ничего не приготовлено</div>}
          {topDishes.map(([name, qty]) => (
            <div key={name} className="bar-row">
              <span className="lab">{name}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(qty / maxDish) * 100}%` }} /></div>
              <b>{qty}</b>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

// ---------------- КУРЬЕР ----------------
// Встроенная онлайн-карта. При наличии координат клиента (геолокация) —
// карта OpenStreetMap с меткой (работает без API-ключа). Иначе — только ссылка.
function DeliveryMap({ o }) {
  if (o.geo?.lat == null) return null;
  const { lat, lng } = o.geo;
  const d = 0.008;
  const bbox = `${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  return (
    <iframe title={`map-${o.id}`} src={src} loading="lazy"
      style={{ width: '100%', height: 190, border: '1px solid var(--line)', borderRadius: 12, marginTop: 10 }} />
  );
}

// Ссылка на карты для построения маршрута (по координатам или адресу)
function mapLink(o) {
  if (o.geo?.lat != null) return o.geo.mapUrl || `https://www.google.com/maps/search/?api=1&query=${o.geo.lat},${o.geo.lng}`;
  if (o.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`;
  return null;
}

export function CourierPanel() {
  const { toast, logout, t } = useStore();
  const orders = useFetch(() => api.get('/orders'));
  const [view, setView] = useState('active');
  const [chatOrder, setChatOrder] = useState(null);
  useEffect(() => { const iv = setInterval(orders.reload, 5000); return () => clearInterval(iv); }, []);
  if (orders.loading) return <Loader />;

  const deliveries = orders.data.filter((o) => o.type === 'delivery');
  const active = deliveries.filter((o) => ['ready', 'delivering'].includes(o.status));
  const history = deliveries.filter((o) => o.status === 'delivered').reverse();
  const act = async (o, status) => { await api.patch(`/orders/${o.id}/status`, { status }); toast(`№${o.id}: ${status === 'delivering' ? t('on_the_way') : t('delivered')}`); orders.reload(); };

  return (
    <div className="screen">
      <div className="between"><h1>{t('courier')}</h1><button className="btn ghost sm" onClick={logout}>{t('logout')}</button></div>
      <div className="chips" style={{ marginTop: 10 }}>
        <button className={`chip ${view === 'active' ? 'active' : ''}`} onClick={() => setView('active')}>{t('active')} ({active.length})</button>
        <button className={`chip ${view === 'history' ? 'active' : ''}`} onClick={() => setView('history')}>{t('history')} ({history.length})</button>
      </div>

      {view === 'active' && (
        <div className="list" style={{ marginTop: 16 }}>
          {active.map((o) => (
            <div key={o.id} className="card">
              <div className="between"><b style={{ fontSize: 17 }}>{t('delivery')} #{o.id}</b><span className="badge gold">{o.status === 'delivering' ? t('on_the_way') : t('ready_pickup')}</span></div>
              <div style={{ marginTop: 6, fontSize: 16 }}>{o.address || t('address_none')}</div>
              <DeliveryMap o={o} />
              {mapLink(o) && <div style={{ marginTop: 8 }}><a href={mapLink(o)} target="_blank" rel="noreferrer" className="gold">{t('route_maps')} →</a></div>}
              <div className="muted" style={{ marginTop: 8 }}>{o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')} · {money(o.total)}</div>
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                {o.status === 'ready' && <button className="btn sm" onClick={() => act(o, 'delivering')}>{t('take_order')}</button>}
                {o.status === 'delivering' && <button className="btn sm" onClick={() => act(o, 'delivered')}>{t('delivered')}</button>}
                <button className="btn ghost sm" onClick={() => setChatOrder(o.id)}>💬 {t('chat')}</button>
              </div>
            </div>
          ))}
          {active.length === 0 && <Empty icon="🛵" text={t('no_deliveries')} />}
        </div>
      )}

      {view === 'history' && (
        <div className="list" style={{ marginTop: 16 }}>
          {history.map((o) => (
            <div key={o.id} className="card tight">
              <div className="between"><b>{t('delivery')} #{o.id}</b><span className="badge green">{t('st_delivered')}</span></div>
              <div className="muted" style={{ margin: '2px 0' }}>{fmtTime(o.createdAt)}</div>
              <div style={{ marginBottom: 2 }}>{o.address || t('address_none')}</div>
              <div className="muted">{o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')} · {money(o.total)}</div>
            </div>
          ))}
          {history.length === 0 && <Empty icon="🕓" text={t('history')} />}
        </div>
      )}

      {chatOrder && <OrderChat orderId={chatOrder} me="courier" onClose={() => setChatOrder(null)} />}
    </div>
  );
}
