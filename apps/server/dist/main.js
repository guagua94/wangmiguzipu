"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const dns = __importStar(require("dns"));
// Railway 容器不支持 IPv6，强制 DNS 优先返回 IPv4
dns.setDefaultResultOrder('ipv4first');
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const app_module_1 = require("./app.module");
const auction_1 = require("./modules/auction");
const express = __importStar(require("express"));
const path = __importStar(require("path"));
async function bootstrap() {
    if (!process.env.JWT_SECRET) {
        console.error('[FATAL] JWT_SECRET environment variable is required. Set it in Railway dashboard → Variables.');
        process.exit(1);
    }
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { cors: true });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({ transform: true, whitelist: false }));
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!require('fs').existsSync(uploadsDir))
        require('fs').mkdirSync(uploadsDir, { recursive: true });
    app.use('/uploads', express.static(uploadsDir));
    const port = process.env.PORT || 3001;
    await app.listen(port, '0.0.0.0');
    console.log(`[wangmi-server] http://0.0.0.0:${port}/api`);
    const auctionService = app.get(auction_1.AuctionService);
    setTimeout(() => {
        auctionService.tickStates();
        setInterval(() => auctionService.tickStates(), 60_000);
    }, 10_000);
    const ds = app.get(typeorm_1.DataSource);
    try {
        await ds.query(`ALTER TABLE series ADD COLUMN mode TEXT DEFAULT 'traditional'`);
    }
    catch (e) { }
    try {
        await ds.query(`ALTER TABLE series ADD COLUMN deadlineAt TIMESTAMP`);
    }
    catch (e) { }
    try {
        await ds.query(`ALTER TABLE order_items ADD COLUMN status TEXT DEFAULT ''`);
    }
    catch (e) { }
    try {
        await ds.query(`ALTER TABLE goods ADD COLUMN unitFee DECIMAL(10,2) DEFAULT '0.1'`);
    }
    catch (e) { }
    try {
        await ds.query(`ALTER TABLE sale_goods ADD COLUMN unitFee DECIMAL(10,2) DEFAULT '0.1'`);
    }
    catch (e) { }
    try {
        await ds.query(`ALTER TABLE shop_config ADD COLUMN groupFreeDays INTEGER DEFAULT 30`);
    }
    catch (e) { }
    try {
        await ds.query(`ALTER TABLE shop_config ADD COLUMN groupOverFeeOn INTEGER DEFAULT 1`);
    }
    catch (e) { }
    try {
        await ds.query(`ALTER TABLE shop_config ADD COLUMN groupOverDays INTEGER DEFAULT 90`);
    }
    catch (e) { }
    try {
        await ds.query(`ALTER TABLE shop_config ADD COLUMN saleFreeDays INTEGER DEFAULT 7`);
    }
    catch (e) { }
    try {
        await ds.query(`ALTER TABLE shop_config ADD COLUMN saleOverFeeOn INTEGER DEFAULT 1`);
    }
    catch (e) { }
    try {
        await ds.query(`ALTER TABLE shop_config ADD COLUMN saleOverDays INTEGER DEFAULT 30`);
    }
    catch (e) { }
    try {
        await ds.query(`ALTER TABLE auction_deposits ADD COLUMN screenshot TEXT DEFAULT ''`);
    }
    catch (e) { }
    try {
        await ds.query(`ALTER TABLE auction_deposits ADD COLUMN auditNote TEXT DEFAULT ''`);
    }
    catch (e) { }
    try {
        await ds.query(`ALTER TABLE shop_config ADD COLUMN unitFees TEXT DEFAULT '[{"name":"拍立得 / 透卡 / 明信片","fee":0.1,"note":"纸片类小件"},{"name":"吧唧 / 立牌 / 色纸 / 文件夹","fee":0.2,"note":"亚克力/铁皮/纸质中件"},{"name":"手办 / 其他","fee":0.5,"note":"大件/其他"}]'`);
    }
    catch (e) { }
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
