"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Roles = exports.CurrentUser = void 0;
exports.checkRole = checkRole;
const common_1 = require("@nestjs/common");
exports.CurrentUser = (0, common_1.createParamDecorator)((data, ctx) => {
    const req = ctx.switchToHttp().getRequest();
    if (!req.user)
        throw new common_1.UnauthorizedException('未登录');
    return req.user;
});
const Roles = (...roles) => (0, common_1.SetMetadata)('roles', roles);
exports.Roles = Roles;
/** 校验登录态 + 角色黑名单 */
function checkRole(user, roles) {
    if (!user)
        throw new common_1.UnauthorizedException('未登录');
    if (user.banned && !roles?.includes('banned-allowed')) {
        throw new common_1.ForbiddenException('你已被拉黑，无法进行新交易；存量订单保留');
    }
    if (roles && roles.length && !roles.includes('banned-allowed')) {
        if (!roles.includes(user.role))
            throw new common_1.ForbiddenException('无权限');
    }
}
