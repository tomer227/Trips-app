import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/rubik';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => {
        // Warm up the lazily-loaded map so it's cached for offline use even if the map wasn't opened yet.
        setTimeout(() => void import('world-atlas/countries-50m.json'), 3000);
      })
      .catch(() => {
        // Offline support is a nice-to-have; ignore registration failures.
      });
  });
}
