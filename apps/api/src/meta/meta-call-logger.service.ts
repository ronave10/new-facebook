import { Injectable } from "@nestjs/common";
import { MetaApiError } from "@campaignos/meta";
import { CryptoService } from "../core/crypto.service";
import { PrismaService } from "../core/prisma.service";

export interface MetaCallMeta {
  organizationId: string;
  connectionId?: string;
  operation: string;
  isWrite?: boolean;
  approvalId?: string;
  requestInfo?: unknown;
}

/**
 * Wraps every Meta connector call: records a meta_api_call_logs row and, on a
 * TOKEN_EXPIRED error, flips the connection to NEEDS_RECONNECT.
 */
@Injectable()
export class MetaCallLogger {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async wrap<T>(meta: MetaCallMeta, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      await this.record(meta, start, true, undefined, 200);
      return result;
    } catch (err) {
      const isTokenExpired = err instanceof MetaApiError && err.code === "TOKEN_EXPIRED";
      const httpStatus = err instanceof MetaApiError ? err.httpStatus : undefined;
      await this.record(meta, start, false, (err as Error).message, httpStatus);
      if (isTokenExpired && meta.connectionId) {
        await this.prisma.metaConnection.update({
          where: { id: meta.connectionId },
          data: { status: "NEEDS_RECONNECT", lastError: (err as Error).message },
        });
      }
      throw err;
    }
  }

  private async record(
    meta: MetaCallMeta,
    start: number,
    success: boolean,
    error: string | undefined,
    responseCode: number | undefined,
  ): Promise<void> {
    await this.prisma.metaApiCallLog.create({
      data: {
        organizationId: meta.organizationId,
        connectionId: meta.connectionId,
        operation: meta.operation,
        isWrite: meta.isWrite ?? false,
        approvalId: meta.approvalId,
        requestHash: meta.requestInfo ? this.crypto.hashJson(meta.requestInfo) : null,
        responseCode,
        success,
        error,
        durationMs: Date.now() - start,
      },
    });
  }
}
