import {
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { ZodError } from "zod";
@Catch()
export class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const parserType = (error as { type?: string })?.type;
    if (parserType === "entity.too.large")
      return res.status(413).json({ code: "payload_too_large" });
    if (parserType === "entity.parse.failed")
      return res.status(400).json({ code: "validation_failed" });
    if (error instanceof ZodError)
      return res.status(400).json({
        code: "validation_failed",
        details: error.issues.map((i) => ({
          path: i.path.join("."),
          code: i.code,
          message:
            i.message.startsWith("invalid_") || i.message.endsWith("_required")
              ? i.message
              : undefined,
        })),
      });
    if (error instanceof HttpException)
      return res
        .status(error.getStatus())
        .json(
          typeof error.getResponse() === "object"
            ? error.getResponse()
            : { code: "request_failed" },
        );
    const code = (error as { code?: string })?.code;
    if (["P2002", "P2034", "P2025"].includes(code || ""))
      return res.status(409).json({ code: "revision_conflict" });
    if (["P2003", "P2004", "P2010"].includes(code || ""))
      return res.status(400).json({ code: "invalid_relationship" });
    console.error(
      JSON.stringify({
        event: "request_error",
        code: code || "internal_error",
      }),
    );
    return res.status(500).json({ code: "internal_error" });
  }
}
