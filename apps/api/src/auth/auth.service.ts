import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomBytes } from "node:crypto";
import type { LoginInput, RegisterInput, AuthSession, OrgRole } from "@campaignos/shared";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { CryptoService } from "../core/crypto.service";
import { loadConfig } from "../core/config";
import { PrismaService } from "../core/prisma.service";
import { dummyVerify, hashPassword, verifyPassword } from "./password.util";

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async register(input: RegisterInput, meta: RequestMeta): Promise<AuthSession> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw AppException.conflict("קיים כבר משתמש עם אימייל זה", "EMAIL_TAKEN");
    }
    const passwordHash = await hashPassword(input.password);
    const slug = await this.uniqueSlug(input.organizationName);

    const { user, organization, membership } = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: input.organizationName, slug },
      });
      const user = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash },
      });
      const membership = await tx.organizationMember.create({
        data: { organizationId: organization.id, userId: user.id, role: "AGENCY_OWNER" },
      });
      return { user, organization, membership };
    });

    await this.audit.log({
      organizationId: organization.id,
      actorId: user.id,
      action: "auth.register",
      entityType: "organization",
      entityId: organization.id,
      ...meta,
    });

    return this.issueSession(user, organization, membership.role, membership.clientScope);
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { memberships: { include: { organization: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!user || !user.isActive) {
      await dummyVerify();
      throw AppException.unauthorized("אימייל או סיסמה שגויים", "INVALID_CREDENTIALS");
    }
    const ok = await verifyPassword(user.passwordHash, input.password);
    if (!ok) {
      throw AppException.unauthorized("אימייל או סיסמה שגויים", "INVALID_CREDENTIALS");
    }
    const membership = user.memberships[0];
    if (!membership) {
      throw AppException.forbidden("המשתמש אינו משויך לאף סוכנות", "NO_ORGANIZATION");
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      organizationId: membership.organizationId,
      actorId: user.id,
      action: "auth.login",
      ...meta,
    });

    return this.issueSession(user, membership.organization, membership.role, membership.clientScope);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const tokenHash = this.crypto.sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw AppException.unauthorized("תוקף ההתחברות פג. יש להתחבר מחדש.", "REFRESH_INVALID");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      include: { memberships: { include: { organization: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!user || !user.isActive) {
      throw AppException.unauthorized("המשתמש אינו פעיל", "USER_INACTIVE");
    }
    const membership = user.memberships[0];
    if (!membership) throw AppException.forbidden("אין שיוך לסוכנות", "NO_ORGANIZATION");

    // rotation: revoke the old token
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(user, membership.organization, membership.role, membership.clientScope);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.crypto.sha256(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string, organizationId: string) {
    const [user, org, membership] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.organization.findUnique({ where: { id: organizationId } }),
      this.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
      }),
    ]);
    if (!user || !org || !membership) throw AppException.unauthorized();
    return {
      user: { id: user.id, email: user.email, name: user.name, locale: user.locale },
      organizationId: org.id,
      organizationName: org.name,
      role: membership.role,
    };
  }

  // ── internals ──

  private async issueSession(
    user: { id: string; email: string; name: string; locale: string },
    org: { id: string; name: string },
    role: OrgRole,
    clientScope: string[],
  ): Promise<AuthSession> {
    const cfg = loadConfig();
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        orgId: org.id,
        role,
        clientScope,
      },
      { secret: cfg.JWT_ACCESS_SECRET, expiresIn: cfg.JWT_ACCESS_TTL as unknown as number },
    );

    const refreshToken = randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + ttlToMs(cfg.JWT_REFRESH_TTL));
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: this.crypto.sha256(refreshToken), expiresAt },
    });

    return {
      user: { id: user.id, email: user.email, name: user.name, locale: user.locale },
      organizationId: org.id,
      organizationName: org.name,
      role,
      accessToken,
      refreshToken,
    };
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9֐-׿]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "org";
    const suffix = randomBytes(3).toString("hex");
    return `${base}-${suffix}`;
  }
}

function ttlToMs(ttl: string): number {
  const m = ttl.match(/^(\d+)([smhd])$/);
  if (!m) return 7 * 24 * 3600 * 1000;
  const n = parseInt(m[1], 10);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]] ?? 1000;
  return n * unit;
}
