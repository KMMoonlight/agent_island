import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import ConfigApp from './ConfigApp';
import './styles/index.css';
import './styles/config.css';

if (navigator.userAgent.includes('Mac OS X')) {
  document.documentElement.classList.add('platform-mac');
}

const isConfigRoute = window.location.hash === '#/config';

document.body.dataset.runtime = 'renderer';
document.body.dataset.route = isConfigRoute ? 'config' : 'overlay';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const RootComponent = isConfigRoute ? ConfigApp : App;

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
