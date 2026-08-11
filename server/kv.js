/**
 * Minimal Upstash Redis REST client.
 *
 * Serverless functions have no shared memory and no writable disk, so the
 * leaderboard has to live outside the process. This speaks the REST dialect
 * used by both Vercel KV and Upstash directly — plain HTTPS, no dependency, no
 * connection pool to leak across cold starts.
 */
const TIMEOUT_MS = 4000;

/** Reads whichever env var pair the host provided; null when none is set. */
export function kvFromEnv(env = process.env) {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL ?? null;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN ?? null;
  return url && token ? new Kv(url.replace(/\/+$/, ''), token) : null;
}

export class Kv {
  constructor(url, token) {
    this.url = url;
    this.token = token;
  }

  async #post(path, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.url}${path}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? `KV request failed (${res.status})`);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /** One command: `kv.run('GET', 'key')`. */
  async run(...command) {
    const data = await this.#post('', command.map(String));
    if (data?.error) throw new Error(data.error);
    return data?.result ?? null;
  }

  /** Several commands in one round trip; returns results in order. */
  async pipeline(commands) {
    if (!commands.length) return [];
    const data = await this.#post('/pipeline', commands.map((c) => c.map(String)));
    if (!Array.isArray(data)) throw new Error(data?.error ?? 'malformed KV pipeline response');
    return data.map((entry) => {
      if (entry?.error) throw new Error(entry.error);
      return entry?.result ?? null;
    });
  }
}
