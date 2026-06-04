import React from 'react';
import ReactDOM from 'react-dom/client';
import '@progress/kendo-theme-default/dist/default-ocean-blue.css';
import 'vanilla-jsoneditor/themes/jse-theme-dark.css';
import { App } from './app/App';
import './brand/brand.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
