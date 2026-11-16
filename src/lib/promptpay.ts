// PromptPay QR (EMVCo merchant-presented, Thai QR Payment standard).

function tlv(id: string, value: string) {
  return id + String(value.length).padStart(2, '0') + value;
}

export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * @param target mobile number (0812345678), citizen/tax id (13 digits) or e-wallet id (15 digits)
 * @param amount optional fixed amount in THB
 */
export function promptPayPayload(target: string, amount?: number): string {
  const id = target.replace(/[^0-9]/g, '');
  let acc: string;
  if (id.length >= 15) acc = tlv('03', id);
  else if (id.length >= 13) acc = tlv('02', id);
  else acc = tlv('01', ('0000000000000' + id.replace(/^0/, '66')).slice(-13));

  const merchant = tlv('00', 'A000000677010111') + acc;
  let payload = tlv('00', '01') + tlv('01', amount ? '12' : '11') + tlv('29', merchant) +
    tlv('53', '764') + tlv('58', 'TH');
  if (amount && amount > 0) payload += tlv('54', amount.toFixed(2));
  payload += '6304';
  return payload + crc16(payload);
}
