import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

/** Short two-tone chime (no audio file needed). */
export function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.3);
    });
  } catch { /* audio blocked until first tap */ }
}

/**
 * Subscribe to changes of a store's orders/items/bookings. Calls `onChange`
 * on every realtime event, and every `pollMs` as a fallback for flaky Wi-Fi.
 */
export function useStoreRealtime(storeId: string, onChange: () => void, pollMs = 20000) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    const ch = supabase.channel(`store-${storeId}-${Math.random().toString(36).slice(2)}`);
    for (const table of ['orders', 'order_items', 'bookings']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `store_id=eq.${storeId}` }, () => cb.current());
    }
    ch.subscribe();
    const t = setInterval(() => cb.current(), pollMs);
    return () => { clearInterval(t); void supabase.removeChannel(ch); };
  }, [storeId, pollMs]);
}

/** Number of customer-sent items (QR / LINE) waiting for staff to accept. Plays a chime when it grows. */
export function usePendingCount(storeId: string) {
  const [count, setCount] = useState(0);
  const last = useRef(0);
  const load = async () => {
    const { count: c } = await supabase.from('order_items').select('id', { count: 'exact', head: true })
      .eq('store_id', storeId).eq('status', 'pending');
    const n = c ?? 0;
    if (n > last.current) chime();
    last.current = n;
    setCount(n);
  };
  useEffect(() => { last.current = 0; void load(); }, [storeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useStoreRealtime(storeId, load);
  return count;
}
