import { useEffect, useState, type CSSProperties } from 'react';
import { ImagePlus, Palette, RotateCcw, Save } from 'lucide-react';
import { supabase, must } from '@/lib/supabase';
import { DEFAULT_BG, brandVars, gradientCss, resolveBackground, setPlatformBackground, type Background } from '@/lib/theme';
import { displayableImageUrl, uploadStoreFile } from '@/lib/upload';
import { fmtPrice } from '@/lib/format';
import type { Store } from '@/lib/types';
import { ErrorBox, Field, PageLoading, Spinner, Toggle, toast, useLoad } from '@/components/ui';
import { StoreBanner } from '@/pages/public/OrderingView';

const PRESETS: { name: string; bg: Background }[] = [
  { name: 'ส้มพีช', bg: { bg_from: '#fff7ed', bg_to: '#fdba74', bg_angle: 135 } },
  { name: 'ส้มสด', bg: { bg_from: '#ffedd5', bg_to: '#f97316', bg_angle: 135 } },
  { name: 'ชมพูพีช', bg: { bg_from: '#fff1f2', bg_to: '#fda4af', bg_angle: 135 } },
  { name: 'ครีมทอง', bg: { bg_from: '#fefce8', bg_to: '#fcd34d', bg_angle: 135 } },
  { name: 'เขียวมัทฉะ', bg: { bg_from: '#f7fee7', bg_to: '#a3e635', bg_angle: 135 } },
  { name: 'มิ้นต์', bg: { bg_from: '#f0fdfa', bg_to: '#5eead4', bg_angle: 135 } },
  { name: 'ฟ้าใส', bg: { bg_from: '#f0f9ff', bg_to: '#7dd3fc', bg_angle: 135 } },
  { name: 'ลาเวนเดอร์', bg: { bg_from: '#faf5ff', bg_to: '#d8b4fe', bg_angle: 135 } },
  { name: 'เทาเรียบ', bg: { bg_from: '#f8fafc', bg_to: '#cbd5e1', bg_angle: 135 } },
];
const ANGLES: { a: number; label: string }[] = [
  { a: 135, label: '↘ เฉียงลง' }, { a: 45, label: '↗ เฉียงขึ้น' }, { a: 180, label: '↓ บนลงล่าง' }, { a: 90, label: '→ ซ้ายไปขวา' },
];

