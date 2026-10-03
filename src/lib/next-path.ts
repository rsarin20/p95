/** Only allow same-site relative paths as post-login destinations. */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw.slice(0, 200);
}
