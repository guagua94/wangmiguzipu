import { Controller, Get, Post, Body, Req, BadRequestException, ForbiddenException, Query } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, Like, In, Not, IsNull, Equal } from 'typeorm';
import { Request } from 'express';
import { SaleGood, User, Order, OrderItem, Notification, Series } from '../entities';
import { JwtUser, checkRole } from '../common';
import { BalanceService } from './balance';

export class SaleService {
  constructor(
    @InjectRepository(SaleGood) private repo: Repository<SaleGood>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private itemRepo: Repository<OrderItem>,
    private balance: BalanceService,
  ) {}

  async list(q: string) {
    const where: any = {};
    if (q) where.name = Like(`%${q}%`);
    const goods = await this.repo.find(q ? { where: { name: Like(`%${q}%`) } } : {});
    // IP/所属者模糊搜索在内存过滤（SQLite Like 中文可用）
    const all = q ? await this.repo.find() : goods;
    const r = q ? all.filter(g => g.name.includes(q) || g.ip.includes(q) || g.ownerCn.includes(q)) : all;
    return r.filter(g => g.stock > 0).sort((a, b) => b.id - a.id);
  }

  async save(b: Partial<SaleGood>) {
    if (b.id) { await this.repo.update(b.id, b); return this.repo.findOneByOrFail({ id: b.id }); }
    const g = await this.repo.save(this.repo.create(b));
    if (!g.no) await this.repo.update(g.id, { no: 'ZS-' + String(g.id).padStart(4, '0') });
    return this.repo.findOneByOrFail({ id: g.id });
  }

  /** 补库存 */
  async restock(id: number, addQty: number) {
    const g = await this.repo.findOneByOrFail({ id });
    g.stock += addQty;
    await this.repo.save(g);
    return this.repo.findOneByOrFail({ id });
  }

  /** 删除直售谷子 */
  async remove(id: number) {
    await this.repo.delete(id);
    return { ok: true };
  }

  /** CSV 批量导入直售谷子 */
  async importGoods(rows: { name: string; ip: string; cat: string; price: string | number; stock: number; emoji?: string; ownerCn?: string }[]) {
    let count = 0;
    for (const r of rows) {
      if (!r.name) continue;
      const g = await this.repo.save(this.repo.create({
        name: r.name, ip: r.ip || '', cat: (r.cat as any) || '全新未拆单领',
        price: (+r.price).toFixed(2), stock: +r.stock || 1,
        emoji: r.emoji || '🎁', ownerCn: r.ownerCn || '店主',
      }));
      if (!g.no) await this.repo.update(g.id, { no: 'ZS-' + String(g.id).padStart(4, '0') });
      count++;
    }
    return { imported: count };
  }

  /** 购买：库存递减（事务），生成直售订单（待付款）；囤店或直接清货 */
  async buy(uid: number, goodId: number, qty: number, blindShipMode?: string) {
    return this.batchBuy(uid, [{ goodId, qty }], blindShipMode);
  }

