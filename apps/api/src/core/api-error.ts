import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Application error with a stable machine-readable code.
 * The GlobalExceptionFilter serializes it as { statusCode, message, code, details }.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super({ statusCode: status, message, code, details }, status);
  }

  static notFound(message = "המשאב לא נמצא", code = "NOT_FOUND"): AppException {
    return new AppException(HttpStatus.NOT_FOUND, message, code);
  }

  static forbidden(message = "אין לך הרשאה לבצע פעולה זו", code = "FORBIDDEN"): AppException {
    return new AppException(HttpStatus.FORBIDDEN, message, code);
  }

  static badRequest(message: string, code = "BAD_REQUEST", details?: unknown): AppException {
    return new AppException(HttpStatus.BAD_REQUEST, message, code, details);
  }

  static conflict(message: string, code = "CONFLICT", details?: unknown): AppException {
    return new AppException(HttpStatus.CONFLICT, message, code, details);
  }

  static unauthorized(message = "נדרשת התחברות", code = "UNAUTHORIZED"): AppException {
    return new AppException(HttpStatus.UNAUTHORIZED, message, code);
  }
}
