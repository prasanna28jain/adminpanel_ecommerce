import { ChevronDown, LogOut } from 'lucide-react';
import { definitions, operations, navigation } from '../config/resources.js';
import { displayName, initials } from '../utils/admin.js';

export function Sidebar({ active, onNavigate, permissions, user, onLogout, isOpen, onClose }) {
  const visible = navigation.filter(({ id }) => {
    if (id === 'overview') return permissions.has('dashboard.view')
      || Object.values(definitions).some((item) => permissions.has(`${item.permission}.view`))
      || Object.values(operations).some((item) => permissions.has(item.permission))
      || permissions.has('payments.manage');
    if (definitions[id]) return permissions.has(`${definitions[id].permission}.view`);
    return permissions.has(operations[id].permission) || (id === 'payments' && permissions.has('payments.manage'));
  });
  const groups = [...new Set(visible.map((item) => item.group))];
  return (
    <>
      {isOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand"><div className="brand-mark"><span>e</span></div><div className="brand-word">edhyaa<span className="brand-dot">.</span><small>ADMIN STUDIO</small></div></div>
        <div className="workspace-select"><div className="workspace-avatar">E</div><div><strong>Edhyaa Store</strong><span>Commerce workspace</span></div><ChevronDown size={15} /></div>
        {groups.map((group) => <div className="nav-group" key={group}>
          <div className="nav-caption">{group}</div>
          <nav className="main-nav" aria-label={`${group.toLowerCase()} navigation`}>
            {visible.filter((item) => item.group === group).map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`nav-link ${active === id ? 'nav-link-active' : ''}`} onClick={() => { onNavigate(id); onClose(); }}><Icon size={17} /><span>{title}</span></button>)}
          </nav>
        </div>)}
        <div className="sidebar-bottom"><button type="button" className="profile-chip" onClick={onLogout}><span className="avatar">{initials(user)}</span><span className="profile-meta"><strong>{displayName(user)}</strong><span>Sign out</span></span><LogOut size={15} /></button></div>
      </aside>
    </>
  );
}

export default Sidebar;
