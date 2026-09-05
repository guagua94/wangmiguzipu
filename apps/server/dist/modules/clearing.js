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
exports.ClearingModuleRef = exports.ClearingController = exports.ClearingService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../entities");
const common_2 = require("../common");
const shop_1 = require("./shop");
const balance_1 = require("./balance");
let ClearingService = class ClearingService {
    constructor(repo, userRepo, orderRepo, itemRepo, goodRepo, saleRepo, addrRepo, auctionRepo, mergeRepo, shop, balance) {
        this.repo = repo;
        this.userRepo = userRepo;
        this.orderRepo = orderRepo;
        this.itemRepo = itemRepo;
        this.goodRepo = goodRepo;
        this.saleRepo = saleRepo;
        this.addrRepo = addrRepo;
        this.auctionRepo = auctionRepo;
        this.mergeRepo = mergeRepo;
        this.shop = shop;
        this.balance = balance;
    }
    /** 团员发起清货：店主配置驱动邮费/打包费选项；超期仓费自动并入 */
    async create(uid, b) {
        const cfg = await this.shop.get();
        const fr = JSON.parse(cfg.freights).find((f) => f.name === b.freightName && f.on);
        const pk = JSON.parse(cfg.packs).find((p) => p.name === b.packName && p.on);
        if (!fr || !pk)
            throw new common_1.BadRequestException('邮费/打包费选项无效');
        const orders = await this.orderRepo.find({ where: { id: (0, typeorm_2.In)(b.orderIds), userId: uid } });
        // orderIds 中不在 orders 表的，去 auctions 表查（state=囤货中, winnerId=uid）
        const foundOrderIds = new Set(orders.map(o => o.id));
        const auctionIds = b.orderIds.filter(id => !foundOrderIds.has(id));
        const auctions = auctionIds.length
            ? await this.auctionRepo.find({ where: { id: (0, typeorm_2.In)(auctionIds), winnerId: uid, state: '囤货中' } })
            : [];
        if (!orders.length && !auctions.length)
            throw new common_1.BadRequestException('无可清货订单');
        const items = await this.itemRepo.find({ where: { orderId: (0, typeorm_2.In)(foundOrderIds.size ? [...foundOrderIds] : [-1]) } });
        // 获取收货地址快照
        let addressSnapshot = '';
        if (b.addressId) {
            const addr = await this.addrRepo.findOneBy({ id: b.addressId, userId: uid });
            if (addr)
                addressSnapshot = JSON.stringify({
                    recipientName: addr.recipientName,
                    phone: addr.phone,
                    region: addr.region,
                    detail: addr.detail,
                });
        }
        // 超期仓费：按订单类型分别计算（拼团/直售/拍卖）
        let overFee = 0;
        const now = Date.now();
        const goodMap = {};
        const saleGoodMap = {};
        const feeDefaults = JSON.parse(cfg.unitFees || '[]');
        // 拼团/直售订单仓费
        for (const o of orders) {
            const orderItems = items.filter(i => i.orderId == o.id);
            const stockTime = o.paidAt ? new Date(o.paidAt).getTime() : new Date(o.createdAt).getTime();
            const isSale = o.seriesId === 0;
            const freeDays = isSale ? cfg.saleFreeDays : cfg.groupFreeDays;
            const feeOn = isSale ? cfg.saleOverFeeOn : cfg.groupOverFeeOn;
            if (!feeOn)
                continue;
            const daysPassed = Math.floor((now - stockTime) / (24 * 3600 * 1000));
            const overDays = Math.max(0, daysPassed - freeDays);
            let orderOverFee = 0;
            for (const it of orderItems) {
                let unitFee = 0.1;
                if (isSale) {
                    if (!saleGoodMap[it.goodId])
                        saleGoodMap[it.goodId] = await this.saleRepo.findOneBy({ id: it.goodId });
                    unitFee = +(saleGoodMap[it.goodId]?.unitFee || '0.1');
                }
                else {
                    if (!goodMap[it.goodId])
                        goodMap[it.goodId] = await this.goodRepo.findOneBy({ id: it.goodId });
                    unitFee = +(goodMap[it.goodId]?.unitFee || '0.1');
                }
                orderOverFee += overDays * it.qty * unitFee;
            }
            overFee += orderOverFee;
        }
        // 拍卖订单仓费（按直售费率，用 stockSince 作为入囤时间）
        for (const a of auctions) {
            const stockTime = a.stockSince ? new Date(a.stockSince).getTime() : new Date(a.createdAt).getTime();
            const freeDays = cfg.saleFreeDays;
            const feeOn = cfg.saleOverFeeOn;
            if (!feeOn)
                continue;
            const daysPassed = Math.floor((now - stockTime) / (24 * 3600 * 1000));
            const overDays = Math.max(0, daysPassed - freeDays);
            let unitFee = 0.1;
            for (const fd of feeDefaults) {
                if (a.name && a.name.includes(fd.name)) {
                    unitFee = fd.fee;
                    break;
                }
            }
            overFee += overDays * 1 * unitFee;
        }
        // 合并 items 快照（订单 items + 拍卖物品），含图片
        const allItems = [
            ...items.map(i => {
                const gi = goodMap[i.goodId];
                const si = saleGoodMap[i.goodId];
                return { name: i.name, qty: i.qty, price: i.price, img: si?.img || gi?.img || '', emoji: si?.emoji || gi?.emoji || '🎁' };
            }),
            ...auctions.map(a => ({ name: a.name, qty: 1, price: a.curPrice, img: a.img || '', emoji: a.emoji || '🎁' })),
        ];
        const total = fr.amt + pk.amt + overFee;
        const c = await this.repo.save(this.repo.create({
            userId: uid,
            items: JSON.stringify(allItems),
            freightName: fr.name, freightAmt: fr.amt.toFixed(2),
            packName: pk.name, packAmt: pk.amt.toFixed(2),
            overFee: overFee.toFixed(2), total: total.toFixed(2),
            addressSnapshot,
        }));
        // 拍卖物品标记为已清货（状态改为已成交）
        for (const a of auctions) {
            await this.auctionRepo.update(a.id, { state: '已成交' });
        }
        return c;
    }
    async mine(uid) {
        return this.repo.find({ where: { userId: uid }, order: { id: 'desc' } });
    }
    async all() {
        const cs = await this.repo.find({ order: { id: 'desc' } });
        const us = cs.length ? await this.userRepo.find({ where: { id: (0, typeorm_2.In)(cs.map(c => c.userId)) } }) : [];
        return cs.map(c => ({ ...c, cn: us.find(u => u.id === c.userId)?.cn || '' }));
    }
    async submit(uid, id, screenshot, useBalanceAmount) {
        const c = await this.repo.findOneByOrFail({ id });
        if (c.userId !== uid || c.state !== '待付款')
            throw new common_1.BadRequestException('状态错误');
        const total = +c.total;
        let useBal = Math.max(0, Math.min(useBalanceAmount || 0, total));
        let rest = total;
        if (useBal > 0) {
            await this.balance.debit(uid, useBal, '清货抵扣', `清货排发余额抵扣 ¥${useBal.toFixed(2)}`, `C${id}`);
            rest = total - useBal;
            await this.repo.update(id, { total: rest.toFixed(2) });
        }
        if (rest <= 0) {
            await this.repo.update(id, { state: '审核通过' });
            return { paidOff: true, usedBalance: useBal };
        }
        if (!screenshot)
            throw new common_1.BadRequestException(`需扫码支付 ¥${rest.toFixed(2)}，请上传付款截图`);
        await this.repo.update(id, { state: '已提交截图', screenshot });
        return { paidOff: false, rest, usedBalance: useBal };
    }
    async audit(id, pass, packImg, auditor) {
        const c = await this.repo.findOneByOrFail({ id });
        if (c.state !== '已提交截图')
            throw new common_1.BadRequestException('状态错误');
        if (pass)
            await this.repo.update(id, { state: '审核通过', packImg });
        else
            await this.repo.update(id, { state: '打回' });
        await this.notify(c.userId, pass ? '清货审核通过' : '清货被打回', `清货单 #${id} ${pass ? '审核通过，等待打包发货' : '邮费/打包费有误被打回'}`);
        return { ok: true };
    }
    async ship(id, trackingNo, packImg) {
        await this.repo.update(id, { state: '已发货', trackingNo, packImg, shippedAt: new Date() });
        const c = await this.repo.findOneByOrFail({ id });
        await this.notify(c.userId, '清货已发货', `清货单 #${id} 物流单号：${trackingNo}`);
        return { ok: true };
    }
    /** 批量发货：仅对「审核通过」状态的清货单执行发货 */
    async batchShip(ids) {
        let shipped = 0;
        for (const id of ids) {
            const c = await this.repo.findOneBy({ id });
            if (!c || c.state !== '审核通过')
                continue;
            await this.repo.update(id, { state: '已发货', shippedAt: new Date() });
            await this.notify(c.userId, '清货已发货', `清货单 #${id} 已发货`);
            shipped++;
        }
        return { shipped };
    }
    /** 团员确认收货：已发货 → 已完成 */
    async confirmReceive(id, uid) {
        const c = await this.repo.findOneByOrFail({ id });
        if (c.userId !== uid || c.state !== '已发货')
            throw new common_1.BadRequestException('状态错误');
        await this.repo.update(id, { state: '已完成' });
        await this.notify(c.userId, '清货已收货', `清货单 #${id} 已确认收货，交易完成`);
        return { ok: true };
    }
    /** 自动确认收货：已发货超过72小时的清货单自动标记为已完成 */
    async autoConfirmReceive() {
        const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);
        const result = await this.repo
            .createQueryBuilder()
            .update()
            .set({ state: '已完成' })
            .where('state = :state', { state: '已发货' })
            .andWhere('shippedAt <= :cutoff', { cutoff })
            .execute();
        const affected = result.affected || 0;
        if (affected > 0) {
            console.log(`[autoConfirmReceive] ${affected} 单已自动确认收货`);
        }
        return { autoConfirmed: affected };
    }
    async notify(uid, title, body) {
        await this.userRepo.manager.getRepository(entities_1.Notification).save(this.userRepo.manager.getRepository(entities_1.Notification).create({ userId: uid, title, body }));
    }
    /** 团员查看自己的合并发货单 */
    async myMerges(uid) {
        const merges = await this.mergeRepo.find({ where: { ownerId: uid }, order: { id: 'desc' } });
        return merges;
    }
    /** 团员提交合并发货单的付款截图 */
    async submitMerge(uid, id, screenshot, useBalanceAmount) {
        const m = await this.mergeRepo.findOneByOrFail({ id });
        if (m.ownerId !== uid)
            throw new common_1.BadRequestException('无权操作');
        if (m.status !== '待发货')
            throw new common_1.BadRequestException('该合并发货单状态不支持付款');
        const total = +m.total;
        let useBal = Math.max(0, Math.min(useBalanceAmount || 0, total));
        let rest = total;
        if (useBal > 0) {
            await this.balance.debit(uid, useBal, '合单发货抵扣', `合并发货 ${m.mergeGroupId} 余额抵扣 ¥${useBal.toFixed(2)}`, `MG${id}`);
            rest = total - useBal;
            await this.mergeRepo.update(id, { total: rest.toFixed(2) });
        }
        if (rest <= 0) {
            await this.mergeRepo.update(id, { status: '待发货', addressSnapshot: m.addressSnapshot });
            return { paidOff: true, usedBalance: useBal };
        }
        if (!screenshot)
            throw new common_1.BadRequestException(`需扫码支付 ¥${rest.toFixed(2)}，请上传付款截图`);
        return { paidOff: false, rest, usedBalance: useBal };
    }
    /** 店主发货合并发货单 */
    async shipMerge(id, trackingNo, packImg) {
        await this.mergeRepo.update(id, { status: '已发货', trackingNo, packImg, shippedAt: new Date() });
        const m = await this.mergeRepo.findOneByOrFail({ id });
        await this.notify(m.ownerId, '合并发货已发货', `合并发货单 ${m.mergeGroupId} 物流单号：${trackingNo}`);
        return { ok: true };
    }
    /** 团员确认收货合并发货单 */
    async confirmMergeReceive(id, uid) {
        const m = await this.mergeRepo.findOneByOrFail({ id });
        if (m.ownerId !== uid || m.status !== '已发货')
            throw new common_1.BadRequestException('状态错误');
        await this.mergeRepo.update(id, { status: '已完成' });
        await this.notify(uid, '合并发货已收货', `合并发货单 ${m.mergeGroupId} 已确认收货`);
        return { ok: true };
    }
    /** 店主查看所有合并发货单 */
    async allMerges() {
        const merges = await this.mergeRepo.find({ order: { id: 'desc' } });
        const us = merges.length ? await this.userRepo.find({ where: { id: (0, typeorm_2.In)(merges.map(m => m.ownerId)) } }) : [];
        return merges.map(m => ({ ...m, cn: us.find(u => u.id === m.ownerId)?.cn || '' }));
    }
};
exports.ClearingService = ClearingService;
exports.ClearingService = ClearingService = __decorate([
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.Clearing)),
    __param(1, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __param(2, (0, typeorm_1.InjectRepository)(entities_1.Order)),
    __param(3, (0, typeorm_1.InjectRepository)(entities_1.OrderItem)),
    __param(4, (0, typeorm_1.InjectRepository)(entities_1.Good)),
    __param(5, (0, typeorm_1.InjectRepository)(entities_1.SaleGood)),
    __param(6, (0, typeorm_1.InjectRepository)(entities_1.Address)),
    __param(7, (0, typeorm_1.InjectRepository)(entities_1.Auction)),
    __param(8, (0, typeorm_1.InjectRepository)(entities_1.MergedShipment)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        shop_1.ShopService,
        balance_1.BalanceService])
], ClearingService);
let ClearingController = class ClearingController {
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
    async submit(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.submit(req.user.id, b.id, b.screenshot || '', b.useBalanceAmount);
    }
    async audit(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.audit(b.id, b.pass, b.packImg || '', req.user);
    }
    async ship(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.ship(b.id, b.trackingNo, b.packImg || '');
    }
    async batchShip(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.batchShip(b.ids || []);
    }
    async confirmReceive(req, b) {
        (0, common_2.checkRole)(req.user, ['banned-allowed']);
        return this.svc.confirmReceive(b.id, req.user.id);
    }
    async autoConfirmReceive(req) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.autoConfirmReceive();
    }
    async myMerges(req) {
        (0, common_2.checkRole)(req.user, ['banned-allowed']);
        return this.svc.myMerges(req.user.id);
    }
    async allMerges(req) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.allMerges();
    }
    async submitMerge(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.submitMerge(req.user.id, b.id, b.screenshot || '', b.useBalanceAmount);
    }
    async shipMerge(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.shipMerge(b.id, b.trackingNo, b.packImg || '');
    }
    async confirmMergeReceive(req, b) {
        (0, common_2.checkRole)(req.user, ['banned-allowed']);
        return this.svc.confirmMergeReceive(b.id, req.user.id);
    }
};
exports.ClearingController = ClearingController;
__decorate([
    (0, common_1.Post)('create'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ClearingController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('mine'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ClearingController.prototype, "mine", null);
__decorate([
    (0, common_1.Get)('all'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ClearingController.prototype, "all", null);
__decorate([
    (0, common_1.Post)('submit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ClearingController.prototype, "submit", null);
__decorate([
    (0, common_1.Post)('audit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ClearingController.prototype, "audit", null);
__decorate([
    (0, common_1.Post)('ship'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ClearingController.prototype, "ship", null);
__decorate([
    (0, common_1.Post)('batch-ship'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ClearingController.prototype, "batchShip", null);
__decorate([
    (0, common_1.Post)('confirm-receive'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ClearingController.prototype, "confirmReceive", null);
__decorate([
    (0, common_1.Post)('auto-confirm-receive'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ClearingController.prototype, "autoConfirmReceive", null);
__decorate([
    (0, common_1.Get)('merges/mine'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ClearingController.prototype, "myMerges", null);
__decorate([
    (0, common_1.Get)('merges/all'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ClearingController.prototype, "allMerges", null);
__decorate([
    (0, common_1.Post)('merges/submit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ClearingController.prototype, "submitMerge", null);
__decorate([
    (0, common_1.Post)('merges/ship'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ClearingController.prototype, "shipMerge", null);
__decorate([
    (0, common_1.Post)('merges/confirm-receive'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ClearingController.prototype, "confirmMergeReceive", null);
exports.ClearingController = ClearingController = __decorate([
    (0, common_1.Controller)('clearing'),
    __metadata("design:paramtypes", [ClearingService])
], ClearingController);
exports.ClearingModuleRef = typeorm_1.TypeOrmModule.forFeature([entities_1.Clearing, entities_1.User, entities_1.Order, entities_1.OrderItem, entities_1.Good, entities_1.SaleGood, entities_1.Address, entities_1.Auction, entities_1.MergedShipment]);
