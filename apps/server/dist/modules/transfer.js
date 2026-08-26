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
exports.TransferModuleRef = exports.TransferController = exports.TransferService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../entities");
const common_2 = require("../common");
const balance_1 = require("./balance");
const STEP_MS = 24 * 3600 * 1000; // 每环节 24h（演示可调小）
let TransferService = class TransferService {
    constructor(repo, userRepo, seriesRepo, goodRepo, orderRepo, itemRepo, balance) {
        this.repo = repo;
        this.userRepo = userRepo;
        this.seriesRepo = seriesRepo;
        this.goodRepo = goodRepo;
        this.orderRepo = orderRepo;
        this.itemRepo = itemRepo;
        this.balance = balance;
    }
    async mine(uid) {
        await this.tickTimeouts();
        const ts = await this.repo.find({
            where: [{ fromUserId: uid }, { toUserId: uid }], order: { id: 'desc' },
        });
        const uidList = [...new Set(ts.flatMap(t => [t.fromUserId, t.toUserId]))];
        const us = uidList.length ? await this.userRepo.find({ where: { id: (0, typeorm_2.In)(uidList) } }) : [];
        return ts.map(t => ({
            ...t,
            fromCn: us.find(u => u.id === t.fromUserId)?.cn,
            toCn: us.find(u => u.id === t.toUserId)?.cn,
            isFrom: t.fromUserId === uid,
        }));
    }
    /** 全量转单（后台审核用） */
    async all() {
        await this.tickTimeouts();
        const ts = await this.repo.find({ order: { id: 'desc' } });
        const uidList = [...new Set(ts.flatMap(t => [t.fromUserId, t.toUserId]))];
        const us = uidList.length ? await this.userRepo.find({ where: { id: (0, typeorm_2.In)(uidList) } }) : [];
        return ts.map(t => ({
            ...t,
            fromCn: us.find(u => u.id === t.fromUserId)?.cn,
            toCn: us.find(u => u.id === t.toUserId)?.cn,
        }));
    }
    /** 发起拼团转单：谷序转移，按当前排表价 */
    async create(uid, b) {
        const s = await this.seriesRepo.findOneByOrFail({ id: b.seriesId });
        if (!s.allowTransfer)
            throw new common_1.ForbiddenException('本团不允许转单');
        const to = await this.userRepo.findOne({ where: { cn: b.toCn } });
        if (!to)
            throw new common_1.BadRequestException('接收者 CN 不存在');
        if (to.banned || (await this.userRepo.findOneByOrFail({ id: uid })).banned)
            throw new common_1.ForbiddenException('黑名单不可转单');
        const g = await this.goodRepo.findOneByOrFail({ id: b.goodId });
        const t = await this.repo.save(this.repo.create({
            seriesId: b.seriesId, goodId: b.goodId, name: g.name, seq: b.seq,
            orderId: 0, fromUserId: uid, toUserId: to.id, price: g.price, way: b.way,
            state: '待接收者确认', deadline: Date.now() + STEP_MS,
        }));
        await this.notify(to.id, '收到转单请求', `${s.name} ${g.name}#${b.seq}，请确认接受（24h内）`);
        return t;
    }
    /** 发起直售转单：单品转移，从订单中拆出 */
    async createSale(uid, b) {
        // 校验转出方和接收者
        const to = await this.userRepo.findOne({ where: { cn: b.toCn } });
        if (!to)
            throw new common_1.BadRequestException('接收者 CN 不存在');
        if (to.banned || (await this.userRepo.findOneByOrFail({ id: uid })).banned)
            throw new common_1.ForbiddenException('黑名单不可转单');
        // 校验订单和商品项
        const order = await this.orderRepo.findOneByOrFail({ id: b.orderId });
        if (order.userId !== uid)
            throw new common_1.ForbiddenException('订单归属不符');
        if (order.status !== '囤货中')
            throw new common_1.BadRequestException('非囤货中订单不可转单');
        const item = await this.itemRepo.findOneByOrFail({ id: b.itemId });
        if (item.orderId !== b.orderId)
            throw new common_1.BadRequestException('商品项不在该订单中');
        // 创建转单记录
        const t = await this.repo.save(this.repo.create({
            seriesId: 0, goodId: item.goodId, name: item.name, seq: 0,
            orderId: b.orderId, fromUserId: uid, toUserId: to.id, price: item.price, way: b.way,
            state: '待接收者确认', deadline: Date.now() + STEP_MS,
        }));
        await this.notify(to.id, '收到直售转单请求', `「${item.name}」（订单#${b.orderId}），请确认接受（24h内）`);
        return t;
    }
    /** 接收者确认 */
    async confirm(uid, id) {
        const t = await this.repo.findOneByOrFail({ id });
        if (t.toUserId !== uid)
            throw new common_1.ForbiddenException();
        if (t.state !== '待接收者确认')
            throw new common_1.BadRequestException('状态错误');
        // 直售转单：确认即完成，立即执行拆单（无需店主审核）
        if (t.orderId > 0) {
            t.state = '已完成';
            await this.repo.save(t);
            await this.applySaleOwnership(t);
            return t;
        }
        // 拼团转单：走原流程
        const s = await this.seriesRepo.findOneByOrFail({ id: t.seriesId });
        t.state = (s.transferNeedAudit && t.way === 'owner') || s.transferNeedAudit ? '待管理员审核' : (t.way === 'owner' ? '待接收者付款' : '已完成');
        t.deadline = Date.now() + STEP_MS;
        await this.repo.save(t);
        if (t.state === '已完成')
            await this.applyOwnership(t);
        return t;
    }
    /** 管理员审核 */
    async audit(id, pass, auditor) {
        const t = await this.repo.findOneByOrFail({ id });
        if (t.state !== '待管理员审核')
            throw new common_1.BadRequestException('状态错误');
        if (pass) {
            t.state = t.way === 'owner' ? '待接收者付款' : '已完成';
            if (t.state === '已完成')
                await this.applyOwnership(t);
        }
        else {
            t.state = '已失败';
            await this.notify(t.fromUserId, '转单被驳回', `${t.name}#${t.seq} 被驳回，谷子退回`);
        }
        t.deadline = Date.now() + STEP_MS;
        await this.repo.save(t);
        return t;
    }
    /** 接收者付款（店主结算）：审核通过视为完成，店主转款给转出方入余额 */
    async pay(uid, id, screenshot) {
        const t = await this.repo.findOneByOrFail({ id });
        if (t.toUserId !== uid || t.state !== '待接收者付款')
            throw new common_1.ForbiddenException('状态错误');
        t.state = '待店主转款';
        t.deadline = Date.now() + STEP_MS;
        await this.repo.save(t);
        return t;
    }
    /** 店主确认收款并转款：归属转移 + 款项入转出方余额 */
    async forward(id, auditor) {
        const t = await this.repo.findOneByOrFail({ id });
        if (t.state !== '待店主转款')
            throw new common_1.BadRequestException('状态错误');
        await this.applyOwnership(t);
        if (t.way === 'owner') {
            await this.balance.credit(t.fromUserId, +t.price, '转单转款', `转单完成（${t.name}#${t.seq}）`, `T${t.id}`);
        }
        t.state = '已完成';
        await this.repo.save(t);
        return t;
    }
    async applyOwnership(t) {
        // 真实系统：更新跟排明细归属。此处记录通知留痕。
        await this.notify(t.toUserId, '转单完成', `${t.name}#${t.seq} 已归属到你名下`);
    }
    /** 直售转单拆单：从原订单减少/删除商品项，为接收者创建新订单（状态囤货中） */
    async applySaleOwnership(t) {
        if (!t.orderId)
            return;
        const item = await this.itemRepo.findOneByOrFail({ goodId: t.goodId, orderId: t.orderId });
        // 从原订单中移除（减少数量，qty=1时删除）
        if (item.qty <= 1) {
            await this.itemRepo.delete(item.id);
        }
        else {
            item.qty -= 1;
            await this.itemRepo.save(item);
        }
        // 为接收者创建新订单
        const newOrder = await this.orderRepo.save(this.orderRepo.create({
            userId: t.toUserId, seriesId: 0, status: '囤货中',
            total: item.price,
            opLog: `从转单获得（原订单#${t.orderId} 转出）`,
        }));
        await this.itemRepo.save(this.itemRepo.create({
            orderId: newOrder.id, goodId: t.goodId, name: item.name, price: item.price, qty: 1, seqs: '',
        }));
        // 通知双方
        await this.notify(t.fromUserId, '转单完成', `「${t.name}」已从订单#${t.orderId} 转给 ${(await this.userRepo.findOneBy({ id: t.toUserId }))?.cn || ''}`);
        await this.notify(t.toUserId, '转单完成', `「${t.name}」已归属到你名下（订单#${newOrder.id}）`);
    }
    /** 超时自动失败（服务端时间） */
    async tickTimeouts() {
        const active = await this.repo.find();
        for (const t of active) {
            if (!['待接收者确认', '待管理员审核', '待接收者付款', '待店主转款'].includes(t.state))
                continue;
            if (t.deadline <= Date.now()) {
                t.state = '已失败';
                await this.repo.save(t);
                const seqPart = t.seq > 0 ? `#${t.seq}` : '';
                await this.notify(t.fromUserId, '转单超时失败', `${t.name}${seqPart} 限时内未完成，谷子退回`);
            }
        }
    }
    async notify(uid, title, body) {
        await this.userRepo.manager.getRepository(entities_1.Notification).save(this.userRepo.manager.getRepository(entities_1.Notification).create({ userId: uid, title, body }));
    }
};
exports.TransferService = TransferService;
exports.TransferService = TransferService = __decorate([
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.Transfer)),
    __param(1, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __param(2, (0, typeorm_1.InjectRepository)(entities_1.Series)),
    __param(3, (0, typeorm_1.InjectRepository)(entities_1.Good)),
    __param(4, (0, typeorm_1.InjectRepository)(entities_1.Order)),
    __param(5, (0, typeorm_1.InjectRepository)(entities_1.OrderItem)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        balance_1.BalanceService])
], TransferService);
let TransferController = class TransferController {
    constructor(svc) {
        this.svc = svc;
    }
    async mine(req) {
        (0, common_2.checkRole)(req.user, ['banned-allowed']);
        return this.svc.mine(req.user.id);
    }
    async all(req) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.all();
    }
    async create(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.create(req.user.id, b);
    }
    async createSale(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.createSale(req.user.id, b);
    }
    async confirm(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.confirm(req.user.id, b.id);
    }
    async audit(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.audit(b.id, b.pass, req.user);
    }
    async pay(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.pay(req.user.id, b.id, b.screenshot || '');
    }
    async forward(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.forward(b.id, req.user);
    }
};
exports.TransferController = TransferController;
__decorate([
    (0, common_1.Get)('mine'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TransferController.prototype, "mine", null);
__decorate([
    (0, common_1.Get)('all'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TransferController.prototype, "all", null);
__decorate([
    (0, common_1.Post)('create'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TransferController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('create-sale'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TransferController.prototype, "createSale", null);
__decorate([
    (0, common_1.Post)('confirm'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TransferController.prototype, "confirm", null);
__decorate([
    (0, common_1.Post)('audit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TransferController.prototype, "audit", null);
__decorate([
    (0, common_1.Post)('pay'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TransferController.prototype, "pay", null);
__decorate([
    (0, common_1.Post)('forward'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TransferController.prototype, "forward", null);
exports.TransferController = TransferController = __decorate([
    (0, common_1.Controller)('transfer'),
    __metadata("design:paramtypes", [TransferService])
], TransferController);
exports.TransferModuleRef = typeorm_1.TypeOrmModule.forFeature([entities_1.Transfer, entities_1.Order, entities_1.OrderItem, entities_1.User, entities_1.Series, entities_1.Good]);
