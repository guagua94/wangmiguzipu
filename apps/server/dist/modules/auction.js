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
exports.AuctionModuleRef = exports.AuctionController = exports.AuctionService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../entities");
const common_2 = require("../common");
const balance_1 = require("./balance");
/** 中标付款期限（24小时），超时自动转给次高出价者或流拍 */
const PAY_DEADLINE_MS = 24 * 60 * 60 * 1000;
let AuctionService = class AuctionService {
    constructor(repo, bidRepo, depRepo, userRepo, orderRepo, itemRepo, balance, dataSource) {
        this.repo = repo;
        this.bidRepo = bidRepo;
        this.depRepo = depRepo;
        this.userRepo = userRepo;
        this.orderRepo = orderRepo;
        this.itemRepo = itemRepo;
        this.balance = balance;
        this.dataSource = dataSource;
    }
    async list() {
        await this.tickStates();
        const as = await this.repo.find({ order: { id: 'desc' } });
        const ds = await this.depRepo.find();
        return as.map(a => ({ ...a, myDeposit: 0, depositState: ds.find(d => d.auctionId === a.id)?.state || '' }));
    }
    /** 状态推进：到点开拍 / 到点截拍 / 待付款超时处理——服务端时间为准 */
    async tickStates() {
        const now = Date.now();
        const pend = await this.repo.find({ where: { state: '待开拍' } });
        for (const a of pend)
            if (+a.startTime <= now)
                await this.repo.update(a.id, { state: '拍卖中' });
        const running = await this.repo.find({ where: { state: '拍卖中' } });
        for (const a of running) {
            if (+a.endTime <= now)
                await this.close(a.id);
        }
        // 待付款超时检查：超过24小时未付款，自动转给次高出价者或流拍
        const won = await this.repo.find({ where: { state: '待付款' } });
        for (const a of won) {
            const deadline = (+a.wonAt || 0) + PAY_DEADLINE_MS;
            if (now >= deadline)
                await this.handlePaymentTimeout(a.id);
        }
    }
    /**
     * 待付款超时处理：
     * 1. 没收当前中标者保证金
     * 2. 查找次高出价者：有则转给次高出价者（重新进入待付款，wonAt 重置），无则流拍
     */
    async handlePaymentTimeout(auctionId) {
        const a = await this.repo.findOneByOrFail({ id: auctionId });
        // 没收当前中标者保证金
        if (a.winnerId) {
            const dep = await this.depRepo.findOne({ where: { auctionId, userId: a.winnerId, state: '已缴' } });
            if (dep) {
                await this.depRepo.update(dep.id, { state: '已没收' });
                await this.notify(a.winnerId, '拍卖超时未付款', `「${a.name}」你未在24小时内付款，保证金已没收，拍卖已转给次高出价者或流拍`);
            }
        }
        // 查找出价记录，排除原中标者，取次高出价者
        const bids = await this.bidRepo.find({ where: { auctionId }, order: { id: 'desc' } });
        const otherBids = a.winnerId ? bids.filter(b => b.userId !== a.winnerId) : bids;
        if (otherBids.length > 0) {
            const nextBid = otherBids[0]; // id 降序，第一条即次高出价
            await this.repo.update(auctionId, {
                winnerId: nextBid.userId,
                curPrice: nextBid.price,
                wonAt: Date.now(),
                state: '待付款',
            });
            await this.notify(nextBid.userId, '拍卖转中标', `「${a.name}」原中标者超时未付款，你以 ¥${nextBid.price} 转为中标！24小时内付款（保证金抵扣）`);
        }
        else {
            // 无次高出价者，流拍：退回所有已缴保证金（扣除已没收的）
            const deps = await this.depRepo.find({ where: { auctionId, state: '已缴' } });
            for (const d of deps) {
                await this.balance.credit(d.userId, +d.amount, '保证金退还', '拍卖流拍退回余额', `A${auctionId}`);
                await this.depRepo.update(d.id, { state: '已退' });
            }
            await this.repo.update(auctionId, { state: '流拍', winnerId: null });
        }
    }
    async detail(id, uid) {
        await this.tickStates();
        const a = await this.repo.findOneByOrFail({ id });
        const bids = await this.bidRepo.find({ where: { auctionId: id }, order: { id: 'desc' }, take: 20 });
        const myDep = uid ? await this.depRepo.findOne({ where: { auctionId: id, userId: uid } }) : null;
        const myDepositState = myDep ? myDep.state : '未缴';
        return { auction: a, bids, myDeposited: myDepositState === '已缴', myDepositState, serverTime: Date.now() };
    }
    async save(b, uid) {
        if (b.id) {
            await this.repo.update(b.id, b);
            return this.repo.findOneByOrFail({ id: b.id });
        }
        const a = this.repo.create({ ...b, state: '待开拍' });
        return this.repo.save(a);
    }
    /** 缴保证金：余额抵扣（记账，即时生效）或截图转账（待团长审核） */
    async deposit(uid, auctionId, useBalanceAmount, screenshot) {
        const a = await this.repo.findOneByOrFail({ id: auctionId });
        const exist = await this.depRepo.findOne({ where: { auctionId, userId: uid, state: '已缴' } });
        if (exist)
            return { ok: true, already: true };
        const depositAmt = +a.deposit;
        let useBal = Math.max(0, Math.min(useBalanceAmount || 0, depositAmt));
        let rest = depositAmt;
        let state = '待审核';
        if (useBal > 0) {
            await this.balance.debit(uid, useBal, '保证金', `拍卖保证金（${a.name}）`, `A${a.id}`);
            rest = depositAmt - useBal;
            if (rest <= 0)
                state = '已缴';
        }
        if (rest > 0 && !screenshot)
            throw new common_1.BadRequestException(`需扫码支付 ¥${rest.toFixed(2)}，请上传付款截图`);
        await this.depRepo.save(this.depRepo.create({ auctionId, userId: uid, amount: a.deposit, state, screenshot: screenshot || '' }));
        return { ok: true, state, rest };
    }
    /** 出价：校验有效出价 ≥ 当前价+最低加价；最后5分钟自动延长3分钟（服务端时间） */
    async bid(uid, auctionId, price) {
        await this.tickStates();
        const auction = await this.repo.findOneBy({ id: auctionId });
        if (!auction)
            throw new common_1.BadRequestException('拍卖不存在');
        const { a, won, extended } = await this.dataSource.transaction(async (manager) => {
            const aRepo = manager.getRepository(entities_1.Auction);
            const bidRepo = manager.getRepository(entities_1.AuctionBid);
            // 行锁：防止并发出价竞态
            const a = await aRepo.findOne({ where: { id: auctionId }, lock: { mode: 'pessimistic_write' } });
            if (!a)
                throw new common_1.ForbiddenException('拍卖不存在');
            if (a.state !== '拍卖中')
                throw new common_1.ForbiddenException(`当前状态（${a.state}）不可出价`);
            const dep = await this.depRepo.findOne({ where: { auctionId, userId: uid, state: '已缴' } });
            if (!dep)
                throw new common_1.ForbiddenException('请先缴纳保证金');
            const min = +a.curPrice > 0 ? +a.curPrice + +a.stepPrice : +a.startPrice + +a.stepPrice;
            if (price < min - 1e-9)
                throw new common_1.BadRequestException(`出价需 ≥ ¥${min.toFixed(2)}`);
            await bidRepo.save(bidRepo.create({ auctionId, userId: uid, price: price.toFixed(2) }));
            let extended = false;
            let end = +a.endTime;
            const FIVE = 5 * 60 * 1000;
            if (end - Date.now() < FIVE) {
                end = Math.max(end, Date.now()) + 3 * 60 * 1000;
                extended = true;
            }
            // 一口价立即成交
            if (+a.buyNow > 0 && price >= +a.buyNow - 1e-9) {
                await aRepo.update(auctionId, { curPrice: (+a.buyNow).toFixed(2), bidCount: a.bidCount + 1, endTime: end, state: '待付款', winnerId: uid, wonAt: Date.now() });
                return { a, won: true, extended: false };
            }
            await aRepo.update(auctionId, { curPrice: price.toFixed(2), bidCount: a.bidCount + 1, endTime: end });
            return { a, won: false, extended };
        });
        if (won) {
            await this.notify(uid, '拍卖中标（一口价）', `「${a.name}」你以一口价 ¥${a.buyNow} 成交！24小时内付款（保证金抵扣），超时将转给次高出价者或流拍`);
            return { won: true, extended: false };
        }
        // 通知之前最高出价者被超越（事务外，失败不影响出价结果）
        const lastBids = await this.bidRepo.find({ where: { auctionId }, order: { id: 'desc' }, take: 2 });
        if (lastBids.length === 2 && lastBids[1].userId !== uid) {
            await this.notify(lastBids[1].userId, '拍卖出价被超越', `「${a.name}」有新出价 ¥${price.toFixed(2)}，你已不是最高出价者`);
        }
        return { ok: true, extended };
    }
    /** 查询我的保证金状态：待审核/已缴/无 */
    async myDepositState(auctionId, uid) {
        const dep = await this.depRepo.findOne({ where: { auctionId, userId: uid } });
        return dep ? dep.state : '未缴';
    }
    /** 查询待审核的保证金列表（团长用）- 扁平结构 */
    async pendingDeposits() {
        const deps = await this.depRepo.find({ where: { state: '待审核' }, order: { id: 'desc' } });
        const auctionIds = [...new Set(deps.map(d => d.auctionId))];
        const auctions = auctionIds.length ? await this.repo.find({ where: { id: (0, typeorm_2.In)(auctionIds) } }) : [];
        const userIds = [...new Set(deps.map(d => d.userId))];
        const users = userIds.length ? await this.userRepo.find({ where: { id: (0, typeorm_2.In)(userIds) } }) : [];
        return deps.map(d => {
            const u = users.find(x => x.id === d.userId);
            return { ...d, cn: u?.cn || '' };
        });
    }
    /** 查询全部保证金记录（团长用）- 扁平结构 */
    async allDeposits() {
        const deps = await this.depRepo.find({ order: { id: 'desc' } });
        const auctionIds = [...new Set(deps.map(d => d.auctionId))];
        const auctions = auctionIds.length ? await this.repo.find({ where: { id: (0, typeorm_2.In)(auctionIds) } }) : [];
        const userIds = [...new Set(deps.map(d => d.userId))];
        const users = userIds.length ? await this.userRepo.find({ where: { id: (0, typeorm_2.In)(userIds) } }) : [];
        return deps.map(d => {
            const u = users.find(x => x.id === d.userId);
            return { ...d, cn: u?.cn || '' };
        });
    }
    /** 审核保证金：通过（已缴），拒绝（已退） */
    async auditDeposit(depositId, pass, note) {
        const dep = await this.depRepo.findOneByOrFail({ id: depositId });
        if (dep.state !== '待审核')
            throw new common_1.BadRequestException('非待审核状态');
        const newState = pass ? '已缴' : '已退';
        await this.depRepo.update(dep.id, { state: newState, auditNote: note || '' });
        const a = await this.repo.findOneByOrFail({ id: dep.auctionId });
        await this.notify(dep.userId, `保证金审核${pass ? '通过' : '未通过'}`, `「${a.name}」保证金 ¥${dep.amount} ${pass ? '已通过，可出价' : '未通过'}`);
        return { ok: true, state: newState };
    }
    /** 截拍：成交/流拍；未中标者保证金退回余额；囤货过期来源的成交款计入原归属余额（记账） */
    async close(auctionId) {
        const a = await this.repo.findOneByOrFail({ id: auctionId });
        const lastBid = await this.bidRepo.findOne({ where: { auctionId }, order: { id: 'desc' } });
        if (!lastBid) {
            await this.repo.update(auctionId, { state: '流拍' });
            // 无人出价流拍：退回所有已缴保证金
            const deps = await this.depRepo.find({ where: { auctionId, state: '已缴' } });
            for (const d of deps) {
                await this.balance.credit(d.userId, +d.amount, '保证金退还', '拍卖流拍退回余额', `A${auctionId}`);
                await this.depRepo.update(d.id, { state: '已退' });
            }
            return { flow: '流拍' };
        }
        await this.repo.update(auctionId, { state: '待付款', winnerId: lastBid.userId, wonAt: Date.now() });
        await this.notify(lastBid.userId, '拍卖中标', `「${a.name}」你以 ¥${lastBid.price} 中标！24小时内付款（保证金抵扣），超时将转给次高出价者或流拍`);
        // 其他参拍人退保证金
        const deps = await this.depRepo.find({ where: { auctionId, state: '已缴' } });
        for (const d of deps) {
            if (d.userId === lastBid.userId)
                continue;
            await this.balance.credit(d.userId, +d.amount, '保证金退还', '未中标退回余额', `A${auctionId}`);
            await this.depRepo.update(d.id, { state: '已退' });
        }
        return { won: lastBid.userId };
    }
    /** 中标付款：保证金已抵扣，支持余额部分抵扣尾款 + 截图补齐 */
    async pay(uid, auctionId, screenshot, useBalanceAmount) {
        const a = await this.repo.findOneByOrFail({ id: auctionId });
        if (a.state !== '待付款' || a.winnerId !== uid)
            throw new common_1.ForbiddenException('非中标待付款状态');
        const dep = await this.depRepo.findOne({ where: { auctionId, userId: uid, state: '已缴' } });
        const depAmt = dep ? +dep.amount : 0;
        // 保证金退回余额
        if (dep) {
            await this.balance.credit(uid, depAmt, '保证金退还', `拍卖中标保证金退还（${a.name}）`, `A${a.id}`);
            await this.depRepo.update(dep.id, { state: '已退' });
        }
        // 支付成交价（全额）
        const total = +a.curPrice;
        let useBal = Math.max(0, Math.min(useBalanceAmount || 0, total));
        let rest = total;
        if (useBal > 0) {
            await this.balance.debit(uid, useBal, '拍卖尾款', `「${a.name}」尾款（余额抵 ¥${useBal.toFixed(2)}）`, `A${a.id}`);
            rest = total - useBal;
        }
        if (rest > 0) {
            if (!screenshot)
                throw new common_1.BadRequestException(`需扫码支付 ¥${rest.toFixed(2)}，请上传付款截图`);
        }
        await this.repo.update(auctionId, { state: '囤货中', stockSince: new Date() });
        // 自动创建直售订单，使拍卖品进入囤货列表，可复用直售转单/清货流程
        const newOrder = await this.orderRepo.save(this.orderRepo.create({
            userId: uid, seriesId: 0, status: '囤货中', paidAt: new Date(),
            total: (+a.curPrice).toFixed(2),
            opLog: `拍卖成交入囤（${a.name}）`,
        }));
        await this.itemRepo.save(this.itemRepo.create({
            orderId: newOrder.id, goodId: 0, name: a.name, price: a.curPrice, qty: 1, seqs: '',
        }));
        // 囤货过期来源：成交款计入原归属团员余额（记账）
        if (a.srcUserId && a.srcUserId !== uid) {
            await this.balance.credit(a.srcUserId, +a.curPrice, '拍卖成交', `囤货过期谷子拍卖成交（${a.name}）`, `A${a.id}`);
        }
        await this.notify(uid, '拍卖付款完成', `「${a.name}」已付款${useBal > 0 ? `（余额抵 ¥${useBal.toFixed(2)}）` : ''}，已入囤（订单#${newOrder.id}）`);
        return { ok: true, restPaid: rest, usedBalance: useBal };
    }
    /** 流拍/截拍后重新上架：清除旧出价记录，重置时间/价格/状态 */
    async relist(id, b) {
        const a = await this.repo.findOneByOrFail({ id });
        if (a.state === '待开拍' || a.state === '拍卖中')
            throw new common_1.BadRequestException('仅已结束的拍卖可重新上架');
        // 参数校验
        if (b.endTime <= b.startTime)
            throw new common_1.BadRequestException('结束时间必须晚于开拍时间');
        if (b.buyNow > 0 && b.buyNow <= b.startPrice)
            throw new common_1.BadRequestException('一口价必须高于起拍价');
        await this.repo.update(id, {
            startPrice: b.startPrice.toFixed(2), stepPrice: b.stepPrice.toFixed(2), buyNow: b.buyNow.toFixed(2), deposit: b.deposit.toFixed(2),
            curPrice: '0.00', bidCount: 0,
            startTime: b.startTime, endTime: b.endTime, state: '待开拍', winnerId: null,
        });
        await this.bidRepo.delete({ auctionId: id });
        return { ok: true };
    }
    /** 删除拍卖（仅限非"拍卖中"状态） */
    async remove(id) {
        const a = await this.repo.findOneByOrFail({ id });
        if (a.state === '拍卖中')
            throw new common_1.BadRequestException('拍卖进行中的拍品不可删除');
        // 清理关联数据
        await this.bidRepo.delete({ auctionId: id });
        await this.depRepo.delete({ auctionId: id });
        await this.repo.delete(id);
        return { ok: true };
    }
    async myOrders(uid) {
        await this.tickStates();
        // 查询该用户中标的拍卖（待付款/已付款/囤货中）
        const won = await this.repo.find({ where: { winnerId: uid }, order: { id: 'desc' } });
        // 查询该用户的所有出价记录（用于统计参与过的拍卖）
        const myBids = await this.bidRepo.find({ where: { userId: uid } });
        const auctionIds = [...new Set(myBids.map(b => b.auctionId))];
        const participated = auctionIds.length ? await this.repo.find({ where: { id: (0, typeorm_2.In)(auctionIds) }, order: { id: 'desc' } }) : [];
        // 合并：中标优先，参与的也显示（排除已重复的）
        const all = [...won];
        for (const a of participated) {
            if (!all.find(x => x.id === a.id))
                all.push(a);
        }
        return all.map(a => ({
            ...a,
            isWinner: a.winnerId === uid,
            myMaxBid: myBids.filter(b => b.auctionId === a.id).sort((x, y) => +y.price - +x.price)[0]?.price || 0,
        }));
    }
    /** 全部拍卖订单（后台用：含中标者userId和cn） */
    async allOrders() {
        await this.tickStates();
        const auctions = await this.repo.find({ order: { id: 'desc' } });
        const winnerIds = [...new Set(auctions.filter(a => a.winnerId).map(a => a.winnerId))];
        const users = winnerIds.length ? await this.userRepo.find({ where: { id: (0, typeorm_2.In)(winnerIds) } }) : [];
        return auctions.map(a => ({
            ...a,
            userId: a.winnerId || 0,
            cn: users.find(u => u.id === a.winnerId)?.cn || '',
        }));
    }
    async notify(uid, title, body) {
        await this.userRepo.manager.getRepository(entities_1.Notification).save(this.userRepo.manager.getRepository(entities_1.Notification).create({ userId: uid, title, body }));
    }
};
exports.AuctionService = AuctionService;
exports.AuctionService = AuctionService = __decorate([
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.Auction)),
    __param(1, (0, typeorm_1.InjectRepository)(entities_1.AuctionBid)),
    __param(2, (0, typeorm_1.InjectRepository)(entities_1.AuctionDeposit)),
    __param(3, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __param(4, (0, typeorm_1.InjectRepository)(entities_1.Order)),
    __param(5, (0, typeorm_1.InjectRepository)(entities_1.OrderItem)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        balance_1.BalanceService,
        typeorm_2.DataSource])
], AuctionService);
let AuctionController = class AuctionController {
    constructor(svc) {
        this.svc = svc;
    }
    async list() { return this.svc.list(); }
    async detail(id, req) {
        return this.svc.detail(+id, req.user?.id || 0);
    }
    async save(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.save(b, req.user.id);
    }
    async deposit(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.deposit(req.user.id, b.auctionId, b.useBalanceAmount || 0, b.screenshot || '');
    }
    async bid(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.bid(req.user.id, b.auctionId, b.price);
    }
    async pay(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.pay(req.user.id, b.auctionId, b.screenshot || '', b.useBalanceAmount);
    }
    async pendingDeposits(req) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.pendingDeposits();
    }
    async allDeposits(req) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.allDeposits();
    }
    async auditDeposit(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.auditDeposit(b.depositId, b.pass, b.note || '');
    }
    async relist(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.relist(b.id, b);
    }
    async remove(req, b) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.remove(b.id);
    }
    async myOrders(req) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.myOrders(req.user.id);
    }
    async allOrders(req) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.allOrders();
    }
};
exports.AuctionController = AuctionController;
__decorate([
    (0, common_1.Get)('list'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AuctionController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('detail/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AuctionController.prototype, "detail", null);
__decorate([
    (0, common_1.Post)('save'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuctionController.prototype, "save", null);
__decorate([
    (0, common_1.Post)('deposit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuctionController.prototype, "deposit", null);
__decorate([
    (0, common_1.Post)('bid'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuctionController.prototype, "bid", null);
__decorate([
    (0, common_1.Post)('pay'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuctionController.prototype, "pay", null);
__decorate([
    (0, common_1.Get)('pending-deposits'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuctionController.prototype, "pendingDeposits", null);
__decorate([
    (0, common_1.Get)('all-deposits'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuctionController.prototype, "allDeposits", null);
__decorate([
    (0, common_1.Post)('audit-deposit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuctionController.prototype, "auditDeposit", null);
__decorate([
    (0, common_1.Post)('relist'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuctionController.prototype, "relist", null);
__decorate([
    (0, common_1.Post)('delete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuctionController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('my-orders'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuctionController.prototype, "myOrders", null);
__decorate([
    (0, common_1.Get)('all-orders'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuctionController.prototype, "allOrders", null);
exports.AuctionController = AuctionController = __decorate([
    (0, common_1.Controller)('auction'),
    __metadata("design:paramtypes", [AuctionService])
], AuctionController);
exports.AuctionModuleRef = typeorm_1.TypeOrmModule.forFeature([entities_1.Auction, entities_1.AuctionBid, entities_1.AuctionDeposit, entities_1.User, entities_1.Order, entities_1.OrderItem]);
