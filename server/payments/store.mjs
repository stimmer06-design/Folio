/**
 * Storage for connections and payment links: a JSON key-value store with
 * optimistic concurrency (etags), so a webhook and a payer's return page that
 * update the same link at once can't overwrite each other.
 *
 *   blobStore(getStore(...))  Netlify Blobs (production)
 *   memoryStore()             tests and local development
 */

/** Netlify Blobs → the store interface. */
export function blobStore(store) {
  return {
    async get(key) {
      return (await store.get(key, { type: 'json' })) ?? null;
    },
    async getWithEtag(key) {
      const r = await store.getWithMetadata(key, { type: 'json' });
      return r ? { value: r.data, etag: r.etag } : null;
    },
    /** Write; with `onlyIfNew` or `onlyIfMatch` the write is conditional. Returns whether it happened. */
    async set(key, value, conditions = {}) {
      const r = await store.setJSON(key, value, conditions);
      return Boolean(r === undefined || r.modified !== false);
    },
    async delete(key) {
      await store.delete(key);
    },
    async list(prefix) {
      const { blobs } = await store.list({ prefix });
      return blobs.map((b) => b.key);
    },
  };
}

/** In-memory store with the same semantics (etags change on every write). */
export function memoryStore() {
  const data = new Map();
  let version = 0;
  const copy = (v) => JSON.parse(JSON.stringify(v));
  return {
    data,
    async get(key) {
      return data.has(key) ? copy(data.get(key).value) : null;
    },
    async getWithEtag(key) {
      return data.has(key) ? { value: copy(data.get(key).value), etag: data.get(key).etag } : null;
    },
    async set(key, value, { onlyIfNew, onlyIfMatch } = {}) {
      if (onlyIfNew && data.has(key)) return false;
      if (onlyIfMatch && (!data.has(key) || data.get(key).etag !== onlyIfMatch)) return false;
      version += 1;
      data.set(key, { value: copy(value), etag: `"m${version}"` });
      return true;
    },
    async delete(key) {
      data.delete(key);
    },
    async list(prefix = '') {
      return [...data.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}

/**
 * Read-modify-write with retries. `fn` gets the current value and returns the
 * new one (or undefined to leave it unchanged). Returns the stored value.
 */
export async function update(store, key, fn, { attempts = 6 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const cur = await store.getWithEtag(key);
    if (!cur) return null;
    const next = await fn(structuredClone(cur.value));
    if (next === undefined) return cur.value;
    if (await store.set(key, next, { onlyIfMatch: cur.etag })) return next;
  }
  throw new Error(`Could not update ${key}: too many concurrent changes`);
}
