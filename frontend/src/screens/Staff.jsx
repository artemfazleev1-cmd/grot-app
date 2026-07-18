import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useStore } from '../context/store.jsx';
import { Loader, useFetch, money, Empty, Sheet } from '../components/ui.jsx';
import OrderChat from '../components/OrderChat.jsx';
import {
  printReceipt, printShiftReport, openDrawer, isNativePrintingAvailable, listPrinters,
  connectPrinter, disconnectPrinter, isConnected, printerStore,
} from '../printer.js';

// ---------------- ПОДКЛЮЧЕНИЕ ПРИНТЕРА ----------------
// Экран выбора Bluetooth-принтера (только в Android-сборке). В вебе показывает,
// что печать доступна лишь в приложении, но превью чека работает и тут.
function PrinterSheet({ open, onClose }) {
  const { toast, t } = useStore();
  const [devices, setDevices] = useState(null);
  const [busy, setBusy] = useState(false);
  const saved = printerStore.get();
  const native = isNativePrintingAvailable();

  const scan = async () => {
    setBusy(true);
    try { setDevices(await listPrinters()); }
    catch { toast(t('print_fail')); setDevices([]); }
    setBusy(false);
  };
  useEffect(() => { if (open && native) scan(); /* eslint-disable-next-line */ }, [open]);

  const pick = async (d) => {
    setBusy(true);
    try { await connectPrinter(d); toast(t('printer_connected')); onClose(); }
    catch { toast(t('print_fail')); }
    setBusy(false);
  };
  const forget = async () => { await disconnectPrinter(); printerStore.clear(); toast(t('printer_forgotten')); onClose(); };
  const testDrawer = async () => {
    try { await openDrawer(); toast(t('drawer_sent')); }
    catch { toast(t('print_fail')); }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>🖨 {t('printer')}</h2>
      {!native && <div className="muted" style={{ marginBottom: 12 }}>{t('printer_app_only')}</div>}
      {saved && (
        <div className="card tight between" style={{ marginBottom: 10 }}>
          <span>{t('printer_saved')}: <b>{saved.name || saved.address}</b></span>
          <button className="btn ghost sm" onClick={forget}>{t('printer_forget')}</button>
        </div>
      )}
      {native && saved && (
        <button className="btn ghost sm" style={{ marginBottom: 10 }} onClick={testDrawer}>💵 {t('drawer_test')}</button>
      )}
      {native && (<>
        <button className="btn sm" onClick={scan} disabled={busy}>{busy ? t('printing') : t('printer_scan')}</button>
        <div className="list" style={{ marginTop: 12 }}>
          {(devices || []).map((d) => (
            <div key={d.address} className="card tight between">
              <span>{d.name || t('printer_unknown')}<div className="muted" style={{ fontSize: 12 }}>{d.address}</div></span>
              <button className="btn sm" onClick={() => pick(d)} disabled={busy}>{t('printer_use')}</button>
            </div>
          ))}
          {devices && devices.length === 0 && <Empty icon="📭" text={t('printer_none')} />}
        </div>
      </>)}
    </Sheet>
  );
}

