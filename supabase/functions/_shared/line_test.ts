import { assert, assertFalse } from 'jsr:@std/assert@1';
import { verifySignature } from './line.ts';

Deno.test('verifySignature accepts a valid LINE signature and rejects tampering', async () => {
  const secret = 'test-channel-secret';
  const body = '{"events":[]}';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))));
  assert(await verifySignature(secret, body, sig));
  assertFalse(await verifySignature(secret, body + ' ', sig));
  assertFalse(await verifySignature(secret, body, null));
});
