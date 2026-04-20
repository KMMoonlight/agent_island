import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import './styles/index.css';

if (navigator.userAgent.includes('Mac OS X')) {
  document.documentElement.classList.add('platform-mac');
}

document.body.dataset.runtime = 'renderer';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
