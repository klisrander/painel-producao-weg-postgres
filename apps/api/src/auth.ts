import {
  Injectable,
  Inject,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  SetMetadata,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request } from "express";
import type { Principal, Permission } from "@panel/contracts";
import { principalFromClaims } from "./policy.js";
import { configuration } from "./config.js";
export type AuthRequest = Request & { principal: Principal };
export const Require = (permission: Permission) =>
  SetMetadata("permission", permission);
export const Public = () => SetMetadata("public", true);
export const CONFIG = Symbol("CONFIG");
export type Config = ReturnType<typeof configuration>;
@Injectable()
export class AccessGuard implements CanActivate {
  private readonly jwks;
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {
    const url = new URL(config.jwks);
    if (url.protocol !== "https:" && process.env.NODE_ENV !== "test")
      throw Error("HTTPS JWKS required");
    this.jwks = createRemoteJWKSet(url, {
      timeoutDuration: 5000,
      cooldownDuration: 30000,
    });
  }
  async canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride("public", [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || "");
    if (!match || match[1].length > 32768)
      throw new UnauthorizedException({ code: "unauthenticated" });
    try {
      const { payload } = await jwtVerify(match[1], this.jwks, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ["RS256", "PS256", "ES256"],
        requiredClaims: ["exp", "iat", "sub", "iss"],
      });
      if (this.config.introspection) {
        const result = await fetch(
          this.config.issuer.replace(/\/$/, "") +
            "/protocol/openid-connect/token/introspect",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization:
                "Basic " +
                Buffer.from(
                  encodeURIComponent(this.config.introspectionClientId!) +
                    ":" +
                    encodeURIComponent(this.config.introspectionSecret!),
                ).toString("base64"),
            },
            body: new URLSearchParams({
              token: match[1],
              token_type_hint: "access_token",
            }),
            signal: AbortSignal.timeout(5000),
          },
        );
        if (!result.ok)
          throw new ServiceUnavailableException({
            code: "service_unavailable",
          });
        if (((await result.json()) as { active?: boolean }).active !== true)
          throw Error("inactive_token");
      }
      req.principal = principalFromClaims(payload, this.config.mapping);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new UnauthorizedException({ code: "unauthenticated" });
    }
    const permission = this.reflector.getAllAndOverride<Permission>(
      "permission",
      [ctx.getHandler(), ctx.getClass()],
    );
    if (permission && !req.principal.permissions.includes(permission))
      throw new ForbiddenException({ code: "forbidden" });
    return true;
  }
}
