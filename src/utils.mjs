import crypto from 'node:crypto';

export const nowIso = () => new Date().toISOString();
export const id = (prefix = '') => `${prefix}${crypto.randomUUID()}`;
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
export const cleanEmail = (value) => clean(value, 254).toLowerCase();
export const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store'
  });
  res.end(payload);
};
export const parseCookies = (req) => Object.fromEntries(
  String(req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const idx = part.indexOf('=');
    return [decodeURIComponent(part.slice(0, idx).trim()), decodeURIComponent(part.slice(idx + 1).trim())];
  })
);
export async function readJson(req, maxBytes = 1_500_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Payload too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 }); }
}
export const maskWallet = (wallet) => {
  const s = String(wallet || '');
  return s.length <= 12 ? s : `${s.slice(0, 5)}…${s.slice(-5)}`;
};
export const isSafeHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:');
  } catch { return false; }
};

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function decodeBase58(value) {
  const text = String(value || '').trim();
  if (!text) return Buffer.alloc(0);
  let bytes = [0];
  for (const ch of text) {
    const digit = BASE58_ALPHABET.indexOf(ch);
    if (digit < 0) throw new Error('Invalid base58 character');
    let carry = digit;
    for (let i = 0; i < bytes.length; i++) {
      const n = bytes[i] * 58 + carry;
      bytes[i] = n & 0xff;
      carry = n >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < text.length - 1 && text[i] === '1'; i++) bytes.push(0);
  return Buffer.from(bytes.reverse());
}
export function isSolanaAddress(value) {
  try {
    const text = String(value || '').trim();
    return text.length >= 32 && text.length <= 44 && decodeBase58(text).length === 32;
  } catch { return false; }
}
