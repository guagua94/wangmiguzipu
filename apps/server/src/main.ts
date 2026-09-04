import 'reflect-metadata';
import * as dns from 'dns';
// Railway 容器可能使用旧版 Node.js，安全调用 IPv4 优先
if (typeof (dns as any).setDefaultResultOrder === 'function') {
  (dns as any).setDefaultResultOrder('ipv4first');
}
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { AuctionService } from './modules/auction';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  // JWT_SECRET: 优先从环境变量读取，未设置时使用硬编码默认值（确保 Railway 能启动）
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'wangmi-secret-key-2024-change-in-production';
    console.warn('[WARN] JWT_SECRET not set, using default. Please set it in Railway dashboard for security.');
  }
  const app = await NestFactory.create<INestApplication>(AppModule, {
    cors: {
      origin: true,
      credentials: true,
      allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      preflightContinue: false,
    }
  });
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
    auctionService.tickStates().catch((e: Error) => console.error('[auction] tickStates error:', e.message));
    setInterval(() => {
      auctionService.tickStates().catch((e: Error) => console.error('[auction] tickStates error:', e.message));
    }, 60_000);
  }, 10_000);
  const ds = app.get(DataSource);

  // === Schema 升级：创建新表和添加新列（如果缺失）===
  // 1. 创建 merged_shipments 表
  try {
    await ds.query(`CREATE TABLE IF NOT EXISTS merged_shipments (
      id SERIAL PRIMARY KEY,
      "mergeGroupId" VARCHAR(32) NOT NULL,
      "ownerId" INT NOT NULL,
      "sourceOrderIds" TEXT,
      freight DECIMAL(10,2) DEFAULT '0.00',
      "packFee" DECIMAL(10,2) DEFAULT '0.00',
      total DECIMAL(10,2) DEFAULT '0.00',
      "addressSnapshot" TEXT DEFAULT '',
      status VARCHAR(32) DEFAULT '待发货',
      "trackingNo" VARCHAR(128) DEFAULT '',
      "packImg" TEXT DEFAULT '',
      "shippedAt" TIMESTAMP,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await ds.query(`CREATE INDEX IF NOT EXISTS idx_merge_owner ON merged_shipments("ownerId")`);
    await ds.query(`CREATE INDEX IF NOT EXISTS idx_merge_group ON merged_shipments("mergeGroupId")`);
    console.log('[schema] merged_shipments 表已就绪');
  } catch(e) { console.log('[schema] merged_shipments 跳过:', (e as Error).message); }
  
  // 2. orders 表添加合单相关列
  const orderCols = [
    { name: 'mergeGroupId', type: 'VARCHAR(32)', default: "''" },
    { name: 'isMerged', type: 'BOOLEAN', default: 'false' },
    { name: 'isSplit', type: 'BOOLEAN', default: 'false' },
    { name: 'parentId', type: 'INT', default: '0' },
    { name: 'orderNo', type: 'VARCHAR(32)', default: "''" },
    { name: 'mergeId', type: 'INT', default: '0' },
  ];
  for (const col of orderCols) {
    try { await ds.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type} DEFAULT ${col.default}`); }
    catch(e) { /* 列已存在 */ }
  }

  // 3. kidney_bills 表添加合单相关列
  const kbCols = [
    { name: 'isMerged', type: 'BOOLEAN', default: 'false' },
    { name: 'mergeId', type: 'INT', default: '0' },
    { name: 'isSplit', type: 'BOOLEAN', default: 'false' },
    { name: 'orderNo', type: 'VARCHAR(32)', default: "''" },
    { name: 'parentId', type: 'INT', default: '0' },
  ];
  for (const col of kbCols) {
    try { await ds.query(`ALTER TABLE kidney_bills ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type} DEFAULT ${col.default}`); }
    catch(e) { /* 列已存在 */ }
  }

  // 4. sale_orders 表添加合单相关列
  const soCols = [
    { name: 'mergeGroupId', type: 'VARCHAR(32)', default: "''" },
    { name: 'isMerged', type: 'BOOLEAN', default: 'false' },
    { name: 'isSplit', type: 'BOOLEAN', default: 'false' },
    { name: 'orderNo', type: 'VARCHAR(32)', default: "''" },
    { name: 'mergeId', type: 'INT', default: '0' },
  ];
  for (const col of soCols) {
    try { await ds.query(`ALTER TABLE sale_orders ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type} DEFAULT ${col.default}`); }
    catch(e) { /* 列已存在 */ }
  }

  // 5. auctions 表添加合单相关列
  const aucCols = [
    { name: 'mergeGroupId', type: 'VARCHAR(32)', default: "''" },
    { name: 'isMerged', type: 'BOOLEAN', default: 'false' },
    { name: 'isSplit', type: 'BOOLEAN', default: 'false' },
    { name: 'parentId', type: 'INT', default: '0' },
    { name: 'mergeId', type: 'INT', default: '0' },
    { name: 'orderNo', type: 'VARCHAR(32)', default: "''" },
  ];
  for (const col of aucCols) {
    try { await ds.query(`ALTER TABLE auctions ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type} DEFAULT ${col.default}`); }
    catch(e) { /* 列已存在 */ }
  }

  console.log('[schema] 数据库结构升级完成');

  // === 旧数据兼容：确保 shop_config 表有基础数据 ===
  try { await ds.query(`ALTER TABLE series ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'traditional'`); } catch(e) {}
  try { await ds.query(`ALTER TABLE series ADD COLUMN IF NOT EXISTS "deadlineAt" TIMESTAMP`); } catch(e) {}
  try { await ds.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''`); } catch(e) {}
  try { await ds.query(`ALTER TABLE goods ADD COLUMN IF NOT EXISTS "unitFee" DECIMAL(10,2) DEFAULT '0.1'`); } catch(e) {}
  try { await ds.query(`ALTER TABLE sale_goods ADD COLUMN IF NOT EXISTS "unitFee" DECIMAL(10,2) DEFAULT '0.1'`); } catch(e) {}
  try { await ds.query(`ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS "groupFreeDays" INTEGER DEFAULT 30`); } catch(e) {}
  try { await ds.query(`ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS "groupOverFeeOn" INTEGER DEFAULT 1`); } catch(e) {}
  try { await ds.query(`ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS "groupOverDays" INTEGER DEFAULT 90`); } catch(e) {}
  try { await ds.query(`ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS "saleFreeDays" INTEGER DEFAULT 7`); } catch(e) {}
  try { await ds.query(`ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS "saleOverFeeOn" INTEGER DEFAULT 1`); } catch(e) {}
  try { await ds.query(`ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS "saleOverDays" INTEGER DEFAULT 30`); } catch(e) {}
  try { await ds.query(`ALTER TABLE auction_deposits ADD COLUMN IF NOT EXISTS screenshot TEXT DEFAULT ''`); } catch(e) {}
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
  }
}

bootstrap();
