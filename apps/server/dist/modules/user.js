"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModuleRef = exports.UserController = exports.UserService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../entities");
const common_2 = require("../common");
let UserService = class UserService {
    constructor(repo) {
        this.repo = repo;
    }
    async list() {
        return this.repo.find({ order: { id: 'asc' } }).then(us => us.map(u => ({
            id: u.id, cn: u.cn, account: u.account, qq: u.qq, wechat: u.wechat,
            role: u.role, banned: u.banned, bannedReason: u.bannedReason, balance: u.balance,
            createdAt: u.createdAt,
        })));
    }
    async toggleBan(id, ban, reason) {
        const u = await this.repo.findOneByOrFail({ id });
        if (u.role === 'owner')
            return { error: '不能拉黑店主' };
        u.banned = ban;
        u.bannedReason = ban ? (reason || '违反店铺规则') : '';
        await this.repo.save(u);
        return { ok: true };
    }
    async resetPassword(id) {
        const pwd = 'wm' + Math.random().toString(36).slice(2, 8);
        const bcrypt = require('bcryptjs');
        const u = await this.repo.findOneByOrFail({ id });
        u.passwordHash = await bcrypt.hash(pwd, 10);
        await this.repo.save(u);
        return { password: pwd }; // 店主线下告知
    }
    /** 设置管理员权限（仅店主） */
    async setAdminPerms(id, perms) {
        const u = await this.repo.findOneByOrFail({ id });
        if (u.role === 'owner')
            return { error: '店主无需设置权限' };
        u.adminPerms = perms;
        await this.repo.save(u);
        return { ok: true };
    }
    /** 注销：无待付款订单才可；黑名单不可注销 */
    async deactivate(uid) {
        const u = await this.repo.findOneByOrFail({ id: uid });
        if (u.banned)
            return { error: '黑名单用户不可注销' };
        // 待付款检查（肾表/二次收肾/清货）
        const ds = this.repo.manager;
        const k = await ds.getRepository('KidneyBill').count({ where: { userId: uid, state: '待付款' } });
        const s = await ds.getRepository('SecondBill').count({ where: { userId: uid, state: '待付款' } });
        const c = await ds.getRepository('Clearing').count({ where: { userId: uid, state: '待付款' } });
        if (k + s + c > 0)
            return { error: '存在待付款订单，无法注销' };
        u.balance = '0.00'; // 余额清零不予提现
        u.account = `deleted_${u.id}_${u.account}`;
        u.cn = `${u.cn}#已注销`; // 释放 CN
        await this.repo.save(u);
        return { ok: true };
    }
    /** 团员修改自己的密码 */
    async changePassword(uid, oldPassword, newPassword) {
        const bcrypt = require('bcryptjs');
        const u = await this.repo.findOneByOrFail({ id: uid });
        if (!await bcrypt.compare(oldPassword, u.passwordHash)) {
            throw new common_1.BadRequestException('原密码不正确');
        }
        if (newPassword.length < 6)
            throw new common_1.BadRequestException('新密码至少6位');
        u.passwordHash = await bcrypt.hash(newPassword, 10);
        await this.repo.save(u);
        return { ok: true };
    }
    /** 团员修改联系方式 */
    async updateProfile(uid, qq, wechat) {
        const u = await this.repo.findOneByOrFail({ id: uid });
        if (qq !== undefined)
            u.qq = qq;
        if (wechat !== undefined)
            u.wechat = wechat;
        await this.repo.save(u);
        return { ok: true };
    }
};
exports.UserService = UserService;
exports.UserService = UserService = __decorate([
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], UserService);
let UserController = class UserController {
    constructor(svc) {
        this.svc = svc;
    }
    async list(req) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.list();
    }
    async ban(req, b) {
        (0, common_2.checkRole)(req.user, ['owner']); // 拉黑仅店主
        return this.svc.toggleBan(b.id, b.ban, b.reason || '');
    }
    async reset(req, b) {
        (0, common_2.checkRole)(req.user, ['owner']);
        return this.svc.resetPassword(b.id);
    }
    async setPerms(req, b) {
        (0, common_2.checkRole)(req.user, ['owner']);
        return this.svc.setAdminPerms(b.id, b.perms);
    }
    async deactivate(req) {
        (0, common_2.checkRole)(req.user, []); // 仅登录用户，黑名单用户被 checkRole 拦截（与业务逻辑一致：黑名单不可注销）
        return this.svc.deactivate(req.user.id);
    }
    /** 团员修改自己的密码（需原密码验证） */
    async changePassword(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.changePassword(req.user.id, b.oldPassword, b.newPassword);
    }
    /** 团员修改联系方式 */
    async updateProfile(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.updateProfile(req.user.id, b.qq, b.wechat);
    }
};
exports.UserController = UserController;
__decorate([
    (0, common_1.Get)('list'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('ban'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "ban", null);
__decorate([
    (0, common_1.Post)('reset-password'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "reset", null);
__decorate([
    (0, common_1.Post)('set-admin-perms'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "setPerms", null);
__decorate([
    (0, common_1.Post)('deactivate'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "deactivate", null);
__decorate([
    (0, common_1.Post)('change-password'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "changePassword", null);
__decorate([
    (0, common_1.Post)('profile'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "updateProfile", null);
exports.UserController = UserController = __decorate([
    (0, common_1.Controller)('user'),
    __metadata("design:paramtypes", [UserService])
], UserController);
exports.UserModuleRef = typeorm_1.TypeOrmModule.forFeature([entities_1.User]);
