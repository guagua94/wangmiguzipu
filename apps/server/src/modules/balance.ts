import { Controller, Get, Post, Body, Req, Query, BadRequestException } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Request } from 'express';
import { User, BalanceFlow, Withdrawal, Notification, Money } from '../entities';
import { JwtUser, checkRole } from '../common';

/** 余额：记账制。流水 append-only，余额由事务内同步更新。 */
export class BalanceService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(BalanceFlow) private flowRepo: Repository<BalanceFlow>,
    @InjectRepository(Withdrawal) private wdRepo: Repository<Withdrawal>,
  ) {}

   async credit(uid: number, amount: number, type: string, note: string, refId = '') {
    if (amount <= 0) throw new BadRequestException();
    const newBalance = await this.userRepo.manager.transaction(async manager => {
      const userRepo = manager.getRepository(User);
      const flowRepo = manager.getRepository(BalanceFlow);
      const u = await userRepo.findOneByOrFail({ id: uid });
      u.balance = Money.of(+u.balance + amount);
      await userRepo.save(u);
      await flowRepo.save(flowRepo.create({ userId: uid, amount: Money.of(amount), type, note, refId }));
      return u.balance;
    });
    // 事务成功后发通知（通知失败不影响余额）
    const nRepo = this.userRepo.manager.getRepository(Notification);
    await nRepo.save(nRepo.create({ userId: uid, title: '余额变动', body: `${note} +¥${Money.of(amount)}，当前余额 ¥${newBalance}` }));
    return newBalance;
  }

   async debit(uid: number, amount: number, type: string, note: string, refId = '') {
    const newBalance = await this.userRepo.manager.transaction(async manager => {
      const userRepo = manager.getRepository(User);
      const flowRepo = manager.getRepository(BalanceFlow);
      const u = await userRepo.findOneByOrFail({ id: uid });
      if (+u.balance + 1e-9 < amount) throw new BadRequestException('余额不足');
      u.balance = Money.of(+u.balance - amount);
      await userRepo.save(u);
      await flowRepo.save(flowRepo.create({ userId: uid, amount: Money.of(-amount), type, note, refId }));
      return u.balance;
    });
    return newBalance;
  }

  async flows(uid: number) {
    return this.flowRepo.find({ where: { userId: uid }, order: { id: 'desc' }, take: 100 });
  }

   async applyWithdraw(uid: number, amount: number, method: string) {
    if (amount <= 0) throw new BadRequestException('金额无效');
    const wd = await this.userRepo.manager.transaction(async manager => {
      const userRepo = manager.getRepository(User);
      const flowRepo = manager.getRepository(BalanceFlow);
      const wdRepo = manager.getRepository(Withdrawal);
      const u = await userRepo.findOneByOrFail({ id: uid });
      if (+u.balance + 1e-9 < amount) throw new BadRequestException('余额不足');
      u.balance = Money.of(+u.balance - amount);
      await userRepo.save(u);
      await flowRepo.save(flowRepo.create({ userId: uid, amount: Money.of(-amount), type: '提现冻结', note: `提现申请冻结 ¥${Money.of(amount)}（${method}）` }));
      return await wdRepo.save(wdRepo.create({ userId: uid, amount: Money.of(amount), method }));
    });
    return wd;
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
    await nRepo.save(nRepo.create({ userId: w.userId, title: '提现完成', body: `提现 ¥${Money.of(w.amount)} 已由 ${auditor.cn} 确认完成（${w.method}）` }));
    return { ok: true };
  }

   async rejectWithdraw(id: number, auditor: JwtUser) {
    const w = await this.wdRepo.findOneByOrFail({ id });
    if (w.state !== '待处理') throw new BadRequestException('仅待处理可拒绝');
    await this.userRepo.manager.transaction(async manager => {
      const wdRepo = manager.getRepository(Withdrawal);
      const userRepo = manager.getRepository(User);
      const flowRepo = manager.getRepository(BalanceFlow);
      await wdRepo.update(id, { state: '已拒绝' });
      const u = await userRepo.findOneByOrFail({ id: w.userId });
      u.balance = Money.of(+u.balance + +w.amount);
      await userRepo.save(u);
      await flowRepo.save(flowRepo.create({ userId: w.userId, amount: Money.of(w.amount), type: '提现退还', note: `提现申请被拒绝，退还冻结金额 ¥${Money.of(w.amount)}（${auditor.cn} 操作）` }));
    });
    // 事务成功后发通知
    const nRepo = this.userRepo.manager.getRepository(Notification);
    await nRepo.save(nRepo.create({ userId: w.userId, title: '提现被拒绝', body: `提现 ¥${Money.of(w.amount)} 被拒绝，冻结金额已退回余额` }));
    return { ok: true };
  }

  /** 全站余额汇总统计 */
  async summary() {
    const users = await this.userRepo.find();
    const totalBalance = users.reduce((s, u) => s + (+u.balance || 0), 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayFlows = await this.flowRepo.find({
      where: { createdAt: new Date(todayStart) },
      order: { id: 'desc' },
    });
    return {
      totalUsers: users.length,
      totalBalance: Money.of(totalBalance),
      avgBalance: users.length ? Money.of(totalBalance / users.length) : '0.00',
      todayFlowCount: todayFlows.length,
    };
  }

  /** 全站余额流水查询（店主） */
  async allFlows(opts: { cn?: string; start?: string; end?: string; type?: string; direction?: 'in'|'out'|'all'; page?: number; size?: number }) {
    const qb = this.flowRepo.createQueryBuilder('f').leftJoinAndSelect(User, 'u', 'u.id = f.userId');
    
    if (opts.cn) {
      qb.andWhere('u.cn ILIKE :cn', { cn: `%${opts.cn}%` });
    }
    if (opts.start) {
      qb.andWhere('f.createdAt >= :start', { start: new Date(opts.start) });
    }
    if (opts.end) {
      qb.andWhere('f.createdAt <= :end', { end: new Date(opts.end + 'T23:59:59') });
    }
    if (opts.type) {
      qb.andWhere('f.type = :type', { type: opts.type });
    }
    if (opts.direction === 'in') {
      qb.andWhere('f.amount > 0');
    } else if (opts.direction === 'out') {
      qb.andWhere('f.amount < 0');
    }
    
    const page = opts.page || 1;
    const size = opts.size || 20;
    const [flows, total] = await qb
      .orderBy('f.id', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();
    
    const userIds = [...new Set(flows.map(f => f.userId))];
    const users = userIds.length ? await this.userRepo.find({ where: { id: In(userIds) } }) : [];
    
    return {
      total,
      page,
      size,
      items: flows.map(f => ({
        ...f,
        cn: users.find(u => u.id === f.userId)?.cn || '',
        amountNum: +f.amount,
        direction: +f.amount > 0 ? 'in' : 'out',
      })),
    };
  }

  /** 余额排名（按余额从高到低） */
  async ranking() {
    const users = await this.userRepo.find({ order: { balance: 'DESC' } });
    return users.map((u, idx) => ({
      rank: idx + 1,
      id: u.id,
      cn: u.cn,
      account: u.account,
      balance: u.balance,
      role: u.role,
    }));
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

  @Get('summary')
  async summary(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.summary();
  }

  @Get('all-flows')
  async allFlows(@Req() req: Request & { user?: JwtUser }, @Query() q: any) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.allFlows({
      cn: q.cn,
      start: q.start,
      end: q.end,
      type: q.type,
      direction: q.direction || 'all',
      page: +(q.page || 1),
      size: +(q.size || 20),
    });
  }

  @Get('ranking')
  async ranking(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.ranking();
  }
}

export const BalanceModuleRef = TypeOrmModule.forFeature([User, BalanceFlow, Withdrawal]);
