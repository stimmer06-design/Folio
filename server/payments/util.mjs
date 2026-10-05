/**
 * Small helpers shared by the payments server: identifiers, connection keys,
 * HTTP responses and errors. Node only (runs in a Netlify Function).
 */
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/** A random URL-safe identifier: `bytes` of entropy (16 → 22 characters). */
export const randomId = (bytes = 16) => randomBytes(bytes).toString('base64url');

/**
 * A lower-case identifier that is easy to read off paper and type: Crockford's
 * base32 alphabet (no i, l, o or u). 20 characters carry 100 bits of entropy.
 */
const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz';
export function readableId(length = 20) {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += CROCKFORD[bytes[i] & 31];
  return out;
}

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('base64url');

/**
 * Connection keys look like `fpc_<connection id>.<secret>`. The browser keeps
 * the whole key; the server stores only a hash of the secret, so a leaked
 * store does not leak working keys.
 */
export function newConnectionKey(connectionId) {
  const secret = randomId(32);
  return { key: `fpc_${connectionId}.${secret}`, hash: sha256(secret) };
}

export function parseConnectionKey(key) {
  const m = /^fpc_([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{32,128})$/.exec(String(key || ''));
  return m ? { connectionId: m[1], secret: m[2] } : null;
}

export function sameHash(secret, hash) {
  const a = Buffer.from(sha256(secret));
  const b = Buffer.from(String(hash || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** An error with an HTTP status and a message that is safe to show the user. */
export class HttpError extends Error {
  constructor(status, message, code = undefined) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE, ...headers } });
}

export function redirect(location, status = 303) {
  return new Response(null, { status, headers: { Location: location, ...NO_STORE } });
}

export const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Read a JSON request body (application/json, at most `limit` bytes). */
export async function readJson(req, limit = 64 * 1024) {
  const type = req.headers.get('content-type') || '';
  if (!/^application\/json\b/i.test(type)) throw new HttpError(415, 'Send JSON.');
  const text = await req.text();
  if (text.length > limit) throw new HttpError(413, 'That request is too large.');
  try {
    const data = JSON.parse(text || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not an object');
    return data;
  } catch {
    throw new HttpError(400, 'That request is not valid JSON.');
  }
}

export const isoNow = (now) => new Date(now()).toISOString();
export const DAY = 24 * 60 * 60 * 1000;

/** Trim a user-supplied string to one line of at most `max` characters. */
export function clip(value, max) {
  const s = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
