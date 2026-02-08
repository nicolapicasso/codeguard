import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  QrCode,
  TestTube,
  BarChart3,
  LogOut,
  ScanBarcode,
} from 'lucide-react';
import { setToken } from '../lib/api';
import { cn } from '../lib/cn';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tenants', icon: Users, label: 'Tenants' },
  { to: '/projects', icon: FolderOpen, label: 'Projects' },
  { to: '/code-rules', icon: QrCode, label: 'Code Rules' },
  { to: '/tester', icon: TestTube, label: 'Code Tester' },
  { to: '/stats', icon: BarChart3, label: 'Stats' },
];

export function Layout() {
  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700 flex items-center gap-2">
          <ScanBarcode className="w-6 h-6 text-brand-400" />
          <h1 className="text-lg font-bold">OmniCodex</h1>
          <span className="text-xs text-gray-400 ml-auto">Admin</span>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white',
                )
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-gray-700">
          <button
            onClick={() => {
              setToken(null);
              window.location.reload();
            }}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white w-full transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesion
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-gray-50">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