// ---------------- ОФИЦИАНТ ----------------
export function WaiterPanel() {
  const { toast, t } = useStore();
  const orders = useFetch(() => api.get('/orders'));
  const calls = useFetch(() => api.get('/calls'));
  const resv = useFetch(() => api.get('/reservations'));
  const menu = useFetch(() => api.get('/menu'));   // для определения еда/напиток по позиции
  const [printerOpen, setPrinterOpen] = useState(false);
  const [preview, setPreview] = useState(null);   // текст чека для превью
  const [ready, setReady] = useState(false);       // принтер подключён?
  const [shiftOpen, setShiftOpen] = useState(false);
  const [floatVal, setFloatVal] = useState(() => localStorage.getItem('grot_float') || '');
  // Периодически проверяем связь с принтером для индикатора статуса.
  useEffect(() => {
    let alive = true;
    const check = async () => { const r = await isConnected(); if (alive) setReady(r); };
    check(); const iv = setInterval(check, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  if (orders.loading) return <Loader />;

  const setStatus = async (o, status) => { await api.patch(`/orders/${o.id}/status`, { status }); toast(`№${o.id}: ${t('st_' + status)}`); orders.reload(); };
  const closeCall = async (c) => { await api.patch(`/calls/${c.id}`, { status: 'done' }); calls.reload(); };
  const confirmResv = async (r) => { await api.patch(`/reservations/${r.id}`, { status: 'confirmed' }); toast('OK'); resv.reload(); };

  // Карта menuId -> group (food/drinks) из меню — чтобы делить KITCHEN/BAR даже
  // для заказов, где у позиции ещё нет метки group.
  const groupMap = {};
  (menu.data?.items || []).forEach((m) => { groupMap[m.id] = m.group || 'food'; });

  // Печать чека по заказу. Есть принтер → печатает; нет → показывает превью формата.
  const printBill = async (o, opts = {}) => {
    const enriched = { ...o, items: (o.items || []).map((i) => ({ ...i, group: i.group || groupMap[i.menuId] || 'food' })) };
    try {
      await printReceipt(enriched, opts);
      toast(t('print_ok'));
    } catch (e) {
      if (e.preview) setPreview(e.preview);
      toast(e.message === 'NO_PRINTER' || e.message === 'NO_NATIVE' ? t('printer_not_connected') : t('print_fail'));
    }
  };

  const active = orders.data.filter((o) => !['delivered', 'handed'].includes(o.status));

  // ── Данные смены (за сегодня) ──
  const isToday2 = (iso) => new Date(iso).toDateString() === new Date().toDateString();
  const orderLabel = (o) => o.type === 'delivery' ? 'Delivery' : o.tableNumber ? `Table ${o.tableNumber}` : o.type === 'pickup' ? 'Pickup' : 'Dine-in';
  const todayOrders = orders.data.filter((o) => isToday2(o.createdAt));
  const revenue = todayOrders.reduce((s, o) => s + o.total, 0);
  let kitchen = 0, bar = 0;
  todayOrders.forEach((o) => (o.items || []).forEach((i) => {
    const g = i.group || groupMap[i.menuId] || 'food';
    (g === 'drinks' ? (bar += i.price * i.qty) : (kitchen += i.price * i.qty));
  }));
  const floatNum = Number(floatVal) || 0;

  const doPrintShift = async () => {
    localStorage.setItem('grot_float', floatVal);
    const r = {
      dateStr: new Date().toLocaleDateString('en-GB'),
      printedStr: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      orders: todayOrders.map((o) => ({ id: o.id, label: orderLabel(o), total: o.total })),
      count: todayOrders.length, revenue, kitchen, bar, float: floatNum,
    };
    try { await printShiftReport(r); toast(t('print_ok')); setShiftOpen(false); }
    catch (e) {
      if (e.preview) { setShiftOpen(false); setPreview(e.preview); }
      toast(e.message === 'NO_PRINTER' || e.message === 'NO_NATIVE' ? t('printer_not_connected') : t('print_fail'));
    }
  };

  return (
    <div className="screen">
      <div className="between">
        <h1>{t('waiter_panel')}</h1>
        <div className="row" style={{ gap: 8 }}>
          <button className="chip" onClick={() => setShiftOpen(true)}>🧾 {t('shift_report')}</button>
          <button className={`chip ${ready ? 'active' : ''}`} onClick={() => setPrinterOpen(true)}>
            🖨 {ready ? t('printer_on') : t('printer_off')}
          </button>
        </div>
      </div>

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
            <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
              {o.status === 'new' && <button className="btn sm" onClick={() => setStatus(o, 'accepted')}>{t('accept')}</button>}
              {o.status === 'accepted' && <button className="btn sm" onClick={() => setStatus(o, 'cooking')}>{t('to_kitchen')}</button>}
              {o.status === 'cooking' && <button className="btn sm" onClick={() => setStatus(o, 'ready')}>{t('ready')}</button>}
              {o.status === 'ready' && o.type === 'delivery' && <button className="btn sm" onClick={() => setStatus(o, 'delivering')}>{t('to_courier')}</button>}
              {o.status === 'ready' && o.type !== 'delivery' && <button className="btn sm" onClick={() => setStatus(o, 'handed')}>{t('hand_over')}</button>}
              <button className="btn ghost sm" onClick={() => printBill(o)}>🖨 {t('print_receipt')}</button>
              <button className="btn ghost sm" onClick={() => printBill(o, { openDrawer: true })}>💵 {t('print_cash')}</button>
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

      <PrinterSheet open={printerOpen} onClose={() => setPrinterOpen(false)} />

      <Sheet open={shiftOpen} onClose={() => setShiftOpen(false)}>
        <h2 style={{ marginTop: 0 }}>🧾 {t('shift_title')}</h2>
        <div className="muted" style={{ marginBottom: 12 }}>{new Date().toLocaleDateString('ru-RU')}</div>
        <div className="card tight">
          <div className="between" style={{ padding: '4px 0' }}><span className="muted">{t('shift_orders')}</span><b>{todayOrders.length}</b></div>
          <div className="between" style={{ padding: '4px 0' }}><span className="muted">{t('shift_kitchen')}</span><b>{money(kitchen)}</b></div>
          <div className="between" style={{ padding: '4px 0' }}><span className="muted">{t('shift_bar')}</span><b>{money(bar)}</b></div>
          <div className="between" style={{ padding: '6px 0', borderTop: '1px solid var(--line)', marginTop: 4 }}><span>{t('shift_revenue')}</span><b className="gold" style={{ fontSize: 18 }}>{money(revenue)}</b></div>
        </div>
        <label style={{ display: 'block', margin: '14px 0 6px' }}>{t('shift_float')}</label>
        <input type="number" inputMode="numeric" value={floatVal} onChange={(e) => setFloatVal(e.target.value)} placeholder="0" style={{ width: '100%' }} />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t('shift_float_hint')}</div>
        <div className="card tight" style={{ marginTop: 12 }}>
          <div className="between" style={{ padding: '6px 0' }}><span>{t('shift_in_drawer')}</span><b style={{ fontSize: 18 }}>{money(floatNum + revenue)}</b></div>
        </div>
        <button className="btn block" style={{ marginTop: 16 }} onClick={doPrintShift}>🖨 {t('shift_print')}</button>
      </Sheet>

      <Sheet open={!!preview} onClose={() => setPreview(null)}>
        <h2 style={{ marginTop: 0 }}>{t('receipt_preview')}</h2>
        <div className="muted" style={{ marginBottom: 10 }}>{t('printer_not_connected')}</div>
        <pre style={{
          whiteSpace: 'pre', overflowX: 'auto', fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: 12, lineHeight: 1.45, background: 'var(--card, #111)', color: 'var(--fg, #eee)',
          padding: 14, borderRadius: 12, border: '1px solid var(--line)',
        }}>{preview}</pre>
        <button className="btn sm" style={{ marginTop: 12 }} onClick={() => { setPreview(null); setPrinterOpen(true); }}>🖨 {t('printer')}</button>
      </Sheet>
    </div>
  );
}

// ---------------- КУХНЯ ----------------
const K_STATUS = { new: 'новый', accepted: 'принят', cooking: 'готовится', ready: 'готов', delivering: 'у курьера', delivered: 'доставлен', handed: 'выдан' };
const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();
const fmtTime = (iso) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function KitchenPanel() {
  const { toast, logout, t, L } = useStore();
  const orders = useFetch(() => api.get('/orders'));
  const menu = useFetch(() => api.get('/menu'));
  const [view, setView] = useState('queue');
  // авто-обновление табло заказов каждые 5 сек
  useEffect(() => { const iv = setInterval(orders.reload, 5000); return () => clearInterval(iv); }, []);
  if (orders.loading || menu.loading) return <Loader />;

  const queue = orders.data.filter((o) => ['cooking', 'accepted'].includes(o.status));
  const history = orders.data.filter((o) => ['ready', 'delivering', 'delivered', 'handed'].includes(o.status));
  const toggle = async (m) => { await api.patch(`/menu/${m.id}/availability`, { available: !m.available }); toast(`${L(m, 'name')}: ${!m.available ? t('avail_on') : t('avail_off')}`); menu.reload(); };

  // отчёт по приготовленным заказам
  const prepared = history;
  const todayOrders = prepared.filter((o) => isToday(o.createdAt));
  const byDish = {};
  let dishesToday = 0;
  todayOrders.forEach((o) => o.items.forEach((i) => { const n = L(i, 'name'); byDish[n] = (byDish[n] || 0) + i.qty; dishesToday += i.qty; }));
  const topDishes = Object.entries(byDish).sort((a, b) => b[1] - a[1]);
  const maxDish = Math.max(...topDishes.map((d) => d[1]), 1);

  const TABS = [['queue', t('orders')], ['stop', t('stop_list')], ['history', t('history')], ['report', t('report')]];

  return (
    <div className="screen">
      <div className="between"><h1>{t('nav_kitchen')}</h1><button className="btn ghost sm" onClick={logout}>{t('logout')}</button></div>
      <div className="chips" style={{ marginTop: 10 }}>
        {TABS.map(([v, l]) => <button key={v} className={`chip ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>{l}</button>)}
      </div>

      {view === 'queue' && (
        <div className="list" style={{ marginTop: 16 }}>
          {queue.map((o) => (
            <div key={o.id} className="card">
              <b style={{ fontSize: 18 }}>{t('k_order')} #{o.id}{o.tableNumber ? ` · ${t('table')} №${o.tableNumber}` : ''}</b>
              <div style={{ margin: '8px 0' }}>
                {o.items.map((i) => <div key={i.menuId} style={{ fontSize: 16, padding: '3px 0' }}>{L(i, 'name')} <b className="gold">×{i.qty}</b></div>)}
              </div>
              {o.comment && <div className="muted">{t('comment')}: {o.comment}</div>}
            </div>
          ))}
          {queue.length === 0 && <Empty icon="🍽" text={t('k_no_queue')} />}
        </div>
      )}

      {view === 'stop' && (<>
        <div className="muted" style={{ margin: '14px 0 10px' }}>{t('k_stop_hint')}</div>
        <div className="list">
          {menu.data.items.map((m) => (
            <div key={m.id} className="card tight between">
              <span className={m.available ? '' : 'unavailable'}>{L(m, 'name')}</span>
              <button className={`chip ${m.available ? 'active' : ''}`} onClick={() => toggle(m)}>{m.available ? t('in_stock') : t('not_avail')}</button>
            </div>
          ))}
        </div>
      </>)}

      {view === 'history' && (
        <div className="list" style={{ marginTop: 16 }}>
          {history.slice().reverse().map((o) => (
            <div key={o.id} className="card tight">
              <div className="between">
                <b>{t('k_order')} #{o.id}</b>
                <span className="badge green">{t('st_' + o.status)}</span>
              </div>
              <div className="muted" style={{ margin: '2px 0' }}>{fmtTime(o.createdAt)}</div>
              <div>{o.items.map((i) => `${L(i, 'name')} ×${i.qty}`).join(', ')}</div>
            </div>
          ))}
          {history.length === 0 && <Empty icon="🕓" text={t('history_empty')} />}
        </div>
      )}

      {view === 'report' && (<>
        <div className="kpi-grid" style={{ marginTop: 16 }}>
          <div className="kpi"><div className="v">{todayOrders.length}</div><div className="l">{t('k_orders_today')}</div></div>
          <div className="kpi"><div className="v">{dishesToday}</div><div className="l">{t('k_items_cooked')}</div></div>
          <div className="kpi"><div className="v">{prepared.length}</div><div className="l">{t('k_total_orders')}</div></div>
          <div className="kpi"><div className="v">{topDishes.length}</div><div className="l">{t('k_dish_types')}</div></div>
        </div>
        <div className="section-title"><h2>{t('k_cooked_by_item')}</h2></div>
        <div className="card">
          {topDishes.length === 0 && <div className="muted">{t('k_nothing_cooked')}</div>}
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
