// Per-device preferences (each tablet / counter can differ).
const get = (k: string, d: string) => { try { return localStorage.getItem(`moreshop.${k}`) ?? d; } catch { return d; } };
const set = (k: string, v: string) => { try { localStorage.setItem(`moreshop.${k}`, v); } catch { /* ignore */ } };

export const prefs = {
  autoPrintKitchen: () => get('autoPrintKitchen', '1') === '1',
  setAutoPrintKitchen: (v: boolean) => set('autoPrintKitchen', v ? '1' : '0'),
  autoPrintReceipt: () => get('autoPrintReceipt', '1') === '1',
  setAutoPrintReceipt: (v: boolean) => set('autoPrintReceipt', v ? '1' : '0'),
};
