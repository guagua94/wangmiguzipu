import { Controller, Get, Post, Body, Req, BadRequestException } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Request } from 'express';
import { User, BalanceFlow, Withdrawal, Notification } from '../entities';
import { JwtUser, checkRole } from '../common';

/** 余额：记账制。流水 append-only，余额由事务内同步更新。 */
export class BalanceService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(BalanceFlow) private flowRepo: Repository<BalanceFlow>,
    @InjectRepository(Withdrawal) private wdRepo: Repository<Withdrawal>,
  ) {}

  /** 入账（正数）；返回新余额。note 描述来源 */
  async credit(uid: number, amount: number, type: string, note: string, refId = '') {
    if (amount <= 0) throw new BadRequestException();
    const u = await this.userRepo.findOneByOrFail({ id: uid });
    u.balance = (+u.balance + amount).toFixed(2);
    await this.userRepo.save(u);
    await this.flowRepo.save(this.flowRepo.create({ userId: uid, amount: amount.toFixed(2), type, note, refId }));
    const nRepo = this.userRepo.manager.getRepository(Notification);
    await nRepo.save(nRepo.create({ userId: uid, title: '余额变动', body: `${note} +¥${amount.toFixed(2)}，当前余额 ¥${u.balance}` }));
    return u.balance;
  }

  /** 扣减（余额须足够） */
  async debit(uid: number, amount: number, type: string, note: string, refId = '') {
    const u = await this.userRepo.findOneByOrFail({ id: uid });
    if (+u.balance + 1e-9 < amount) throw new BadRequestException('余额不足');
    u.balance = (+u.balance - amount).toFixed(2);
    await this.userRepo.save(u);
    await this.flowRepo.save(this.flowRepo.create({ userId: uid, amount: (-amount).toFixed(2), type, note, refId }));
    return u.balance;
  }

  async flows(uid: number) {
    return this.flowRepo.find({ where: { userId: uid }, order: { id: 'desc' }, take: 100 });
  }

  async applyWithdraw(uid: number, amount: number, method: string) {
    if (amount <= 0) throw new BadRequestException('金额无效');
    const u = await this.userRepo.findOneByOrFail({ id: uid });
    if (+u.balance + 1e-9 < amount) throw new BadRequestException('余额不足');
    // 立即冻结：扣减余额并记流水，退款时再退还
    u.balance = (+u.balance - amount).toFixed(2);
    await this.userRepo.save(u);
    await this.flowRepo.save(this.flowRepo.create({ userId: uid, amount: (-amount).toFixed(2), type: '提现冻结', note: `提现申请冻结 ¥${amount.toFixed(2)}（${method}）` }));
    return this.wdRepo.save(this.wdRepo.create({ userId: uid, amount: amount.toFixed(2), method }));
  }

  async myWithdraws(uid: number) {
    return this.wdRepo.find({ where: { userId: uid }, order: { id: 'desc' } });
  }

  async allWithdraws() {
    const ws = await this.wdRepo.find({ order: { id: 'desc' } });
    const us = ws.length ? await this.userRepo.find({ where: { id: In(ws.map(w => w.userId)) } }) : [];
    return ws.map(w => ({ ...w, cn: us.find(u => u.id === w.userId)?.cn || '' }));
  }

  /** 店主线下退回后标记完成：余额已在申请时冻结，此处仅更新状态 */
  async finishWithdraw(id: number, auditor: JwtUser) {
    const w = await this.wdRepo.findOneByOrFail({ id });
    if (w.state !== '待处理') throw new BadRequestException();
    await this.wdRepo.update(id, { state: '已完成' });
    // 通知用户提现已完成
    const nRepo = this.userRepo.manager.getRepository(Notification);
    await nRepo.save(nRepo.create({ userId: w.userId, title: '提现完成', body: `提现 ¥${w.amount} 已由 ${auditor.cn} 确认完成（${w.method}）` }));
    return { ok: true };
  }

  /** 拒绝提现：退还冻结的余额 */
  async rejectWithdraw(id: number, auditor: JwtUser) {
    const w = await this.wdRepo.findOneByOrFail({ id });
    if (w.state !== '待处理') throw new BadRequestException('仅待处理可拒绝');
    await this.wdRepo.update(id, { state: '已拒绝' });
    // 退还冻结的余额
    const u = await this.userRepo.findOneByOrFail({ id: w.userId });
    u.balance = (+u.balance + +w.amount).toFixed(2);
    await this.userRepo.save(u);
    await this.flowRepo.save(this.flowRepo.create({ userId: w.userId, amount: w.amount, type: '提现退还', note: `提现申请被拒绝，退还冻结金额 ¥${w.amount}（${auditor.cn} 操作）` }));
    const nRepo = this.userRepo.manager.getRepository(Notification);
    await nRepo.save(nRepo.create({ userId: w.userId, title: '提现被拒绝', body: `提现 ¥${w.amount} 被拒绝，冻结金额已退回余额` }));
    return { ok: true };
  }
}

@Controller('balance')
export class BalanceController {
  constructor(private svc: BalanceService) {}

  @Get('flows')
  async flows(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['banned-allowed']);
    return this.svc.flows(req.user!.id);
  }

  @Post('withdraw')
  async apply(@Req() req: Request & { user?: JwtUser }, @Body() b: { amount: number; method: string }) {
    checkRole(req.user, []);
    return this.svc.applyWithdraw(req.user!.id, b.amount, b.method);
  }

  @Get('my-withdraws')
  async my(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['banned-allowed']);
    return this.svc.myWithdraws(req.user!.id);
  }

  @Get('all-withdraws')
  async all(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.allWithdraws();
  }

  @Post('withdraw/finish')
  async finish(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.finishWithdraw(b.id, req.user!);
  }

  @Post('withdraw/reject')
  async reject(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.rejectWithdraw(b.id, req.user!);
  }
}

export const BalanceModuleRef = TypeOrmModule.forFeature([User, BalanceFlow, Withdrawal]);
