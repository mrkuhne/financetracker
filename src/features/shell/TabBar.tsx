import { NavLink, useLocation } from 'react-router-dom';
import { Icon } from './Icons';

// Recurring opens from Activity, Settings from the Home avatar. Savings, budgets and the guide open from Plan.
const TABS = [
  { to: '/', label: 'Home', icon: 'home', roots: ['/'] },
  { to: '/transactions', label: 'Activity', icon: 'list', roots: ['/transactions', '/recurring'] },
  { to: '/plan', label: 'Plan', icon: 'target', roots: ['/plan', '/savings', '/budgets', '/guide'] },
] as const;

export function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end className={t.roots.some((r) => (r === '/' ? pathname === '/' : pathname.startsWith(r))) ? 'on' : ''}>
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
