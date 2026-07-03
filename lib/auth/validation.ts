export type AuthMode = "login" | "signup";

export function parseAuthRequest(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const mode = body.mode === "login" || body.mode === "signup" ? body.mode : null;
  if (!mode || !/^\S+@\S+\.\S+$/.test(email) || email.length > 320) return null;
  return { email, mode };
}
