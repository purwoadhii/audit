import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import { SettingsProvider } from './settings.jsx';
import { ToastProvider } from './components/ui.jsx';
import App from './App.jsx';
import './styles.css';

function WithSettings({ children }) {
  const { user } = useAuth();
  return <SettingsProvider signedIn={Boolean(user)}>{children}</SettingsProvider>;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <WithSettings>
          <ToastProvider>
            <App />
          </ToastProvider>
        </WithSettings>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
