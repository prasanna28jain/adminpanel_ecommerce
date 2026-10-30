import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CircleAlert, LoaderCircle, LogOut, Menu } from 'lucide-react';
import { apiRequest, clearToken, decodeToken, getToken, permissionSet } from './api.js';
import Sidebar from './components/Sidebar.jsx';
import { definitions, operations } from './config/resources.js';
import { CategoryPage } from './pages/CategoryPage.jsx';
import { Dashboard } from './pages/DashboardPage.jsx';
import { Login } from './pages/LoginPage.jsx';
import { OperationalPage } from './pages/OperationalPage.jsx';
import BrandsPage from './pages/BrandsPage.jsx';
import AttributesPage from './pages/AttributesPage.jsx';
import ComboOffersPage from './pages/ComboOffersPage.jsx';
import CouponsPage from './pages/CouponsPage.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import SubcategoriesPage from './pages/SubcategoriesPage.jsx';
import TagsPage from './pages/TagsPage.jsx';
import { displayName, errorMessage, initials } from './utils/admin.js';

const resourcePages = {
  brands: BrandsPage,
  attributes: AttributesPage,
  'combo-offers': ComboOffersPage,
  coupons: CouponsPage,
  products: ProductsPage,
  subcategories: SubcategoriesPage,
  tags: TagsPage,
};

const routeToPage = new Map([
  ...Object.entries(definitions).map(([key, definition]) => [definition.path, key]),
  ...Object.keys(operations).map((key) => [`/${key}`, key]),
]);

function pageFromLocation() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  return routeToPage.get(path) || 'overview';
}

export function App() {
  const [token, setToken] = useState(() => getToken());
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!getToken());
  const [sessionError, setSessionError] = useState('');
  const [sessionRetry, setSessionRetry] = useState(0);
  const [active, setActive] = useState(pageFromLocation);
  const [navigationVersion, setNavigationVersion] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const claims = useMemo(() => decodeToken(token || ''), [token]);
  const tokenPermissions = permissionSet(claims);
  const permissions = useMemo(() => {
    const combined = new Set(tokenPermissions);
    (user?.permissions || []).forEach((permission) => combined.add(typeof permission === 'string' ? permission : permission.name || permission.slug || ''));
    return permissionSet({ permissions: [...combined] });
  }, [token, user]);

  useEffect(() => {
    const restoreRoute = () => setActive(pageFromLocation());
    window.addEventListener('popstate', restoreRoute);
    return () => window.removeEventListener('popstate', restoreRoute);
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    const controller = new AbortController();
    apiRequest('/auth/me', { token, signal: controller.signal }).then((response) => {
      if (alive) {
        setUser((current) => ({
          ...current,
          ...response.data,
          permissions: response.data?.permissions ?? current?.permissions ?? [],
        }));
        setSessionError('');
      }
    }).catch((requestError) => {
      if (!alive || requestError.name === 'AbortError') return;
      if (requestError.status === 401) { clearToken(); setToken(null); setUser(null); setAuthReady(true); }
      else setSessionError(errorMessage(requestError));
    }).finally(() => { if (alive) setAuthReady(true); });
    const unauthorized = () => { clearToken(); setToken(null); setUser(null); setAuthReady(true); };
    window.addEventListener('edhyaa:unauthorized', unauthorized);
    return () => { alive = false; controller.abort(); window.removeEventListener('edhyaa:unauthorized', unauthorized); };
  }, [token, sessionRetry]);

  function login(nextToken, nextUser) { setUser(nextUser); setToken(nextToken); setAuthReady(true); navigateTo('overview'); }
  function logout() { clearToken(); setToken(null); setUser(null); setActive('overview'); window.history.replaceState({}, '', '/'); }
  function navigateTo(page) {
    setActive(page);
    const path = page === 'overview' ? '/' : definitions[page]?.path || `/${page}`;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setNavigationVersion((version) => version + 1);
  }

  const activeItem = definitions[active] || operations[active];
  const activeAllowed = active === 'overview'
    || (definitions[active] && permissions.has(`${definitions[active].permission}.view`))
    || (active === 'payments' && (permissions.has('settings.view') || permissions.has('payments.manage')))
    || (operations[active] && permissions.has(operations[active].permission));
  const safeActive = activeItem && activeAllowed ? active : 'overview';
  useEffect(() => {
    if (safeActive !== active) {
      setActive(safeActive);
      const path = safeActive === 'overview' ? '/' : definitions[safeActive]?.path || `/${safeActive}`;
      window.history.replaceState({}, '', path);
    }
  }, [active, safeActive]);
  if (!authReady) return <main className="app-loading"><LoaderCircle className="spin" size={24} /><span>Checking your admin session…</span></main>;
  if (sessionError && token) return <main className="app-loading session-error" role="alert"><CircleAlert size={21} /><span>{sessionError}</span><button className="button button-light" type="button" onClick={() => { setAuthReady(false); setSessionRetry((value) => value + 1); }}>Retry</button><button className="button button-light" type="button" onClick={logout}>Sign out</button></main>;
  if (!token) return <Login onLogin={login} />;

  const safeItem = definitions[safeActive] || operations[safeActive];
  const pageTitle = safeActive === 'overview' ? 'Dashboard' : safeItem?.title || 'Dashboard';
  const showDashboard = safeActive === 'overview';
  const ResourceComponent = resourcePages[safeActive];
  const pageKey = `${safeActive}-${navigationVersion}`;
  const selectedView = showDashboard
    ? <Dashboard key={pageKey} token={token} user={user} permissions={permissions} onNavigate={navigateTo} />
    : safeActive === 'categories'
      ? <CategoryPage key={pageKey} token={token} permissions={permissions} />
      : ResourceComponent
      ? <ResourceComponent key={pageKey} token={token} permissions={permissions} />
      : <OperationalPage key={pageKey} page={safeActive} token={token} permissions={permissions} />;
  return <div className="app-shell">
    <Sidebar active={safeActive} onNavigate={navigateTo} permissions={permissions} user={user} onLogout={logout} isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    <main className="main-shell">
      <header className="topbar"><button type="button" className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={18} /></button><div className="breadcrumbs"><span>Admin</span><ArrowRight size={13} /><strong>{pageTitle}</strong></div><div className="topbar-actions"><span className="topbar-date">{displayName(user)}</span><span className="topbar-separator" /><button type="button" className="topbar-user" onClick={logout} title="Sign out"><span className="avatar avatar-small">{initials(user)}</span><span>Sign out</span><LogOut size={14} /></button></div></header>
      <div className="page-content">{selectedView}</div>
    </main>
  </div>;
}

export default App;
