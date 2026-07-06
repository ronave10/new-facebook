import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { ZodError } from "zod";
import { MetaApiError, META_ERROR_MESSAGES_HE } from "@campaignos/meta";

/**
 * Serializes every error to the shared ApiError shape:
 * { statusCode, message, code?, details? } — message is user-facing Hebrew
 * wherever we control it.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = {
      statusCode: status,
      message: "אירעה שגיאה בלתי צפויה",
      code: "INTERNAL_ERROR",
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      body =
        typeof res === "object" && res !== null
          ? { statusCode: status, ...(res as object) }
          : { statusCode: status, message: String(res) };
    } else if (exception instanceof MetaApiError) {
      status = exception.code === "TOKEN_EXPIRED" ? 401 : exception.retryable ? 503 : 502;
      body = {
        statusCode: status,
        message: META_ERROR_MESSAGES_HE[exception.code],
        code: `META_${exception.code}`,
        details: { graphCode: exception.graphCode, graphSubcode: exception.graphSubcode },
      };
    } else if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      body = {
        statusCode: status,
        message: "קלט לא תקין",
        code: "VALIDATION_ERROR",
        details: exception.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      };
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled error on ${request?.method} ${request?.url}: ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).json(body);
  }
}
