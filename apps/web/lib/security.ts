import { createHash, randomBytes } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
export const random = () => randomBytes(32).toString("base64url");
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
function key() {
  const k = Buffer.from(process.env.SESSION_ENCRYPTION_KEY || "", "base64url");
  if (k.length !== 32)
    throw Error("SESSION_ENCRYPTION_KEY must contain 32 random bytes");
  return k;
}
export async function seal(value: Record<string, unknown>, seconds: number) {
  return new EncryptJWT(value)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + seconds)
    .encrypt(key());
}
export async function unseal<T>(value: string): Promise<T> {
  const { payload } = await jwtDecrypt(value, key(), {
    keyManagementAlgorithms: ["dir"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });
  return payload as T;
}
export function appOrigin() {
  const u = new URL(process.env.APP_URL || "http://localhost:3000");
  if (process.env.NODE_ENV === "production" && u.protocol !== "https:")
    throw Error("APP_URL must use HTTPS");
  return u.origin;
}
export function sameOrigin(req: Request) {
  return (
    req.headers.get("origin") === appOrigin() &&
    !["cross-site", "none"].includes(
      req.headers.get("sec-fetch-site") || "same-origin",
    )
  );
}
export const secure = () => process.env.NODE_ENV === "production";
export const cookieName = () => (secure() ? "__Host-panel" : "panel");
export function cookie(req: Request, name = cookieName()) {
  const raw = (req.headers.get("cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
  return raw && /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : null;
}
export function cookieHeader(name: string, value: string, seconds: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure() ? "; Secure" : ""}`;
}
