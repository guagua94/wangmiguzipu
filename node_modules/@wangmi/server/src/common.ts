import { createParamDecorator, ExecutionContext, SetMetadata, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

export interface JwtUser { id: number; cn: string; role: 'owner' | 'admin' | 'member'; banned: boolean; }

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): JwtUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: JwtUser }>();
    if (!req.user) throw new UnauthorizedException('未登录');
    return req.user;
  },
);

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

/** 校验登录态 + 角色黑名单 */
export function checkRole(user: JwtUser | undefined, roles: string[] | undefined) {
  if (!user) throw new UnauthorizedException('未登录');
  if (user.banned && !roles?.includes('banned-allowed')) {
    throw new ForbiddenException('你已被拉黑，无法进行新交易；存量订单保留');
  }
  if (roles && roles.length && !roles.includes('banned-allowed')) {
    if (!roles.includes(user.role)) throw new ForbiddenException('无权限');
  }
}
