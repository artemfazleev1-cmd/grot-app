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

// ---------------- ОФИЦИАНТ (POS: открытые столы) ----------------
const orderLabel = (o) => o.type === 'delivery' ? 'Delivery' : o.tableNumber ? `Table ${o.tableNumber}` : o.type === 'pickup' ? 'Pickup' : 'Dine-in';
const isTodayIso = (iso) => new Date(iso).toDateString() === new Date().toDateString();

// Меню + карта menuId -> group (еда/напиток)
function useGroupMap() {
  const menu = useFetch(() => api.get('/menu'));
  const groupMap = {};
  (menu.data?.items || []).forEach((m) => { groupMap[m.id] = m.group || 'food'; });
  return { menu, groupMap };
}

// Печать чека с превью-фолбэком. Возвращает true при успешной печати.
function usePrintBill(groupMap) {
  const { t, toast } = useStore();
  const [preview, setPreview] = useState(null);
  const printBill = async (o, opts = {}) => {
    const enriched = { ...o, items: (o.items || []).map((i) => ({ ...i, group: i.group || groupMap[i.menuId] || 'food' })) };
    try { await printReceipt(enriched, opts); toast(t('print_ok')); return true; }
    catch (e) {
      if (e.preview) setPreview(e.preview);
      toast(e.message === 'NO_PRINTER' || e.message === 'NO_NATIVE' ? t('printer_not_connected') : t('print_fail'));
      return false;
    }
  };
  return { printBill, preview, setPreview };
}

function PreviewSheet({ preview, setPreview, onPrinter }) {
  const { t } = useStore();
  return (
    <Sheet open={!!preview} onClose={() => setPreview(null)}>
      <h2 style={{ marginTop: 0 }}>{t('receipt_preview')}</h2>
      <div className="muted" style={{ marginBottom: 10 }}>{t('printer_not_connected')}</div>
      <pre style={{ whiteSpace: 'pre', overflowX: 'auto', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, lineHeight: 1.45, background: 'var(--card, #111)', color: 'var(--fg, #eee)', padding: 14, borderRadius: 12, border: '1px solid var(--line)' }}>{preview}</pre>
      {onPrinter && <button className="btn sm" style={{ marginTop: 12 }} onClick={() => { setPreview(null); onPrinter(); }}>🖨 {t('printer')}</button>}
    </Sheet>
  );
}

