import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource-variable/public-sans';

import App from './App.jsx';
import './styles.css';
import './theme.css';

createRoot(
  document.getElementById('root'),
).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
