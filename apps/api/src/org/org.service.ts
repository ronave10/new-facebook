import { Injectable } from "@nestjs/common";
import type { CreateMemberInput, OrgRole } from "@campaignos/shared";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { PrismaService } from "../core/prisma.service";
import { hashPassword } from "../auth/password.util";

const PRIVILEGED: OrgRole[] = ["ADMIN", "AGENCY_OWNER"];

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw AppException.notFound("הסוכנות לא נמצאה");
    const memberCount = await this.prisma.organizationMember.count({ where: { organizationId } });
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      memberCount,
      createdAt: org.createdAt.toISOString(),
    };
  }

  async update(organizationId: string, name: string, actorId: string) {
    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { name },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: "org.update",
      entityType: "organization",
      entityId: organizationId,
      after: { name },
    });
    return { id: org.id, name: org.name };
  }

  async listMembers(organizationId: string) {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      clientScope: m.clientScope,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async addMember(organizationId: string, input: CreateMemberInput, actorId: string) {
    let user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
        },
      });
    }
    const existing = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
    });
    if (existing) throw AppException.conflict("המשתמש כבר חבר בסוכנות", "ALREADY_MEMBER");

    const member = await this.prisma.organizationMember.create({
      data: {
        organizationId,
        userId: user.id,
        role: input.role,
        clientScope: input.clientScope ?? [],
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: "member.add",
      entityType: "member",
      entityId: member.id,
      after: { email: input.email, role: input.role },
    });
    return { id: member.id, userId: user.id, email: user.email, role: member.role };
  }

  async updateMember(
    organizationId: string,
    memberId: string,
    data: { role?: OrgRole; clientScope?: string[] },
    actorId: string,
  ) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
    });
    if (!member) throw AppException.notFound("החבר לא נמצא");

    // Protect the last privileged member from being demoted.
    if (data.role && PRIVILEGED.includes(member.role) && !PRIVILEGED.includes(data.role)) {
      await this.assertNotLastPrivileged(organizationId, member.id);
    }

    const updated = await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: {
        ...(data.role ? { role: data.role } : {}),
        ...(data.clientScope ? { clientScope: data.clientScope } : {}),
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: "member.update",
      entityType: "member",
      entityId: memberId,
      before: { role: member.role },
      after: { role: updated.role },
    });
    return { id: updated.id, role: updated.role, clientScope: updated.clientScope };
  }

  async removeMember(organizationId: string, memberId: string, actorId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
    });
    if (!member) throw AppException.notFound("החבר לא נמצא");
    if (PRIVILEGED.includes(member.role)) {
      await this.assertNotLastPrivileged(organizationId, member.id);
    }
    await this.prisma.organizationMember.delete({ where: { id: memberId } });
    await this.audit.log({
      organizationId,
      actorId,
      action: "member.remove",
      entityType: "member",
      entityId: memberId,
    });
    return { ok: true };
  }

  async listAuditLogs(organizationId: string, page: number, action?: string) {
    const pageSize = 30;
    const where = { organizationId, ...(action ? { action } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        actorId: r.actorId,
        actorType: r.actorType,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  private async assertNotLastPrivileged(organizationId: string, excludeMemberId: string) {
    const count = await this.prisma.organizationMember.count({
      where: {
        organizationId,
        role: { in: PRIVILEGED },
        id: { not: excludeMemberId },
      },
    });
    if (count === 0) {
      throw AppException.conflict(
        "לא ניתן להסיר/לשנות את בעל הסוכנות האחרון",
        "LAST_OWNER",
      );
    }
  }
}
