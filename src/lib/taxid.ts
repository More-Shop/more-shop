/** Thai 13-digit tax / citizen ID checksum. */
export function isValidThaiTaxId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

export const formatTaxId = (id: string | null | undefined) =>
  id && id.length === 13 ? `${id[0]}-${id.slice(1, 5)}-${id.slice(5, 10)}-${id.slice(10, 12)}-${id[12]}` : id ?? '';
