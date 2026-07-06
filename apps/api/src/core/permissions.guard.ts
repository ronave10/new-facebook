import { CanActivate, ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Permission, roleHasPermission } from "@campaignos/shared";
import { AppException } from "./api-error";
import { AuthContext, PERMISSION_KEY } from "./auth-context";

/** Declares the permission required to invoke a route. */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true;

    const request = context.switchToHttp().getRequest();
    const auth: AuthContext | undefined = request.authContext;
    if (!auth) return true; // public route or JwtAuthGuard will reject first

    if (!roleHasPermission(auth.role, permission)) {
      throw AppException.forbidden(
        `אין לתפקיד שלך הרשאה לפעולה זו (${permission})`,
        "PERMISSION_DENIED",
      );
    }
    return true;
  }
}
