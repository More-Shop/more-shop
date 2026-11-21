import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save, ToggleLeft } from 'lucide-react';
import { supabase, must } from '@/lib/supabase';
import { FEATURES, FEATURE_GROUPS, isOn, type FeatureKey, type FeatureMap } from '@/lib/features';
import { ErrorBox, Field, PageLoading, Spinner, Toggle, toast, useLoad } from '@/components/ui';

type StoreRow = { id: string; name: string; slug: string; features: FeatureMap | null };
type Choice = 'default' | 'on' | 'off';

/** Admin: switch each accounting & tax function on/off — system default and per store. */
export default function FeaturesTab() {
  const [defaults, dLoading, dError, reloadDefaults] = useLoad(async () =>
    (must(await supabase.rpc('platform_features')) as FeatureMap | null) ?? {}, []);
  const [def, setDef] = useState<FeatureMap>({});
  useEffect(() => { if (defaults) setDef(defaults); }, [defaults]);
  const [savingDef, setSavingDef] = useState(false);

  const [stores, sLoading, sError, reloadStores] = useLoad(async () =>
    must(await supabase.from('stores').select('id, name, slug, features').order('name')) as StoreRow[], []);
  const [storeId, setStoreId] = useState('');
  useEffect(() => { if (!storeId && stores?.length) setStoreId(stores[0].id); }, [stores, storeId]);
  const store = stores?.find((s) => s.id === storeId) ?? null;
  const [over, setOver] = useState<FeatureMap>({});
  useEffect(() => { setOver(store?.features ?? {}); }, [store?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [savingStore, setSavingStore] = useState(false);

  const offCount = useMemo(() => FEATURES.filter((f) => !isOn(f.key, defaults, null)).length, [defaults]);

  async function saveDefaults() {
    setSavingDef(true);
    try {
      // store only the switched-off ones; missing = on
      const payload = Object.fromEntries(FEATURES.filter((f) => def[f.key] === false).map((f) => [f.key, false]));
      must(await supabase.rpc('admin_set_default_features', { p_features: payload }));
      toast.ok('บันทึกค่าเริ่มต้นแล้ว — มีผลกับทุกร้านที่ไม่ได้ตั้งเฉพาะ');
      await reloadDefaults();
    } catch (e) { toast.err((e as Error).message); } finally { setSavingDef(false); }
  }
  async function saveStore() {
    if (!store) return;
    setSavingStore(true);
    try {
      must(await supabase.rpc('admin_set_store_features', { p_store: store.id, p_features: over }));
      toast.ok(`บันทึกฟีเจอร์ของ ${store.name} แล้ว — ร้านจะเห็นผลเมื่อรีเฟรชหน้า`);
      await reloadStores();
    } catch (e) { toast.err((e as Error).message); } finally { setSavingStore(false); }
  }

  const choiceOf = (k: FeatureKey): Choice => (over[k] === true ? 'on' : over[k] === false ? 'off' : 'default');
  const setChoice = (k: FeatureKey, c: Choice) => setOver((o) => {
    const n = { ...o };
    if (c === 'default') delete n[k]; else n[k] = c === 'on';
    return n;
  });

  if ((dLoading && !defaults) || (sLoading && !stores)) return <PageLoading />;

  return (
    <div className="space-y-5">
      <ErrorBox error={dError || sError} />
      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold"><ToggleLeft className="h-5 w-5 text-brand-600" /> ค่าเริ่มต้นสำหรับทุกร้าน</h2>
        <p className="mb-4 text-sm text-slate-500">ฟังก์ชันของระบบบัญชีและภาษีที่ร้านทั่วไปจะเห็น — ปิดอยู่ {offCount} จาก {FEATURES.length} ฟังก์ชัน</p>
        <div className="space-y-5">
          {FEATURE_GROUPS.map((g) => (
            <div key={g}>
              <div className="mb-2 text-sm font-bold text-slate-600">{g}</div>
              <div className="grid gap-2 md:grid-cols-2">
                {FEATURES.filter((f) => f.group === g).map((f) => (
                  <div key={f.key} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3">
                    <div className="min-w-0"><div className="font-semibold">{f.label}</div><div className="text-xs text-slate-500">{f.desc}</div></div>
                    <Toggle checked={def[f.key] !== false} onChange={(v) => setDef((d) => ({ ...d, [f.key]: v }))} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setDef({})}><RotateCcw className="h-4 w-4" /> เปิดทั้งหมด</button>
          <button className="btn-primary" disabled={savingDef} onClick={saveDefaults}>{savingDef ? <Spinner /> : <Save className="h-4 w-4" />} บันทึกค่าเริ่มต้น</button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold"><ToggleLeft className="h-5 w-5 text-brand-600" /> ตั้งเฉพาะร้าน</h2>
        <p className="mb-4 text-sm text-slate-500">“ตามค่าเริ่มต้น” = ใช้ค่าด้านบน · เลือก “เปิด” หรือ “ปิด” เพื่อให้ร้านนี้ต่างจากร้านอื่น</p>
        {!stores?.length ? <p className="text-sm text-slate-400">ยังไม่มีร้าน</p> : <>
          <Field label="เลือกร้าน" className="mb-4">
            <select className="input sm:w-80" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name} (/{s.slug})</option>)}
            </select>
          </Field>
          <div className="space-y-5">
            {FEATURE_GROUPS.map((g) => (
              <div key={g}>
                <div className="mb-2 text-sm font-bold text-slate-600">{g}</div>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
                  {FEATURES.filter((f) => f.group === g).map((f) => {
                    const c = choiceOf(f.key);
                    const effective = isOn(f.key, defaults, over);
                    return (
                      <div key={f.key} className="flex flex-wrap items-center gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">{f.label}
                            <span className={`badge ml-2 ${effective ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>{effective ? 'เปิด' : 'ปิด'}</span>
                          </div>
                          <div className="text-xs text-slate-500">{f.desc}</div>
                        </div>
                        <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
                          {(['default', 'on', 'off'] as Choice[]).map((x) => (
                            <button key={x} type="button" onClick={() => setChoice(f.key, x)}
                              className={`rounded-lg px-3 py-1.5 font-semibold ${c === x ? 'bg-white shadow' : 'text-slate-500'}`}>
                              {x === 'default' ? `ตามค่าเริ่มต้น (${isOn(f.key, defaults, null) ? 'เปิด' : 'ปิด'})` : x === 'on' ? 'เปิด' : 'ปิด'}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setOver({})}><RotateCcw className="h-4 w-4" /> ใช้ค่าเริ่มต้นทั้งหมด</button>
            <button className="btn-primary" disabled={savingStore} onClick={saveStore}>{savingStore ? <Spinner /> : <Save className="h-4 w-4" />} บันทึกฟีเจอร์ของร้านนี้</button>
          </div>
        </>}
      </section>
    </div>
  );
}
