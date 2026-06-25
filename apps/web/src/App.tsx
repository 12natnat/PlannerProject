import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter, createRoute, createRootRoute, redirect } from '@tanstack/react-router';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './routes/Dashboard';
import WeeklyHistory from './routes/WeeklyHistory';
import { Login } from './routes/Login';
import { useAuthStore } from './stores/authStore';
import './index.css';

const queryClient = new QueryClient();

// Auth Guard
const checkAuth = () => {
  const { accessToken } = useAuthStore.getState();
  if (!accessToken) {
    throw redirect({
      to: '/login',
    });
  }
};

const rootRoute = createRootRoute({
  component: () => <RouterProviderInner />
});

// Create a wrapper to use Zustand hook properly inside React
function RouterProviderInner() {
  return <Outlet />;
}
import { Outlet } from '@tanstack/react-router';

const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authLayout',
  beforeLoad: checkAuth,
  component: Layout,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: () => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken) throw redirect({ to: '/' });
  },
  component: Login,
});

const indexRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/',
  component: Dashboard,
});

import { ItemTracking } from './routes/ItemTracking';

const trackingRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/tracking',
  component: ItemTracking,
});

import { Items } from './routes/Items';
import { Users } from './routes/Users';
import { DailySchedule } from './routes/DailySchedule';
import { FGStock } from './routes/FGStock';
import { FGHistory } from './routes/FGHistory';
import { WIP } from './routes/WIP';
import { WeeklyDemand } from './routes/WeeklyDemand';
import { ShortageDetail } from './routes/ShortageDetail';

const itemsRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/items',
  component: Items,
});

const dailyScheduleRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/schedule',
  component: DailySchedule,
});

const fgStockRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/fg-stock',
  component: FGStock,
});

const fgHistoryRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/fg-history',
  component: FGHistory,
});

const wipRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/wip',
  component: WIP,
});

const usersRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/users',
  component: Users,
});

const weeklyDemandRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/weekly-demand',
  component: WeeklyDemand,
});

const shortageDetailRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/shortage-detail',
  component: ShortageDetail,
});

const weeklyHistoryRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/weekly-history',
  component: WeeklyHistory,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  authLayoutRoute.addChildren([
    indexRoute,
    trackingRoute,
    itemsRoute,
    dailyScheduleRoute,
    fgStockRoute,
    fgHistoryRoute,
    wipRoute,
    usersRoute,
    weeklyDemandRoute,
    shortageDetailRoute,
    weeklyHistoryRoute,
  ]),
]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export default App;