  /** 批量购买：多个直售谷子合为单笔订单，一起结算（事务保护，防止高并发超卖） */
  async batchBuy(uid: number, items: { goodId: number; qty: number }[], blindShipMode?: string) {
    if (!items || items.length === 0) throw new BadRequestException('购物车为空');
    const goodIds = items.map(it => it.goodId);
    if (new Set(goodIds).size !== goodIds.length) throw new BadRequestException('购物车中存在重复商品');
    return this.repo.manager.transaction(async transactionalEntityManager => {
      const saleRepo = transactionalEntityManager.getRepository(SaleGood);
      const orderRepo = transactionalEntityManager.getRepository(Order);
      const itemRepo = transactionalEntityManager.getRepository(OrderItem);
      let total = 0;
      const orderItems: { goodId: number; name: string; price: string; qty: number }[] = [];
      const names: string[] = [];
      let hasBlind = false;
      for (const it of items) {
        if (it.qty <= 0) throw new BadRequestException('数量必须大于0');
        const g = await saleRepo.findOneOrFail({
          where: { id: it.goodId },
          lock: { mode: 'pessimistic_write' },
        });
        if (it.qty > 99) throw new BadRequestException(`${g.name} 单次购买数量不能超过99`);
        if (g.stock < it.qty) throw new BadRequestException(`${g.name} 库存不足（剩 ${g.stock}）`);
        if (g.cat === '盲抽') hasBlind = true;
        g.stock -= it.qty;
        await saleRepo.save(g);
        total += +g.price * it.qty;
        orderItems.push({ goodId: g.id, name: g.name, price: g.price, qty: it.qty });
        names.push(`${g.name}×${it.qty}`);
      }
      // 若包含盲抽商品，必须传入发货模式
      if (hasBlind && !blindShipMode) {
        throw new BadRequestException('盲抽商品需选择发货模式：video（需要视频选择且拆开）或 random（直接随机发货不拆开）');
      }
      const order = await orderRepo.save(orderRepo.create({
        userId: uid, seriesId: 0, status: '待付款', total: total.toFixed(2),
        blindShipMode: blindShipMode || '',
      }));
      for (const oi of orderItems) {
        await itemRepo.save(itemRepo.create({ orderId: order.id, ...oi }));
      }
      const nRepo = transactionalEntityManager.getRepository(Notification);
      await nRepo.save(nRepo.create({ userId: uid, title: '直售下单成功', body: `${names.join('，')}，请付款并提交截图（¥${order.total}）` }));
      return order;
    });
  }

  
  /** 直售订单付款：支持余额部分抵扣 + 截图补齐 */
  async pay(uid: number, orderId: number, useBalanceAmount: number, screenshot: string = '') {
    const o = await this.orderRepo.findOneByOrFail({ id: orderId });
    if (o.userId !== uid || o.status !== '待付款') throw new BadRequestException('状态错误');
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
    if (!screenshot) throw new BadRequestException(`需扫码支付 ¥${rest.toFixed(2)}，请上传付款截图`);
    await this.orderRepo.update(orderId, { status: '已提交截图', screenshot, paidAt: new Date(), opLog: (o.opLog || '') + `\n${new Date().toISOString()} 余额抵扣 ¥${useBal.toFixed(2)}，扫码付 ¥${rest.toFixed(2)}` });
    return { paidOff: false, rest, usedBalance: useBal };
  }

  /** 店主审核直售付款 */
  async audit(orderId: number, pass: boolean) {
    const o = await this.orderRepo.findOneByOrFail({ id: orderId });
    if (o.status !== '已提交截图') throw new BadRequestException('状态错误');
    await this.orderRepo.update(orderId, { status: pass ? '囤货中' : '待付款', ...(pass ? { paidAt: new Date() } : {}) });
    return { ok: true };
  }

  /** 团员申请取消直售订单 */
  async requestCancel(uid: number, orderId: number) {
    const o = await this.orderRepo.findOneByOrFail({ id: orderId });
    if (o.userId !== uid) throw new ForbiddenException();
    if (o.seriesId !== 0) throw new BadRequestException('非直售订单');
    if (['已发货', '已完成', '已取消', '已取消（超时）'].includes(o.status)) throw new BadRequestException('当前状态不可取消');
    const hours = (Date.now() - new Date(o.createdAt).getTime()) / 3600_000;
    if (hours >= 48) throw new BadRequestException('超过48小时不可取消');
    if (hours < 24) {
      // 24h内直接取消，恢复库存
      await this.doCancel(o, '团员24h内直接取消');
      return { action: 'cancelled' };
    }
    // 24-48h：提交取消申请
    const prevStatus = o.status;
    await this.orderRepo.update(orderId, { cancelRequestAt: new Date(), status: '申请取消' });
    const notifRepo = this.orderRepo.manager.getRepository(Notification);
    await notifRepo.save(notifRepo.create({
      userId: 1, // 通知团长
      title: '直售取消申请',
      body: `订单 #${orderId} 申请取消，团员24-48h内提出，请尽快审核`,
    }));
    return { action: 'requested' };
  }

