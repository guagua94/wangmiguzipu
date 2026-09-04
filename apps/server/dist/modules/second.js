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
exports.SecondModuleRef = exports.SecondController = exports.SecondService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../entities");
const common_2 = require("../common");
const balance_1 = require("./balance");
let SecondService = class SecondService {
    constructor(repo, userRepo, balance) {
        this.repo = repo;
        this.userRepo = userRepo;
        this.balance = balance;
    }
    /** 发起：三种计算方式 point=单价×点数 / weight=首重+续重×n / custom=自定义金额 */
    async create(b) {
        let amount = 0, calc = '';
        if (b.way === 'point') {
            amount = b.p1 * b.p2;
            calc = `按点数 ${b.p1}×${b.p2}`;
        }
        else if (b.way === 'weight') {
            amount = b.p1 + b.p2 * b.p3;
            calc = `按克重 首重${b.p1}+续重${b.p2}×${b.p3}`;
        }
        else {
            amount = b.p1;
            calc = '自定义';
        }
        if (!(amount > 0))
            throw new common_1.BadRequestException('金额无效');
        const bill = await this.repo.save(this.repo.create({
            userId: b.userId, title: b.title || calc, calc, amount: amount.toFixed(2),
        }));
        const u = await this.userRepo.findOneByOrFail({ id: b.userId });
        const nRepo = this.userRepo.manager.getRepository('Notification');
        await nRepo.save(nRepo.create({ userId: b.userId, title: '新的二次收肾账单', body: `${b.title || calc} ¥${amount.toFixed(2)}（${calc}），请前往付款` }));
        return { ...bill, cn: u.cn };
    }
    async mine(uid) { return this.repo.find({ where: { userId: uid }, order: { id: 'desc' } }); }
    async all() {
        const bs = await this.repo.find({ order: { id: 'desc' } });
        const us = bs.length ? await this.userRepo.find({ where: { id: (0, typeorm_2.In)(bs.map(b => b.userId)) } }) : [];
        return bs.map(b => ({ ...b, cn: us.find(u => u.id === b.userId)?.cn || '' }));
    }
    /** 付款：余额优先（全额抵扣直接完成），否则提交截图待审 */
    async submit(uid, id, screenshot, useBalanceAmount) {
        const b = await this.repo.findOneByOrFail({ id });
        if (b.userId !== uid || b.state !== '待付款')
            throw new common_1.BadRequestException('状态错误');
        const total = +b.amount;
        let useBal = Math.max(0, Math.min(useBalanceAmount || 0, total));
        let rest = total;
        if (useBal > 0) {
            await this.balance.debit(uid, useBal, '二次收肾抵扣', `${b.title}（余额抵 ¥${useBal.toFixed(2)}）`, `S${id}`);
            rest = total - useBal;
        }
        if (rest > 0) {
            if (!screenshot)
                throw new common_1.BadRequestException(`需扫码支付 ¥${rest.toFixed(2)}，请上传付款截图`);
            await this.repo.update(id, { state: '已提交截图', screenshot });
            return { paidOff: false, usedBalance: useBal, restPaid: rest };
        }
        await this.repo.update(id, { state: '已完成' });
        return { paidOff: true, usedBalance: useBal, restPaid: 0 };
    }
    async audit(id, pass) {
        const b = await this.repo.findOneByOrFail({ id });
        if (b.state !== '已提交截图')
            throw new common_1.BadRequestException('状态错误');
        await this.repo.update(id, { state: pass ? '已完成' : '待付款' });
        return { ok: true };
    }
};
exports.SecondService = SecondService;
exports.SecondService = SecondService = __decorate([
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.SecondBill)),
    __param(1, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        balance_1.BalanceService])
], SecondService);
let SecondController = class SecondController {
    constructor(svc) {
        this.svc = svc;
    }
    async create(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.create(b);
    }
    async mine(req) {
        (0, common_2.checkRole)(req.user, ['banned-allowed']);
        return this.svc.mine(req.user.id);
    }
    async all(req) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.all();
    }
    async submit(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.submit(req.user.id, b.id, b.screenshot || '', b.useBalanceAmount);
    }
    async audit(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.audit(b.id, b.pass);
    }
};
exports.SecondController = SecondController;
__decorate([
    (0, common_1.Post)('create'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SecondController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('mine'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SecondController.prototype, "mine", null);
__decorate([
    (0, common_1.Get)('all'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SecondController.prototype, "all", null);
__decorate([
    (0, common_1.Post)('submit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SecondController.prototype, "submit", null);
__decorate([
    (0, common_1.Post)('audit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SecondController.prototype, "audit", null);
exports.SecondController = SecondController = __decorate([
    (0, common_1.Controller)('second'),
    __metadata("design:paramtypes", [SecondService])
], SecondController);
exports.SecondModuleRef = typeorm_1.TypeOrmModule.forFeature([entities_1.SecondBill, entities_1.User]);