// Выбор позиций из меню → создать заказ или дописать в открытый счёт.
function ItemPicker({ tableNumber, orderId, onClose, onSaved }) {
  const { t, toast, L } = useStore();
  const menu = useFetch(() => api.get('/menu'));
  const kitchen = useFetch(() => api.get('/kitchen'));
  const kOpen = kitchen.data?.open !== false;  // пока грузится — считаем открытой
  const [cart, setCart] = useState({});
  const [cat, setCat] = useState('all');
  const [busy, setBusy] = useState(false);
  const items = (menu.data?.items || []).filter((m) => m.available);
  const cats = ['all', ...(menu.data?.categories || [])];
  const shown = cat === 'all' ? items : items.filter((m) => m.category === cat);
  const add = (m) => setCart((c) => ({ ...c, [m.id]: (c[m.id] || 0) + 1 }));
  const dec = (id) => setCart((c) => { const q = (c[id] || 0) - 1; const n = { ...c }; if (q <= 0) delete n[id]; else n[id] = q; return n; });
  const lines = Object.entries(cart).map(([id, q]) => ({ m: items.find((x) => x.id === +id), q })).filter((x) => x.m);
  const total = lines.reduce((s, x) => s + x.m.price * x.q, 0);
  const count = lines.reduce((s, x) => s + x.q, 0);
  const save = async () => {
    if (!lines.length) return;
    setBusy(true);
    try {
      const payload = { items: lines.map((x) => ({ menuId: x.m.id, qty: x.q })) };
      if (orderId) await api.post(`/orders/${orderId}/items`, payload);
      else await api.post('/orders', { type: 'dinein', tableNumber, items: payload.items });
      toast(t('order_saved')); onSaved();
    } catch (e) { toast(e.message); }
    setBusy(false);
  };
  return (
    <Sheet open onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>{orderId ? t('add_items') : t('new_order')} · {t('table')} {tableNumber}</h2>
      {menu.loading ? <Loader /> : (<>
        {!kOpen && <div className="card tight" style={{ marginBottom: 8, border: '1px solid var(--gold, #d4a017)', color: 'var(--gold, #d4a017)' }}>🍳 {t('kitchen_closed_banner')}</div>}
        <div className="chips" style={{ margin: '8px 0', flexWrap: 'wrap' }}>
          {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c === 'all' ? t('all') : c}</button>)}
        </div>
        <div className="list" style={{ maxHeight: 320, overflowY: 'auto' }}>
          {shown.map((m) => {
            const closed = !kOpen && (m.group || 'food') !== 'drinks';
            return (
            <div key={m.id} className="card tight between" style={closed ? { opacity: 0.45 } : undefined}>
              <div><b>{L(m, 'name')}</b><div className="muted" style={{ fontSize: 12 }}>{closed ? t('kitchen_closed_item') : money(m.price)}</div></div>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                {closed ? <span title={t('kitchen_closed_item')}>🚫</span> : cart[m.id] ? (<>
                  <button className="btn ghost sm" onClick={() => dec(m.id)}>−</button>
                  <b style={{ minWidth: 18, textAlign: 'center' }}>{cart[m.id]}</b>
                  <button className="btn sm" onClick={() => add(m)}>+</button>
                </>) : <button className="btn sm" onClick={() => add(m)}>{t('add')}</button>}
              </div>
            </div>
            );
          })}
        </div>
        <div className="between" style={{ marginTop: 12, gap: 10 }}>
          <b>{t('total')}: {money(total)}{count ? ` · ${count}` : ''}</b>
          <button className="btn" disabled={busy || !lines.length} onClick={save}>{orderId ? t('add_items') : t('leave_open')}</button>
        </div>
      </>)}
    </Sheet>
  );
}

