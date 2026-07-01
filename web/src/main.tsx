import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary
      fallback={
        <div style={{ padding: 24, textAlign: 'center', fontFamily: 'Inter, sans-serif', background: '#030810', color: '#fff', minHeight: '100vh' }}>
          <h1>World Choir</h1>
          <p>Something went wrong. Please refresh the page.</p>
        </div>
      }
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
