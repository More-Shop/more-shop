import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { installGlobalErrorReporting } from './lib/errorlog';

installGlobalErrorReporting();

// LINE LIFF endpoint URL is "<site>/?liff=<store-slug>" (hash fragments are
// not allowed there), so translate it into the hash route of the LIFF page.
const params = new URLSearchParams(window.location.search);
const liffSlug = params.get('liff');
if (liffSlug && !window.location.hash.startsWith('#/s/')) {
  window.location.hash = `#/s/${encodeURIComponent(liffSlug)}/line`;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
