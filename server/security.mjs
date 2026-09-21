import { createHmac, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code, message, retryAfter = null) { super(message); this.status = status; this.code = code; this.retryAfter = retryAfter; }
}
export const token = () => randomBytes(32).toString('base64url');
export const digest = (key, purpose, value) => createHmac('sha256', key).update(`${purpose}\0${value}`).digest('hex');
export function constantEqual(a, b) {
  const x = Buffer.from(String(a ?? '')); const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}
export function encrypt(key, plain) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}
export function decrypt(key, encoded) {
  const bytes = Buffer.from(encoded, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
}
export function normalizeEmail(value) {
  if (typeof value !== 'string') throw new HttpError(400, 'INVALID_EMAIL', '이메일 주소를 확인해주세요.');
  const email = value.trim();
  // Preserve local-part case and plus/dot aliases. The source service must resolve identity explicitly.
  if (email.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(email)) throw new HttpError(400, 'INVALID_EMAIL', '이메일 주소를 확인해주세요.');
  const at = email.lastIndexOf('@');
  return email.slice(0, at) + '@' + email.slice(at + 1).toLowerCase();
}
export function maskEmail(email) { const [local, domain] = email.split('@'); return `${local.slice(0, 1)}***@${domain}`; }
export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim().split(/=(.*)/s)).filter(v => /^[A-Za-z0-9_-]+$/.test(v[0])).map(([k, v]) => [k, v || '']));
}
export function assertId(id) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id || '')) throw new HttpError(404, 'NOT_FOUND', '해당 기록을 확인할 수 없어요.');
  return id;
}
export async function boundedBytes(response, max) {
  if (Number(response.headers.get('content-length')) > max) throw new Error('Response limit');
  let size = 0; const chunks = [];
  for await (const chunk of response.body ?? []) { size += chunk.length; if (size > max) throw new Error('Response limit'); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}
export function validImage(bytes, type) {
  if (type === 'image/jpeg') return bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type === 'image/webp') return bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
  return false;
}
