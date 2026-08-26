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
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const app_module_1 = require("./app.module");
const express = __importStar(require("express"));
const path = __importStar(require("path"));
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { cors: true });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({ transform: true, whitelist: false }));
    // 静态文件服务：/uploads/xxx.png
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!require('fs').existsSync(uploadsDir))
        require('fs').mkdirSync(uploadsDir, { recursive: true });
    app.use('/uploads', express.static(uploadsDir));
    await app.listen(3001);
    console.log('[wangmi-server] http://localhost:3001/api');
    // 数据库迁移：兼容旧数据
    const ds = app.get(typeorm_1.DataSource);
    try {
        await ds.query(`ALTER TABLE series ADD COLUMN mode TEXT DEFAULT 'traditional'`);
    }
    catch (e) { }
    try {
        await ds.query(`ALTER TABLE series ADD COLUMN deadlineAt DATETIME`);
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
}
bootstrap();
