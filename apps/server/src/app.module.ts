import { Module, OnModuleInit, MiddlewareConsumer, RequestMethod, NestModule, Injectable } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { Request, Response, NextFunction } from 'express';
import { entities, Series } from './entities';
import { JwtUser } from './common';

// 按文件聚合的模块
import { AuthController, AuthService } from './modules/auth';
import { UserController, UserService } from './modules/user';
import { ShopController, ShopService } from './modules/shop';
import { GroupController, GroupService } from './modules/group';
import { BalanceController, BalanceService } from './modules/balance';
import { SaleController, SaleService } from './modules/sale';
import { AuctionController, AuctionService } from './modules/auction';
import { TransferController, TransferService } from './modules/transfer';
import { ClearingController, ClearingService } from './modules/clearing';
import { AfterSaleController, AfterSaleService } from './modules/aftersale';
import { NotifyController, NotifyService } from './modules/notify';
import { SecondController, SecondService } from './modules/second';
import { AddressController, AddressService, AddressModuleRef } from './modules/address';
import { UploadController } from './modules/upload';

const isPostgres = !!process.env.DATABASE_URL;
const dbFile = path.join(__dirname, '..', 'wangmi.db');
if (!isPostgres && !fs.existsSync(dbFile)) fs.writeFileSync(dbFile, '');

const dbConfig: any = isPostgres
  ? {
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      entities,
      synchronize: false, // 生产环境禁用自动同步，表结构变更请用 migration
    }
  : {
      type: 'sqljs',
      location: dbFile,
      autoSave: true,
      entities,
      synchronize: true, // 本地开发保留自动同步
    };

@Injectable()
export class AutoJietuanTask {
  constructor(private ds: DataSource, private group: GroupService) {}
  start() {
    setInterval(async () => {
      try {
        const seriesRepo = this.ds.getRepository(Series);
        const now = new Date();
        const due = await seriesRepo.find({
          where: { status: '进行中', deadlineAt: LessThanOrEqual(now) },
        });
        for (const s of due) {
          try {
            await this.group.jietuan(s.id, 1); // uid=1 系统定时截团
            console.log(`[auto-jietuan] 系列 #${s.id} "${s.name}" 已自动截团`);
          } catch (e: any) {
            console.error(`[auto-jietuan] 系列 #${s.id} 自动截团失败:`, e.message);
          }
        }
      } catch (e) { /* 静默失败，不影响服务 */ }
    }, 60_000); // 每 60 秒检查一次
    console.log('[auto-jietuan] 自动截团定时任务已启动（每60秒）');
  }
}

@Module({
  imports: [
    JwtModule.register({ secret: process.env.JWT_SECRET! }),
    TypeOrmModule.forRoot(dbConfig),
    TypeOrmModule.forFeature(entities),
    AddressModuleRef,
  ],
  controllers: [
    AuthController, UserController, ShopController, GroupController,
    BalanceController, SaleController, AuctionController, TransferController,
    ClearingController, AfterSaleController, NotifyController, SecondController,
    AddressController, UploadController,
  ],
  providers: [
    AuthService, UserService, ShopService, GroupService, BalanceService,
    SaleService, AuctionService, TransferService, ClearingService,
    AfterSaleService, NotifyService, SecondService, AddressService,
    AutoJietuanTask,
  ],
})
export class AppModule implements OnModuleInit, NestModule {
  constructor(private ds: DataSource, private jwt: JwtService, private autoJietuan: AutoJietuanTask) {}

  /** 全局 JWT 解析中间件：有 token 则注入 req.user（路由内再按需校验） */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply((req: Request & { user?: JwtUser }, res: Response, next: NextFunction) => {
      const auth = req.headers.authorization;
      if (auth?.startsWith('Bearer ')) {
        try {
          req.user = this.jwt.verify(auth.slice(7)) as JwtUser;
        } catch { /* token 无效视为未登录 */ }
      }
      next();
    }).forRoutes({ path: '*', method: RequestMethod.ALL });
  }

  async onModuleInit() {
    // 启动自动截团定时任务
    this.autoJietuan.start();
    const cfgRepo = this.ds.getRepository('ShopConfig');
    if (!await cfgRepo.count()) await cfgRepo.save(cfgRepo.create({}));

    // 演示系列（首启动注入，可删）
    const seriesRepo = this.ds.getRepository('Series');
    if (!await seriesRepo.count()) {
      const s = seriesRepo.create({
        name: '夏日祭系列拼团', ip: '原神', emoji: '🎆', status: '进行中',
        eta: '2026-09-20 到货', freightRule: '运费按件均摊，截团后二次收肾', deadline: '08-20 截团',
      });
      await seriesRepo.save(s);
      const goodRepo = this.ds.getRepository('Good');
      await goodRepo.save([
        goodRepo.create({ seriesId: s.id, name: '枫叶吧唧 75mm', cat: '吧唧', emoji: '🍁', price: '12.50', limit: 10, booked: 8 }),
        goodRepo.create({ seriesId: s.id, name: '海盐吧唧 58mm', cat: '吧唧', emoji: '🧂', price: '10.00', limit: 10, booked: 10 }),
        goodRepo.create({ seriesId: s.id, name: '花火亚克力立牌', cat: '立牌', emoji: '🎴', price: '28.00', limit: 6, booked: 2 }),
      ]);
    }

    const saleRepo = this.ds.getRepository('SaleGood');
    if (!await saleRepo.count()) {
      await saleRepo.save([
        saleRepo.create({ no: 'ZS-0001', name: '文豪野犬 中岛敦 吧唧', ip: '文豪野犬', cat: '中古', emoji: '🎖️', price: '25.00', stock: 1, statusText: '几乎全新' }),
        saleRepo.create({ no: 'ZS-0002', name: '咒术回战 五条悟 盲抽', ip: '咒术回战', cat: '盲抽', emoji: '🎲', price: '13.90', stock: 12, statusText: '端盒抽' }),
      ]);
    }
  }
}
