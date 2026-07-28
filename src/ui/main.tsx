import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

declare global {
  interface Window {
    __COMPOSE_UI_TOKEN__?: string;
  }
}

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('compose UI root element was not found.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App token={window.__COMPOSE_UI_TOKEN__ ?? ''} />
  </React.StrictMode>,
);
