import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useStore } from '../context/store.jsx';
import { Loader, useFetch, money, Empty, FoodImg } from '../components/ui.jsx';

export function Menu() {
  const { addToCart, cartCount, cartTotal, t, lang } = useStore();
  const nav = useNavigate();
  const { data, loading } = useFetch(() => api.get('/menu'));
  const [group, setGroup] = useState('food');
  const [cat, setCat] = useState('Все');
  if (loading || !data) return <Loader />;

  const groupCats = data.categoryGroups?.[group] || [];
  const cats = ['Все', ...groupCats];
  const items = data.items.filter((i) => i.group === group && (cat === 'Все' || i.category === cat));
  const catLabel = (c) => c === 'Все' ? t('all') : t('cat_' + c);
  const dishName = (d) => (lang === 'en' && d.nameEn) ? d.nameEn : d.name;

  const switchGroup = (g) => { setGroup(g); setCat('Все'); };

  return (
    <div className="screen">
      <h1>{t('menu')}</h1>

      {/* Переключатель Еда / Напитки */}
      <div className="seg" style={{ marginTop: 12 }}>
        <button className={group === 'food' ? 'on' : ''} onClick={() => switchGroup('food')}>{t('food')}</button>
        <button className={group === 'drinks' ? 'on' : ''} onClick={() => switchGroup('drinks')}>{t('drinks')}</button>
      </div>

      <div className="chips" style={{ marginTop: 14 }}>
        {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{catLabel(c)}</button>)}
      </div>

      <div className="list" style={{ marginTop: 16 }}>
        {items.map((d) => (
          <div key={d.id} className={`card tight dish ${d.available ? '' : 'unavailable'}`}>
            <FoodImg src={d.image} />
            <div style={{ flex: 1 }}>
              <div className="name">{dishName(d)}</div>
              <div className="price">{money(d.price)}{!d.available && <span className="muted"> · {t('out_of_stock')}</span>}</div>
            </div>
            <button className="btn sm" disabled={!d.available} onClick={() => addToCart(d)}>＋</button>
          </div>
        ))}
      </div>

      {cartCount > 0 && (
        <div style={{ position: 'fixed', bottom: 'calc(96px + env(safe-area-inset-bottom))', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 35 }}>
          <button className="btn fire" style={{ maxWidth: 440, width: '90%' }} onClick={() => nav('/cart')}>
            {t('cart')} · {cartCount} · {money(cartTotal)}
          </button>
        </div>
      )}

    </div>
  );
}

export function Cart() {
  const { cart, setQty, cartTotal, t, L } = useStore();
  const nav = useNavigate();
  if (!cart.length) return <div className="screen"><h1>{t('cart')}</h1><Empty icon="🛒" text={t('cart_empty')} /></div>;
  return (
    <div className="screen">
      <h1>{t('cart')}</h1>
      <div className="list" style={{ marginTop: 14 }}>
        {cart.map((i) => (
          <div key={i.menuId} className="card tight between">
            <div><div style={{ fontWeight: 700 }}>{L(i, 'name')}</div><div className="price">{money(i.price)}</div></div>
            <div className="stepper">
              <button onClick={() => setQty(i.menuId, i.qty - 1)}>−</button>
              <b>{i.qty}</b>
              <button onClick={() => setQty(i.menuId, i.qty + 1)}>+</button>
            </div>
          </div>
        ))}
      </div>
      <div className="card between" style={{ marginTop: 16 }}>
        <span className="muted">{t('total')}</span><b style={{ fontSize: 20 }} className="gold">{money(cartTotal)}</b>
      </div>
      <button className="btn block" style={{ marginTop: 16 }} onClick={() => nav('/checkout')}>{t('checkout')}</button>
    </div>
  );
}

