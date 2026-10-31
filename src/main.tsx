import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthGate } from './auth';
import { AuthScreen } from './screens/AuthScreen';
import { StoreProvider } from './store';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthGate signedOut={(onSignedIn) => <AuthScreen onSignedIn={onSignedIn} />}>
        <StoreProvider>
          <App />
        </StoreProvider>
      </AuthGate>
    </BrowserRouter>
  </StrictMode>,
);
