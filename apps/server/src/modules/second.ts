import { Controller, Get, Post, Body, Req, BadRequestException } from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Request } from 'express';
import { SecondBill, User } from '../entities';
import { JwtUser, checkRole } from '../common';
import { BalanceService } from './balance';

export class SecondService {
  constructor(
    @InjectRepository(SecondBill) private repo: Repository<SecondBill>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private balance: BalanceService,
  ) {}

  /** 发起：三种计算方式 point=单价×点数 / weight=首重+续重×n / custom=自定义金额 */
  async create(b: { userId: number; title: string; way: 'point' | 'weight' | 'custom'; p1: number; p2: number; p3: number }) {
    let amount = 0, calc = '';
    if (b.way === 'point') { amount = b.p1 * b.p2; calc = `按点数 ${b.p1}×${b.p2}`; }
    else if (b.way === 'weight') { amount = b.p1 + b.p2 * b.p3; calc = `按克重 首重${b.p1}+续重${b.p2}×${b.p3}`; }
    else { amount = b.p1; calc = '自定义'; }
    if (!(amount > 0)) throw new BadRequestException('金额无效');
    const bill = await this.repo.save(this.repo.create({
      userId: b.userId, title: b.title || calc, calc, amount: amount.toFixed(2),
    }));
    const u = await this.userRepo.findOneByOrFail({ id: b.userId });
    const nRepo = this.userRepo.manager.getRepository('Notification');
    await nRepo.save(nRepo.create({ userId: b.userId, title: '新的二次收肾账单', body: `${b.title || calc} ¥${amount.toFixed(2)}（${calc}），请前往付款` }));
    return { ...bill, cn: u.cn };
  }

  async mine(uid: number) { return this.repo.find({ where: { userId: uid }, order: { id: 'desc' } }); }

  async all() {
    const bs = await this.repo.find({ order: { id: 'desc' } });
    const us = bs.length ? await this.userRepo.find({ where: { id: In(bs.map(b => b.userId)) } }) : [];
    return bs.map(b => ({ ...b, cn: us.find(u => u.id === b.userId)?.cn || '' }));
  }

  /** 付款：余额优先（全额抵扣直接完成），否则提交截图待审 */
  async submit(uid: number, id: number, screenshot: string, useBalanceAmount: number) {
    const b = await this.repo.findOneByOrFail({ id });
    if (b.userId !== uid || b.state !== '待付款') throw new BadRequestException('状态错误');
    const total = +b.amount;
    let useBal = Math.max(0, Math.min(useBalanceAmount || 0, total));
    let rest = total;
    if (useBal > 0) {
      await this.balance.debit(uid, useBal, '二次收肾抵扣', `${b.title}（余额抵 ¥${useBal.toFixed(2)}）`, `S${id}`);
      rest = total - useBal;
    }
    if (rest > 0) {
      if (!screenshot) throw new BadRequestException(`需扫码支付 ¥${rest.toFixed(2)}，请上传付款截图`);
      await this.repo.update(id, { state: '已提交截图', screenshot });
      return { paidOff: false, usedBalance: useBal, restPaid: rest };
    }
    await this.repo.update(id, { state: '已完成' });
    return { paidOff: true, usedBalance: useBal, restPaid: 0 };
  }

  async audit(id: number, pass: boolean) {
    const b = await this.repo.findOneByOrFail({ id });
    if (b.state !== '已提交截图') throw new BadRequestException('状态错误');
    await this.repo.update(id, { state: pass ? '已完成' : '待付款' });
    return { ok: true };
  }
}

@Controller('second')
export class SecondController {
  constructor(private svc: SecondService) {}

  @Post('create')
  async create(@Req() req: Request & { user?: JwtUser }, @Body() b: any) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.create(b);
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
  async audit(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number; pass: boolean }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.audit(b.id, b.pass);
  }
}

export const SecondModuleRef = TypeOrmModule.forFeature([SecondBill, User]);
