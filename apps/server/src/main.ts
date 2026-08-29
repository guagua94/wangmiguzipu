import 'reflect-metadata';
import * as dns from 'dns';
// Railway 容器不支持 IPv6，强制 DNS 优先返回 IPv4
dns.setDefaultResultOrder('ipv4first');
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
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!require('fs').existsSync(uploadsDir)) require('fs').mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));
  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`[wangmi-server] http://0.0.0.0:${port}/api`);
  const auctionService = app.get(AuctionService);
  setTimeout(() => {
    auctionService.tickStates();
    setInterval(() => auctionService.tickStates(), 60_000);
  }, 10_000);
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

  // 确保 wangmi 账号存在且密码正确（处理 CN 冲突）
  const userRepo = ds.getRepository('User');
  let wangmi = await userRepo.findOne({ where: { account: 'wangmi' } });
  if (!wangmi) {
    const conflict = await userRepo.findOne({ where: { cn: '汪咪店主' } });
    if (conflict) {
      conflict.cn = '原_' + conflict.cn + '_' + Date.now();
      await userRepo.save(conflict);
      console.log('[seed] renamed conflicting CN for account ' + conflict.account);
    }
    wangmi = userRepo.create({
      account: 'wangmi',
      passwordHash: '$2a$10$MUu7likKwg1CDIsHadE2KOlfNIMpA2B7yugoo0NKoCpzRP/o1rHPS',
      cn: '汪咪店主', qq: '10000', wechat: 'wangmi', role: 'owner', balance: '0.00',
    });
    wangmi = await userRepo.save(wangmi);
    console.log('[seed] created owner: wangmi');
  } else {
    wangmi.passwordHash = '$2a$10$MUu7likKwg1CDIsHadE2KOlfNIMpA2B7yugoo0NKoCpzRP/o1rHPS';
    wangmi.role = 'owner';
    wangmi.cn = '汪咪店主';
    await userRepo.save(wangmi);
    console.log('[seed] updated owner: wangmi');
  }
}

bootstrap();
