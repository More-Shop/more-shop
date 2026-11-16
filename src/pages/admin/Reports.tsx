import { useMemo, useState } from 'react';
import { Download, FileText, Printer } from 'lucide-react';
import { supabase, must } from '@/lib/supabase';
import { useCurrentStore } from '@/lib/store';
import { todayISO } from '@/lib/format';
import { downloadCsv } from '@/lib/csv';
import { esc, printHtml } from '@/lib/print';
import { REPORTS, buildReport, fmtCell, reportToCsv, type Report, type ReportKey } from '@/lib/reports';
import type { Account, LedgerEntry } from '@/lib/types';
import { ErrorBox, Field, PageHeader, PageLoading, useLoad } from '@/components/ui';
import { MonthPicker, monthRange } from './Ledger';

function reportHtml(r: Report) {
  return `
    <h1>${esc(r.title)}</h1>
    <div style="text-align:center;margin-bottom:4mm">${esc(r.subtitle)}</div>
    <div class="meta">${r.meta.map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join('')}</div>
    <table>
      <thead><tr>${r.columns.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${r.rows.map((row, i) => `<tr${r.emphasis?.includes(i) ? ' style="font-weight:700;background:#fafafa"' : ''}>${row.map((c, j) =>
        `<td class="${r.columns[j]?.num ? 'num' : ''}">${esc(fmtCell(c, r.columns[j]?.num))}</td>`).join('')}</tr>`).join('')}</tbody>
      ${r.footer ? `<tfoot><tr>${r.footer.map((c, j) => `<td class="${r.columns[j]?.num ? 'num' : ''}">${esc(fmtCell(c, r.columns[j]?.num))}</td>`).join('')}</tr></tfoot>` : ''}
    </table>
    ${(r.notes ?? []).map((n) => `<p style="font-size:9pt;margin:2mm 0 0">${esc(n)}</p>`).join('')}
    ${r.signatures ? `<div class="sign">${r.signatures.map((s) => `<div>ลงชื่อ ..................................................<br>(..................................................)<br>${esc(s)}<br>วันที่ ........../........../..........</div>`).join('')}</div>` : ''}`;
}

export default function Reports() {
  const { store } = useCurrentStore();
  const [mode, setMode] = useState<'month' | 'year' | 'custom'>('month');
  const [ym, setYm] = useState(todayISO(store.timezone).slice(0, 7));
  const [year, setYear] = useState(new Date().getFullYear());
  const [custom, setCustom] = useState({ from: `${todayISO(store.timezone).slice(0, 7)}-01`, to: todayISO(store.timezone) });
  const [key, setKey] = useState<ReportKey>(store.vat_registered ? 'sales_vat' : 'cashbook');

  const { from, to } = mode === 'month' ? monthRange(ym) : mode === 'year' ? { from: `${year}-01-01`, to: `${year}-12-31` } : custom;

  const [data, loading, error] = useLoad(async () => {
    const [e, a] = await Promise.all([
      supabase.from('ledger_entries').select('*').eq('store_id', store.id).gte('entry_date', from).lte('entry_date', to).order('entry_date').limit(20000),
      supabase.from('accounts').select('*').eq('store_id', store.id).order('code'),
    ]);
    return { entries: must(e) as LedgerEntry[], accounts: must(a) as Account[] };
  }, [store.id, from, to]);

  const report = useMemo(() => (data ? buildReport(key, store, data.entries, data.accounts, from, to) : null), [data, key, store, from, to]);
  const available = REPORTS.filter((r) => !r.vatOnly || store.vat_registered);
  const fileName = `${store.slug}-${key}-${from}_${to}`;

  return (
    <div>
      <PageHeader title="รายงานบัญชีและภาษี" subtitle="พิมพ์เป็น PDF (A4) เพื่อยื่นสรรพากร หรือดาวน์โหลด CSV เปิดใน Excel ส่งสำนักงานบัญชี"
        actions={report && <>
          <button className="btn-secondary" onClick={() => downloadCsv(fileName, reportToCsv(report))}><Download className="h-4 w-4" /> CSV / Excel</button>
          <button className="btn-primary" onClick={() => printHtml(reportHtml(report), 'A4', fileName)}><Printer className="h-4 w-4" /> พิมพ์ / PDF</button>
        </>} />
      <div className="mb-4 grid gap-3 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-2">
          {available.map((r) => (
            <button key={r.key} onClick={() => setKey(r.key)}
              className={`card w-full p-3 text-left transition ${key === r.key ? 'border-brand-500 ring-2 ring-brand-100' : 'hover:border-slate-300'}`}>
              <div className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-brand-600" />{r.label}</div>
              <div className="mt-0.5 text-xs text-slate-500">{r.desc}</div>
            </button>
          ))}
          {!store.vat_registered && <p className="px-1 text-xs text-slate-400">รายงานภาษีซื้อ/ขายจะแสดงเมื่อเปิด “จดทะเบียน VAT” ในตั้งค่าร้าน</p>}
        </div>
        <div className="min-w-0">
          <div className="card mb-3 flex flex-wrap items-end gap-3 p-3">
            <div className="flex rounded-xl bg-slate-100 p-1">
              {([['month', 'รายเดือน'], ['year', 'รายปี'], ['custom', 'กำหนดเอง']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setMode(k)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${mode === k ? 'bg-white shadow' : 'text-slate-500'}`}>{l}</button>
              ))}
            </div>
            {mode === 'month' && <MonthPicker value={ym} onChange={setYm} />}
            {mode === 'year' && (
              <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>พ.ศ. {y + 543}</option>)}
              </select>
            )}
            {mode === 'custom' && <>
              <Field label="ตั้งแต่"><input type="date" className="input" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field>
              <Field label="ถึง"><input type="date" className="input" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></Field>
            </>}
          </div>
          <ErrorBox error={error} />
          {loading && !report ? <PageLoading /> : report && (
            <div className="card overflow-x-auto p-4">
              <h2 className="text-center text-lg font-bold">{report.title}</h2>
              <p className="mb-3 text-center text-sm text-slate-500">{report.subtitle}</p>
              <div className="mb-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {report.meta.map(([k, v]) => <div key={k}><span className="text-slate-500">{k}:</span> {v}</div>)}
              </div>
              <table className="table-std">
                <thead><tr>{report.columns.map((c) => <th key={c.label} className={c.num ? 'text-right' : ''}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {report.rows.length === 0 && <tr><td colSpan={report.columns.length} className="py-8 text-center text-slate-400">ไม่มีรายการในช่วงนี้</td></tr>}
                  {report.rows.map((row, i) => (
                    <tr key={i} className={report.emphasis?.includes(i) ? 'bg-slate-50 font-semibold' : ''}>
                      {row.map((c, j) => <td key={j} className={`${report.columns[j]?.num ? 'whitespace-nowrap text-right' : ''} ${j === 0 ? 'whitespace-pre' : ''}`}>{fmtCell(c, report.columns[j]?.num)}</td>)}
                    </tr>
                  ))}
                </tbody>
                {report.footer && (
                  <tfoot><tr className="bg-slate-50 font-bold">{report.footer.map((c, j) => <td key={j} className={`px-3 py-2 ${report.columns[j]?.num ? 'text-right' : ''}`}>{fmtCell(c, report.columns[j]?.num)}</td>)}</tr></tfoot>
                )}
              </table>
              {report.notes?.map((n) => <p key={n} className="mt-2 text-xs text-slate-500">{n}</p>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
