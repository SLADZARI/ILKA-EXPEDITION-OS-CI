import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import { registerPwaServiceWorker } from './pwa/register-service-worker';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);

void registerPwaServiceWorker();
