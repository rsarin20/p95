const TIMEOUT_MS = 6000;

export class ApiError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    /**
     * The caller should fall back to local-only play. True for network-level
     * failures, and for a deploy that simply has no leaderboard store wired up
     * — that isn't an error the player can do anything about, so it should not
     * stand between them and the game.
     */
    this.offline = status === 0 || code === 'no-store';
  }
}

async function request(path, { method = 'GET', body, token } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(path, {
      method,
      signal: controller.signal,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    const data = text ? safeParse(text) : {};

    if (!res.ok) {
      throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data?.code);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.name === 'AbortError' ? 'Server timed out' : 'Cannot reach the river', 0);
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  createSession: (callsign) => request('/api/session', { method: 'POST', body: { callsign } }),

  touchSession: ({ id, token, callsign }) =>
    request('/api/session', { method: 'PATCH', token, body: { id, ...(callsign ? { callsign } : {}) } }),

  postScore: ({ id, token, score, durationMs }) =>
    request('/api/score', { method: 'POST', token, body: { id, score, durationMs } }),

  leaderboard: (id) => request(`/api/leaderboard${id ? `?id=${encodeURIComponent(id)}` : ''}`)
};
