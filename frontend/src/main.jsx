import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { StoreProvider } from './context/store.jsx';
import App from './App.jsx';
import { registerSW } from './pwa.js';
import './styles.css';

// Service worker регистрируем только в продакшен-сборке.
// В dev он кэширует страницу и мешает обновлению (HMR/стили/фон).
if (import.meta.env.PROD) {
  registerSW();
} else if ('serviceWorker' in navigator) {
  // снять ранее зарегистрированный SW и очистить кэш в dev
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
  if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </React.StrictMode>
);
