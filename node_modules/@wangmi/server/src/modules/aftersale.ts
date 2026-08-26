import { Controller, Get, Post, Body, Req, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Request } from 'express';
import { AfterSale, User, Order, KidneyBill, ShopConfig, Notification } from '../entities';
import { JwtUser, checkRole } from '../common';
import { ShopService } from './shop';
import { BalanceService } from './balance';

export class AfterSaleService {
  constructor(
    @InjectRepository(AfterSale) private repo: Repository<AfterSale>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private shop: ShopService,
    private balance: BalanceService,
  ) {}

  /** 申请：仅漏发/错发，必选换货/退货，必须开箱视频 */
  async create(uid: number, b: { orderId: string; type: '漏发' | '错发'; goods: string; way: '退货' | '换货'; video: string; note?: string }) {
    if (!['漏发', '错发'].includes(b.type)) throw new BadRequestException('仅支持漏发/错发');
    if (!b.video) throw new BadRequestException('必须上传完整无剪辑开箱视频');
    const cfg = await this.shop.get();
    // 售后时限校验：按订单创建时间 + afterSaleDays 计算
    const ds = this.repo.manager.getRepository<Order>('Order');
    const billRepo = this.repo.manager.getRepository<KidneyBill>('KidneyBill');
    if (b.orderId) {
      let order: Order | null = null;
      if (b.orderId.startsWith('bill-')) {
        // 拼团肾表：bill-{billId} → KidneyBill.orderId → Order
        const billId = +b.orderId.substring(5);
        if (!isNaN(billId) && billId > 0) {
          const bill = await billRepo.findOne({ where: { id: billId } });
          if (bill) order = await ds.findOne({ where: { id: bill.orderId } });
        }
      } else {
        // 直售订单：直接用 orderId 查
        const orderId = +b.orderId;
        if (!isNaN(orderId) && orderId > 0) order = await ds.findOne({ where: { id: orderId } });
      }
      if (order) {
        const created = new Date(order.createdAt).getTime();
        const elapsed = Math.floor((Date.now() - created) / (24 * 3600 * 1000));
        if (elapsed > cfg.afterSaleDays) {
          throw new BadRequestException(`已超过售后时限（${cfg.afterSaleDays}天），无法申请`);
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

  async mine(uid: number) {
    return this.repo.find({ where: { userId: uid }, order: { id: 'desc' } });
  }

  async all() {
    const as = await this.repo.find({ order: { id: 'desc' } });
    const us = as.length ? await this.userRepo.find({ where: { id: In(as.map(a => a.userId)) } }) : [];
    return as.map(a => ({ ...a, cn: us.find(u => u.id === a.userId)?.cn || '' }));
  }

  async audit(id: number, pass: boolean, note: string) {
    const a = await this.repo.findOneByOrFail({ id });
    if (a.state !== '待审核') throw new BadRequestException('状态错误');
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
  async shipBack(uid: number, id: number, trackingNo: string) {
    const a = await this.repo.findOneByOrFail({ id });
    if (a.userId !== uid) throw new ForbiddenException();
    if (a.state === '退货·待寄回') await this.repo.update(id, { state: '退货·待退款' });
    else if (a.state === '换货·待寄回错发品') await this.repo.update(id, { state: '换货·店主确认收货' });
    else throw new BadRequestException('状态错误');
    await this.notify(uid, '寄回单号已提交', `售后单 #${id}，等待店主确认`);
    return { ok: true };
  }

  /** 店主确认收货并退款（退货）：货款退回余额 */
  async refund(id: number, amount: number) {
    const a = await this.repo.findOneByOrFail({ id });
    if (a.state !== '退货·待退款') throw new BadRequestException('状态错误');
    await this.balance.credit(a.userId, amount, '售后退款', `售后退货退款（#${id}）`, `AS${id}`);
    await this.repo.update(id, { state: '已退款' });
    return { ok: true };
  }

  /** 换货：确认收到错发品 → 待补发；随下次排发寄出 → 完成 */
  async restock(id: number) {
    await this.repo.update(id, { state: '换货·待补发' });
    return { ok: true };
  }

  async shipped(id: number) {
    const a = await this.repo.findOneByOrFail({ id });
    await this.repo.update(id, { state: '已完成' });
    await this.notify(a.userId, '售后补发已寄出', `售后单 #${id} 换货谷子已随排发寄出`);
    return { ok: true };
  }

  private async notify(uid: number, title: string, body: string) {
    await this.userRepo.manager.getRepository(Notification).save(
      this.userRepo.manager.getRepository(Notification).create({ userId: uid, title, body }));
  }
}

@Controller('aftersale')
export class AfterSaleController {
  constructor(private svc: AfterSaleService) {}

  @Post('create')
  async create(@Req() req: Request & { user?: JwtUser }, @Body() b: { orderId: string; type: '漏发' | '错发'; goods: string; way: '退货' | '换货'; video: string; note?: string }) {
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

  @Post('audit')
  async audit(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number; pass: boolean; note?: string }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.audit(b.id, b.pass, b.note || '');
  }

  @Post('ship-back')
  async shipBack(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number; trackingNo: string }) {
    checkRole(req.user, []);
    return this.svc.shipBack(req.user!.id, b.id, b.trackingNo);
  }

  @Post('refund')
  async refund(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number; amount: number }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.refund(b.id, b.amount);
  }

  @Post('restock')
  async restock(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.restock(b.id);
  }

  @Post('shipped')
  async shipped(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.shipped(b.id);
  }
}

export const AfterSaleModuleRef = TypeOrmModule.forFeature([AfterSale, User]);
