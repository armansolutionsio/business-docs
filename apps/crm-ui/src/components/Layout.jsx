import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar-brand">
          <img src={import.meta.env.BASE_URL + 'logo-arman-travel.png'} alt="Arman Travel" className="topbar-logo-img" />
          <span className="topbar-brand-name">CRM</span>
        </div>
        <nav className="topbar-nav">
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Dashboard
          </NavLink>
          <NavLink to="/contactos" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Contactos
          </NavLink>
          <NavLink to="/pipeline" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Pipeline
          </NavLink>
          <NavLink to="/whatsapp" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#25d366', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 700 }}>W</span>
            WhatsApp
          </NavLink>
          <NavLink to="/campanias" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Campañas
          </NavLink>
          <NavLink to="/proveedores" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Proveedores
          </NavLink>
        </nav>
        <div className="topbar-user">
          <div className="user-avatar">{((user?.nombre || user?.email || '?')[0] || '?').toUpperCase()}</div>
          <div className="user-info">
            <span className="user-name">{user?.nombre || user?.email}</span>
            <span className="user-role-badge">{user?.rol}</span>
          </div>
          <button className="btn btn-topbar-logout btn-sm" onClick={handleLogout}>Salir</button>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
