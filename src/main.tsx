import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// DEV-only: симулятор GPS — патчит navigator.geolocation до рендера
if (import.meta.env.DEV) {
  const { installDevGPS } = await import('./lib/geoMock');
  installDevGPS();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