function BackgroundEditor({ value, onChange }: { value: Background; onChange: (b: Background) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {PRESETS.map((p) => {
          const active = p.bg.bg_from === value.bg_from && p.bg.bg_to === value.bg_to;
          return (
            <button key={p.name} type="button" onClick={() => onChange({ ...p.bg, bg_angle: value.bg_angle })}
              className={`rounded-xl border-2 p-1 text-center text-[11px] font-semibold ${active ? 'border-slate-900' : 'border-transparent'}`}>
              <div className="h-10 rounded-lg" style={{ backgroundImage: gradientCss({ ...p.bg, bg_angle: value.bg_angle }) }} />
              <div className="mt-1 truncate">{p.name}</div>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Field label="สีเริ่ม">
          <input type="color" className="h-10 w-16 cursor-pointer rounded-lg border border-slate-200" value={value.bg_from} onChange={(e) => onChange({ ...value, bg_from: e.target.value })} />
        </Field>
        <Field label="สีปลาย">
          <input type="color" className="h-10 w-16 cursor-pointer rounded-lg border border-slate-200" value={value.bg_to} onChange={(e) => onChange({ ...value, bg_to: e.target.value })} />
        </Field>
        <div>
          <span className="label">ทิศทาง</span>
          <div className="flex flex-wrap gap-1">
            {ANGLES.map((x) => (
              <button key={x.a} type="button" onClick={() => onChange({ ...value, bg_angle: x.a })}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${value.bg_angle === x.a ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-200'}`}>{x.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small mock-up of the customer menu and the back office with the chosen look. */
function Preview({ bg, theme, store }: { bg: Background; theme: string; store: Partial<Store> & { name: string } }) {
  const vars = brandVars(theme) as CSSProperties;
  return (
    <div className="grid gap-4 md:grid-cols-[19rem_1fr]" style={vars}>
      <div>
        <div className="mb-1 text-xs font-semibold text-slate-500">หน้าลูกค้า (เมนู / QR / LINE)</div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm" style={{ backgroundImage: gradientCss(bg) }}>
          <StoreBanner store={{ name: store.name, logo_url: store.logo_url ?? null, open_time: store.open_time ?? '10:00', close_time: store.close_time ?? '22:00',
            cover_image_url: store.cover_image_url ?? null, welcome_text: store.welcome_text ?? null }} />
          <div className="grid grid-cols-2 gap-2 p-3">
            {['เมนูแนะนำ', 'เครื่องดื่ม'].map((n, i) => (
              <div key={n} className="overflow-hidden rounded-xl bg-white shadow-sm">
                <div className="aspect-square bg-slate-100" />
                <div className="p-2 text-xs"><div className="font-semibold">{n}</div><div className="font-bold text-brand-700">฿{fmtPrice(i ? 45 : 89)}</div></div>
              </div>
            ))}
          </div>
          <div className="p-3 pt-0"><div className="rounded-xl bg-brand-600 py-2 text-center text-sm font-bold text-white">ดูตะกร้า</div></div>
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold text-slate-500">ระบบหลังร้าน</div>
        <div className="flex h-full min-h-[14rem] overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-1/3 space-y-2 bg-white p-2">
            <div className="flex items-center gap-1.5">
              <div className="h-6 w-6 rounded-md bg-brand-600" /><div className="truncate text-[11px] font-bold">{store.name}</div>
            </div>
            <div className="h-4 rounded bg-brand-50" /><div className="h-4 rounded bg-slate-100" /><div className="h-4 rounded bg-slate-100" />
          </div>
          <div className="flex-1 space-y-2 p-3" style={{ backgroundImage: gradientCss(bg) }}>
            <div className="text-xs font-bold">สวัสดี, {store.name}</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-10 rounded-lg bg-white shadow-sm" /><div className="h-10 rounded-lg bg-white shadow-sm" />
            </div>
            <div className="h-16 rounded-lg bg-white shadow-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageField({ label, hint, value, onChange, onUpload, uploading }: {
  label: string; hint: string; value: string; onChange: (v: string) => void; onUpload: (f: File) => void; uploading: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        {value && <img src={displayableImageUrl(value)} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover" />}
        <label className="btn-secondary shrink-0 cursor-pointer">
          {uploading ? <Spinner /> : <ImagePlus className="h-4 w-4" />} เลือกรูป
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        </label>
        <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="หรือวางลิงก์รูป" />
        {value && <button type="button" className="btn-ghost px-2 text-xs" onClick={() => onChange('')}>ลบ</button>}
      </div>
    </Field>
  );
}

export default function DesignTab() {
  // ---- System default
  const [platform, pLoading] = useLoad(async () => {
    const v = must(await supabase.rpc('public_appearance')) as Partial<Background> | null;
    return v?.bg_from && v?.bg_to ? { bg_from: v.bg_from, bg_to: v.bg_to, bg_angle: Number(v.bg_angle ?? 135) } : DEFAULT_BG;
  }, []);
  const [sys, setSys] = useState<Background>(DEFAULT_BG);
  useEffect(() => { if (platform) setSys(platform); }, [platform]);
  const [savingSys, setSavingSys] = useState(false);

  // ---- Stores
  const [stores, sLoading, sError, reloadStores] = useLoad(async () =>
    must(await supabase.from('stores').select('*').order('name')) as Store[], []);
  const [storeId, setStoreId] = useState<string>('');
  useEffect(() => { if (!storeId && stores?.length) setStoreId(stores[0].id); }, [stores, storeId]);
  const store = stores?.find((s) => s.id === storeId) ?? null;

  const [d, setD] = useState({ theme_color: '#ea580c', custom_bg: false, bg: DEFAULT_BG, logo_url: '', cover_image_url: '', welcome_text: '' });
  useEffect(() => {
    if (!store) return;
    setD({
      theme_color: store.theme_color, custom_bg: Boolean(store.bg_from && store.bg_to),
      bg: resolveBackground(store.bg_from && store.bg_to ? store : sys), logo_url: store.logo_url ?? '',
      cover_image_url: store.cover_image_url ?? '', welcome_text: store.welcome_text ?? '',
    });
  }, [store?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [savingStore, setSavingStore] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);

  async function saveSystem() {
    setSavingSys(true);
    try {
      must(await supabase.rpc('admin_set_appearance', { p_value: sys }));
      setPlatformBackground(sys);
      toast.ok('บันทึกพื้นหลังทั้งระบบแล้ว — ร้านที่ไม่ได้ตั้งพื้นหลังเองจะใช้แบบนี้');
    } catch (e) { toast.err((e as Error).message); } finally { setSavingSys(false); }
  }

  async function saveStore() {
    if (!store) return;
    setSavingStore(true);
    try {
      must(await supabase.from('stores').update({
        theme_color: d.theme_color,
        bg_from: d.custom_bg ? d.bg.bg_from : null, bg_to: d.custom_bg ? d.bg.bg_to : null, bg_angle: d.custom_bg ? d.bg.bg_angle : null,
        logo_url: d.logo_url ? displayableImageUrl(d.logo_url) : null,
        cover_image_url: d.cover_image_url ? displayableImageUrl(d.cover_image_url) : null,
        welcome_text: d.welcome_text.trim() || null,
      }).eq('id', store.id).select('id'));
      toast.ok(`บันทึกการตกแต่ง ${store.name} แล้ว`);
      await reloadStores();
    } catch (e) { toast.err((e as Error).message); } finally { setSavingStore(false); }
  }

  async function upload(kind: 'logo' | 'cover', f: File) {
    if (!store) return;
    setUploading(kind);
    try {
      const url = await uploadStoreFile(store, f, 'logo');
      setD((x) => ({ ...x, [kind === 'logo' ? 'logo_url' : 'cover_image_url']: url }));
      toast.ok('อัปโหลดแล้ว — กด “บันทึกการตกแต่งร้าน” เพื่อใช้งาน');
    } catch (e) { toast.err((e as Error).message); } finally { setUploading(null); }
  }

  if (pLoading && !platform) return <PageLoading />;
  const storeBg = d.custom_bg ? d.bg : sys;

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Palette className="h-5 w-5 text-brand-600" /> พื้นหลังทั้งระบบ (ค่าเริ่มต้น)</h2>
        <p className="mb-4 text-sm text-slate-500">ใช้กับหน้าเข้าสู่ระบบ หน้าผู้ดูแล และทุกร้านที่ไม่ได้ตั้งพื้นหลังของตัวเอง</p>
        <BackgroundEditor value={sys} onChange={setSys} />
        <div className="mt-4 h-16 rounded-2xl border border-slate-200" style={{ backgroundImage: gradientCss(sys) }} />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setSys(DEFAULT_BG)}><RotateCcw className="h-4 w-4" /> ค่าเดิม (ส้มพีช)</button>
          <button className="btn-primary" disabled={savingSys} onClick={saveSystem}>{savingSys ? <Spinner /> : <Save className="h-4 w-4" />} บันทึกพื้นหลังทั้งระบบ</button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Palette className="h-5 w-5 text-brand-600" /> ตกแต่งร้าน</h2>
        <p className="mb-4 text-sm text-slate-500">สีประจำร้าน พื้นหลัง โลโก้ ภาพปก และข้อความต้อนรับ ที่ลูกค้าเห็นบนหน้าเมนู QR / LINE และในระบบหลังร้าน</p>
        <ErrorBox error={sError} />
        {sLoading && !stores ? <PageLoading /> : !stores?.length ? <p className="text-sm text-slate-400">ยังไม่มีร้าน</p> : (
          <div className="space-y-5">
            <Field label="เลือกร้าน">
              <select className="input sm:w-80" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name} (/{s.slug})</option>)}
              </select>
            </Field>
            {store && <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="สีประจำร้าน" hint="ปุ่ม แถบหัว และราคาในหน้าร้าน">
                  <div className="flex items-center gap-2">
                    <input type="color" className="h-10 w-16 cursor-pointer rounded-lg border border-slate-200" value={d.theme_color} onChange={(e) => setD({ ...d, theme_color: e.target.value })} />
                    <input className="input" value={d.theme_color} onChange={(e) => setD({ ...d, theme_color: e.target.value })} pattern="#[0-9a-fA-F]{6}" />
                  </div>
                </Field>
                <Field label="ข้อความต้อนรับ" hint="แสดงใต้ชื่อร้านบนหน้าเมนูลูกค้า (ไม่เกิน 200 ตัวอักษร)">
                  <input className="input" maxLength={200} value={d.welcome_text} onChange={(e) => setD({ ...d, welcome_text: e.target.value })} placeholder="เช่น ยินดีต้อนรับค่ะ วันนี้มีเมนูพิเศษ!" />
                </Field>
                <ImageField label="โลโก้ร้าน" hint="รูปสี่เหลี่ยมจัตุรัสจะสวยที่สุด" value={d.logo_url}
                  onChange={(v) => setD({ ...d, logo_url: v })} onUpload={(f) => upload('logo', f)} uploading={uploading === 'logo'} />
                <ImageField label="ภาพปกหน้าร้าน" hint="ภาพแนวนอน เช่น หน้าร้าน/อาหารเด่น — แสดงเป็นแถบหัวหน้าเมนู" value={d.cover_image_url}
                  onChange={(v) => setD({ ...d, cover_image_url: v })} onUpload={(f) => upload('cover', f)} uploading={uploading === 'cover'} />
              </div>
              <div>
                <Toggle checked={d.custom_bg} onChange={(v) => setD({ ...d, custom_bg: v, bg: v ? d.bg : sys })} label="ใช้พื้นหลังเฉพาะร้านนี้ (ปิด = ใช้พื้นหลังทั้งระบบ)" />
                {d.custom_bg && <div className="mt-3"><BackgroundEditor value={d.bg} onChange={(bg) => setD({ ...d, bg })} /></div>}
              </div>
              <Preview bg={storeBg} theme={d.theme_color} store={{ ...store, logo_url: d.logo_url || null, cover_image_url: d.cover_image_url || null, welcome_text: d.welcome_text || null }} />
              <div className="flex justify-end">
                <button className="btn-primary" disabled={savingStore || !!uploading} onClick={saveStore}>{savingStore ? <Spinner /> : <Save className="h-4 w-4" />} บันทึกการตกแต่งร้าน</button>
              </div>
            </>}
          </div>
        )}
      </section>
    </div>
  );
}
