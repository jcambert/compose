import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { mountStreamingWidget } from './streaming-widget';
import './styles.css';
import './workspace-polish.css';
import './streaming.css';

declare global {
  interface Window {
    __COMPOSE_UI_TOKEN__?: string;
  }
}

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('compose UI root element was not found.');
}

const token = window.__COMPOSE_UI_TOKEN__ ?? '';

createRoot(rootElement).render(
  <React.StrictMode>
    <App token={token} />
  </React.StrictMode>,
);

mountStreamingWidget(token);
