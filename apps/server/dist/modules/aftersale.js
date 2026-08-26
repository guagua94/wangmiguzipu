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
exports.AfterSaleModuleRef = exports.AfterSaleController = exports.AfterSaleService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../entities");
const common_2 = require("../common");
const shop_1 = require("./shop");
const balance_1 = require("./balance");
let AfterSaleService = class AfterSaleService {
    constructor(repo, userRepo, shop, balance) {
        this.repo = repo;
        this.userRepo = userRepo;
        this.shop = shop;
        this.balance = balance;
    }
    /** 申请：仅漏发/错发，必选换货/退货，必须开箱视频 */
    async create(uid, b) {
        if (!['漏发', '错发'].includes(b.type))
            throw new common_1.BadRequestException('仅支持漏发/错发');
        if (!b.video)
            throw new common_1.BadRequestException('必须上传完整无剪辑开箱视频');
        const cfg = await this.shop.get();
        // 售后时限校验：按订单创建时间 + afterSaleDays 计算
        const ds = this.repo.manager.getRepository('Order');
        if (b.orderId) {
            const orderId = +b.orderId;
            if (!isNaN(orderId) && orderId > 0) {
                const order = await ds.findOne({ where: { id: orderId } });
                if (order) {
                    const created = new Date(order.createdAt).getTime();
                    const elapsed = Math.floor((Date.now() - created) / (24 * 3600 * 1000));
                    if (elapsed > cfg.afterSaleDays) {
                        throw new common_1.BadRequestException(`已超过售后时限（${cfg.afterSaleDays}天），无法申请`);
                    }
                }
            }
        }
        const a = await this.repo.save(this.repo.create({
            userId: uid, orderId: b.orderId, type: b.type, goods: b.goods,
            way: b.way, video: b.video, note: b.note || '', state: '待审核',
        }));
        await this.notify(uid, '售后申请已提交', `订单${b.orderId} ${b.type}·${b.goods}（${b.way}），等待店主审核`);
        return a;
    }
    async mine(uid) {
        return this.repo.find({ where: { userId: uid }, order: { id: 'desc' } });
    }
    async all() {
        const as = await this.repo.find({ order: { id: 'desc' } });
        const us = as.length ? await this.userRepo.find({ where: { id: (0, typeorm_2.In)(as.map(a => a.userId)) } }) : [];
        return as.map(a => ({ ...a, cn: us.find(u => u.id === a.userId)?.cn || '' }));
    }
    async audit(id, pass, note) {
        const a = await this.repo.findOneByOrFail({ id });
        if (a.state !== '待审核')
            throw new common_1.BadRequestException('状态错误');
        if (!pass) {
            await this.repo.update(id, { state: '已驳回', note: note || '凭证不符或不在售后范围' });
            await this.notify(a.userId, '售后被驳回', `售后单 #${id}：${note || '凭证不符或不在售后范围'}`);
            return { ok: true };
        }
        const state = a.way === '退货' ? (a.type === '漏发' ? '退货·待退款' : '退货·待寄回') : (a.type === '漏发' ? '换货·待补发' : '换货·待寄回错发品');
        await this.repo.update(id, { state });
        await this.notify(a.userId, '售后已通过', `售后单 #${id} 进入「${state}」`);
        return { ok: true };
    }
    /** 团员提交寄回单号（错发/退货需寄回） */
    async shipBack(uid, id, trackingNo) {
        const a = await this.repo.findOneByOrFail({ id });
        if (a.userId !== uid)
            throw new common_1.ForbiddenException();
        if (a.state === '退货·待寄回')
            await this.repo.update(id, { state: '退货·待退款' });
        else if (a.state === '换货·待寄回错发品')
            await this.repo.update(id, { state: '换货·店主确认收货' });
        else
            throw new common_1.BadRequestException('状态错误');
        await this.notify(uid, '寄回单号已提交', `售后单 #${id}，等待店主确认`);
        return { ok: true };
    }
    /** 店主确认收货并退款（退货）：货款退回余额 */
    async refund(id, amount) {
        const a = await this.repo.findOneByOrFail({ id });
        if (a.state !== '退货·待退款')
            throw new common_1.BadRequestException('状态错误');
        await this.balance.credit(a.userId, amount, '售后退款', `售后退货退款（#${id}）`, `AS${id}`);
        await this.repo.update(id, { state: '已退款' });
        return { ok: true };
    }
    /** 换货：确认收到错发品 → 待补发；随下次排发寄出 → 完成 */
    async restock(id) {
        await this.repo.update(id, { state: '换货·待补发' });
        return { ok: true };
    }
    async shipped(id) {
        const a = await this.repo.findOneByOrFail({ id });
        await this.repo.update(id, { state: '已完成' });
        await this.notify(a.userId, '售后补发已寄出', `售后单 #${id} 换货谷子已随排发寄出`);
        return { ok: true };
    }
    async notify(uid, title, body) {
        await this.userRepo.manager.getRepository(entities_1.Notification).save(this.userRepo.manager.getRepository(entities_1.Notification).create({ userId: uid, title, body }));
    }
};
exports.AfterSaleService = AfterSaleService;
exports.AfterSaleService = AfterSaleService = __decorate([
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.AfterSale)),
    __param(1, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        shop_1.ShopService,
        balance_1.BalanceService])
], AfterSaleService);
let AfterSaleController = class AfterSaleController {
    constructor(svc) {
        this.svc = svc;
    }
    async create(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.create(req.user.id, b);
    }
    async mine(req) {
        (0, common_2.checkRole)(req.user, ['banned-allowed']);
        return this.svc.mine(req.user.id);
    }
    async all(req) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.all();
    }
    async audit(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.audit(b.id, b.pass, b.note || '');
    }
    async shipBack(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.shipBack(req.user.id, b.id, b.trackingNo);
    }
    async refund(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.refund(b.id, b.amount);
    }
    async restock(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.restock(b.id);
    }
    async shipped(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.shipped(b.id);
    }
};
exports.AfterSaleController = AfterSaleController;
__decorate([
    (0, common_1.Post)('create'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AfterSaleController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('mine'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AfterSaleController.prototype, "mine", null);
__decorate([
    (0, common_1.Get)('all'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AfterSaleController.prototype, "all", null);
__decorate([
    (0, common_1.Post)('audit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AfterSaleController.prototype, "audit", null);
__decorate([
    (0, common_1.Post)('ship-back'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AfterSaleController.prototype, "shipBack", null);
__decorate([
    (0, common_1.Post)('refund'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AfterSaleController.prototype, "refund", null);
__decorate([
    (0, common_1.Post)('restock'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AfterSaleController.prototype, "restock", null);
__decorate([
    (0, common_1.Post)('shipped'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AfterSaleController.prototype, "shipped", null);
exports.AfterSaleController = AfterSaleController = __decorate([
    (0, common_1.Controller)('aftersale'),
    __metadata("design:paramtypes", [AfterSaleService])
], AfterSaleController);
exports.AfterSaleModuleRef = typeorm_1.TypeOrmModule.forFeature([entities_1.AfterSale, entities_1.User]);
