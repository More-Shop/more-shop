import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { applyTheme } from '@/lib/theme';
import type { PublicStore } from '@/lib/types';
import { useLoad } from '@/components/ui';

export function usePublicStore(slug: string | undefined) {
  const res = useLoad(async () => {
    const { data, error } = await supabase.rpc('public_store', { p_slug: slug });
    if (error) throw new Error(error.message);
    return (data as PublicStore | null) ?? null;
  }, [slug]);
  const store = res[0]?.store;
  useEffect(() => {
    if (store) { applyTheme(store.theme_color); document.title = store.name; }
  }, [store]);
  return res;
}
