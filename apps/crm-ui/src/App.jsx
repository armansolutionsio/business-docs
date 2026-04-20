'use strict';

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { ToastProvider } from './ToastContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import KanbanPage from './pages/KanbanPage.jsx';
import ContactosPage from './pages/ContactosPage.jsx';
import ContactoDetailPage from './pages/ContactoDetailPage.jsx';
import ProveedoresPage from './pages/ProveedoresPage.jsx';
import CampaniasPage from './pages/CampaniasPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import WhatsAppLeadsPage from './pages/WhatsAppLeadsPage.jsx';
import Layout from './components/Layout.jsx';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter basename="/crm">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="contactos" element={<ContactosPage />} />
            <Route path="contactos/:id" element={<ContactoDetailPage />} />
            <Route path="pipeline" element={<KanbanPage />} />
            <Route path="whatsapp" element={<WhatsAppLeadsPage />} />
            <Route path="campanias" element={<CampaniasPage />} />
            <Route path="proveedores" element={<ProveedoresPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
