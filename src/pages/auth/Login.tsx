import { useState, type FormEvent } from 'react';
import { Store } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { APP_NAME } from '@/lib/config';
import { ErrorBox, Field, Spinner } from '@/components/ui';

type Mode = 'login' | 'signup' | 'forgot';

export default function Login({ admin = false }: { admin?: boolean }) {
  const { notice } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState({ full_name: '', phone: '', business_name: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: window.location.origin + window.location.pathname, data: profile },
        });
        if (error) throw error;
        if (!data.session) setInfo('สมัครเรียบร้อย — กรุณายืนยันอีเมลจากกล่องจดหมาย จากนั้นรอผู้ดูแลระบบอนุมัติบัญชี');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + window.location.pathname,
        });
        if (error) throw error;
        setInfo('ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว');
      }
    } catch (err) {
      const m = (err as Error).message;
      setError(m === 'Invalid login credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : m);
    } finally {
      setBusy(false);
    }
  }

  const title = { login: 'เข้าสู่ระบบ', signup: 'สมัครใช้งาน', forgot: 'ลืมรหัสผ่าน' }[mode];

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg"><Store className="h-7 w-7" /></div>
          <h1 className="text-2xl font-bold text-slate-900">{APP_NAME}{admin && ' · ผู้ดูแลระบบ'}</h1>
          <p className="text-sm text-slate-500">ระบบจัดการร้าน · POS · บัญชี · จองโต๊ะ</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <h2 className="text-lg font-bold">{title}</h2>
          {notice && !error && !info && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</div>}
          <ErrorBox error={error} />
          {info && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{info}</div>}
          <Field label="อีเมล">
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {mode === 'signup' && <>
            <Field label="ชื่อ-นามสกุล"><input className="input" required value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} /></Field>
            <Field label="เบอร์โทรศัพท์"><input className="input" type="tel" required value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
            <Field label="ชื่อร้านที่จะใช้ระบบ" hint="ถ้าเป็นพนักงานของร้าน ใส่ชื่อร้านที่ทำงาน"><input className="input" value={profile.business_name} onChange={(e) => setProfile({ ...profile, business_name: e.target.value })} /></Field>
          </>}
          {mode !== 'forgot' && (
            <Field label="รหัสผ่าน" hint={mode === 'signup' ? 'อย่างน้อย 8 ตัวอักษร' : undefined}>
              <input className="input" type="password" required minLength={mode === 'signup' ? 8 : 1}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          )}
          <button className="btn-primary w-full py-3" disabled={busy}>{busy && <Spinner />}{title}</button>
          <div className="flex justify-between text-sm">
            {admin ? <span /> : mode === 'login'
              ? <button type="button" className="text-brand-700 hover:underline" onClick={() => setMode('signup')}>สมัครใช้งานใหม่</button>
              : <button type="button" className="text-brand-700 hover:underline" onClick={() => setMode('login')}>มีบัญชีแล้ว? เข้าสู่ระบบ</button>}
            {mode === 'login' && <button type="button" className="text-slate-500 hover:underline" onClick={() => setMode('forgot')}>ลืมรหัสผ่าน</button>}
          </div>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">แต่ละร้านใช้อีเมลและข้อมูลแยกกัน — เจ้าของร้านสามารถเพิ่มพนักงานด้วยอีเมลของพนักงานเอง</p>
      </div>
    </div>
  );
}
