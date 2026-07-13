import { Global, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { AuditService } from "./audit.service";
import { CryptoService } from "./crypto.service";
import { KeyRotationService } from "./key-rotation.service";
import { GlobalExceptionFilter } from "./global-exception.filter";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PermissionsGuard } from "./permissions.guard";
import { PrismaService } from "./prisma.service";
import { QueueService } from "./queue.service";
import { RateLimitGuard } from "./rate-limit.guard";

/**
 * Global infrastructure module. Guard order matters:
 * RateLimit → JwtAuth → Permissions.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [
    PrismaService,
    CryptoService,
    KeyRotationService,
    AuditService,
    QueueService,
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
  exports: [PrismaService, CryptoService, KeyRotationService, AuditService, QueueService, JwtModule],
})
export class CoreModule {}
