import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { AppException } from "./api-error";
import { AuthContext, IS_PUBLIC_KEY } from "./auth-context";
import { loadConfig } from "./config";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw AppException.unauthorized();
    }
    const token = header.slice("Bearer ".length);
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: loadConfig().JWT_ACCESS_SECRET,
      });
      const authContext: AuthContext = {
        userId: payload.sub,
        email: payload.email,
        name: payload.name,
        organizationId: payload.orgId,
        role: payload.role,
        clientScope: payload.clientScope ?? [],
      };
      if (!authContext.userId || !authContext.organizationId || !authContext.role) {
        throw AppException.unauthorized("טוקן לא תקין", "INVALID_TOKEN");
      }
      request.authContext = authContext;
      return true;
    } catch (err) {
      if (err instanceof AppException) throw err;
      throw AppException.unauthorized("ההתחברות פגה. יש להתחבר מחדש.", "TOKEN_EXPIRED");
    }
  }
}
