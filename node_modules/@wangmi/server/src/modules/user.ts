import { Controller, Get, Post, Body, Req, BadRequestException } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsNotEmpty, IsString, IsNumber, IsBoolean, IsOptional } from 'class-validator';
import { Request } from 'express';
import { User, ShopConfig } from '../entities';
import { JwtUser, checkRole } from '../common';

export class UserService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  async list() {
    return this.repo.find({ order: { id: 'asc' } }).then(us => us.map(u => ({
      id: u.id, cn: u.cn, account: u.account, qq: u.qq, wechat: u.wechat,
      role: u.role, banned: u.banned, bannedReason: u.bannedReason, balance: u.balance,
      createdAt: u.createdAt,
    })));
  }

  async toggleBan(id: number, ban: boolean, reason: string) {
    const u = await this.repo.findOneByOrFail({ id });
    if (u.role === 'owner') return { error: '不能拉黑店主' };
    u.banned = ban; u.bannedReason = ban ? (reason || '违反店铺规则') : '';
    await this.repo.save(u);
    return { ok: true };
  }

  async resetPassword(id: number) {
    const pwd = 'wm' + Math.random().toString(36).slice(2, 8);
    const bcrypt = require('bcryptjs');
    const u = await this.repo.findOneByOrFail({ id });
    u.passwordHash = await bcrypt.hash(pwd, 10);
    await this.repo.save(u);
    return { password: pwd }; // 店主线下告知
  }

  /** 设置管理员权限（仅店主） */
  async setAdminPerms(id: number, perms: string) {
    const u = await this.repo.findOneByOrFail({ id });
    if (u.role === 'owner') return { error: '店主无需设置权限' };
    u.adminPerms = perms;
    await this.repo.save(u);
    return { ok: true };
  }

  /** 注销：无待付款订单才可；黑名单不可注销 */
  async deactivate(uid: number) {
    const u = await this.repo.findOneByOrFail({ id: uid });
    if (u.banned) return { error: '黑名单用户不可注销' };
    // 待付款检查（肾表/二次收肾/清货）
    const ds = this.repo.manager;
    const k = await ds.getRepository('KidneyBill').count({ where: { userId: uid, state: '待付款' } });
    const s = await ds.getRepository('SecondBill').count({ where: { userId: uid, state: '待付款' } });
    const c = await ds.getRepository('Clearing').count({ where: { userId: uid, state: '待付款' } });
    if (k + s + c > 0) return { error: '存在待付款订单，无法注销' };
    u.balance = '0.00'; // 余额清零不予提现
    u.account = `deleted_${u.id}_${u.account}`;
    u.cn = `${u.cn}#已注销`; // 释放 CN
    await this.repo.save(u);
    return { ok: true };
  }

  /** 团员修改自己的密码 */
  async changePassword(uid: number, oldPassword: string, newPassword: string) {
    const bcrypt = require('bcryptjs');
    const u = await this.repo.findOneByOrFail({ id: uid });
    if (!await bcrypt.compare(oldPassword, u.passwordHash)) {
      throw new BadRequestException('原密码不正确');
    }
    if (newPassword.length < 6) throw new BadRequestException('新密码至少6位');
    u.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.repo.save(u);
    return { ok: true };
  }

  /** 团员修改联系方式 */
  async updateProfile(uid: number, qq?: string, wechat?: string) {
    const u = await this.repo.findOneByOrFail({ id: uid });
    if (qq !== undefined) u.qq = qq;
    if (wechat !== undefined) u.wechat = wechat;
    await this.repo.save(u);
    return { ok: true };
  }
}

@Controller('user')
export class UserController {
  constructor(private svc: UserService) {}

  @Get('list')
  async list(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.list();
  }

  @Post('ban')
  async ban(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number; ban: boolean; reason?: string }) {
    checkRole(req.user, ['owner']); // 拉黑仅店主
    return this.svc.toggleBan(b.id, b.ban, b.reason || '');
  }

  @Post('reset-password')
  async reset(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number }) {
    checkRole(req.user, ['owner']);
    return this.svc.resetPassword(b.id);
  }

  @Post('set-admin-perms')
  async setPerms(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number; perms: string }) {
    checkRole(req.user, ['owner']);
    return this.svc.setAdminPerms(b.id, b.perms);
  }

  @Post('deactivate')
  async deactivate(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, []); // 仅登录用户，黑名单用户被 checkRole 拦截（与业务逻辑一致：黑名单不可注销）
    return this.svc.deactivate(req.user!.id);
  }

  /** 团员修改自己的密码（需原密码验证） */
  @Post('change-password')
  async changePassword(@Req() req: Request & { user?: JwtUser }, @Body() b: { oldPassword: string; newPassword: string }) {
    checkRole(req.user, []);
    return this.svc.changePassword(req.user!.id, b.oldPassword, b.newPassword);
  }

  /** 团员修改联系方式 */
  @Post('profile')
  async updateProfile(@Req() req: Request & { user?: JwtUser }, @Body() b: { qq?: string; wechat?: string }) {
    checkRole(req.user, []);
    return this.svc.updateProfile(req.user!.id, b.qq, b.wechat);
  }
}

export const UserModuleRef = TypeOrmModule.forFeature([User]);
