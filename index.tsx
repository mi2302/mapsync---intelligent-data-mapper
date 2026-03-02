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

  return (
    <>
      <App />
      <button
        onClick={() => {
          localStorage.removeItem('mapsync_user');
          localStorage.removeItem('mapsync_user_role');
          setCurrentUser(null);
          setCurrentRole(null);
        }}
        className="fixed bottom-4 left-4 z-50 bg-slate-900/50 hover:bg-slate-900 backdrop-blur text-white/50 hover:text-white px-4 py-2 rounded-full text-[10px] uppercase font-semibold tracking-widest transition-all shadow-lg border border-white/10"
      >
        Log out
      </button>
    </>
  );
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
