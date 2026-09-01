import { Controller, Get, Post, Body, Req, BadRequestException } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { Request } from 'express';
import { Clearing, User, ShopConfig, Order, OrderItem, Notification, Good, SaleGood, Address, Auction } from '../entities';
import { JwtUser, checkRole } from '../common';
import { ShopService } from './shop';
import { BalanceService } from './balance';

export class ClearingService {
  constructor(
    @InjectRepository(Clearing) private repo: Repository<Clearing>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private itemRepo: Repository<OrderItem>,
    @InjectRepository(Good) private goodRepo: Repository<Good>,
    @InjectRepository(SaleGood) private saleRepo: Repository<SaleGood>,
    @InjectRepository(Address) private addrRepo: Repository<Address>,
    @InjectRepository(Auction) private auctionRepo: Repository<Auction>,
    private shop: ShopService,
    private balance: BalanceService,
  ) {}

  /** 团员发起清货：店主配置驱动邮费/打包费选项；超期仓费自动并入 */
  async create(uid: number, b: { orderIds: number[]; freightName: string; packName: string; addressId?: number }) {
    const cfg = await this.shop.get();
    const fr = JSON.parse(cfg.freights).find((f: any) => f.name === b.freightName && f.on);
    const pk = JSON.parse(cfg.packs).find((p: any) => p.name === b.packName && p.on);
    if (!fr || !pk) throw new BadRequestException('邮费/打包费选项无效');
    const orders = await this.orderRepo.find({ where: { id: In(b.orderIds), userId: uid } });
    // orderIds 中不在 orders 表的，去 auctions 表查（state=囤货中, winnerId=uid）
    const foundOrderIds = new Set(orders.map(o => o.id));
    const auctionIds = b.orderIds.filter(id => !foundOrderIds.has(id));
    const auctions = auctionIds.length
      ? await this.auctionRepo.find({ where: { id: In(auctionIds), winnerId: uid, state: '囤货中' as any } })
      : [];
    if (!orders.length && !auctions.length) throw new BadRequestException('无可清货订单');
    const items = await this.itemRepo.find({ where: { orderId: In(foundOrderIds.size ? [...foundOrderIds] : [-1]) } });

    // 获取收货地址快照
    let addressSnapshot = '';
    if (b.addressId) {
      const addr = await this.addrRepo.findOneBy({ id: b.addressId, userId: uid });
      if (addr) addressSnapshot = JSON.stringify({
        recipientName: addr.recipientName,
        phone: addr.phone,
        region: addr.region,
        detail: addr.detail,
      });
    }

    // 超期仓费：按订单类型分别计算（拼团/直售/拍卖）
    let overFee = 0;
    const now = Date.now();
    const goodMap: Record<number, Good> = {};
    const saleGoodMap: Record<number, SaleGood> = {};
    const feeDefaults: { name: string; fee: number }[] = JSON.parse(cfg.unitFees || '[]');

    // 拼团/直售订单仓费
    for (const o of orders) {
      const orderItems = items.filter(i => i.orderId == o.id);
      const stockTime = o.paidAt ? new Date(o.paidAt).getTime() : new Date(o.createdAt).getTime();
      const isSale = o.seriesId === 0;
      const freeDays = isSale ? cfg.saleFreeDays : cfg.groupFreeDays;
      const feeOn = isSale ? cfg.saleOverFeeOn : cfg.groupOverFeeOn;
      if (!feeOn) continue;
      const daysPassed = Math.floor((now - stockTime) / (24 * 3600 * 1000));
      const overDays = Math.max(0, daysPassed - freeDays);
      let orderOverFee = 0;
      for (const it of orderItems) {
        let unitFee = 0.1;
        if (isSale) {
          if (!saleGoodMap[it.goodId]) saleGoodMap[it.goodId] = await this.saleRepo.findOneBy({ id: it.goodId });
          unitFee = +(saleGoodMap[it.goodId]?.unitFee || '0.1');
        } else {
          if (!goodMap[it.goodId]) goodMap[it.goodId] = await this.goodRepo.findOneBy({ id: it.goodId });
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
      if (!feeOn) continue;
      const daysPassed = Math.floor((now - stockTime) / (24 * 3600 * 1000));
      const overDays = Math.max(0, daysPassed - freeDays);
      let unitFee = 0.1;
      for (const fd of feeDefaults) {
        if (a.name && a.name.includes(fd.name)) { unitFee = fd.fee; break; }
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

  async mine(uid: number) {
    return this.repo.find({ where: { userId: uid }, order: { id: 'desc' } });
  }

  async all() {
    const cs = await this.repo.find({ order: { id: 'desc' } });
    const us = cs.length ? await this.userRepo.find({ where: { id: In(cs.map(c => c.userId)) } }) : [];
    return cs.map(c => ({ ...c, cn: us.find(u => u.id === c.userId)?.cn || '' }));
  }

  async submit(uid: number, id: number, screenshot: string, useBalanceAmount: number) {
    const c = await this.repo.findOneByOrFail({ id });
    if (c.userId !== uid || c.state !== '待付款') throw new BadRequestException('状态错误');
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
    if (!screenshot) throw new BadRequestException(`需扫码支付 ¥${rest.toFixed(2)}，请上传付款截图`);
    await this.repo.update(id, { state: '已提交截图', screenshot });
    return { paidOff: false, rest, usedBalance: useBal };
  }

  async audit(id: number, pass: boolean, packImg: string, auditor: JwtUser) {
    const c = await this.repo.findOneByOrFail({ id });
    if (c.state !== '已提交截图') throw new BadRequestException('状态错误');
    if (pass) await this.repo.update(id, { state: '审核通过', packImg });
    else await this.repo.update(id, { state: '打回' });
    await this.notify(c.userId, pass ? '清货审核通过' : '清货被打回',
      `清货单 #${id} ${pass ? '审核通过，等待打包发货' : '邮费/打包费有误被打回'}`);
    return { ok: true };
  }

  async ship(id: number, trackingNo: string, packImg: string) {
    await this.repo.update(id, { state: '已发货', trackingNo, packImg, shippedAt: new Date() });
    const c = await this.repo.findOneByOrFail({ id });
    await this.notify(c.userId, '清货已发货', `清货单 #${id} 物流单号：${trackingNo}`);
    return { ok: true };
  }

  /** 批量发货：仅对「审核通过」状态的清货单执行发货 */
  async batchShip(ids: number[]) {
    let shipped = 0;
    for (const id of ids) {
      const c = await this.repo.findOneBy({ id });
      if (!c || c.state !== '审核通过') continue;
      await this.repo.update(id, { state: '已发货', shippedAt: new Date() });
      await this.notify(c.userId, '清货已发货', `清货单 #${id} 已发货`);
      shipped++;
    }
    return { shipped };
  }

  /** 团员确认收货：已发货 → 已完成 */
  async confirmReceive(id: number, uid: number) {
    const c = await this.repo.findOneByOrFail({ id });
    if (c.userId !== uid || c.state !== '已发货') throw new BadRequestException('状态错误');
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

  private async notify(uid: number, title: string, body: string) {
    await this.userRepo.manager.getRepository(Notification).save(
      this.userRepo.manager.getRepository(Notification).create({ userId: uid, title, body }));
  }
}

@Controller('clearing')
export class ClearingController {
  constructor(private svc: ClearingService) {}

  @Post('create')
  async create(@Req() req: Request & { user?: JwtUser }, @Body() b: { orderIds: number[]; freightName: string; packName: string; addressId?: number }) {
    checkRole(req.user, []);
    return this.svc.create(req.user!.id, b);
  }

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

  @Post('submit')
  async submit(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number; screenshot?: string; useBalanceAmount: number }) {
    checkRole(req.user, []);
    return this.svc.submit(req.user!.id, b.id, b.screenshot || '', b.useBalanceAmount);
  }

  @Post('audit')
  async audit(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number; pass: boolean; packImg?: string }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.audit(b.id, b.pass, b.packImg || '', req.user!);
  }

  @Post('ship')
  async ship(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number; trackingNo: string; packImg?: string }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.ship(b.id, b.trackingNo, b.packImg || '');
  }

  @Post('batch-ship')
  async batchShip(@Req() req: Request & { user?: JwtUser }, @Body() b: { ids: number[] }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.batchShip(b.ids || []);
  }

  @Post('confirm-receive')
  async confirmReceive(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number }) {
    checkRole(req.user, ['banned-allowed']);
    return this.svc.confirmReceive(b.id, req.user!.id);
  }

  @Post('auto-confirm-receive')
  async autoConfirmReceive(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.autoConfirmReceive();
  }
}

export const ClearingModuleRef = TypeOrmModule.forFeature([Clearing, User, Order, OrderItem, Good, SaleGood, Address, Auction]);
