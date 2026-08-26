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
exports.GroupModuleRef = exports.GroupController = exports.GroupService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../entities");
const common_2 = require("../common");
let GroupService = class GroupService {
    constructor(seriesRepo, goodRepo, orderRepo, itemRepo, billRepo, userRepo) {
        this.seriesRepo = seriesRepo;
        this.goodRepo = goodRepo;
        this.orderRepo = orderRepo;
        this.itemRepo = itemRepo;
        this.billRepo = billRepo;
        this.userRepo = userRepo;
    }
    async listSeries() {
        const ss = await this.seriesRepo.find({ order: { id: 'desc' } });
        const ids = ss.map(s => s.id);
        const goods = ids.length ? await this.goodRepo.find({ where: { seriesId: (0, typeorm_2.In)(ids) } }) : [];
        return ss.map(s => {
            const gs = goods.filter(g => g.seriesId === s.id);
            return { ...s, goodCount: gs.length, cats: [...new Set(gs.map(g => g.cat))] };
        });
    }
    async seriesDetail(id) {
        const s = await this.seriesRepo.findOneByOrFail({ id });
        const goods = await this.goodRepo.find({ where: { seriesId: id }, order: { id: 'asc' } });
        return { series: s, goods };
    }
    async createSeries(b, uid) {
        const s = await this.seriesRepo.save(this.seriesRepo.create({ ...b, status: b.status || '预排' }));
        const result = await this.seriesRepo.findOneByOrFail({ id: s.id });
        await this.log(s.id, uid, '创建系列');
        return result;
    }
    async updateSeries(id, b, uid) {
        await this.seriesRepo.update(id, b);
        await this.log(id, uid, '修改系列信息');
        return this.seriesRepo.findOneByOrFail({ id });
    }
    /** 新增/修改谷子（分类自定义，标签栏自动生成） */
    async saveGood(b, uid) {
        const g = await this.goodRepo.save(this.goodRepo.create(b));
        await this.log(g.seriesId, uid, `保存谷子 ${g.name}`);
        return g;
    }
    /** 批量调价：加/减/乘/除，可按分类 */
    async batchPrice(seriesId, op, val, cat, uid) {
        if (!(val > 0))
            throw new common_1.BadRequestException('数值必须大于0');
        const where = { seriesId };
        if (cat)
            where.cat = cat;
        const goods = await this.goodRepo.find({ where });
        for (const g of goods) {
            let p = +g.price;
            if (op === 'add')
                p += val;
            else if (op === 'sub')
                p = Math.max(0, p - val);
            else if (op === 'mul')
                p = p * val;
            else
                p = p / val;
            g.price = p.toFixed(2);
        }
        await this.goodRepo.save(goods);
        await this.log(seriesId, uid, `批量调价 ${op} ${val} ${cat || '整表'}，共 ${goods.length} 项`);
        return { updated: goods.length };
    }
    /** 余量表 */
    async remainTable(seriesId) {
        const goods = await this.goodRepo.find({ where: { seriesId }, order: { id: 'asc' } });
        return goods.map(g => ({ name: g.name, cat: g.cat, total: g.limit, booked: g.booked, remain: Math.max(0, g.limit - g.booked) }));
    }
    /** 团员跟排：合并进同系列同状态订单；记录谷序 */
    async follow(uid, seriesId, items) {
        const s = await this.seriesRepo.findOneByOrFail({ id: seriesId });
        if (s.status !== '进行中' && s.status !== '预排')
            throw new common_1.ForbiddenException(`当前状态（${s.status}）不可跟排`);
        let order = await this.orderRepo.findOne({ where: { userId: uid, seriesId, status: '跟排中' } });
        if (!order) {
            order = await this.orderRepo.save(this.orderRepo.create({ userId: uid, seriesId }));
        }
        let total = +order.total;
        for (const it of items) {
            if (it.qty <= 0)
                continue;
            const g = await this.goodRepo.findOneByOrFail({ id: it.goodId });
            let item = await this.itemRepo.findOne({ where: { orderId: order.id, goodId: it.goodId } });
            const startSeq = item ? (item.seqs ? item.seqs.split(',').map(Number).filter(Boolean) : []) : [];
            const newSeqs = [...startSeq];
            for (let i = 1; i <= it.qty; i++)
                newSeqs.push(g.booked + i); // 超排也分配谷序（候补）
            g.booked += it.qty;
            await this.goodRepo.save(g);
            if (item) {
                item.qty += it.qty;
                item.seqs = newSeqs.join(',');
            }
            else
                item = this.itemRepo.create({ orderId: order.id, goodId: g.id, name: g.name, price: g.price, qty: it.qty, seqs: newSeqs.join(',') });
            await this.itemRepo.save(item);
            total += +g.price * it.qty;
        }
        order.total = total.toFixed(2);
        await this.orderRepo.save(order);
        return order;
    }
    /** 拆分订单：修改首项保留数量，剩余生成新单（超配拆单场景） */
    async splitOrder(orderId, keepQty, auditor) {
        const o = await this.orderRepo.findOneByOrFail({ id: orderId });
        const items = await this.itemRepo.find({ where: { orderId } });
        if (!items.length || keepQty >= items[0].qty)
            throw new common_1.BadRequestException('保留数量需小于原数量');
        const rest = items[0].qty - keepQty;
        items[0].seqs = items[0].seqs.split(',').slice(0, keepQty).join(',');
        items[0].qty = keepQty;
        await this.itemRepo.save(items[0]);
        const kept = items.reduce((a, i) => a + +i.price * i.qty, 0);
        const newOrder = await this.orderRepo.save(this.orderRepo.create({ userId: o.userId, seriesId: o.seriesId, status: o.status, total: (rest * +items[0].price).toFixed(2) }));
        await this.itemRepo.save(this.itemRepo.create({ orderId: newOrder.id, goodId: items[0].goodId, name: items[0].name, price: items[0].price, qty: rest, seqs: '' }));
        await this.orderRepo.update(o.id, { total: kept.toFixed(2), opLog: `${o.opLog}
${new Date().toISOString()} ${auditor.cn} 拆分，保留${keepQty}件` });
        return { kept, newOrderId: newOrder.id };
    }
    /** 合并订单：同团同状态（跟排中/待付款）合并为一单 */
    async mergeOrders(orderId, targetId, auditor) {
        const a = await this.orderRepo.findOneByOrFail({ id: orderId });
        const b = await this.orderRepo.findOneByOrFail({ id: targetId });
        if (a.userId !== b.userId || a.seriesId !== b.seriesId || a.status !== b.status)
            throw new common_1.BadRequestException('仅限同团员同系列同状态订单合并');
        const itemsB = await this.itemRepo.find({ where: { orderId: targetId } });
        for (const it of itemsB) {
            const ex = await this.itemRepo.findOne({ where: { orderId, goodId: it.goodId } });
            if (ex) {
                ex.qty += it.qty;
                ex.seqs = [ex.seqs, it.seqs].filter(Boolean).join(',');
                await this.itemRepo.save(ex);
                await this.itemRepo.delete(it.id);
            }
            else {
                it.orderId = orderId;
                await this.itemRepo.save(it);
            }
        }
        await this.orderRepo.update(orderId, { total: (+a.total + +b.total).toFixed(2) });
        await this.orderRepo.delete(targetId);
        return { ok: true };
    }
    /** 我的跟排订单 */
    async myOrders(uid) {
        const orders = await this.orderRepo.find({ where: { userId: uid }, order: { id: 'desc' } });
        const items = await this.itemRepo.find({ where: { orderId: (0, typeorm_2.In)(orders.map(o => o.id) || [0]) } });
        return orders.map(o => ({ ...o, items: items.filter(i => i.orderId == o.id) }));
    }
    /** 截团：冻结排表 → 生成肾表 → 通知 */
    async jietuan(seriesId, uid) {
        const s = await this.seriesRepo.findOneByOrFail({ id: seriesId });
        if (s.status !== '进行中' && s.status !== '预排')
            throw new common_1.BadRequestException(`状态 ${s.status} 不可截团`);
        const orders = await this.orderRepo.find({ where: { seriesId, status: '跟排中' } });
        const notifRepo = this.seriesRepo.manager.getRepository(entities_1.Notification);
        for (const o of orders) {
            await this.billRepo.save(this.billRepo.create({
                userId: o.userId, seriesId, orderId: o.id, total: o.total, state: '待付款',
            }));
            await this.orderRepo.update(o.id, { status: '待付款' });
            await notifRepo.save(notifRepo.create({
                userId: o.userId, title: '拼团已截团',
                body: `「${s.name}」已截团，肾表已生成（¥${o.total}），请前往我的肾表付款`,
            }));
        }
        await this.seriesRepo.update(seriesId, { status: '已截团' });
        await this.log(seriesId, uid, `截团：生成 ${orders.length} 张肾表`);
        return { bills: orders.length };
    }
    /** 我的肾表 */
    async myBills(uid) {
        const bills = await this.billRepo.find({ where: { userId: uid }, order: { id: 'desc' } });
        const orders = bills.length ? await this.orderRepo.find({ where: { id: (0, typeorm_2.In)(bills.map(b => b.orderId)) } }) : [];
        const items = await this.itemRepo.find({ where: { orderId: (0, typeorm_2.In)(orders.map(o => o.id) || [0]) } });
        const names = bills.map(b => {
            const o = orders.find(x => x.id === b.orderId);
            return { ...b, seriesName: o ? '' : '', items: items.filter(i => i.orderId == b.orderId) };
        });
        const ss = bills.length ? await this.seriesRepo.find({ where: { id: (0, typeorm_2.In)(bills.map(b => b.seriesId)) } }) : [];
        return names.map(b => ({ ...b, seriesName: ss.find(s => s.id === b.seriesId)?.name || '' }));
    }
    /** 提交付款截图 */
    async submitBill(uid, billId, screenshot, useBalanceAmount) {
        const b = await this.billRepo.findOneByOrFail({ id: billId });
        if (b.userId !== uid)
            throw new common_1.ForbiddenException();
        if (b.state !== '待付款')
            throw new common_1.BadRequestException('当前状态不可提交');
        const total = +b.total;
        let useBal = Math.max(0, Math.min(useBalanceAmount || 0, total));
        let rest = total;
        if (useBal > 0) {
            const user = await this.userRepo.findOneByOrFail({ id: uid });
            const bal = +user.balance;
            if (bal < useBal)
                throw new common_1.BadRequestException(`余额不足（当前 ¥${bal.toFixed(2)}，需抵扣 ¥${useBal.toFixed(2)}）`);
            user.balance = (bal - useBal).toFixed(2);
            await this.userRepo.save(user);
            rest = total - useBal;
            await this.billRepo.update(billId, {
                total: rest.toFixed(2),
                opLog: `${b.opLog}\n${new Date().toISOString()} 余额抵扣 ¥${useBal.toFixed(2)}（剩余待付 ¥${rest.toFixed(2)}）`,
            });
        }
        if (rest <= 0) {
            // 余额全额抵扣，直接销账
            await this.billRepo.update(billId, { state: '已销账' });
            await this.orderRepo.update(b.orderId, { status: '囤货中' });
            return { paidOff: true, usedBalance: useBal };
        }
        if (!screenshot)
            throw new common_1.BadRequestException(`需扫码支付 ¥${rest.toFixed(2)}，请上传付款截图`);
        await this.billRepo.update(billId, { state: '已提交截图', screenshot });
        return { paidOff: false, rest, usedBalance: useBal };
    }
    /** 店主/管理员审核：通过销账 / 打回 */
    async auditBill(billId, pass, note, auditor) {
        const b = await this.billRepo.findOneByOrFail({ id: billId });
        if (b.state !== '已提交截图')
            throw new common_1.BadRequestException('状态不允许审核');
        if (pass) {
            await this.billRepo.update(billId, { state: '已销账', auditNote: note, opLog: `${b.opLog}\n${new Date().toISOString()} ${auditor.cn} 通过销账` });
            await this.orderRepo.update(b.orderId, { status: '囤货中' });
        }
        else {
            await this.billRepo.update(billId, { state: '待付款', auditNote: note, opLog: `${b.opLog}\n${new Date().toISOString()} ${auditor.cn} 打回：${note}` });
        }
        const nRepo = this.billRepo.manager.getRepository(entities_1.Notification);
        await nRepo.save(nRepo.create({
            userId: b.userId, title: pass ? '肾表审核通过' : '肾表审核被打回',
            body: `肾表 #${billId} ${pass ? '已销账完成，谷子进入囤货' : `被打回：${note}，请重新付款提交`}`,
        }));
        return { ok: true };
    }
    /** 全部肾表（后台） */
    async allBills() {
        const bills = await this.billRepo.find({ order: { id: 'desc' } });
        const users = bills.length ? await this.userRepo.find({ where: { id: (0, typeorm_2.In)(bills.map(b => b.userId)) } }) : [];
        const ss = bills.length ? await this.seriesRepo.find({ where: { id: (0, typeorm_2.In)(bills.map(b => b.seriesId)) } }) : [];
        return bills.map(b => ({
            ...b, cn: users.find(u => u.id === b.userId)?.cn || '',
            seriesName: ss.find(s => s.id === b.seriesId)?.name || '',
        }));
    }
    /** 到货标记（单/多谷子） */
    async markArrived(seriesId, goodIds, arrived, uid) {
        if (goodIds.length === 0) {
            await this.goodRepo.update({ seriesId }, { arrived });
            await this.log(seriesId, uid, `整批标记到货：${arrived}`);
        }
        else {
            await this.goodRepo.update(goodIds.map(id => ({ id })), { arrived });
            await this.log(seriesId, uid, `标记到货：${goodIds.length} 件 ${arrived}`);
        }
        return { updated: goodIds.length || (await this.goodRepo.count({ where: { seriesId } })) };
    }
    /** CSV 排表导入 */
    async importGoods(seriesId, rows) {
        const created = [];
        for (const r of rows) {
            if (!r.name)
                continue;
            const g = await this.goodRepo.save(this.goodRepo.create({
                seriesId, name: r.name, cat: r.cat || '',
                price: (+r.price).toFixed(2), limit: +r.limit || 0,
                emoji: r.emoji || '🎁',
            }));
            created.push(g);
        }
        return { imported: created.length };
    }
    /** 排表导出 CSV */
    exportGoodsCSV(seriesId) {
        return this.goodRepo.find({ where: { seriesId }, order: { id: 'asc' } });
    }
    /** CN 自查：团员查自己全部跟排/购买/拍卖记录汇总 */
    async cnSelfCheck(uid) {
        const orders = await this.orderRepo.find({ where: { userId: uid }, order: { id: 'desc' } });
        const orderIds = orders.map(o => o.id);
        const items = orderIds.length ? await this.itemRepo.find({ where: { orderId: (0, typeorm_2.In)(orderIds) } }) : [];
        const bills = await this.billRepo.find({ where: { userId: uid } });
        const seriesIds = [...new Set(orders.map(o => o.seriesId))];
        const ss = seriesIds.length ? await this.seriesRepo.find({ where: { id: (0, typeorm_2.In)(seriesIds) } }) : [];
        const saleRepo = this.orderRepo.manager.getRepository('SaleGood');
        // 直售订单（seriesId=0）
        const saleOrders = orders.filter(o => o.seriesId === 0);
        const saleItems = saleOrders.length ? items.filter(i => saleOrders.some(o => o.id === i.orderId)) : [];
        // 拍卖记录
        const aucRepo = this.orderRepo.manager.getRepository('Auction');
        const auctions = await aucRepo.createQueryBuilder('a')
            .leftJoin('auction_bids', 'ab', 'ab.auctionId = a.id')
            .where('ab.userId = :uid', { uid })
            .select(['a.id', 'a.name', 'a.curPrice', 'a.state', 'a.winnerId'])
            .getMany();
        return {
            groupOrders: orders.filter(o => o.seriesId !== 0).map(o => ({
                ...o,
                seriesName: ss.find(s => s.id === o.seriesId)?.name || '',
                items: items.filter(i => i.orderId == o.id),
            })),
            saleOrders: saleOrders.map(o => ({ ...o, items: saleItems.filter(i => i.orderId == o.id) })),
            bills: bills.map(b => ({ ...b, seriesName: ss.find(s => s.id === b.seriesId)?.name || '' })),
            auctions: auctions.map(a => ({
                id: a.id, name: a.name, curPrice: a.curPrice,
                state: a.state, isWinner: a.winnerId === uid,
            })),
        };
    }
    async log(seriesId, uid, msg) {
        const s = await this.seriesRepo.findOneBy({ id: seriesId });
        if (s) {
            // 操作留痕写入订单日志流（简化：系列内最近订单 opLog 不动，用控制台+通知留痕）
            console.log(`[op-log] series=${seriesId} by=${uid} ${msg}`);
        }
    }
};
exports.GroupService = GroupService;
exports.GroupService = GroupService = __decorate([
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.Series)),
    __param(1, (0, typeorm_1.InjectRepository)(entities_1.Good)),
    __param(2, (0, typeorm_1.InjectRepository)(entities_1.Order)),
    __param(3, (0, typeorm_1.InjectRepository)(entities_1.OrderItem)),
    __param(4, (0, typeorm_1.InjectRepository)(entities_1.KidneyBill)),
    __param(5, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], GroupService);
