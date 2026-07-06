import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useStore } from './context/store.jsx';
import { api } from './api.js';
import { STR } from './i18n.js';
import { Sheet } from './components/ui.jsx';
import Auth from './screens/Auth.jsx';
import Home from './screens/Home.jsx';
import { Menu, Cart, Checkout } from './screens/Menu.jsx';
import Tables, { TableService } from './screens/Tables.jsx';
import Events from './screens/Events.jsx';
import Profile from './screens/Profile.jsx';
import { WaiterPanel, KitchenPanel, CourierPanel } from './screens/Staff.jsx';
import Owner from './screens/Owner.jsx';

// ---------------- Интро ----------------
function Intro({ onDone }) {
  const [intro, setIntro] = useState(null);
  useEffect(() => {
    api.get('/intro').then(setIntro).catch(() => setIntro({}));
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="intro">
      <img src="/logo.png" alt="GROT" className="brand-logo glow-lg" style={{ width: 190, height: 190 }} />
      <span className="badge gold" style={{ marginTop: 20 }}>{intro?.badge || 'GROT'}</span>
      <h1 style={{ margin: '14px 0 6px' }}>{intro?.title || 'GROT Bar & Grill'}</h1>
      <div className="muted">{intro?.subtitle}</div>
      <div style={{ marginTop: 8 }}>{intro?.text}</div>
      <button className="btn fire" style={{ marginTop: 22 }} onClick={onDone}>{intro?.cta || 'Подробнее'}</button>
      <div className="intro-bar"><i /></div>
    </div>
  );
}

// ---------------- Навигация по ролям ----------------
const CLIENT_TABS = [
  ['/', '🏠', 'nav_home'], ['/menu', '🍔', 'nav_menu'],
  ['/events', '🎉', 'nav_events'], ['/profile', '👤', 'nav_account'],
];
const STAFF_TABS = {
  waiter:  [['/staff', '🧾', 'nav_orders'], ['/menu', '🍔', 'nav_menu'], ['/profile', '👤', 'nav_me']],
  cook:    [['/staff', '🍳', 'nav_kitchen']],
  courier: [['/staff', '🛵', 'nav_delivery']],
  owner:   [['/owner', '📊', 'nav_business'], ['/', '🏠', 'nav_home'], ['/menu', '🍔', 'nav_menu'], ['/profile', '👤', 'nav_me']],
  admin:   [['/owner', '📊', 'nav_business'], ['/staff', '🧾', 'nav_orders'], ['/', '🏠', 'nav_home'], ['/profile', '👤', 'nav_me']],
};

function TabBar({ role }) {
  const { t } = useStore();
  const tabs = role === 'client' ? CLIENT_TABS : (STAFF_TABS[role] || CLIENT_TABS);
  // Язык переключают только клиент/официант/курьер; остальные — RU
  const translatable = ['client', 'waiter', 'courier'].includes(role);
  return (
    <nav className="tabbar">
      {tabs.map(([to, ic, key]) => (
        <NavLink key={to} to={to} end={to === '/'}>
          {({ isActive }) => (<><span className="ic" style={{ filter: isActive ? 'none' : 'grayscale(.6)' }}>{ic}</span><span className={isActive ? 'active' : ''}>{translatable ? t(key) : STR.ru[key]}</span></>)}
        </NavLink>
      ))}
    </nav>
  );
}

function TopBar() {
  const { unread, notifications, markRead, user, lang, setLang } = useStore();
  const [open, setOpen] = useState(false);
  // Переключатель языка — только для клиента, официанта, курьера
  const showLang = ['client', 'waiter', 'courier'].includes(user?.role);
  return (<>
    <div className="topbar">
      <div className="row" style={{ gap: 10 }}>
        <img src="/logo.png" alt="GROT" className="brand-logo" />
        <div className="logo">GR<span>O</span>T</div>
      </div>
      <div className="row" style={{ gap: 12 }}>
        {showLang && (
          <button className="lang-toggle" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}>
            {lang === 'ru' ? 'EN' : 'RU'}
          </button>
        )}
        <div className="bell" onClick={() => { setOpen(true); markRead(); }}>🔔{unread > 0 && <span className="dot">{unread}</span>}</div>
      </div>
    </div>
    <Sheet open={open} onClose={() => setOpen(false)}>
      <h2>Уведомления</h2>
      <div className="list" style={{ marginTop: 12 }}>
        {notifications.length === 0 && <div className="muted">Пока пусто</div>}
        {notifications.map((n) => (
          <div key={n.id} className="card tight">{n.text}<div className="muted" style={{ fontSize: 11 }}>{new Date(n.createdAt).toLocaleTimeString('ru-RU')}</div></div>
        ))}
      </div>
    </Sheet>
  </>);
}

// Роль-гард
function RoleRoute({ roles, role, children }) {
  return roles.includes(role) ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { user, booting } = useStore();
  const [introDone, setIntroDone] = useState(false);
  const loc = useLocation();

  if (booting) return <div className="app-shell"><div className="loader"><i /></div></div>;
  if (!introDone) return <div className="app-shell"><Intro onDone={() => setIntroDone(true)} /></div>;
  if (!user) return <div className="app-shell"><Auth /></div>;

  const role = user.role;
  const homeFor = ['waiter', 'cook', 'courier'].includes(role) ? '/staff' : role === 'owner' || role === 'admin' ? '/owner' : '/';

  return (
    <div className="app-shell">
      <TopBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/tables" element={<Tables />} />
        <Route path="/table-service" element={<TableService />} />
        <Route path="/events" element={<Events />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/staff" element={
          <RoleRoute roles={['waiter', 'cook', 'courier', 'admin']} role={role}>
            {role === 'cook' ? <KitchenPanel /> : role === 'courier' ? <CourierPanel /> : <WaiterPanel />}
          </RoleRoute>} />
        <Route path="/owner" element={<RoleRoute roles={['owner', 'admin']} role={role}><Owner /></RoleRoute>} />
        <Route path="*" element={<Navigate to={homeFor} replace />} />
      </Routes>
      <TabBar role={role} />
    </div>
  );
}
