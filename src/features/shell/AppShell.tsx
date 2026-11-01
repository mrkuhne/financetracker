import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { QuickAddSheet } from '@/features/transactions/QuickAddSheet';
import { Icon, IconSprite } from './Icons';
import { TabBar } from './TabBar';

export function AppShell() {
  const { pathname } = useLocation();
  const [adding, setAdding] = useState(false);
  const showFab = pathname === '/' || pathname === '/transactions';
  return (
    <>
      <IconSprite />
      <div className="shell">
        <Outlet />
      </div>
      {showFab && (
        <button className="fab" aria-label="Add transaction" onClick={() => setAdding(true)}>
          <Icon name="plus" />
        </button>
      )}
      <QuickAddSheet open={adding} onClose={() => setAdding(false)} />
      <TabBar />
    </>
  );
}
