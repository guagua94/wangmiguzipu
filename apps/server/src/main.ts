import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { AuctionService } from './modules/auction';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create<INestApplication>(AppModule, { cors: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));

  // 静态文件服务：/uploads/xxx.png
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!require('fs').existsSync(uploadsDir)) require('fs').mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`[wangmi-server] http://0.0.0.0:${port}/api`);

  // 拍卖状态定时推进：启动后10秒首次执行，之后每分钟一次
  const auctionService = app.get(AuctionService);
  setTimeout(() => {
    auctionService.tickStates();
    setInterval(() => auctionService.tickStates(), 60_000);
  }, 10_000);

  // 数据库迁移：兼容旧数据
  const ds = app.get(DataSource);
  try { await ds.query(`ALTER TABLE series ADD COLUMN mode TEXT DEFAULT 'traditional'`); } catch(e) {}
  try { await ds.query(`ALTER TABLE series ADD COLUMN deadlineAt TIMESTAMP`); } catch(e) {}
  try { await ds.query(`ALTER TABLE order_items ADD COLUMN status TEXT DEFAULT ''`); } catch(e) {}
  try { await ds.query(`ALTER TABLE goods ADD COLUMN unitFee DECIMAL(10,2) DEFAULT '0.1'`); } catch(e) {}
  try { await ds.query(`ALTER TABLE sale_goods ADD COLUMN unitFee DECIMAL(10,2) DEFAULT '0.1'`); } catch(e) {}
  try { await ds.query(`ALTER TABLE shop_config ADD COLUMN groupFreeDays INTEGER DEFAULT 30`); } catch(e) {}
  try { await ds.query(`ALTER TABLE shop_config ADD COLUMN groupOverFeeOn INTEGER DEFAULT 1`); } catch(e) {}
  try { await ds.query(`ALTER TABLE shop_config ADD COLUMN groupOverDays INTEGER DEFAULT 90`); } catch(e) {}
  try { await ds.query(`ALTER TABLE shop_config ADD COLUMN saleFreeDays INTEGER DEFAULT 7`); } catch(e) {}
  try { await ds.query(`ALTER TABLE shop_config ADD COLUMN saleOverFeeOn INTEGER DEFAULT 1`); } catch(e) {}
  try { await ds.query(`ALTER TABLE shop_config ADD COLUMN saleOverDays INTEGER DEFAULT 30`); } catch(e) {}
  try { await ds.query(`ALTER TABLE auction_deposits ADD COLUMN screenshot TEXT DEFAULT ''`); } catch(e) {}
  try { await ds.query(`ALTER TABLE auction_deposits ADD COLUMN auditNote TEXT DEFAULT ''`); } catch(e) {}
  try { await ds.query(`ALTER TABLE shop_config ADD COLUMN unitFees TEXT DEFAULT '[{"name":"拍立得 / 透卡 / 明信片","fee":0.1,"note":"纸片类小件"},{"name":"吧唧 / 立牌 / 色纸 / 文件夹","fee":0.2,"note":"亚克力/铁皮/纸质中件"},{"name":"手办 / 其他","fee":0.5,"note":"大件/其他"}]'`); } catch(e) {}
}
bootstrap();