// ── Экран 1: Активные столики ──
export function WaiterTables() {
  const { t } = useStore();
  const orders = useFetch(() => api.get('/orders'));
  const { groupMap } = useGroupMap();
  const { printBill, preview, setPreview } = usePrintBill(groupMap);
  const [sel, setSel] = useState(null);       // id выбранного счёта
  const [picker, setPicker] = useState(null); // {tableNumber, orderId}
  const [pay, setPay] = useState(null);       // {order, method:'cash'|'card', cash:''}
  useEffect(() => { const iv = setInterval(orders.reload, 5000); return () => clearInterval(iv); }, []);
  if (orders.loading) return <Loader />;
  const open = orders.data.filter((o) => o.type === 'dinein' && !o.paid);
  const selOrder = sel && orders.data.find((o) => o.id === sel);

  // Скидка: пересчёт по текущему выбору
  const discOf = (p) => {
    const sub = p.order.total;
    const v = Number(p.discVal) || 0;
    if (v <= 0) return 0;
    return p.discType === 'percent' ? Math.round(sub * Math.min(100, v) / 100) : Math.min(Math.round(v), sub);
  };

  const doCheckout = async () => {
    const o = pay.order;
    const discAmt = discOf(pay);
    const finalTotal = o.total - discAmt;
    const cashNum = pay.method === 'cash' && pay.cash ? Number(pay.cash) : null;
    const enriched = { ...o, discount: discAmt };
    const ok = await printBill(enriched, { payment: pay.method, cash: cashNum, openDrawer: pay.method === 'cash' });
    if (ok) { await api.post(`/orders/${o.id}/close`, { payment: pay.method, discount: { type: pay.discType, value: Number(pay.discVal) || 0 } }).catch(() => {}); setPay(null); orders.reload(); }
  };

  const setQty = async (orderId, menuId, qty) => {
    try { const r = await api.patch(`/orders/${orderId}/items`, { menuId, qty }); if (r.deleted) setSel(null); orders.reload(); }
    catch (e) {}
  };

  return (
    <div className="screen">
      <h1>{t('nav_tables')}</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginTop: 14 }}>
        {open.map((o) => (
          <div key={o.id} className="card" onClick={() => setSel(o.id)} style={{ cursor: 'pointer' }}>
            <div className="between"><b style={{ fontSize: 18 }}>{t('table')} {o.tableNumber}</b><span className="badge gold">{o.items.reduce((s, i) => s + i.qty, 0)}</span></div>
            <div className="gold" style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>{money(o.total)}</div>
          </div>
        ))}
      </div>
      {open.length === 0 && <Empty icon="🍽" text={t('no_open_tables')} />}

      {selOrder && (
        <Sheet open onClose={() => setSel(null)}>
          <h2 style={{ marginTop: 0 }}>{t('table')} {selOrder.tableNumber}</h2>
          <div className="list">
            {selOrder.items.map((i, idx) => (
              <div key={idx} className="between" style={{ padding: '6px 0', gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0 }}>{i.nameEn || i.name}</span>
                <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <button className="btn ghost sm" onClick={() => setQty(selOrder.id, i.menuId, i.qty - 1)}>−</button>
                  <b style={{ minWidth: 18, textAlign: 'center' }}>{i.qty}</b>
                  <button className="btn ghost sm" onClick={() => setQty(selOrder.id, i.menuId, i.qty + 1)}>+</button>
                  <b style={{ minWidth: 54, textAlign: 'right' }}>{money(i.price * i.qty)}</b>
                </div>
              </div>
            ))}
          </div>
          <div className="between" style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <b>{t('total')}</b><b className="gold" style={{ fontSize: 18 }}>{money(selOrder.total)}</b>
          </div>
          <button className="btn ghost block" style={{ marginTop: 14 }} onClick={() => printBill(selOrder, { preBill: true })}>🧾 {t('prebill')}</button>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn ghost" onClick={() => setPicker({ tableNumber: selOrder.tableNumber, orderId: selOrder.id })}>➕ {t('add_items')}</button>
            <button className="btn" onClick={() => { setPay({ order: selOrder, method: 'cash', cash: '', discType: 'percent', discVal: '' }); setSel(null); }}>💵 {t('checkout_print')}</button>
          </div>
        </Sheet>
      )}

      {pay && (() => {
        const discAmt = discOf(pay);
        const finalTotal = pay.order.total - discAmt;
        return (
        <Sheet open onClose={() => setPay(null)}>
          <h2 style={{ marginTop: 0 }}>{t('checkout_title2')} · {t('table')} {pay.order.tableNumber}</h2>

          <div className="card tight">
            <div className="between" style={{ padding: '3px 0' }}><span className="muted">{t('subtotal')}</span><b>{money(pay.order.total)}</b></div>
            {discAmt > 0 && <div className="between" style={{ padding: '3px 0' }}><span className="muted">{t('discount')}</span><b style={{ color: 'var(--green, #5c9)' }}>−{money(discAmt)}</b></div>}
            <div className="between" style={{ padding: '6px 0', borderTop: '1px solid var(--line)', marginTop: 4 }}><b>{t('total')}</b><b className="gold" style={{ fontSize: 22 }}>{money(finalTotal)}</b></div>
          </div>

          <label style={{ display: 'block', margin: '14px 0 6px' }}>{t('discount')}</label>
          <div className="row" style={{ gap: 8 }}>
            <button className={`btn sm ${pay.discType === 'percent' ? '' : 'ghost'}`} onClick={() => setPay((p) => ({ ...p, discType: 'percent' }))}>%</button>
            <button className={`btn sm ${pay.discType === 'amount' ? '' : 'ghost'}`} onClick={() => setPay((p) => ({ ...p, discType: 'amount' }))}>฿</button>
            <input type="number" inputMode="numeric" value={pay.discVal} onChange={(e) => setPay((p) => ({ ...p, discVal: e.target.value }))} placeholder="0" style={{ flex: 1 }} />
          </div>

          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            <button className={`btn ${pay.method === 'cash' ? '' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setPay((p) => ({ ...p, method: 'cash' }))}>💵 {t('pay_cash')}</button>
            <button className={`btn ${pay.method === 'card' ? '' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setPay((p) => ({ ...p, method: 'card' }))}>💳 {t('pay_card')}</button>
          </div>
          {pay.method === 'cash' && (<>
            <label style={{ display: 'block', margin: '14px 0 6px' }}>{t('pay_received')}</label>
            <input type="number" inputMode="numeric" value={pay.cash} onChange={(e) => setPay((p) => ({ ...p, cash: e.target.value }))} placeholder={String(finalTotal)} style={{ width: '100%' }} />
            {Number(pay.cash) > finalTotal && (
              <div className="between" style={{ marginTop: 8 }}><span>{t('pay_change')}</span><b style={{ fontSize: 18 }}>{money(Number(pay.cash) - finalTotal)}</b></div>
            )}
          </>)}
          <button className="btn block" style={{ marginTop: 16 }} onClick={doCheckout}>🖨 {t('checkout_print')}</button>
        </Sheet>
        );
      })()}

      {picker && <ItemPicker tableNumber={picker.tableNumber} orderId={picker.orderId} onClose={() => setPicker(null)} onSaved={() => { setPicker(null); orders.reload(); }} />}
      <PreviewSheet preview={preview} setPreview={setPreview} />
    </div>
  );
}

