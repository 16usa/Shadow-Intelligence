import crypto from 'node:crypto';
import { id } from './utils.mjs';

const SCRYPT_KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, expectedHex] = String(stored).split(':');
    const actual = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch { return false; }
}

export function createSession(db, userId, ttlDays = 30) {
  const token = id('sess_');
  const expiresAt = new Date(Date.now() + ttlDays * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return { token, expiresAt };
}

export function deleteSession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function getUserFromSession(db, token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.email, u.display_name AS displayName, u.role, u.avatar, u.bio, u.x_handle AS xHandle, u.created_at AS createdAt
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, new Date().toISOString());
  return row || null;
}

export function setSessionCookie(res, token, maxAge = 2592000) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `si_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `si_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}
