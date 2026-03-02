import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Login } from './components/Login';

const AuthWrapper = () => {
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem('mapsync_user'));
  const [currentRole, setCurrentRole] = useState<string | null>(() => localStorage.getItem('mapsync_user_role'));

  if (!currentUser) {
    return <Login onLogin={(email, role) => {
      localStorage.setItem('mapsync_user', email);
      localStorage.setItem('mapsync_user_role', role);
      setCurrentUser(email);
      setCurrentRole(role);
    }} />;
  }

  return <App />;
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthWrapper />
  </React.StrictMode>
);
