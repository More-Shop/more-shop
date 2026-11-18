import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { ShieldOff } from 'lucide-react';
import './index.css';
import { installGlobalErrorReporting } from './lib/errorlog';
import { AuthProvider, useAuth } from './lib/auth';
import { AccountProvider, useAccount } from './lib/account';
import { isConfigured, APP_NAME } from './lib/config';
import { supabase } from './lib/supabase';
import { PageLoading, Toaster } from './components/ui';
import Login from './pages/auth/Login';
import NotConfigured from './pages/NotConfigured';

installGlobalErrorReporting();
const AdminConsole = lazy(() => import('./pages/platform/AdminConsole'));

/** Platform admin site — separate page and separate login from the shop app. */
function AdminGate() {
  const { session, loading, user } = useAuth();
  const account = useAccount();
  if (loading || (session && account.loading)) return <PageLoading />;
  if (!session) return <Login admin />;
  if (!account.isAdmin) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="card max-w-sm p-6 text-center">
          <ShieldOff className="mx-auto mb-3 h-10 w-10 text-red-500" />
          <h1 className="text-lg font-bold">ไม่มีสิทธิ์เข้าหน้านี้</h1>
          <p className="mt-1 text-sm text-slate-500">บัญชี {user?.email} ไม่ใช่ผู้ดูแลระบบ {APP_NAME}</p>
          <button className="btn-primary mt-4" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>
        </div>
      </div>
    );
  }
  return <Suspense fallback={<PageLoading />}><AdminConsole /></Suspense>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isConfigured ? (
      <AuthProvider>
        <AccountProvider>
          <AdminGate />
        </AccountProvider>
        <Toaster />
      </AuthProvider>
    ) : <NotConfigured />}
  </React.StrictMode>,
);
