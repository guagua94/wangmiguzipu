import { Controller, Get, Post, Body, Req, BadRequestException } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { ShopConfig } from '../entities';
import { JwtUser, checkRole } from '../common';

export class ShopService {
  constructor(@InjectRepository(ShopConfig) private repo: Repository<ShopConfig>) {}
  async get() {
    let c = await this.repo.findOneBy({ id: 1 });
    if (!c) c = await this.repo.save(this.repo.create({}));
    return c;
  }
  async save(patch: Partial<ShopConfig>) {
    if (patch.groupFreeDays < 0 || patch.groupOverDays < 0 || patch.saleFreeDays < 0 || patch.saleOverDays < 0) throw new BadRequestException('天数不能为负数');
    const c = await this.get();
    Object.assign(c, patch);
    await this.repo.save(c);
    return c;
  }
}

@Controller('shop')
export class ShopController {
  constructor(private svc: ShopService) {}

  @Get('config')
  async get() { return this.svc.get(); }

  @Post('config')
  async save(@Req() req: Request & { user?: JwtUser }, @Body() b: Partial<ShopConfig>) {
    checkRole(req.user, ['owner']);
    return this.svc.save(b);
  }
}

export const ShopModuleRef = TypeOrmModule.forFeature([ShopConfig]);
