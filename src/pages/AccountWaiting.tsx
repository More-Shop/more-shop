import { useState } from 'react';
import { Clock, LogOut, RefreshCw, ShieldOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useAccount } from '@/lib/account';
import { APP_NAME } from '@/lib/config';
import { Spinner } from '@/components/ui';

/** Shown to accounts that are waiting for approval or were suspended. */
export default function AccountWaiting() {
  const { user } = useAuth();
  const { status, adminNote, reload } = useAccount();
  const [busy, setBusy] = useState(false);
  const suspended = status === 'suspended';

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 text-center">
        <div className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl ${suspended ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
          {suspended ? <ShieldOff className="h-7 w-7" /> : <Clock className="h-7 w-7" />}
        </div>
        <h1 className="text-xl font-bold">{suspended ? 'บัญชีถูกระงับการใช้งาน' : 'รอผู้ดูแลระบบอนุมัติ'}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {suspended
            ? `บัญชี ${user?.email} ถูกระงับโดยผู้ดูแลระบบ ${APP_NAME}`
            : `สมัครใช้งาน ${APP_NAME} เรียบร้อยแล้ว — ผู้ดูแลระบบจะตรวจสอบและอนุมัติบัญชี ${user?.email} เร็ว ๆ นี้`}
        </p>
        {adminNote && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">หมายเหตุจากผู้ดูแล: {adminNote}</p>}
        {!suspended && <p className="mt-3 text-xs text-slate-400">ถ้าคุณเป็นพนักงาน ให้เจ้าของร้านเพิ่มอีเมลของคุณในหน้า “พนักงาน” — บัญชีจะใช้งานได้ทันที</p>}
        <div className="mt-5 flex justify-center gap-2">
          <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); await reload(); setBusy(false); }}>
            {busy ? <Spinner /> : <RefreshCw className="h-4 w-4" />} ตรวจสอบอีกครั้ง
          </button>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}><LogOut className="h-4 w-4" /> ออกจากระบบ</button>
        </div>
      </div>
    </div>
  );
}
