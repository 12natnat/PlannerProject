import { Outlet, Link, useRouterState, useRouter } from '@tanstack/react-router';
import { LayoutDashboard, Activity, Users, Bell, LogOut, Settings, CalendarClock, Box, Settings2, CalendarRange, ShieldAlert } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/authStore';

export function Layout() {
  const routerState = useRouterState();
  const router = useRouter();
  const pathname = routerState.location.pathname;
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.navigate({ to: '/login' });
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Item Tracking', path: '/tracking', icon: Activity },
    { name: 'Shortage Detail', path: '/shortage-detail', icon: ShieldAlert },
    { name: 'Daily Schedule', path: '/schedule', icon: CalendarClock },
    { name: '26-Week Demand Plan', path: '/weekly-demand', icon: CalendarRange },
    { name: 'Finish Good (FG)', path: '/fg-stock', icon: Box },
    { name: 'Work in Progress', path: '/wip', icon: Settings2 },
    { name: 'Dropdown Management', path: '/items', icon: Settings2, adminOnly: true },
    { name: 'User Management', path: '/users', icon: Users, superAdminOnly: true },
  ].filter(item => {
    if (item.superAdminOnly) return user?.role === 'SUPER_ADMIN';
    if (item.adminOnly) return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
    return true;
  });

  return (
    <div className="min-h-screen bg-secondary/30 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-card border-r shadow-sm flex flex-col">
        <div className="p-4 flex items-center border-b">
          <div className="bg-primary text-primary-foreground font-bold text-xl px-3 py-1 rounded-md">
            ProPlan
          </div>
          <span className="ml-3 font-semibold tracking-tight">System</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-md transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon size={18} />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t space-y-2">
          <button className="flex w-full items-center space-x-3 px-3 py-2 rounded-md transition-colors hover:bg-secondary text-muted-foreground hover:text-foreground">
            <Settings size={18} />
            <span className="font-medium">Settings</span>
          </button>
          <button 
            onClick={handleLogout}
            className="flex w-full items-center space-x-3 px-3 py-2 rounded-md transition-colors hover:bg-destructive/10 text-destructive hover:text-destructive"
          >
            <LogOut size={18} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-card border-b flex items-center justify-between px-6 shadow-sm z-10">
          <h1 className="text-xl font-semibold">
            {navItems.find(i => i.path === pathname)?.name || 'ProPlan'}
          </h1>
          <div className="flex items-center space-x-4">
            <button className="p-2 rounded-full hover:bg-secondary relative">
              <Bell size={20} className="text-muted-foreground" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full"></span>
            </button>
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
              {user?.name?.charAt(0).toUpperCase() || 'A'}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
