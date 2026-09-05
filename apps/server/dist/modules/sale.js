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
exports.SaleModuleRef = exports.SaleController = exports.SaleService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../entities");
const common_2 = require("../common");
const balance_1 = require("./balance");
let SaleService = class SaleService {
    constructor(repo, userRepo, orderRepo, itemRepo, balance) {
        this.repo = repo;
        this.userRepo = userRepo;
        this.orderRepo = orderRepo;
        this.itemRepo = itemRepo;
        this.balance = balance;
    }
    async list(q) {
        const where = {};
        if (q)
            where.name = (0, typeorm_2.Like)(`%${q}%`);
        const goods = await this.repo.find(q ? { where: { name: (0, typeorm_2.Like)(`%${q}%`) } } : {});
        // IP/所属者模糊搜索在内存过滤（SQLite Like 中文可用）
        const all = q ? await this.repo.find() : goods;
        const r = q ? all.filter(g => g.name.includes(q) || g.ip.includes(q) || g.ownerCn.includes(q)) : all;
        return r.filter(g => g.stock > 0).sort((a, b) => b.id - a.id);
    }
    async save(b) {
        // 验证 ownerCn 存在性（非店主/空时必须是注册团员）
        if (b.ownerCn && b.ownerCn !== '店主') {
            const owner = await this.userRepo.findOneBy({ cn: b.ownerCn });
            if (!owner)
                throw new common_1.BadRequestException(`所属者CN「${b.ownerCn}」不存在，请检查团员是否已注册`);
        }
        // commissionRate 默认 0%
        if (b.commissionRate === undefined && !b.id) {
            b.commissionRate = '0.00';
        }
        if (b.id) {
            await this.repo.update(b.id, b);
            return this.repo.findOneByOrFail({ id: b.id });
        }
        const g = await this.repo.save(this.repo.create(b));
        if (!g.no)
            await this.repo.update(g.id, { no: 'ZS-' + String(g.id).padStart(4, '0') });
        return this.repo.findOneByOrFail({ id: g.id });
    }
    /** 补库存 */
    async restock(id, addQty) {
        const g = await this.repo.findOneByOrFail({ id });
        g.stock += addQty;
        await this.repo.save(g);
        return this.repo.findOneByOrFail({ id });
    }
    /** 删除直售谷子 */
    async remove(id) {
        await this.repo.delete(id);
        return { ok: true };
    }
    /** CSV 批量导入直售谷子 */
    async importGoods(rows) {
        let count = 0;
        for (const r of rows) {
            if (!r.name)
                continue;
            // 验证 ownerCn 存在性
            if (r.ownerCn && r.ownerCn !== '店主') {
                const owner = await this.userRepo.findOneBy({ cn: r.ownerCn });
                if (!owner)
                    continue; // 跳过无效 ownerCn，导入时静默忽略
            }
            const g = await this.repo.save(this.repo.create({
                name: r.name, ip: r.ip || '', cat: r.cat || '全新未拆单领',
                price: (+r.price).toFixed(2), stock: +r.stock || 1,
                emoji: r.emoji || '🎁', ownerCn: r.ownerCn || '店主',
                commissionRate: r.commissionRate !== undefined ? (+r.commissionRate).toFixed(2) : '0.00',
            }));
            if (!g.no)
                await this.repo.update(g.id, { no: 'ZS-' + String(g.id).padStart(4, '0') });
            count++;
        }
        return { imported: count };
    }
    /** 购买：库存递减（事务），生成直售订单（待付款）；囤店或直接清货 */
    async buy(uid, goodId, qty, blindShipMode) {
        return this.batchBuy(uid, [{ goodId, qty }], blindShipMode);
    }
    /** 批量购买：多个直售谷子合为单笔订单，一起结算（事务保护，防止高并发超卖） */
    async batchBuy(uid, items, blindShipMode) {
        if (!items || items.length === 0)
            throw new common_1.BadRequestException('购物车为空');
        const goodIds = items.map(it => it.goodId);
        if (new Set(goodIds).size !== goodIds.length)
            throw new common_1.BadRequestException('购物车中存在重复商品');
        return this.repo.manager.transaction(async (transactionalEntityManager) => {
            const saleRepo = transactionalEntityManager.getRepository(entities_1.SaleGood);
            const orderRepo = transactionalEntityManager.getRepository(entities_1.Order);
            const itemRepo = transactionalEntityManager.getRepository(entities_1.OrderItem);
            let total = 0;
            const orderItems = [];
            const names = [];
            let hasBlind = false;
            for (const it of items) {
                if (it.qty <= 0)
                    throw new common_1.BadRequestException('数量必须大于0');
                const g = await saleRepo.findOneOrFail({
                    where: { id: it.goodId },
                    lock: { mode: 'pessimistic_write' },
                });
                if (it.qty > 99)
                    throw new common_1.BadRequestException(`${g.name} 单次购买数量不能超过99`);
                if (g.stock < it.qty)
                    throw new common_1.BadRequestException(`${g.name} 库存不足（剩 ${g.stock}）`);
                if (g.cat === '盲抽')
                    hasBlind = true;
                g.stock -= it.qty;
                await saleRepo.save(g);
                total += +g.price * it.qty;
                orderItems.push({ goodId: g.id, name: g.name, price: g.price, qty: it.qty });
                names.push(`${g.name}×${it.qty}`);
            }
            // 若包含盲抽商品，必须传入发货模式
            if (hasBlind && !blindShipMode) {
                throw new common_1.BadRequestException('盲抽商品需选择发货模式：video（需要视频选择且拆开）或 random（直接随机发货不拆开）');
            }
            const order = await orderRepo.save(orderRepo.create({
                userId: uid, seriesId: 0, status: '待付款', total: total.toFixed(2),
                blindShipMode: blindShipMode || '',
            }));
            for (const oi of orderItems) {
                await itemRepo.save(itemRepo.create({ orderId: order.id, ...oi }));
            }
            const nRepo = transactionalEntityManager.getRepository(entities_1.Notification);
            await nRepo.save(nRepo.create({ userId: uid, title: '直售下单成功', body: `${names.join('，')}，请付款并提交截图（¥${order.total}）` }));
            return order;
        });
    }
    /** 直售订单付款：支持余额部分抵扣 + 截图补齐 */
    async pay(uid, orderId, useBalanceAmount, screenshot = '') {
        const o = await this.orderRepo.findOneByOrFail({ id: orderId });
        if (o.userId !== uid || o.status !== '待付款')
            throw new common_1.BadRequestException('状态错误');
        const total = +o.total;
        let useBal = Math.max(0, Math.min(useBalanceAmount || 0, total));
        let rest = total;
        if (useBal > 0) {
            await this.balance.debit(uid, useBal, '直售抵扣', `直售订单 #${orderId} 余额抵扣 ¥${useBal.toFixed(2)}`, String(orderId));
            rest = total - useBal;
            await this.orderRepo.update(orderId, { total: rest.toFixed(2) });
        }
        if (rest <= 0) {
            await this.orderRepo.update(orderId, { status: '囤货中', paidAt: new Date() });
            return { paidOff: true, usedBalance: useBal };
        }
        if (!screenshot)
            throw new common_1.BadRequestException(`需扫码支付 ¥${rest.toFixed(2)}，请上传付款截图`);
        await this.orderRepo.update(orderId, { status: '已提交截图', screenshot, paidAt: new Date(), opLog: (o.opLog || '') + `\n${new Date().toISOString()} 余额抵扣 ¥${useBal.toFixed(2)}，扫码付 ¥${rest.toFixed(2)}` });
        return { paidOff: false, rest, usedBalance: useBal };
    }
    /** 店主审核直售付款 */
    async audit(orderId, pass) {
        const o = await this.orderRepo.findOneByOrFail({ id: orderId });
        if (o.status !== '已提交截图')
            throw new common_1.BadRequestException('状态错误');
        await this.orderRepo.update(orderId, { status: pass ? '囤货中' : '待付款', ...(pass ? { paidAt: new Date() } : {}) });
        return { ok: true };
    }
    /** 团员申请取消直售订单 */
    async requestCancel(uid, orderId) {
        const o = await this.orderRepo.findOneByOrFail({ id: orderId });
        if (o.userId !== uid)
            throw new common_1.ForbiddenException();
        if (o.seriesId !== 0)
            throw new common_1.BadRequestException('非直售订单');
        if (['已发货', '已完成', '已取消', '已取消（超时）'].includes(o.status))
            throw new common_1.BadRequestException('当前状态不可取消');
        const hours = (Date.now() - new Date(o.createdAt).getTime()) / 3600_000;
        if (hours >= 48)
            throw new common_1.BadRequestException('超过48小时不可取消');
        if (hours < 24) {
            // 24h内直接取消，恢复库存
            await this.doCancel(o, '团员24h内直接取消');
            return { action: 'cancelled' };
        }
        // 24-48h：提交取消申请
        const prevStatus = o.status;
        await this.orderRepo.update(orderId, { cancelRequestAt: new Date(), status: '申请取消' });
        const notifRepo = this.orderRepo.manager.getRepository(entities_1.Notification);
        await notifRepo.save(notifRepo.create({
            userId: 1, // 通知团长
            title: '直售取消申请',
            body: `订单 #${orderId} 申请取消，团员24-48h内提出，请尽快审核`,
        }));
        return { action: 'requested' };
    }
    /** 团长审核取消申请 */
    async auditCancel(orderId, pass, note) {
        const o = await this.orderRepo.findOneByOrFail({ id: orderId });
        if (!o.cancelRequestAt)
            throw new common_1.BadRequestException('没有取消申请');
        const notifRepo = this.orderRepo.manager.getRepository(entities_1.Notification);
        if (pass) {
            await this.doCancel(o, `团长审核通过取消${note ? '：' + note : ''}`);
            await notifRepo.save(notifRepo.create({
                userId: o.userId, title: '直售取消已通过',
                body: `订单 #${orderId} 取消申请已通过，库存已恢复`,
            }));
            return { action: 'cancelled' };
        }
        // 拒绝：清除申请标记，恢复之前状态
        await this.orderRepo.update(orderId, { cancelRequestAt: null, status: '待付款' });
        await notifRepo.save(notifRepo.create({
            userId: o.userId, title: '直售取消被拒绝',
            body: `订单 #${orderId} 取消申请被拒绝${note ? '：' + note : ''}，请继续付款`,
        }));
        return { action: 'rejected' };
    }
    /** 执行取消：标记已取消 + 恢复库存 */
    async doCancel(o, reason) {
        const items = await this.itemRepo.find({ where: { orderId: o.id } });
        for (const it of items) {
            const g = await this.repo.findOneBy({ id: it.goodId });
            if (g) {
                g.stock += it.qty;
                await this.repo.save(g);
            }
        }
        await this.orderRepo.update(o.id, { status: '已取消', cancelRequestAt: null, opLog: (o.opLog || '') + `\n${new Date().toISOString()} ${reason}` });
    }
    /** 待审核的取消申请列表（后台） */
    async pendingCancelAudits() {
        const os = await this.orderRepo.find({
            where: { seriesId: 0, cancelRequestAt: (0, typeorm_2.Not)((0, typeorm_2.IsNull)()) },
            order: { id: 'desc' },
        });
        const us = os.length ? await this.userRepo.find({ where: { id: (0, typeorm_2.In)(os.map(o => o.userId)) } }) : [];
        const items = os.length ? await this.itemRepo.find({ where: { orderId: (0, typeorm_2.In)(os.map(o => o.id)) } }) : [];
        return os.map(o => ({
            ...o,
            cn: us.find(u => u.id === o.userId)?.cn || '',
            hours: Math.round((Date.now() - new Date(o.createdAt).getTime()) / 3600_000 * 10) / 10,
            items: items.filter(i => i.orderId == o.id),
        }));
    }
    /** 待审核直售订单（后台） */
    async pendingAudit() {
        const os = await this.orderRepo.find({ where: { seriesId: 0, status: '已提交截图' }, order: { id: 'desc' } });
        const us = os.length ? await this.userRepo.find({ where: { id: (0, typeorm_2.In)(os.map(o => o.userId)) } }) : [];
        return os.map(o => ({ ...o, cn: us.find(u => u.id === o.userId)?.cn || '' }));
    }
    /** 全部直售订单（后台） */
    async allOrders() {
        const os = await this.orderRepo.find({ where: { seriesId: 0 }, order: { id: 'desc' } });
        const us = os.length ? await this.userRepo.find({ where: { id: (0, typeorm_2.In)(os.map(o => o.userId)) } }) : [];
        return os.map(o => ({ ...o, cn: us.find(u => u.id === o.userId)?.cn || '' }));
    }
    async myBuys(uid) {
        const orders = await this.orderRepo.find({ where: { userId: uid }, order: { id: 'desc' } });
        const orderIds = orders.map(o => o.id);
        const items = orderIds.length ? await this.itemRepo.find({ where: { orderId: (0, typeorm_2.In)(orderIds) } }) : [];
        const seriesIds = [...new Set(orders.filter(o => o.seriesId !== 0).map(o => o.seriesId))];
        const seriesList = seriesIds.length ? await this.orderRepo.manager.getRepository(entities_1.Series).find({ where: { id: (0, typeorm_2.In)(seriesIds) } }) : [];
        return orders.map(o => ({
            ...o,
            items: items.filter(i => i.orderId == o.id),
            seriesName: seriesList.find(s => s.id === o.seriesId)?.name || '',
            hours: Math.round((Date.now() - new Date(o.createdAt).getTime()) / 3600_000 * 10) / 10,
        }));
    }
};
exports.SaleService = SaleService;
exports.SaleService = SaleService = __decorate([
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.SaleGood)),
    __param(1, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __param(2, (0, typeorm_1.InjectRepository)(entities_1.Order)),
    __param(3, (0, typeorm_1.InjectRepository)(entities_1.OrderItem)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        balance_1.BalanceService])
], SaleService);
let SaleController = class SaleController {
    constructor(svc) {
        this.svc = svc;
    }
    async list(q) { return this.svc.list(q || ''); }
    async save(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.save(b);
    }
    async restock(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.restock(b.id, b.qty);
    }
    async remove(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.remove(b.id);
    }
    async importGoods(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.importGoods(b.rows);
    }
    async buy(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.buy(req.user.id, b.goodId, b.qty);
    }
    async batchBuy(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.batchBuy(req.user.id, b.items, b.blindShipMode);
    }
    async pay(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.pay(req.user.id, b.orderId, b.useBalanceAmount, b.screenshot);
    }
    async audit(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.audit(b.orderId, b.pass);
    }
    async pendingAudit(req) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.pendingAudit();
    }
    async allOrders(req) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.allOrders();
    }
    async my(req) {
        (0, common_2.checkRole)(req.user, ['banned-allowed']);
        return this.svc.myBuys(req.user.id);
    }
    async cancelReq(req, b) {
        (0, common_2.checkRole)(req.user, ['banned-allowed']);
        return this.svc.requestCancel(req.user.id, b.orderId);
    }
    async cancelAudit(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.auditCancel(b.orderId, b.pass, b.note || '');
    }
    async pendingCancel(req) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.pendingCancelAudits();
    }
};
exports.SaleController = SaleController;
__decorate([
    (0, common_1.Get)('list'),
    __param(0, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('save'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "save", null);
__decorate([
    (0, common_1.Post)('restock'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "restock", null);
__decorate([
    (0, common_1.Post)('delete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('import'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "importGoods", null);
__decorate([
    (0, common_1.Post)('buy'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "buy", null);
__decorate([
    (0, common_1.Post)('batch-buy'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "batchBuy", null);
__decorate([
    (0, common_1.Post)('pay'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "pay", null);
__decorate([
    (0, common_1.Post)('audit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "audit", null);
__decorate([
    (0, common_1.Get)('pending-audit'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "pendingAudit", null);
__decorate([
    (0, common_1.Get)('all'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "allOrders", null);
__decorate([
    (0, common_1.Get)('my-buys'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "my", null);
__decorate([
    (0, common_1.Post)('cancel-request'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "cancelReq", null);
__decorate([
    (0, common_1.Post)('cancel-audit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "cancelAudit", null);
__decorate([
    (0, common_1.Get)('pending-cancel'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SaleController.prototype, "pendingCancel", null);
exports.SaleController = SaleController = __decorate([
    (0, common_1.Controller)('sale'),
    __metadata("design:paramtypes", [SaleService])
], SaleController);
exports.SaleModuleRef = typeorm_1.TypeOrmModule.forFeature([entities_1.SaleGood, entities_1.User, entities_1.Order, entities_1.OrderItem]);