export function Checkout() {
  const { cart, cartTotal, clearCart, table, refreshMe, toast, t } = useStore();
  const nav = useNavigate();
  const [type, setType] = useState('delivery');
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [delivery, setDelivery] = useState(null);
  const [geo, setGeo] = useState(null);
  const [locating, setLocating] = useState(false);
  if (!cart.length) { nav('/menu'); return null; }

  // Автоопределение геолокации через GPS телефона + проверка зоны доставки
  const locate = () => {
    if (!navigator.geolocation) { toast(t('geo_unsupported')); return; }
    if (!window.isSecureContext) { toast(t('geo_insecure')); return; }
    setLocating(true);
    const onOk = async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      try {
        const d = await api.post('/delivery/check', { lat, lng });
        setDelivery(d);
        setGeo({ lat, lng, mapUrl: d.mapUrl });
        if (d.formatted) setAddress(d.formatted);
        toast(t('geo_located'));
      } catch (e) { toast(e.message); } finally { setLocating(false); }
    };
    const onErr = (err) => {
      setLocating(false);
      if (err.code === 1) toast(t('geo_denied'));
      else if (err.code === 2) toast(t('geo_unavailable'));
      else if (err.code === 3) toast(t('geo_timeout'));
      else toast(t('geo_failed'));
    };
    // сначала быстрый запрос, при таймауте — точный по GPS
    navigator.geolocation.getCurrentPosition(onOk, () => {
      navigator.geolocation.getCurrentPosition(onOk, onErr, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
  };

  const deliveryFee = type === 'delivery' && delivery?.inZone ? (delivery.fee || 0) : 0;
  const finalTotal = cartTotal + deliveryFee;
  // Доставка доступна только внутри зоны: нужен подтверждённый чек зоны (inZone).
  const blocked = type === 'delivery' && !delivery?.inZone;

  const submit = async () => {
    if (type === 'delivery' && !delivery) { toast(t('need_location_for_delivery')); return; }
    if (blocked) { toast(t('out_zone')); return; }
    try {
      setBusy(true);
      await api.post('/orders', { items: cart, type, address: type === 'delivery' ? address : null,
        geo: type === 'delivery' ? geo : null,
        comment, tableNumber: type === 'dinein' ? table?.number : null });
      clearCart(); await refreshMe();
      toast(t('order_placed') + ' ✅');
      nav('/profile');
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="screen">
      <h1>{t('checkout_title')}</h1>
      <label>{t('receive_method')}</label>
      <div className="chips">
        {[['delivery', t('delivery')], ['pickup', t('pickup')]].map(([v, l]) => (
          <button key={v} className={`chip ${type === v ? 'active' : ''}`} onClick={() => setType(v)}>{l}</button>
        ))}
      </div>
      {type === 'delivery' && (<>
        <label>{t('delivery_location')}</label>
        <button className="btn ghost block" disabled={locating} onClick={locate}>
          {locating ? t('detecting') : `📍 ${t('detect_location')}`}
        </button>
        {!delivery && <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>{t('need_location_for_delivery')}</div>}
        {delivery && (
          <div className="card tight" style={{ marginTop: 10, borderColor: delivery.inZone ? 'var(--line)' : 'var(--red)' }}>
            {delivery.inZone
              ? <>{t('in_zone')} · {delivery.distanceKm} km · {t('delivery_fee')} {delivery.fee ? money(delivery.fee) : t('free')}</>
              : <>{t('out_zone')}</>}
            {geo?.mapUrl && <div style={{ marginTop: 6 }}><a href={geo.mapUrl} target="_blank" rel="noreferrer" className="gold">{t('open_map')}</a></div>}
            {!delivery.inZone && <button className="btn fire block sm" style={{ marginTop: 10 }} onClick={() => setType('pickup')}>{t('switch_to_pickup')}</button>}
          </div>
        )}
      </>)}
      {type === 'dinein' && <div className="card tight" style={{ marginTop: 12 }}>{t('table')} №{table?.number || '—'}</div>}
      <label>{type === 'delivery' ? t('address_details') : t('comment')}</label>
      <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={type === 'delivery' ? t('delivery_note_ph') : t('comment_ph')} />

      <div className="card between" style={{ marginTop: 16 }}>
        <span className="muted">{t('to_pay')}</span><b style={{ fontSize: 22 }} className="gold">{money(finalTotal)}</b>
      </div>
      <div className="muted center" style={{ marginTop: 8, fontSize: 11 }}>{t('pay_note')}</div>
      <button className="btn block" style={{ marginTop: 14 }} disabled={busy || blocked} onClick={submit}>{t('confirm_order')}</button>
    </div>
  );
}
