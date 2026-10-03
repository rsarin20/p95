// Small, dependency-free validators shared by forms and APIs.

const BANNED = ["admin", "moderator", "walktober", "official", "fuck", "shit", "cunt", "nigger", "faggot", "bitch", "nazi"];

export function cleanName(raw: unknown, { min = 2, max = 24 } = {}): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(raw ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f\u200b\u200c\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (value.length < min) return { ok: false, error: `Use at least ${min} characters.` };
  if (value.length > max) return { ok: false, error: `Keep it to ${max} characters or fewer.` };
  if (!/^[\p{L}\p{N}\p{M} ._'’\-!&\p{Extended_Pictographic}\u200d]+$/u.test(value))
    return { ok: false, error: "Letters, numbers, spaces and a little punctuation only." };
  const lower = value.toLowerCase().replace(/[^a-z]/g, "");
  if (BANNED.some((b) => lower.includes(b))) return { ok: false, error: "Please pick a different name." };
  return { ok: true, value };
}

/** Parse a step count leniently: Shortcuts may send "12,345" or "12345.0". */
export function parseCount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\s,_]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s));
}

export const AVATARS = ["🚶", "🏃", "🏃‍♀️", "🚶‍♀️", "🦊", "🐻", "🦉", "🐿️", "🦔", "🐢", "🐇", "🦌", "🍂", "🍁", "🎃", "🌰", "🍄", "⛰️", "🌲", "⭐", "🔥", "⚡", "🌈", "🐕"];
export const TEAM_EMOJIS = ["🍂", "🍁", "🎃", "🦊", "🦉", "🐺", "🦌", "🐻", "🌲", "⛰️", "🔥", "⚡", "🚀", "🌪️", "🐝", "🦄", "🐙", "👟", "🏔️", "🌙"];
export const TEAM_COLORS = ["pumpkin", "maple", "gold", "forest", "plum", "sky"] as const;
export type TeamColor = (typeof TEAM_COLORS)[number];

export function isOneOf<T extends string>(v: unknown, list: readonly T[]): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}
