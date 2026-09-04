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
exports.BalanceModuleRef = exports.BalanceController = exports.BalanceService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../entities");
const common_2 = require("../common");
/** 余额：记账制。流水 append-only，余额由事务内同步更新。 */
let BalanceService = class BalanceService {
    constructor(userRepo, flowRepo, wdRepo) {
        this.userRepo = userRepo;
        this.flowRepo = flowRepo;
        this.wdRepo = wdRepo;
    }
    async credit(uid, amount, type, note, refId = '') {
        if (amount <= 0)
            throw new common_1.BadRequestException();
        const newBalance = await this.userRepo.manager.transaction(async (manager) => {
            const userRepo = manager.getRepository(entities_1.User);
            const flowRepo = manager.getRepository(entities_1.BalanceFlow);
            const u = await userRepo.findOneByOrFail({ id: uid });
            u.balance = entities_1.Money.of(+u.balance + amount);
            await userRepo.save(u);
            await flowRepo.save(flowRepo.create({ userId: uid, amount: entities_1.Money.of(amount), type, note, refId }));
            return u.balance;
        });
        // 事务成功后发通知（通知失败不影响余额）
        const nRepo = this.userRepo.manager.getRepository(entities_1.Notification);
        await nRepo.save(nRepo.create({ userId: uid, title: '余额变动', body: `${note} +¥${entities_1.Money.of(amount)}，当前余额 ¥${newBalance}` }));
        return newBalance;
    }
    async debit(uid, amount, type, note, refId = '') {
        const newBalance = await this.userRepo.manager.transaction(async (manager) => {
            const userRepo = manager.getRepository(entities_1.User);
            const flowRepo = manager.getRepository(entities_1.BalanceFlow);
            const u = await userRepo.findOneByOrFail({ id: uid });
            if (+u.balance + 1e-9 < amount)
                throw new common_1.BadRequestException('余额不足');
            u.balance = entities_1.Money.of(+u.balance - amount);
            await userRepo.save(u);
            await flowRepo.save(flowRepo.create({ userId: uid, amount: entities_1.Money.of(-amount), type, note, refId }));
            return u.balance;
        });
        return newBalance;
    }
    async flows(uid) {
        return this.flowRepo.find({ where: { userId: uid }, order: { id: 'desc' }, take: 100 });
    }
    async applyWithdraw(uid, amount, method) {
        if (amount <= 0)
            throw new common_1.BadRequestException('金额无效');
        const wd = await this.userRepo.manager.transaction(async (manager) => {
            const userRepo = manager.getRepository(entities_1.User);
            const flowRepo = manager.getRepository(entities_1.BalanceFlow);
            const wdRepo = manager.getRepository(entities_1.Withdrawal);
            const u = await userRepo.findOneByOrFail({ id: uid });
            if (+u.balance + 1e-9 < amount)
                throw new common_1.BadRequestException('余额不足');
            u.balance = entities_1.Money.of(+u.balance - amount);
            await userRepo.save(u);
            await flowRepo.save(flowRepo.create({ userId: uid, amount: entities_1.Money.of(-amount), type: '提现冻结', note: `提现申请冻结 ¥${entities_1.Money.of(amount)}（${method}）` }));
            return await wdRepo.save(wdRepo.create({ userId: uid, amount: entities_1.Money.of(amount), method }));
        });
        return wd;
    }
    async myWithdraws(uid) {
        return this.wdRepo.find({ where: { userId: uid }, order: { id: 'desc' } });
    }
    async allWithdraws() {
        const ws = await this.wdRepo.find({ order: { id: 'desc' } });
        const us = ws.length ? await this.userRepo.find({ where: { id: (0, typeorm_2.In)(ws.map(w => w.userId)) } }) : [];
        return ws.map(w => ({ ...w, cn: us.find(u => u.id === w.userId)?.cn || '' }));
    }
    /** 店主线下退回后标记完成：余额已在申请时冻结，此处仅更新状态 */
    async finishWithdraw(id, auditor) {
        const w = await this.wdRepo.findOneByOrFail({ id });
        if (w.state !== '待处理')
            throw new common_1.BadRequestException();
        await this.wdRepo.update(id, { state: '已完成' });
        // 通知用户提现已完成
        const nRepo = this.userRepo.manager.getRepository(entities_1.Notification);
        await nRepo.save(nRepo.create({ userId: w.userId, title: '提现完成', body: `提现 ¥${entities_1.Money.of(w.amount)} 已由 ${auditor.cn} 确认完成（${w.method}）` }));
        return { ok: true };
    }
    async rejectWithdraw(id, auditor) {
        const w = await this.wdRepo.findOneByOrFail({ id });
        if (w.state !== '待处理')
            throw new common_1.BadRequestException('仅待处理可拒绝');
        await this.userRepo.manager.transaction(async (manager) => {
            const wdRepo = manager.getRepository(entities_1.Withdrawal);
            const userRepo = manager.getRepository(entities_1.User);
            const flowRepo = manager.getRepository(entities_1.BalanceFlow);
            await wdRepo.update(id, { state: '已拒绝' });
            const u = await userRepo.findOneByOrFail({ id: w.userId });
            u.balance = entities_1.Money.of(+u.balance + +w.amount);
            await userRepo.save(u);
            await flowRepo.save(flowRepo.create({ userId: w.userId, amount: entities_1.Money.of(w.amount), type: '提现退还', note: `提现申请被拒绝，退还冻结金额 ¥${entities_1.Money.of(w.amount)}（${auditor.cn} 操作）` }));
        });
        // 事务成功后发通知
        const nRepo = this.userRepo.manager.getRepository(entities_1.Notification);
        await nRepo.save(nRepo.create({ userId: w.userId, title: '提现被拒绝', body: `提现 ¥${entities_1.Money.of(w.amount)} 被拒绝，冻结金额已退回余额` }));
        return { ok: true };
    }
};
exports.BalanceService = BalanceService;
exports.BalanceService = BalanceService = __decorate([
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(entities_1.BalanceFlow)),
    __param(2, (0, typeorm_1.InjectRepository)(entities_1.Withdrawal)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], BalanceService);
