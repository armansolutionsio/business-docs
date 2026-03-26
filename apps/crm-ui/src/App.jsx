'use strict';

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { ToastProvider } from './ToastContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import InboxPage from './pages/InboxPage.jsx';
import KanbanPage from './pages/KanbanPage.jsx';
import LeadDetailPage from './pages/LeadDetailPage.jsx';
import ContactosPage from './pages/ContactosPage.jsx';
import ContactoDetailPage from './pages/ContactoDetailPage.jsx';
import ProveedoresPage from './pages/ProveedoresPage.jsx';
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
            <Route index element={<Navigate to="/contactos" replace />} />
            <Route path="contactos" element={<ContactosPage />} />
            <Route path="contactos/:id" element={<ContactoDetailPage />} />
            <Route path="proveedores" element={<ProveedoresPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="kanban" element={<KanbanPage />} />
            <Route path="leads/:id" element={<LeadDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/contactos" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
