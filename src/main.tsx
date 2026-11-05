import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register Service Worker for PWA compliance (supporting GitHub Pages subpaths)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        console.log('Chronos PWA Service Worker registered with scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('Service Worker registration skipped or failed:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);

