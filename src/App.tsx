import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { StoreProvider, useStore } from '@/lib/store';
import { AccountProvider, useAccount } from '@/lib/account';
import type { FeatureKey } from '@/lib/features';
import AccountWaiting from '@/pages/AccountWaiting';
import { isConfigured } from '@/lib/config';
import { PageLoading, Toaster } from '@/components/ui';
import Layout from '@/components/Layout';
import NotConfigured from '@/pages/NotConfigured';
import Login from '@/pages/auth/Login';
import StorePicker from '@/pages/StorePicker';
import NewStore from '@/pages/NewStore';

const Dashboard = lazy(() => import('@/pages/admin/Dashboard'));
const Pos = lazy(() => import('@/pages/admin/Pos'));
const Orders = lazy(() => import('@/pages/admin/Orders'));
const Bookings = lazy(() => import('@/pages/admin/Bookings'));
const MenuAdmin = lazy(() => import('@/pages/admin/MenuAdmin'));
const Tables = lazy(() => import('@/pages/admin/Tables'));
const Ledger = lazy(() => import('@/pages/admin/Ledger'));
const Reports = lazy(() => import('@/pages/admin/Reports'));
const Staff = lazy(() => import('@/pages/admin/Staff'));
const Settings = lazy(() => import('@/pages/admin/Settings'));
const PublicMenu = lazy(() => import('@/pages/public/PublicMenu'));
const PublicBooking = lazy(() => import('@/pages/public/PublicBooking'));
const LineEntry = lazy(() => import('@/pages/public/LineEntry'));
const BillStatus = lazy(() => import('@/pages/public/BillStatus'));

function RequireRole({ roles, feature: f, children }: { roles: ('owner' | 'manager' | 'staff')[]; feature?: FeatureKey; children: ReactNode }) {
  const { can, feature } = useStore();
  return can(...roles) && (!f || feature(f)) ? <>{children}</> : <Navigate to="/" replace />;
}

function StaffArea() {
  const { session, loading } = useAuth();
  const account = useAccount();
  const { store, loading: storesLoading } = useStore();
  if (loading || (session && (account.loading || storesLoading))) return <PageLoading />;
  if (!session) return <Login />;
  if (!account.isAdmin && account.status !== 'approved') return <AccountWaiting />;
  if (!store) {
    return (
      <Routes>
        <Route path="/new-store" element={<NewStore />} />
        <Route path="*" element={<StorePicker />} />
      </Routes>
    );
  }
  const mgr = ['owner', 'manager'] as const;
  return (
    <Routes>
      <Route path="/new-store" element={<NewStore />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="pos" element={<Pos />} />
        <Route path="orders" element={<Orders />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="menu" element={<RequireRole roles={[...mgr]}><MenuAdmin /></RequireRole>} />
        <Route path="tables" element={<RequireRole roles={[...mgr]}><Tables /></RequireRole>} />
        <Route path="ledger" element={<RequireRole roles={[...mgr]} feature="ledger"><Ledger /></RequireRole>} />
        <Route path="reports" element={<RequireRole roles={[...mgr]} feature="reports"><Reports /></RequireRole>} />
        <Route path="staff" element={<RequireRole roles={['owner']}><Staff /></RequireRole>} />
        <Route path="settings" element={<RequireRole roles={[...mgr]}><Settings /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  if (!isConfigured) return <NotConfigured />;
  return (
    <HashRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            {/* Customer pages — no login */}
            <Route path="/s/:slug" element={<PublicMenu />} />
            <Route path="/s/:slug/t/:token" element={<PublicMenu />} />
            <Route path="/s/:slug/book" element={<PublicBooking />} />
            <Route path="/s/:slug/line" element={<LineEntry />} />
            <Route path="/bill/:orderId" element={<BillStatus />} />
            {/* Staff back office */}
            <Route path="/*" element={<AccountProvider><StoreProvider><StaffArea /></StoreProvider></AccountProvider>} />
          </Routes>
        </Suspense>
        <Toaster />
      </AuthProvider>
    </HashRouter>
  );
}
