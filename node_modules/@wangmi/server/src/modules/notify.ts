import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Notification } from '../entities';
import { JwtUser, checkRole } from '../common';

export class NotifyService {
  constructor(@InjectRepository(Notification) private repo: Repository<Notification>) {}
  async push(userId: number, title: string, body: string) {
    await this.repo.save(this.repo.create({ userId, title, body }));
  }
  async list(uid: number) {
    return this.repo.find({ where: { userId: uid }, order: { id: 'desc' }, take: 50 });
  }
  async readAll(uid: number) {
    await this.repo.update({ userId: uid }, { read: true });
    return { ok: true };
  }
  async readOne(uid: number, id: number) {
    const n = await this.repo.findOneByOrFail({ id });
    if (n.userId !== uid) return { error: '无权操作' };
    await this.repo.update(id, { read: true });
    return { ok: true };
  }
  async unreadCount(uid: number) {
    return this.repo.count({ where: { userId: uid, read: false } });
  }
  async deleteOne(uid: number, id: number) {
    const n = await this.repo.findOneByOrFail({ id });
    if (n.userId !== uid) return { error: '无权操作' };
    await this.repo.delete(id);
    return { ok: true };
  }
}

@Controller('notify')
export class NotifyController {
  constructor(private svc: NotifyService) {}

  @Get('list')
  async list(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, []);
    return this.svc.list(req.user!.id);
  }

  @Post('read-all')
  async readAll(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, []);
    return this.svc.readAll(req.user!.id);
  }

  @Post('read-one')
  async readOne(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number }) {
    checkRole(req.user, []);
    return this.svc.readOne(req.user!.id, b.id);
  }

  @Post('delete-one')
  async deleteOne(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number }) {
    checkRole(req.user, []);
    return this.svc.deleteOne(req.user!.id, b.id);
  }

  @Get('unread-count')
  async unreadCount(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, []);
    return { count: await this.svc.unreadCount(req.user!.id) };
  }
}

export const NotifyModuleRef = TypeOrmModule.forFeature([Notification]);
