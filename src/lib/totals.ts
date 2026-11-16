import { round2 } from './format';

export interface TaxSettings {
  vat_registered: boolean;
  vat_rate: number;
  prices_include_vat: boolean;
  service_charge_rate: number;
}

/** Same arithmetic as public.recalc_order() in the database (keep in sync). */
export function computeTotals(s: TaxSettings, subtotal: number, discount = 0) {
  const base = Math.max(round2(subtotal - discount), 0);
  const service = round2((base * Number(s.service_charge_rate)) / 100);
  const rate = Number(s.vat_rate);
  let vat = 0;
  let total = base + service;
  if (s.vat_registered && rate > 0) {
    if (s.prices_include_vat) vat = round2((total * rate) / (100 + rate));
    else { vat = round2(((base + service) * rate) / 100); total = base + service + vat; }
  }
  return { subtotal: round2(subtotal), discount: round2(discount), service, vat, total: round2(total) };
}