let GroupController = class GroupController {
    constructor(svc) {
        this.svc = svc;
    }
    async list() { return this.svc.listSeries(); }
    async detail(id) { return this.svc.seriesDetail(+id); }
    async create(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.createSeries(b, req.user.id);
    }
    async update(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.updateSeries(b.id, b, req.user.id);
    }
    async saveGood(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.saveGood(b, req.user.id);
    }
    async batchPrice(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.batchPrice(b.seriesId, b.op, b.val, b.cat || '', req.user.id);
    }
    async remain(seriesId) { return this.svc.remainTable(+seriesId); }
    async follow(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.follow(req.user.id, b.seriesId, b.items);
    }
    async myOrders(req) {
        (0, common_2.checkRole)(req.user, ['banned-allowed']);
        return this.svc.myOrders(req.user.id);
    }
    async split(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.splitOrder(b.orderId, b.keepQty, req.user);
    }
    async merge(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.mergeOrders(b.orderId, b.targetId, req.user);
    }
    async jietuan(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.jietuan(b.seriesId, req.user.id);
    }
    async myBills(req) {
        (0, common_2.checkRole)(req.user, ['banned-allowed']);
        return this.svc.myBills(req.user.id);
    }
    async allBills(req) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.allBills();
    }
    async submit(req, b) {
        (0, common_2.checkRole)(req.user, ['banned-allowed']);
        return this.svc.submitBill(req.user.id, b.billId, b.screenshot || '', b.useBalanceAmount || 0);
    }
    async audit(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.auditBill(b.billId, b.pass, b.note || '', req.user);
    }
    async markArrive(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.markArrived(b.seriesId, b.goodIds || [], b.arrived, req.user.id);
    }
    async importGoods(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.importGoods(b.seriesId, b.rows);
    }
    async exportGoods(seriesId) {
        return this.svc.exportGoodsCSV(+seriesId);
    }
    async cnSelfCheck(req) {
        (0, common_2.checkRole)(req.user, ['banned-allowed']);
        return this.svc.cnSelfCheck(req.user.id);
    }
};
exports.GroupController = GroupController;
__decorate([
    (0, common_1.Get)('series'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('series/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "detail", null);
__decorate([
    (0, common_1.Post)('series/create'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('series/update'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('good/save'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "saveGood", null);
__decorate([
    (0, common_1.Post)('batch-price'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "batchPrice", null);
__decorate([
    (0, common_1.Get)('remain/:seriesId'),
    __param(0, (0, common_1.Param)('seriesId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "remain", null);
__decorate([
    (0, common_1.Post)('follow'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "follow", null);
__decorate([
    (0, common_1.Get)('my-orders'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "myOrders", null);
__decorate([
    (0, common_1.Post)('order/split'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "split", null);
__decorate([
    (0, common_1.Post)('order/merge'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "merge", null);
__decorate([
    (0, common_1.Post)('jietuan'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "jietuan", null);
__decorate([
    (0, common_1.Get)('my-bills'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "myBills", null);
__decorate([
    (0, common_1.Get)('all-bills'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "allBills", null);
__decorate([
    (0, common_1.Post)('bill/submit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "submit", null);
__decorate([
    (0, common_1.Post)('bill/audit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "audit", null);
__decorate([
    (0, common_1.Post)('good/arrive'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "markArrive", null);
__decorate([
    (0, common_1.Post)('import'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "importGoods", null);
__decorate([
    (0, common_1.Get)('export/:seriesId'),
    __param(0, (0, common_1.Param)('seriesId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "exportGoods", null);
__decorate([
    (0, common_1.Get)('cn-self-check'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "cnSelfCheck", null);
exports.GroupController = GroupController = __decorate([
    (0, common_1.Controller)('group'),
    __metadata("design:paramtypes", [GroupService])
], GroupController);
exports.GroupModuleRef = typeorm_1.TypeOrmModule.forFeature([entities_1.Series, entities_1.Good, entities_1.Order, entities_1.OrderItem, entities_1.KidneyBill, entities_1.User]);
