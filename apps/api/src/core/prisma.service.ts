import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@campaignos/db";

/**
 * Single PrismaClient for the app.
 *
 * TENANT ISOLATION RULE: no service may call prisma.<model> without an
 * organizationId filter for tenant-owned models. Prefer the `forOrg` helpers
 * in feature services. Cross-tenant queries are only allowed in auth flows
 * (login by email) and system jobs that iterate organizations explicitly.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
