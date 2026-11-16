import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase, must } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/ui';
import { uploadStoreFile } from '@/lib/upload';
import StoreForm, { emptyStoreForm } from '@/components/StoreForm';
import type { Store } from '@/lib/types';

export default function NewStore() {
  const { reload, selectStore } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <Link to="/" className="btn-ghost -ml-3 mb-2"><ArrowLeft className="h-4 w-4" /> กลับ</Link>
      <h1 className="mb-1 text-2xl font-bold">เพิ่มร้านใหม่</h1>
      <p className="mb-6 text-sm text-slate-500">ข้อมูลแต่ละร้านแยกจากกันทั้งหมด (เมนู ออเดอร์ บัญชี พนักงาน) — คุณจะเป็นเจ้าของร้านนี้</p>
      <StoreForm
        initial={{ ...emptyStoreForm, email: user?.email ?? '' }}
        submitLabel="สร้างร้าน"
        onSubmit={async (values, { logoFile }) => {
          const store = must(await supabase.rpc('create_store', { p_store: values })) as Store;
          if (logoFile) {
            try {
              const logo_url = await uploadStoreFile(store, logoFile, 'logo');
              must(await supabase.from('stores').update({ logo_url }).eq('id', store.id).select('id'));
            } catch (e) {
              toast.err(`สร้างร้านแล้ว แต่อัปโหลดโลโก้ไม่สำเร็จ (${(e as Error).message}) — อัปโหลดใหม่ได้ที่หน้าตั้งค่าร้าน`);
            }
          }
          await reload();
          selectStore(store.id);
          toast.ok(`สร้างร้าน ${store.name} เรียบร้อย`);
          navigate('/');
        }}
      />
    </div>
  );
}
