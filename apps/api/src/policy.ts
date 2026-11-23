import { z } from "zod";
import { permissions, type Permission, type Principal } from "@panel/contracts";
import type { JWTPayload } from "jose";
const grant = z
  .object({
    role: z.string().min(1),
    groups: z.array(z.string()).min(1),
    permissions: z.array(z.enum(permissions)).min(1),
    global: z.boolean().default(false),
  })
  .strict();
export const mappingSchema = z
  .object({
    clientId: z.string().min(1),
    groupsClaim: z.string().min(1),
    scopeClaim: z.string().min(1),
    grants: z.array(grant),
  })
  .strict();
export type AccessMapping = z.infer<typeof mappingSchema>;
const path = (obj: unknown, key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (o, k) =>
        o &&
        typeof o === "object" &&
        !["__proto__", "constructor", "prototype"].includes(k)
          ? (o as Record<string, unknown>)[k]
          : undefined,
      obj,
    );
const strings = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
export function principalFromClaims(
  c: JWTPayload,
  map: AccessMapping,
): Principal {
  if (!c.iss || !c.sub) throw Error("invalid_identity");
  const roles = [
    ...new Set([
      ...strings(path(c, "realm_access.roles")),
      ...strings(path(c, `resource_access.${map.clientId}.roles`)),
    ]),
  ];
  const groups = strings(path(c, map.groupsClaim)),
    scopes = strings(path(c, map.scopeClaim));
  const grants = map.grants.filter(
    (g) =>
      roles.includes(g.role) &&
      g.groups.every((group) => groups.includes(group)),
  );
  const global = scopes.includes("*") && grants.some((g) => g.global);
  return {
    issuer: c.iss,
    subject: c.sub,
    name: String(c.name || c.preferred_username || c.sub).slice(0, 160),
    roles,
    groups,
    scopes: scopes.filter((s) => s !== "*"),
    global,
    permissions: [...new Set(grants.flatMap((g) => g.permissions))],
  };
}
export const can = (p: Principal, permission: Permission) =>
  p.permissions.includes(permission);
export const inUnit = (p: Principal, key: string) =>
  p.global || p.scopes.includes(key);
