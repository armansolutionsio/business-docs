import React, { createContext, useContext, useState } from 'react';

// Mock users — replace with real auth in production
export const USERS = [
  { username: 'santi',  password: '1234', name: 'Santiago', role: 'CEO' },
  { username: 'gabi',   password: '1234', name: 'Gabriela', role: 'CEO' },
  { username: 'nacho',  password: '1234', name: 'Ignacio',  role: 'MANAGER' },
  { username: 'agus',   password: '1234', name: 'Agustina', role: 'MANAGER' },
];

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_user')) || null; }
    catch { return null; }
  });

  const login = (username, password) => {
    const found = USERS.find(u => u.username === username && u.password === password);
    if (!found) throw new Error('Usuario o contraseña incorrectos');
    const u = { username: found.username, name: found.name, role: found.role };
    localStorage.setItem('crm_user', JSON.stringify(u));
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem('crm_user');
    setUser(null);
  };

  // CEO can read everything; MANAGER can operate leads
  const can = (action) => {
    if (!user) return false;
    if (user.role === 'CEO') return true;
    const managerActions = ['view_leads', 'update_lead', 'create_lead', 'create_task', 'generate_quote', 'close_won'];
    return managerActions.includes(action);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
