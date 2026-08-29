import { Controller, Get, Post, Body, Req, Param, BadRequestException } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Address } from '../entities';
import { JwtUser, checkRole } from '../common';

export class AddressService {
  constructor(@InjectRepository(Address) private repo: Repository<Address>) {}

  /** 列出我的地址（默认地址排最前） */
  async list(uid: number) {
    const list = await this.repo.find({ where: { userId: uid }, order: { isDefault: 'desc', id: 'desc' } });
    return list;
  }

  /** 新增地址 */
  async create(uid: number, b: { recipientName: string; phone: string; region: string; detail: string; isDefault?: boolean }) {
    if (!b.recipientName?.trim()) throw new BadRequestException('请填写收件人姓名');
    if (!b.phone?.trim()) throw new BadRequestException('请填写手机号');
    if (!/^1\d{10}$/.test(b.phone.trim())) throw new BadRequestException('手机号格式不正确');
    if (!b.region?.trim()) throw new BadRequestException('请填写省市区');
    if (!b.detail?.trim()) throw new BadRequestException('请填写详细地址');

    // 如果设为默认，先取消其他默认
    if (b.isDefault) await this.repo.update({ userId: uid }, { isDefault: false });
    const isFirst = await this.repo.count({ where: { userId: uid } }) === 0;

    const addr = this.repo.create({
      userId: uid,
      recipientName: b.recipientName.trim(),
      phone: b.phone.trim(),
      region: b.region.trim(),
      detail: b.detail.trim(),
      isDefault: b.isDefault || isFirst, // 第一个地址自动设为默认
    });
    return this.repo.save(addr);
  }

  /** 编辑地址 */
  async update(uid: number, id: number, b: { recipientName: string; phone: string; region: string; detail: string; isDefault?: boolean }) {
    const addr = await this.repo.findOneByOrFail({ id, userId: uid });
    if (!b.recipientName?.trim()) throw new BadRequestException('请填写收件人姓名');
    if (!b.phone?.trim()) throw new BadRequestException('请填写手机号');
    if (!/^1\d{10}$/.test(b.phone.trim())) throw new BadRequestException('手机号格式不正确');
    if (!b.region?.trim()) throw new BadRequestException('请填写省市区');
    if (!b.detail?.trim()) throw new BadRequestException('请填写详细地址');

    if (b.isDefault && !addr.isDefault) {
      await this.repo.update({ userId: uid }, { isDefault: false });
    }
    addr.recipientName = b.recipientName.trim();
    addr.phone = b.phone.trim();
    addr.region = b.region.trim();
    addr.detail = b.detail.trim();
    addr.isDefault = b.isDefault || false;
    return this.repo.save(addr);
  }

  /** 删除地址 */
  async remove(uid: number, id: number) {
    const addr = await this.repo.findOneByOrFail({ id, userId: uid });
    await this.repo.remove(addr);
    // 如果删的是默认地址，把剩余的第一条设为默认
    if (addr.isDefault) {
      const rest = await this.repo.find({ where: { userId: uid }, order: { id: 'desc' }, take: 1 });
      if (rest.length) await this.repo.update(rest[0].id, { isDefault: true });
    }
    return { ok: true };
  }

  /** 设为默认 */
  async setDefault(uid: number, id: number) {
    const addr = await this.repo.findOneByOrFail({ id, userId: uid });
    await this.repo.update({ userId: uid }, { isDefault: false });
    addr.isDefault = true;
    return this.repo.save(addr);
  }

  /** 获取默认地址 */
  async getDefault(uid: number) {
    return this.repo.findOne({ where: { userId: uid, isDefault: true } });
  }

  /** 团长查看某团员的地址列表 */
  async listByUser(uid: number) {
    return this.repo.find({ where: { userId: uid }, order: { isDefault: 'desc', id: 'desc' } });
  }
}

@Controller('address')
export class AddressController {
  constructor(private svc: AddressService) {}

  /** 列出我的地址 */
  @Get('list')
  async list(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, []);
    return this.svc.list(req.user!.id);
  }

  /** 新增 */
  @Post('create')
  async create(@Req() req: Request & { user?: JwtUser }, @Body() b: any) {
    checkRole(req.user, []);
    return this.svc.create(req.user!.id, b);
  }

  /** 编辑 */
  @Post('update')
  async update(@Req() req: Request & { user?: JwtUser }, @Body() b: any) {
    checkRole(req.user, []);
    if (!b.id || b.id <= 0) throw new BadRequestException('地址ID无效');
    return this.svc.update(req.user!.id, b.id, b);
  }

  /** 删除 */
  @Post('delete')
  async remove(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number }) {
    checkRole(req.user, []);
    if (!b.id || b.id <= 0) throw new BadRequestException('地址ID无效');
    return this.svc.remove(req.user!.id, b.id);
  }

  /** 设为默认 */
  @Post('default')
  async setDefault(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number }) {
    checkRole(req.user, []);
    if (!b.id || b.id <= 0) throw new BadRequestException('地址ID无效');
    return this.svc.setDefault(req.user!.id, b.id);
  }

  /** 团长查看某团员的地址 */
  @Get('user/:uid')
  async listByUser(@Req() req: Request & { user?: JwtUser }, @Param('uid') uid: string) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.listByUser(+uid);
  }
}

export const AddressModuleRef = TypeOrmModule.forFeature([Address]);
