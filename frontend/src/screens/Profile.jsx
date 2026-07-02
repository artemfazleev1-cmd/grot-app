import { api } from '../api.js';
import { useStore } from '../context/store.jsx';
import { Loader, useFetch, money, Empty } from '../components/ui.jsx';

const STEPS = ['new', 'accepted', 'cooking', 'ready', 'delivered'];
const STEP_LBL = { new: 'Принят', accepted: 'Принят', cooking: 'Готовится', ready: 'Готов', delivering: 'У курьера', delivered: 'Доставлен', handed: 'Выдан' };

function OrderCard({ o, onRepeat }) {
  const idx = Math.max(0, STEPS.indexOf(o.status === 'handed' ? 'delivered' : o.status === 'delivering' ? 'ready' : o.status));
  const active = !['delivered', 'handed'].includes(o.status);
  return (
    <div className="card">
      <div className="between">
        <b>Заказ #{o.id}</b>
        <span className={`badge ${active ? 'gold' : 'green'}`}>{STEP_LBL[o.status]}</span>
      </div>
      <div className="muted" style={{ margin: '4px 0' }}>{o.type === 'delivery' ? 'Доставка' : o.type === 'pickup' ? 'Самовывоз' : `Стол №${o.tableNumber}`}</div>
      {active && <div className="steps">{STEPS.map((s, i) => <i key={s} className={i <= idx ? 'on' : ''} />)}</div>}
      <div className="muted">{o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}</div>
      <div className="between" style={{ marginTop: 8 }}>
        <b className="gold">{money(o.total)}</b>
        <button className="btn ghost sm" onClick={() => onRepeat(o)}>↩ Повторить</button>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, logout, addToCart, toast } = useStore();
  const orders = useFetch(() => api.get('/orders'));

  if (orders.loading) return <Loader />;
  const repeat = (o) => { o.items.forEach((i) => addToCart({ id: i.menuId, name: i.name, price: i.price })); toast('Добавлено в корзину'); };

  return (
    <div className="screen">
      <div className="between"><h1>Кабинет</h1><button className="btn ghost sm" onClick={logout}>Выйти</button></div>

      {user?.favDishes?.length > 0 && (
        <div className="card tight" style={{ marginTop: 14 }}>
          <div className="muted">Любимые блюда</div><div>{user.favDishes.join(', ')}</div>
          <div className="muted" style={{ marginTop: 8 }}>Любимые напитки</div><div>{user.favDrinks?.join(', ') || '—'}</div>
        </div>
      )}

      <div className="section-title"><h2>Активные заказы</h2></div>
      <div className="list">
        {orders.data.filter((o) => !['delivered', 'handed'].includes(o.status)).map((o) => <OrderCard key={o.id} o={o} onRepeat={repeat} />)}
        {orders.data.filter((o) => !['delivered', 'handed'].includes(o.status)).length === 0 && <Empty icon="✨" text="Нет активных заказов" />}
      </div>

      <div className="section-title"><h2>История заказов</h2></div>
      <div className="list">
        {orders.data.filter((o) => ['delivered', 'handed'].includes(o.status)).map((o) => <OrderCard key={o.id} o={o} onRepeat={repeat} />)}
      </div>
    </div>
  );
}
