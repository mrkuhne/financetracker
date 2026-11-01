import { Outlet } from 'react-router-dom';
import { IconSprite } from './Icons';
import { TabBar } from './TabBar';

export function AppShell() {
  return (
    <>
      <IconSprite />
      <div className="shell">
        <Outlet />
      </div>
      <TabBar />
    </>
  );
}