// ── Экран 2: Новый заказ (выбор стола → позиции) ──
export function WaiterNewOrder() {
  const { t } = useStore();
  const orders = useFetch(() => api.get('/orders'));
  const tables = useFetch(() => api.get('/tables'));
  const [picker, setPicker] = useState(null);
  if (orders.loading || tables.loading) return <Loader />;
  const openByTable = {};
  orders.data.filter((o) => o.type === 'dinein' && !o.paid).forEach((o) => { openByTable[o.tableNumber] = o; });
  const pick = (n) => { const ex = openByTable[n]; setPicker({ tableNumber: n, orderId: ex ? ex.id : null }); };
  return (
    <div className="screen">
      <h1>{t('new_order')}</h1>
      <div className="muted" style={{ margin: '4px 0 12px' }}>{t('pick_table')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {tables.data.map((tb) => {
          const busy = openByTable[tb.number];
          return (
            <button key={tb.id} onClick={() => pick(tb.number)}
              style={{ padding: '18px 0', borderRadius: 12, border: `1px solid ${busy ? 'var(--gold, #d4a017)' : 'var(--line)'}`, background: busy ? 'rgba(212,160,23,.10)' : 'transparent', color: 'inherit', cursor: 'pointer' }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{tb.number}</div>
              {busy ? <div className="gold" style={{ fontSize: 12 }}>{money(busy.total)}</div> : <div className="muted" style={{ fontSize: 11 }}>{t('table_free')}</div>}
            </button>
          );
        })}
      </div>
      {picker && <ItemPicker tableNumber={picker.tableNumber} orderId={picker.orderId} onClose={() => setPicker(null)} onSaved={() => { setPicker(null); orders.reload(); }} />}
    </div>
  );
}

// ── Экран 3: Кабинет (статистика + принтер + отчёт смены) ──
export function WaiterCabinet() {
  const { t, user, logout, toast } = useStore();
  const orders = useFetch(() => api.get('/orders'));
  const { groupMap } = useGroupMap();
  const { printBill, preview, setPreview } = usePrintBill(groupMap);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [reprintOpen, setReprintOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [floatVal, setFloatVal] = useState(() => localStorage.getItem('grot_float') || '');
  useEffect(() => { let a = true; const c = async () => { const r = await isConnected(); if (a) setReady(r); }; c(); const iv = setInterval(c, 5000); return () => { a = false; clearInterval(iv); }; }, []);
  if (orders.loading) return <Loader />;

  const mine = orders.data.filter((o) => o.waiterId === user.id);
  const todayMine = mine.filter((o) => isTodayIso(o.createdAt));
  const sumRev = (arr) => arr.reduce((s, o) => s + o.total, 0);

  // Отчёт смены — по всем заказам за сегодня (касса заведения)
  const todayAll = orders.data.filter((o) => isTodayIso(o.createdAt));
  const revenue = sumRev(todayAll);
  let kitchen = 0, bar = 0;
  todayAll.forEach((o) => (o.items || []).forEach((i) => { const g = i.group || groupMap[i.menuId] || 'food'; (g === 'drinks' ? (bar += i.price * i.qty) : (kitchen += i.price * i.qty)); }));
  const cash = todayAll.filter((o) => o.payment === 'cash').reduce((s, o) => s + o.total, 0);
  const card = todayAll.filter((o) => o.payment === 'card').reduce((s, o) => s + o.total, 0);
  const floatNum = Number(floatVal) || 0;

  const doPrintShift = async () => {
    localStorage.setItem('grot_float', floatVal);
    const r = {
      dateStr: new Date().toLocaleDateString('en-GB'),
      printedStr: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      orders: todayAll.map((o) => ({ id: o.id, label: orderLabel(o), total: o.total, items: (o.items || []).map((i) => ({ qty: i.qty, name: i.nameEn || i.name, amount: i.price * i.qty })) })),
      count: todayAll.length, revenue, kitchen, bar, cash, card, float: floatNum,
    };
    try { await printShiftReport(r); toast(t('print_ok')); setShiftOpen(false); }
    catch (e) { if (e.preview) { setShiftOpen(false); setPreview(e.preview); } }
  };

  return (
    <div className="screen">
      <div className="between"><h1>{t('nav_me')}</h1><button className="btn ghost sm" onClick={logout}>{t('logout')}</button></div>
      <div className="muted">{user.name}</div>

      <div className="section-title"><h2>{t('cab_shift')}</h2></div>
      <div className="kpi-grid">
        <div className="kpi"><div className="v">{todayMine.length}</div><div className="l">{t('cab_orders')}</div></div>
        <div className="kpi"><div className="v">{money(sumRev(todayMine))}</div><div className="l">{t('cab_revenue')}</div></div>
      </div>

      <div className="section-title"><h2>{t('cab_total')}</h2></div>
      <div className="kpi-grid">
        <div className="kpi"><div className="v">{mine.length}</div><div className="l">{t('cab_orders')}</div></div>
        <div className="kpi"><div className="v">{money(sumRev(mine))}</div><div className="l">{t('cab_revenue')}</div></div>
      </div>

      <div className="section-title"><h2>{t('cab_tools')}</h2></div>
      <div className="list">
        <button className="btn block" onClick={() => setShiftOpen(true)}>🧾 {t('shift_report')}</button>
        <button className="btn ghost block" onClick={() => setReprintOpen(true)}>🔁 {t('reprint')}</button>
        <button className="btn ghost block" onClick={() => setPrinterOpen(true)}>🖨 {ready ? t('printer_connected') : t('printer_not_connected')}</button>
      </div>

      <Sheet open={reprintOpen} onClose={() => setReprintOpen(false)}>
        <h2 style={{ marginTop: 0 }}>🔁 {t('reprint_title')}</h2>
        <div className="muted" style={{ marginBottom: 10 }}>{t('reprint_hint')}</div>
        <div className="list" style={{ maxHeight: 340, overflowY: 'auto' }}>
          {todayAll.filter((o) => o.paid).slice().reverse().map((o) => (
            <div key={o.id} className="card tight between">
              <div><b>#{o.id} · {orderLabel(o)}</b><div className="muted" style={{ fontSize: 12 }}>{money(o.total)} · {o.payment === 'card' ? t('pay_card') : t('pay_cash')}</div></div>
              <button className="btn sm" onClick={() => printBill(o, { payment: o.payment })}>🖨 {t('reprint')}</button>
            </div>
          ))}
          {todayAll.filter((o) => o.paid).length === 0 && <Empty icon="🧾" text={t('no_recent_bills')} />}
        </div>
      </Sheet>

      <PrinterSheet open={printerOpen} onClose={() => setPrinterOpen(false)} />

      <Sheet open={shiftOpen} onClose={() => setShiftOpen(false)}>
        <h2 style={{ marginTop: 0 }}>🧾 {t('shift_title')}</h2>
        <div className="muted" style={{ marginBottom: 12 }}>{new Date().toLocaleDateString('ru-RU')}</div>
        <div className="card tight">
          <div className="between" style={{ padding: '4px 0' }}><span className="muted">{t('shift_orders')}</span><b>{todayAll.length}</b></div>
          <div className="between" style={{ padding: '4px 0' }}><span className="muted">{t('shift_kitchen')}</span><b>{money(kitchen)}</b></div>
          <div className="between" style={{ padding: '4px 0' }}><span className="muted">{t('shift_bar')}</span><b>{money(bar)}</b></div>
          <div className="between" style={{ padding: '4px 0', borderTop: '1px solid var(--line)', marginTop: 4 }}><span className="muted">💵 {t('pay_cash')}</span><b>{money(cash)}</b></div>
          <div className="between" style={{ padding: '4px 0' }}><span className="muted">💳 {t('pay_card')}</span><b>{money(card)}</b></div>
          <div className="between" style={{ padding: '6px 0', borderTop: '1px solid var(--line)', marginTop: 4 }}><span>{t('shift_revenue')}</span><b className="gold" style={{ fontSize: 18 }}>{money(revenue)}</b></div>
        </div>
        {todayAll.length > 0 && (
          <div className="card tight" style={{ marginTop: 10, maxHeight: 240, overflowY: 'auto' }}>
            <div className="muted" style={{ marginBottom: 6 }}>{t('shift_by_order')}</div>
            {todayAll.map((o) => (
              <div key={o.id} style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}>
                <div className="between"><b>#{o.id} · {orderLabel(o)}</b><b>{money(o.total)}</b></div>
                {(o.items || []).map((i, idx) => (
                  <div key={idx} className="between muted" style={{ fontSize: 13, paddingLeft: 8 }}>
                    <span>{i.qty}× {i.nameEn || i.name}</span><span>{money(i.price * i.qty)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <label style={{ display: 'block', margin: '14px 0 6px' }}>{t('shift_float')}</label>
        <input type="number" inputMode="numeric" value={floatVal} onChange={(e) => setFloatVal(e.target.value)} placeholder="0" style={{ width: '100%' }} />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t('shift_float_hint')}</div>
        <div className="card tight" style={{ marginTop: 12 }}>
          <div className="between" style={{ padding: '6px 0' }}><span>{t('shift_in_drawer')}</span><b style={{ fontSize: 18 }}>{money(floatNum + cash)}</b></div>
          <div className="muted" style={{ fontSize: 12 }}>{t('shift_drawer_hint')}</div>
        </div>
        <button className="btn block" style={{ marginTop: 16 }} onClick={doPrintShift}>🖨 {t('shift_print')}</button>
      </Sheet>

      <PreviewSheet preview={preview} setPreview={setPreview} onPrinter={() => setPrinterOpen(true)} />
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
