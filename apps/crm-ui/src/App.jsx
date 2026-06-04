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
import TemplatesPage from './pages/TemplatesPage.jsx';
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
            <Route path="clientes" element={<ContactosPage />} />
            <Route path="clientes/:id" element={<ContactoDetailPage />} />
            {/* Compatibilidad: links viejos a /contactos siguen funcionando */}
            <Route path="contactos" element={<Navigate to="/clientes" replace />} />
            <Route path="contactos/:id" element={<ContactoDetailPage />} />
            <Route path="pipeline" element={<KanbanPage />} />
            <Route path="whatsapp" element={<WhatsAppLeadsPage />} />
            <Route path="mails" element={<CampaniasPage />} />
            <Route path="campanias" element={<Navigate to="/mails" replace />} />
            <Route path="proveedores" element={<ProveedoresPage />} />
            <Route path="templates" element={<TemplatesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
