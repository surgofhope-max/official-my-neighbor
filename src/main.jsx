// TEMP: Global error capture for debugging navigation issues
window.addEventListener("error", (event) => {
  console.error("🔥 GLOBAL ERROR:", event.error || event.message, event);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("🔥 UNHANDLED PROMISE REJECTION:", event.reason);
});

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  <App />
  // </React.StrictMode>,
)

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}



