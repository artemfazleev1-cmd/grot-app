import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useStore } from '../context/store.jsx';
import { Loader, useFetch, money, Empty, FoodImg } from '../components/ui.jsx';

export function Menu() {
  const { addToCart, cartCount, cartTotal } = useStore();
  const nav = useNavigate();
  const { data, loading } = useFetch(() => api.get('/menu'));
  const [group, setGroup] = useState('food');
  const [cat, setCat] = useState('Все');
  if (loading || !data) return <Loader />;

  const groupCats = data.categoryGroups?.[group] || [];
  const cats = ['Все', ...groupCats];
  const items = data.items.filter((i) => i.group === group && (cat === 'Все' || i.category === cat));

  const switchGroup = (g) => { setGroup(g); setCat('Все'); };

  return (
    <div className="screen">
      <h1>Меню</h1>

      {/* Переключатель Еда / Напитки */}
      <div className="seg" style={{ marginTop: 12 }}>
        <button className={group === 'food' ? 'on' : ''} onClick={() => switchGroup('food')}>Еда</button>
        <button className={group === 'drinks' ? 'on' : ''} onClick={() => switchGroup('drinks')}>Напитки</button>
      </div>

      <div className="chips" style={{ marginTop: 14 }}>
        {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>

      <div className="list" style={{ marginTop: 16 }}>
        {items.map((d) => (
          <div key={d.id} className={`card tight dish ${d.available ? '' : 'unavailable'}`}>
            <FoodImg src={d.image} />
            <div style={{ flex: 1 }}>
              <div className="name">{d.name}</div>
              <div className="price">{money(d.price)}{!d.available && <span className="muted"> · нет в наличии</span>}</div>
            </div>
            <button className="btn sm" disabled={!d.available} onClick={() => addToCart(d)}>＋</button>
          </div>
        ))}
      </div>

      {cartCount > 0 && (
        <div style={{ position: 'fixed', bottom: 86, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 25 }}>
          <button className="btn fire" style={{ maxWidth: 440, width: '90%' }} onClick={() => nav('/cart')}>
            Корзина · {cartCount} · {money(cartTotal)}
          </button>
        </div>
      )}

    </div>
  );
}

export function Cart() {
  const { cart, setQty, cartTotal } = useStore();
  const nav = useNavigate();
  if (!cart.length) return <div className="screen"><h1>Корзина</h1><Empty icon="🛒" text="Корзина пуста" /></div>;
  return (
    <div className="screen">
      <h1>Корзина</h1>
      <div className="list" style={{ marginTop: 14 }}>
        {cart.map((i) => (
          <div key={i.menuId} className="card tight between">
            <div><div style={{ fontWeight: 700 }}>{i.name}</div><div className="price">{money(i.price)}</div></div>
            <div className="stepper">
              <button onClick={() => setQty(i.menuId, i.qty - 1)}>−</button>
              <b>{i.qty}</b>
              <button onClick={() => setQty(i.menuId, i.qty + 1)}>+</button>
            </div>
          </div>
        ))}
      </div>
      <div className="card between" style={{ marginTop: 16 }}>
        <span className="muted">Итого</span><b style={{ fontSize: 20 }} className="gold">{money(cartTotal)}</b>
      </div>
      <button className="btn block" style={{ marginTop: 16 }} onClick={() => nav('/checkout')}>Оформить заказ</button>
    </div>
  );
}

export function Checkout() {
  const { cart, cartTotal, clearCart, table, refreshMe, toast } = useStore();
  const nav = useNavigate();
  const [type, setType] = useState('delivery');
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [delivery, setDelivery] = useState(null);
  const [geo, setGeo] = useState(null);
  const [locating, setLocating] = useState(false);
  if (!cart.length) { nav('/menu'); return null; }

  const checkAddress = async () => {
    if (!address.trim()) return;
    try { setDelivery(await api.post('/delivery/check', { address })); }
    catch (e) { toast(e.message); }
  };

  // Автоопределение геолокации через GPS телефона + проверка зоны доставки
  const locate = () => {
    if (!navigator.geolocation) { toast('Геолокация не поддерживается этим браузером'); return; }
    if (!window.isSecureContext) { toast('Геолокация работает только по защищённому соединению (https)'); return; }
    setLocating(true);
    const onOk = async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      try {
        const d = await api.post('/delivery/check', { lat, lng });
        setDelivery(d);
        setGeo({ lat, lng, mapUrl: d.mapUrl });
        if (d.formatted) setAddress(d.formatted);
        toast('Местоположение определено');
      } catch (e) { toast(e.message); } finally { setLocating(false); }
    };
    const onErr = (err) => {
      setLocating(false);
      if (err.code === 1) toast('Доступ к геолокации запрещён. Разрешите его в настройках браузера и откройте ссылку в Chrome или Safari (не внутри мессенджера).');
      else if (err.code === 2) toast('Местоположение недоступно. Включите геолокацию на телефоне и попробуйте на улице.');
      else if (err.code === 3) toast('Не успели определить за отведённое время — попробуйте ещё раз.');
      else toast('Не удалось получить геолокацию. Можно ввести адрес вручную.');
    };
    // сначала быстрый запрос, при таймауте — точный по GPS
    navigator.geolocation.getCurrentPosition(onOk, () => {
      navigator.geolocation.getCurrentPosition(onOk, onErr, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
  };

  const deliveryFee = type === 'delivery' && delivery?.inZone ? (delivery.fee || 0) : 0;
  const finalTotal = cartTotal + deliveryFee;
  const blocked = type === 'delivery' && delivery && !delivery.inZone;

  const submit = async () => {
    if (blocked) { toast('Адрес вне зоны доставки'); return; }
    try {
      setBusy(true);
      await api.post('/orders', { items: cart, type, address: type === 'delivery' ? address : null,
        geo: type === 'delivery' ? geo : null,
        comment, tableNumber: type === 'dinein' ? table?.number : null });
      clearCart(); await refreshMe();
      toast('Заказ оформлен ✅');
      nav('/profile');
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="screen">
      <h1>Оформление</h1>
      <label>Способ получения</label>
      <div className="chips">
        {[['delivery', 'Доставка'], ['pickup', 'Самовывоз']].map(([v, l]) => (
          <button key={v} className={`chip ${type === v ? 'active' : ''}`} onClick={() => setType(v)}>{l}</button>
        ))}
      </div>
      {type === 'delivery' && (<>
        <label>Адрес доставки</label>
        <button className="btn ghost block" style={{ marginBottom: 8 }} disabled={locating} onClick={locate}>
          {locating ? 'Определяем…' : 'Определить моё местоположение'}
        </button>
        <input value={address} onChange={(e) => { setAddress(e.target.value); setGeo(null); }} onBlur={checkAddress} placeholder="Soi, дом, Pattaya" />
        {delivery && (
          <div className="card tight" style={{ marginTop: 10, borderColor: delivery.inZone ? 'var(--line)' : 'var(--red)' }}>
            {delivery.inZone
              ? <>В зоне доставки · {delivery.distanceKm} км · доставка {delivery.fee ? money(delivery.fee) : 'бесплатно'}</>
              : <>Вне зоны доставки (радиус {delivery.radiusKm} км). Выберите самовывоз.</>}
            {geo?.mapUrl && <div style={{ marginTop: 6 }}><a href={geo.mapUrl} target="_blank" rel="noreferrer" className="gold">Открыть точку на карте</a></div>}
            {delivery.demo && <div className="muted" style={{ fontSize: 11 }}>демо-расчёт · с ключом Google Maps будет точный адрес</div>}
          </div>
        )}
      </>)}
      {type === 'dinein' && <div className="card tight" style={{ marginTop: 12 }}>Стол №{table?.number || '—'}</div>}
      <label>Комментарий</label>
      <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: без лука" />

      <div className="card between" style={{ marginTop: 16 }}>
        <span className="muted">К оплате</span><b style={{ fontSize: 22 }} className="gold">{money(finalTotal)}</b>
      </div>
      <div className="muted center" style={{ marginTop: 8, fontSize: 11 }}>Онлайн-оплата подключается позже · сейчас оплата на месте</div>
      <button className="btn block" style={{ marginTop: 14 }} disabled={busy || blocked} onClick={submit}>Подтвердить заказ</button>
    </div>
  );
}