  /** 团长审核取消申请 */
  async auditCancel(orderId: number, pass: boolean, note: string) {
    const o = await this.orderRepo.findOneByOrFail({ id: orderId });
    if (!o.cancelRequestAt) throw new BadRequestException('没有取消申请');
    const notifRepo = this.orderRepo.manager.getRepository(Notification);
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
  private async doCancel(o: Order, reason: string) {
    const items = await this.itemRepo.find({ where: { orderId: o.id } });
    for (const it of items) {
      const g = await this.repo.findOneBy({ id: it.goodId });
      if (g) { g.stock += it.qty; await this.repo.save(g); }
    }
    await this.orderRepo.update(o.id, { status: '已取消', cancelRequestAt: null, opLog: (o.opLog || '') + `\n${new Date().toISOString()} ${reason}` });
  }

  /** 待审核的取消申请列表（后台） */
  async pendingCancelAudits() {
    const os = await this.orderRepo.find({
      where: { seriesId: 0, cancelRequestAt: Not(IsNull()) },
      order: { id: 'desc' },
    });
    const us = os.length ? await this.userRepo.find({ where: { id: In(os.map(o => o.userId)) } }) : [];
    const items = os.length ? await this.itemRepo.find({ where: { orderId: In(os.map(o => o.id)) } }) : [];
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
    const us = os.length ? await this.userRepo.find({ where: { id: In(os.map(o => o.userId)) } }) : [];
    return os.map(o => ({ ...o, cn: us.find(u => u.id === o.userId)?.cn || '' }));
  }

  /** 全部直售订单（后台） */
  async allOrders() {
    const os = await this.orderRepo.find({ where: { seriesId: 0 }, order: { id: 'desc' } });
    const us = os.length ? await this.userRepo.find({ where: { id: In(os.map(o => o.userId)) } }) : [];
    return os.map(o => ({ ...o, cn: us.find(u => u.id === o.userId)?.cn || '' }));
  }

  async myBuys(uid: number) {
    const orders = await this.orderRepo.find({ where: { userId: uid }, order: { id: 'desc' } });
    const orderIds = orders.map(o => o.id);
    const items = orderIds.length ? await this.itemRepo.find({ where: { orderId: In(orderIds) } }) : [];
    const seriesIds = [...new Set(orders.filter(o => o.seriesId !== 0).map(o => o.seriesId))];
    const seriesList = seriesIds.length ? await this.orderRepo.manager.getRepository(Series).find({ where: { id: In(seriesIds) } }) : [];
    return orders.map(o => ({
      ...o,
      items: items.filter(i => i.orderId == o.id),
      seriesName: seriesList.find(s => s.id === o.seriesId)?.name || '',
      hours: Math.round((Date.now() - new Date(o.createdAt).getTime()) / 3600_000 * 10) / 10,
    }));
  }
}

@Controller('sale')
export class SaleController {
  constructor(private svc: SaleService) {}

  @Get('list')
  async list(@Query('q') q?: string) { return this.svc.list(q || ''); }

  @Post('save')
  async save(@Req() req: Request & { user?: JwtUser }, @Body() b: Partial<SaleGood>) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.save(b);
  }

  @Post('restock')
  async restock(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number; qty: number }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.restock(b.id, b.qty);
  }

  @Post('delete')
  async remove(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.remove(b.id);
  }

  @Post('import')
  async importGoods(@Req() req: Request & { user?: JwtUser }, @Body() b: { rows: any[] }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.importGoods(b.rows);
  }

  @Post('buy')
  async buy(@Req() req: Request & { user?: JwtUser }, @Body() b: { goodId: number; qty: number }) {
    checkRole(req.user, []);
    return this.svc.buy(req.user!.id, b.goodId, b.qty);
  }

  @Post('batch-buy')
  async batchBuy(@Req() req: Request & { user?: JwtUser }, @Body() b: { items: { goodId: number; qty: number }[]; blindShipMode?: string }) {
    checkRole(req.user, []);
    return this.svc.batchBuy(req.user!.id, b.items, b.blindShipMode);
  }

  @Post('pay')
  async pay(@Req() req: Request & { user?: JwtUser }, @Body() b: { orderId: number; useBalanceAmount: number; screenshot?: string }) {
    checkRole(req.user, []);
    return this.svc.pay(req.user!.id, b.orderId, b.useBalanceAmount, b.screenshot);
  }

  @Post('audit')
  async audit(@Req() req: Request & { user?: JwtUser }, @Body() b: { orderId: number; pass: boolean }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.audit(b.orderId, b.pass);
  }

  @Get('pending-audit')
  async pendingAudit(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.pendingAudit();
  }

  @Get('all')
  async allOrders(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.allOrders();
  }

  @Get('my-buys')
  async my(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['banned-allowed']);
    return this.svc.myBuys(req.user!.id);
  }

  @Post('cancel-request')
  async cancelReq(@Req() req: Request & { user?: JwtUser }, @Body() b: { orderId: number }) {
    checkRole(req.user, ['banned-allowed']);
    return this.svc.requestCancel(req.user!.id, b.orderId);
  }

  @Post('cancel-audit')
  async cancelAudit(@Req() req: Request & { user?: JwtUser }, @Body() b: { orderId: number; pass: boolean; note?: string }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.auditCancel(b.orderId, b.pass, b.note || '');
  }

  @Get('pending-cancel')
  async pendingCancel(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.pendingCancelAudits();
  }
}

export const SaleModuleRef = TypeOrmModule.forFeature([SaleGood, User, Order, OrderItem]);
