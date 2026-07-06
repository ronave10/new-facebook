import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";
import { ZodError, ZodType } from "zod";
import { AppException } from "./api-error";

/**
 * Per-route zod validation: @Body(new ZodValidationPipe(schema)).
 * Returns the PARSED value (with defaults/coercions applied).
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw AppException.badRequest(
          "קלט לא תקין",
          "VALIDATION_ERROR",
          err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      throw err;
    }
  }
}
