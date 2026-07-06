import { Injectable } from "@nestjs/common";
import type { MetaConnector, MetaConnectorContext } from "@campaignos/meta";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { CryptoService, EncryptedBlob } from "../core/crypto.service";
import { loadConfig } from "../core/config";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { MetaConnectorFactory } from "./connector.factory";
import { MetaCallLogger } from "./meta-call-logger.service";

@Injectable()
export class MetaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly factory: MetaConnectorFactory,
    private readonly logger: MetaCallLogger,
  ) {}

  connector(): MetaConnector {
    return this.factory.get();
  }

  /** Builds a connector context by decrypting the connection's stored token. */
  async context(organizationId: string, connectionId: string): Promise<MetaConnectorContext> {
    const connection = await this.prisma.metaConnection.findFirst({
      where: { id: connectionId, organizationId },
      include: { credential: true },
    });
    if (!connection) throw AppException.notFound("החיבור ל-Meta לא נמצא");
    if (!connection.credential) {
      throw AppException.badRequest("החיבור ל-Meta חסר אישורים. יש להתחבר מחדש.", "META_NO_CREDENTIAL");
    }
    const token = this.crypto.decrypt({
      ciphertext: connection.credential.ciphertext,
      iv: connection.credential.iv,
      authTag: connection.credential.authTag,
      keyVersion: connection.credential.keyVersion,
    });
    return { accessToken: token, organizationId, connectionId };
  }

  /** Starts a connection. In mock mode connects immediately; otherwise returns an authUrl. */
  async startConnect(user: AuthContext, clientId: string | undefined, buildState: () => string) {
    const cfg = loadConfig();
    if (cfg.META_MODE === "mock") {
      const connection = await this.mockConnect(user, clientId);
      return { mode: "mock" as const, connectionId: connection.id };
    }
    const scopes = cfg.META_OAUTH_SCOPES.split(",").map((s) => s.trim());
    const authUrl = this.factory.marketingApi().buildAuthUrl({
      redirectUri: cfg.META_OAUTH_REDIRECT_URI,
      scopes,
      state: buildState(),
    });
    return { mode: "oauth" as const, authUrl };
  }

  private async mockConnect(user: AuthContext, clientId?: string) {
    const connector = this.connector();
    const ctx: MetaConnectorContext = {
      accessToken: "mock-token",
      organizationId: user.organizationId,
    };
    const me = await connector.getMe(ctx);
    const blob = this.crypto.encrypt("mock-token");
    const connection = await this.persistConnection(
      user.organizationId,
      clientId,
      me,
      ["ads_read", "ads_management", "pages_show_list", "business_management"],
      blob,
    );
    await this.syncAssets(user.organizationId, connection.id);
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "meta.connect",
      entityType: "meta_connection",
      entityId: connection.id,
      metadata: { mode: "mock" },
    });
    return connection;
  }

  /** OAuth callback landing: exchange code → long-lived token, persist, sync. */
  async completeOAuth(
    organizationId: string,
    userId: string,
    clientId: string | undefined,
    code: string,
  ) {
    const cfg = loadConfig();
    const marketing = this.factory.marketingApi();
    const short = await marketing.exchangeCodeForToken(code, cfg.META_OAUTH_REDIRECT_URI);
    const long = await marketing.getLongLivedToken(short.accessToken);
    const ctx: MetaConnectorContext = { accessToken: long.accessToken, organizationId };
    const me = await marketing.getMe(ctx);
    const blob = this.crypto.encrypt(long.accessToken);
    const scopes = cfg.META_OAUTH_SCOPES.split(",").map((s) => s.trim());
    const expiresAt = long.expiresIn ? new Date(Date.now() + long.expiresIn * 1000) : undefined;
    const connection = await this.persistConnection(organizationId, clientId, me, scopes, blob, expiresAt);
    await this.syncAssets(organizationId, connection.id);
    await this.audit.log({
      organizationId,
      actorId: userId,
      action: "meta.connect",
      entityType: "meta_connection",
      entityId: connection.id,
      metadata: { mode: "oauth" },
    });
    return connection;
  }

  private async persistConnection(
    organizationId: string,
    clientId: string | undefined,
    me: { id: string; name: string },
    scopes: string[],
    blob: EncryptedBlob,
    tokenExpiresAt?: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.metaConnection.findFirst({
        where: { organizationId, clientId: clientId ?? null, metaUserId: me.id },
      });
      const credential = await tx.encryptedCredential.create({
        data: {
          organizationId,
          provider: "meta",
          ciphertext: blob.ciphertext,
          iv: blob.iv,
          authTag: blob.authTag,
          keyVersion: blob.keyVersion,
        },
      });
      if (existing) {
        return tx.metaConnection.update({
          where: { id: existing.id },
          data: {
            status: "CONNECTED",
            metaUserName: me.name,
            scopes,
            credentialId: credential.id,
            tokenExpiresAt,
            lastError: null,
          },
        });
      }
      return tx.metaConnection.create({
        data: {
          organizationId,
          clientId,
          status: "CONNECTED",
          metaUserId: me.id,
          metaUserName: me.name,
          scopes,
          credentialId: credential.id,
          tokenExpiresAt,
        },
      });
    });
  }

  /** Pull ad accounts, pages and pixels for a connection into local tables. */
  async syncAssets(organizationId: string, connectionId: string) {
    const ctx = await this.context(organizationId, connectionId);
    const connector = this.connector();
    const accounts = await this.logger.wrap(
      { organizationId, connectionId, operation: "listAdAccounts" },
      () => connector.listAdAccounts(ctx),
    );
    for (const acc of accounts) {
      const saved = await this.prisma.metaAdAccount.upsert({
        where: { connectionId_accountId: { connectionId, accountId: acc.accountId } },
        create: {
          connectionId,
          organizationId,
          accountId: acc.accountId,
          name: acc.name,
          currency: acc.currency,
          timezone: acc.timezone,
          accountStatus: acc.accountStatus,
          raw: acc as object,
        },
        update: { name: acc.name, currency: acc.currency, accountStatus: acc.accountStatus },
      });
      // pages + pixels per account (best-effort)
      const [pages, pixels] = await Promise.all([
        this.logger
          .wrap({ organizationId, connectionId, operation: "listPages" }, () => connector.listPages(ctx, acc.accountId))
          .catch(() => []),
        this.logger
          .wrap({ organizationId, connectionId, operation: "listPixels" }, () => connector.listPixels(ctx, acc.accountId))
          .catch(() => []),
      ]);
      for (const page of pages) {
        await this.prisma.metaPage.upsert({
          where: { connectionId_pageId: { connectionId, pageId: page.pageId } },
          create: {
            connectionId,
            organizationId,
            pageId: page.pageId,
            name: page.name,
            category: page.category,
            leadgenTosAccepted: page.leadgenTosAccepted ?? false,
          },
          update: { name: page.name, leadgenTosAccepted: page.leadgenTosAccepted ?? false },
        });
      }
      for (const pixel of pixels) {
        await this.prisma.metaPixel.upsert({
          where: { connectionId_pixelId: { connectionId, pixelId: pixel.pixelId } },
          create: {
            connectionId,
            organizationId,
            pixelId: pixel.pixelId,
            name: pixel.name,
            adAccountId: saved.accountId,
          },
          update: { name: pixel.name },
        });
      }
    }
    await this.prisma.metaConnection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: new Date() },
    });
  }

  async listConnections(organizationId: string, clientId?: string) {
    const connections = await this.prisma.metaConnection.findMany({
      where: { organizationId, ...(clientId ? { clientId } : {}) },
      include: { adAccounts: true, pages: true, pixels: true },
      orderBy: { createdAt: "desc" },
    });
    return connections.map((c) => ({
      id: c.id,
      status: c.status,
      metaUserName: c.metaUserName,
      scopes: c.scopes,
      clientId: c.clientId,
      tokenExpiresAt: c.tokenExpiresAt?.toISOString() ?? null,
      lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
      lastError: c.lastError,
      adAccounts: c.adAccounts.map((a) => ({
        id: a.id,
        accountId: a.accountId,
        name: a.name,
        currency: a.currency,
        isSelected: a.isSelected,
      })),
      pages: c.pages.map((p) => ({ id: p.id, pageId: p.pageId, name: p.name, leadgenTosAccepted: p.leadgenTosAccepted })),
      pixels: c.pixels.map((p) => ({ id: p.id, pixelId: p.pixelId, name: p.name })),
    }));
  }

  async selectAdAccount(user: AuthContext, adAccountInternalId: string, clientId: string) {
    const account = await this.prisma.metaAdAccount.findFirst({
      where: { id: adAccountInternalId, organizationId: user.organizationId },
    });
    if (!account) throw AppException.notFound("חשבון המודעות לא נמצא");
    await this.prisma.$transaction([
      this.prisma.metaAdAccount.updateMany({
        where: { connectionId: account.connectionId },
        data: { isSelected: false },
      }),
      this.prisma.metaAdAccount.update({
        where: { id: account.id },
        data: { isSelected: true, clientId },
      }),
      this.prisma.metaConnection.updateMany({
        where: { id: account.connectionId },
        data: { clientId },
      }),
    ]);
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "meta.ad_account.select",
      entityType: "meta_ad_account",
      entityId: account.id,
      metadata: { clientId },
    });
    return { ok: true, adAccountId: account.accountId };
  }

  async disconnect(user: AuthContext, connectionId: string) {
    const connection = await this.prisma.metaConnection.findFirst({
      where: { id: connectionId, organizationId: user.organizationId },
    });
    if (!connection) throw AppException.notFound("החיבור לא נמצא");
    await this.prisma.$transaction(async (tx) => {
      await tx.metaConnection.update({
        where: { id: connectionId },
        data: { status: "DISCONNECTED", credentialId: null },
      });
      if (connection.credentialId) {
        await tx.encryptedCredential.delete({ where: { id: connection.credentialId } }).catch(() => undefined);
      }
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "meta.disconnect",
      entityType: "meta_connection",
      entityId: connectionId,
    });
    return { ok: true };
  }

  async listAdAccounts(organizationId: string, connectionId: string) {
    return this.prisma.metaAdAccount.findMany({
      where: { organizationId, connectionId },
      orderBy: { name: "asc" },
    });
  }
}
