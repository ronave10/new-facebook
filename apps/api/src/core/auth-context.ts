import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { OrgRole } from "@campaignos/shared";

/** Authenticated request context, embedded in the JWT access token. */
export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  role: OrgRole;
  /** For CLIENT_VIEWER: list of client ids the member may see. Empty = all clients. */
  clientScope: string[];
}

export const IS_PUBLIC_KEY = "isPublic";
/** Marks a route as public (no JWT required). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSION_KEY = "requiredPermission";

/** Extracts the AuthContext attached by JwtAuthGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const request = ctx.switchToHttp().getRequest();
  return request.authContext as AuthContext;
});