let BalanceController = class BalanceController {
    constructor(svc) {
        this.svc = svc;
    }
    async flows(req) {
        (0, common_2.checkRole)(req.user, ['banned-allowed']);
        return this.svc.flows(req.user.id);
    }
    async apply(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.applyWithdraw(req.user.id, b.amount, b.method);
    }
    async my(req) {
        (0, common_2.checkRole)(req.user, ['banned-allowed']);
        return this.svc.myWithdraws(req.user.id);
    }
    async all(req) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.allWithdraws();
    }
    async finish(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.finishWithdraw(b.id, req.user);
    }
    async reject(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.rejectWithdraw(b.id, req.user);
    }
};
exports.BalanceController = BalanceController;
__decorate([
    (0, common_1.Get)('flows'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BalanceController.prototype, "flows", null);
__decorate([
    (0, common_1.Post)('withdraw'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BalanceController.prototype, "apply", null);
__decorate([
    (0, common_1.Get)('my-withdraws'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BalanceController.prototype, "my", null);
__decorate([
    (0, common_1.Get)('all-withdraws'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BalanceController.prototype, "all", null);
__decorate([
    (0, common_1.Post)('withdraw/finish'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BalanceController.prototype, "finish", null);
__decorate([
    (0, common_1.Post)('withdraw/reject'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BalanceController.prototype, "reject", null);
exports.BalanceController = BalanceController = __decorate([
    (0, common_1.Controller)('balance'),
    __metadata("design:paramtypes", [BalanceService])
], BalanceController);
exports.BalanceModuleRef = typeorm_1.TypeOrmModule.forFeature([entities_1.User, entities_1.BalanceFlow, entities_1.Withdrawal]);
