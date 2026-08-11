const STORAGE_KEY = 'capy.identity.v1';
const COOKIE_KEY = 'capy_identity';
const COOKIE_DAYS = 365;

/**
 * Who's playing. Persisted twice on purpose: localStorage is the primary, and a
 * same-site cookie survives the cases where site data gets cleared but cookies
 * don't (and vice versa). Either one alone is enough to skip the callsign
 * prompt on a return visit.
 */
export const identity = {
  load() {
    return readLocal() ?? readCookie();
  },

  save(record) {
    const value = {
      id: record.id,
      token: record.token,
      callsign: record.callsign,
      city: record.city ?? null,
      country: record.country ?? null,
      countryCode: record.countryCode ?? null,
      best: Math.max(0, Math.floor(record.best ?? 0))
    };
    writeLocal(value);
    writeCookie(value);
    return value;
  },

  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable — cookie removal below still applies */
    }
    document.cookie = `${COOKIE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
};

function valid(record) {
  return record && typeof record.id === 'string' && typeof record.callsign === 'string' ? record : null;
}

function readLocal() {
  try {
    return valid(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return null;
  }
}

function writeLocal(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* private mode / quota — the cookie copy carries the identity */
  }
}

function readCookie() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  if (!match) return null;
  try {
    const record = valid(JSON.parse(decodeURIComponent(match[1])));
    if (record) writeLocal(record); // heal the missing half
    return record;
  } catch {
    return null;
  }
}

function writeCookie(value) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  const encoded = encodeURIComponent(JSON.stringify(value));
  document.cookie =
    `${COOKIE_KEY}=${encoded}; Max-Age=${COOKIE_DAYS * 86400}; Path=/; SameSite=Lax${secure}`;
}
