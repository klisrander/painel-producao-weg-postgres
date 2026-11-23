import "reflect-metadata";
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  Res,
  Inject,
  Module,
} from "@nestjs/common";
import { NestFactory, APP_GUARD } from "@nestjs/core";
import type { Response } from "express";
import { fileURLToPath } from "node:url";
import { Database } from "./db.js";
import { Operations } from "./service.js";
import {
  AccessGuard,
  CONFIG,
  Public,
  Require,
  type AuthRequest,
  type Config,
} from "./auth.js";
import { configuration } from "./config.js";
import { ApiErrors } from "./errors.js";
@Controller()
class Api {
  constructor(@Inject(Operations) private readonly ops: Operations) {}
  @Get("health/live") @Public() live() {
    return { status: "ok" };
  }
  @Get("health/ready") @Public() async ready() {
    await this.ops.db.organization.findFirst({ select: { id: true } });
    return { status: "ok" };
  }
  @Get("me") me(@Req() r: AuthRequest) {
    return r.principal;
  }
  @Get("tree") tree(@Req() r: AuthRequest) {
    return this.ops.tree(r.principal);
  }
  @Post("resources") @Require("organization.manage") resource(
    @Req() r: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.ops.createResource(r.principal, body);
  }
  @Put("translations") @Require("organization.manage") translation(
    @Req() r: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.ops.translate(r.principal, body);
  }
  @Get("targets") @Require("production.read") targets(
    @Req() r: AuthRequest,
    @Query("areaId") areaId: string,
    @Query("date") date: string,
  ) {
    return this.ops.targets(r.principal, areaId, date);
  }
  @Post("targets") @Require("targets.manage") target(
    @Req() r: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.ops.target(r.principal, body);
  }
  @Get("production") @Require("production.read") history(
    @Req() r: AuthRequest,
    @Query() q: unknown,
  ) {
    return this.ops.history(r.principal, q);
  }
  @Post("production") @Require("production.create") production(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.ops.production(r.principal, b);
  }
  @Put("production/:id") editProduction(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.ops.production(r.principal, b, id);
  }
  @Get("stops") @Require("stops.read") stops(
    @Req() r: AuthRequest,
    @Query() q: unknown,
  ) {
    return this.ops.history(r.principal, q, true);
  }
  @Post("stops") @Require("stops.create") stop(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.ops.stop(r.principal, b);
  }
  @Put("stops/:id") editStop(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.ops.stop(r.principal, b, id);
  }
  @Get("summary") @Require("production.read") summary(
    @Req() r: AuthRequest,
    @Query() q: unknown,
  ) {
    return this.ops.summary(r.principal, q);
  }
  @Get("export") @Require("reports.export") async export(
    @Req() r: AuthRequest,
    @Query() q: unknown,
    @Res() res: Response,
  ) {
    res
      .type("text/csv")
      .setHeader(
        "Content-Disposition",
        'attachment; filename="production.csv"',
      );
    res.send(await this.ops.export(r.principal, q));
  }
  @Get("plans") @Require("plans.read") plans(
    @Req() r: AuthRequest,
    @Query("areaId") a: string,
  ) {
    return this.ops.plans(r.principal, a);
  }
  @Post("plans") @Require("plans.manage") plan(
    @Req() r: AuthRequest,
    @Query("areaId") a: string,
    @Body() b: unknown,
  ) {
    return this.ops.plan(r.principal, a, b);
  }
  @Put("plans/:id") @Require("plans.manage") editPlan(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Query("areaId") a: string,
    @Body() b: unknown,
  ) {
    return this.ops.plan(r.principal, a, b, id);
  }
  @Get("plans/:id/projection") @Require("plans.read") projection(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.ops.projection(r.principal, id);
  }
  @Get("plans/:id/revisions") @Require("plans.read") revisions(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.ops.revisions(r.principal, id);
  }
  @Get("audit") @Require("audit.read") audit(
    @Req() r: AuthRequest,
    @Query("unitId") u: string,
    @Query("page") page: number,
  ) {
    return this.ops.audits(r.principal, u, page);
  }
  @Get("recipients") @Require("reports.email") recipients(
    @Req() r: AuthRequest,
    @Query("unitId") u: string,
  ) {
    return this.ops.recipients(r.principal, u);
  }
  @Put("recipients") @Require("reports.email") recipient(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.ops.recipient(r.principal, b);
  }
  @Post("reports") @Require("reports.email") report(
    @Req() r: AuthRequest,
    @Query() q: unknown,
  ) {
    return this.ops.report(r.principal, q);
  }
}
export async function createApp(config: Config = configuration()) {
  @Module({
    controllers: [Api],
    providers: [
      Database,
      Operations,
      { provide: CONFIG, useValue: config },
      { provide: APP_GUARD, useClass: AccessGuard },
    ],
  })
  class AppModule {}
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn"],
    bodyParser: false,
  });
  const { json } = await import("express");
  app.use(json({ limit: "512kb" }));
  app.use((_req: unknown, res: Response, next: () => void) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.useGlobalFilters(new ApiErrors());
  app.enableShutdownHooks();
  return app;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = configuration();
  const app = await createApp(config);
  await app.listen(config.port, "0.0.0.0");
}
