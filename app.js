// Chronos PWA Service Worker Registration
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        console.log('Chronos Service Worker registered with scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('Chronos Service Worker registration failed:', err);
      });
  });
}
