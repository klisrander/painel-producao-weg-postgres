import { readFileSync } from "node:fs";
import { mappingSchema } from "./policy.js";
const required = (key: string) => {
  const v = process.env[key];
  if (!v) throw Error(`Missing environment variable: ${key}`);
  return v;
};
export function configuration() {
  const issuer = required("OIDC_ISSUER");
  if (new URL(issuer).protocol !== "https:" && process.env.NODE_ENV !== "test")
    throw Error("HTTPS issuer required");
  const mapping = mappingSchema.parse(
    JSON.parse(readFileSync(required("ACCESS_MAPPING_FILE"), "utf8")),
  );
  const port = Number(process.env.PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("Invalid port");
  const introspection = process.env.OIDC_INTROSPECTION_ENABLED === "true";
  if (process.env.NODE_ENV === "production" && !introspection)
    throw Error("Corporate production requires token introspection");
  const introspectionClientId = introspection
      ? required("OIDC_INTROSPECTION_CLIENT_ID")
      : undefined,
    introspectionSecret = introspection
      ? required("OIDC_INTROSPECTION_CLIENT_SECRET")
      : undefined;
  return {
    introspection,
    introspectionClientId,
    introspectionSecret,
    issuer,
    audience: required("OIDC_API_AUDIENCE"),
    jwks:
      process.env.OIDC_JWKS_URL ||
      issuer.replace(/\/$/, "") + "/protocol/openid-connect/certs",
    mapping,
    port,
  };
}
