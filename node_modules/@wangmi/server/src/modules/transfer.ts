import { Controller, Get, Post, Body, Req, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Request } from 'express';
import { Transfer, Order, OrderItem, User, Series, Good, Notification, KidneyBill } from '../entities';
import { JwtUser, checkRole } from '../common';
import { BalanceService } from './balance';

const STEP_MS = 24 * 3600 * 1000; // 每环节 24h（演示可调小）

export class TransferService {
  constructor(
    @InjectRepository(Transfer) private repo: Repository<Transfer>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Series) private seriesRepo: Repository<Series>,
    @InjectRepository(Good) private goodRepo: Repository<Good>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private itemRepo: Repository<OrderItem>,
    private balance: BalanceService,
  ) {}

  async mine(uid: number) {
    await this.tickTimeouts();
    const ts = await this.repo.find({
      where: [{ fromUserId: uid }, { toUserId: uid }], order: { id: 'desc' },
    });
    const uidList = [...new Set(ts.flatMap(t => [t.fromUserId, t.toUserId]))];
    const us = uidList.length ? await this.userRepo.find({ where: { id: In(uidList) } }) : [];
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
    const us = uidList.length ? await this.userRepo.find({ where: { id: In(uidList) } }) : [];
    return ts.map(t => ({
      ...t,
      fromCn: us.find(u => u.id === t.fromUserId)?.cn,
      toCn: us.find(u => u.id === t.toUserId)?.cn,
    }));
  }

  /** 发起拼团转单：谷序转移，按当前排表价 */
  async create(uid: number, b: { seriesId: number; goodId: number; seq: number; toCn: string; way: 'private' | 'owner' }) {
    const s = await this.seriesRepo.findOneByOrFail({ id: b.seriesId });
    if (!s.allowTransfer) throw new ForbiddenException('本团不允许转单');
    const to = await this.userRepo.findOne({ where: { cn: b.toCn } });
    if (!to) throw new BadRequestException('接收者 CN 不存在');
    if (to.banned || (await this.userRepo.findOneByOrFail({ id: uid })).banned) throw new ForbiddenException('黑名单不可转单');
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
  async createSale(uid: number, b: { orderId: number; itemId: number; toCn: string; way: 'private' | 'owner' }) {
    // 校验转出方和接收者
    const to = await this.userRepo.findOne({ where: { cn: b.toCn } });
    if (!to) throw new BadRequestException('接收者 CN 不存在');
    if (to.banned || (await this.userRepo.findOneByOrFail({ id: uid })).banned) throw new ForbiddenException('黑名单不可转单');
    // 校验订单和商品项
    const order = await this.orderRepo.findOneByOrFail({ id: b.orderId });
    if (order.userId !== uid) throw new ForbiddenException('订单归属不符');
    if (order.status !== '囤货中') throw new BadRequestException('非囤货中订单不可转单');
    const item = await this.itemRepo.findOneByOrFail({ id: b.itemId });
    if (item.orderId !== b.orderId) throw new BadRequestException('商品项不在该订单中');
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
  async confirm(uid: number, id: number) {
    const t = await this.repo.findOneByOrFail({ id });
    if (t.toUserId !== uid) throw new ForbiddenException();
    if (t.state !== '待接收者确认') throw new BadRequestException('状态错误');
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
    if (t.state === '已完成') await this.applyOwnership(t);
    return t;
  }

  /** 管理员审核 */
  async audit(id: number, pass: boolean, auditor: JwtUser) {
    const t = await this.repo.findOneByOrFail({ id });
    if (t.state !== '待管理员审核') throw new BadRequestException('状态错误');
    if (pass) {
      t.state = t.way === 'owner' ? '待接收者付款' : '已完成';
      if (t.state === '已完成') await this.applyOwnership(t);
    } else {
      t.state = '已失败';
      await this.notify(t.fromUserId, '转单被驳回', `${t.name}#${t.seq} 被驳回，谷子退回`);
    }
    t.deadline = Date.now() + STEP_MS;
    await this.repo.save(t);
    return t;
  }

  /** 接收者付款（店主结算）：审核通过视为完成，店主转款给转出方入余额 */
  async pay(uid: number, id: number, screenshot: string) {
    const t = await this.repo.findOneByOrFail({ id });
    if (t.toUserId !== uid || t.state !== '待接收者付款') throw new ForbiddenException('状态错误');
    t.state = '待店主转款';
    t.deadline = Date.now() + STEP_MS;
    await this.repo.save(t);
    return t;
  }

  /** 店主确认收款并转款：归属转移 + 款项入转出方余额 */
  async forward(id: number, auditor: JwtUser) {
    const t = await this.repo.findOneByOrFail({ id });
    if (t.state !== '待店主转款') throw new BadRequestException('状态错误');
    await this.applyOwnership(t);
    if (t.way === 'owner') {
      await this.balance.credit(t.fromUserId, +t.price, '转单转款', `转单完成（${t.name}#${t.seq}）`, `T${t.id}`);
    }
    t.state = '已完成';
    await this.repo.save(t);
    return t;
  }

  private async applyOwnership(t: Transfer) {
    const item = await this.itemRepo.findOneByOrFail({ goodId: t.goodId, orderId: t.orderId });
    const seqs = (item.seqs || '').split(',').filter(s => s.trim()).map(Number);
    const idx = seqs.indexOf(t.seq);
    if (idx < 0) throw new BadRequestException(`谷序 #${t.seq} 不在跟排中`);

    // 从转出方 order_items 中移除该谷序
    seqs.splice(idx, 1);
    const order = await this.orderRepo.findOneByOrFail({ id: t.orderId });
    const price = +item.price;

    if (seqs.length === 0) {
      // 该item的seq全部转出，删除item并从订单总金额中扣除
      await this.itemRepo.delete(item.id);
      const newTotal = Math.max(0, +order.total - price);
      await this.orderRepo.update(order.id, { total: newTotal.toFixed(2), opLog: (order.opLog || '') + `\n${new Date().toISOString()} 转单出 ${t.name}#${t.seq}（¥${price.toFixed(2)}）` });
    } else {
      // 还剩其他seq，更新seq列表并减少qty
      item.seqs = seqs.join(',');
      item.qty -= 1;
      await this.itemRepo.save(item);
      const newTotal = Math.max(0, +order.total - price);
      await this.orderRepo.update(order.id, { total: newTotal.toFixed(2), opLog: (order.opLog || '') + `\n${new Date().toISOString()} 转单出 ${t.name}#${t.seq}（¥${price.toFixed(2)}）` });
    }

    // 检查接收方是否已有该good的跟排
    const toItems = await this.itemRepo.find({ where: { goodId: t.goodId, orderId: In([order.id]) } }); // 这里查询的是同一series的所有订单
    // 需要查询接收者的订单：先找接收者在同一series的订单
    const toOrders = await this.orderRepo.find({ where: { seriesId: order.seriesId, userId: t.toUserId } });
    let toOrder = toOrders[0];
    if (!toOrder) {
      // 接收者还没有该series的订单，创建一个
      toOrder = await this.orderRepo.save(this.orderRepo.create({
        userId: t.toUserId, seriesId: order.seriesId, status: order.status, total: '0.00',
        opLog: `转单获得 ${t.name}#${t.seq}`,
      }));
    }

    const toExistingItem = await this.itemRepo.findOne({ where: { goodId: t.goodId, orderId: toOrder.id } });
    if (toExistingItem) {
      // 追加谷序
      const toSeqs = (toExistingItem.seqs || '').split(',').filter(s => s.trim()).map(Number);
      toSeqs.push(t.seq);
      toExistingItem.seqs = toSeqs.join(',');
      toExistingItem.qty += 1;
      await this.itemRepo.save(toExistingItem);
      const newToTotal = (+toOrder.total + price).toFixed(2);
      await this.orderRepo.update(toOrder.id, { total: newToTotal, opLog: (toOrder.opLog || '') + `\n${new Date().toISOString()} 转单获得 ${t.name}#${t.seq}（¥${price.toFixed(2)}）` });
    } else {
      // 新建item
      await this.itemRepo.save(this.itemRepo.create({
        orderId: toOrder.id, goodId: t.goodId, name: item.name, price: item.price, qty: 1, seqs: String(t.seq),
      }));
      const newToTotal = (+toOrder.total + price).toFixed(2);
      await this.orderRepo.update(toOrder.id, { total: newToTotal, opLog: (toOrder.opLog || '') + `\n${new Date().toISOString()} 转单获得 ${t.name}#${t.seq}（¥${price.toFixed(2)}）` });
    }

    await this.notify(t.toUserId, '转单完成', `${t.name}#${t.seq} 已归属到你名下（订单#${toOrder.id}）`);
  }

  /** 直售转单拆单：从原订单减少/删除商品项，为接收者创建新订单（状态囤货中） */
  private async applySaleOwnership(t: Transfer) {
    if (!t.orderId) return;
    const item = await this.itemRepo.findOneByOrFail({ goodId: t.goodId, orderId: t.orderId });
    // 从原订单中移除（减少数量，qty=1时删除）
    if (item.qty <= 1) {
      await this.itemRepo.delete(item.id);
    } else {
      item.qty -= 1;
      await this.itemRepo.save(item);
    }
    // 为接收者创建新订单
    const newOrder = await this.orderRepo.save(this.orderRepo.create({
      userId: t.toUserId, seriesId: 0, status: '囤货中', paidAt: new Date(),
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
  private async tickTimeouts() {
    const active = await this.repo.find();
    for (const t of active) {
      if (!['待接收者确认', '待管理员审核', '待接收者付款', '待店主转款'].includes(t.state)) continue;
    if (t.deadline <= Date.now()) {
      t.state = '已失败';
      await this.repo.save(t);
      const seqPart = t.seq > 0 ? `#${t.seq}` : '';
      await this.notify(t.fromUserId, '转单超时失败', `${t.name}${seqPart} 限时内未完成，谷子退回`);
    }
    }
  }

  private async notify(uid: number, title: string, body: string) {
    await this.userRepo.manager.getRepository(Notification).save(
      this.userRepo.manager.getRepository(Notification).create({ userId: uid, title, body }));
  }
}

@Controller('transfer')
export class TransferController {
  constructor(private svc: TransferService) {}

  @Get('mine')
  async mine(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['banned-allowed']);
    return this.svc.mine(req.user!.id);
  }

  @Get('all')
  async all(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.all();
  }

  @Post('create')
  async create(@Req() req: Request & { user?: JwtUser }, @Body() b: { seriesId: number; goodId: number; seq: number; toCn: string; way: 'private' | 'owner' }) {
    checkRole(req.user, []);
    return this.svc.create(req.user!.id, b);
  }

  @Post('create-sale')
  async createSale(@Req() req: Request & { user?: JwtUser }, @Body() b: { orderId: number; itemId: number; toCn: string; way: 'private' | 'owner' }) {
    checkRole(req.user, []);
    return this.svc.createSale(req.user!.id, b);
  }

  @Post('confirm')
  async confirm(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number }) {
    checkRole(req.user, []);
    return this.svc.confirm(req.user!.id, b.id);
  }

  @Post('audit')
  async audit(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number; pass: boolean }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.audit(b.id, b.pass, req.user!);
  }

  @Post('pay')
  async pay(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number; screenshot?: string }) {
    checkRole(req.user, []);
    return this.svc.pay(req.user!.id, b.id, b.screenshot || '');
  }

  @Post('forward')
  async forward(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.forward(b.id, req.user!);
  }
}

export const TransferModuleRef = TypeOrmModule.forFeature([Transfer, Order, OrderItem, User, Series, Good]);
