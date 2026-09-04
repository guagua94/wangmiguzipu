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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = exports.AutoJietuanTask = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const jwt_1 = require("@nestjs/jwt");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const entities_1 = require("./entities");
// 按文件聚合的模块
const auth_1 = require("./modules/auth");
const user_1 = require("./modules/user");
const shop_1 = require("./modules/shop");
const group_1 = require("./modules/group");
const balance_1 = require("./modules/balance");
const sale_1 = require("./modules/sale");
const auction_1 = require("./modules/auction");
const transfer_1 = require("./modules/transfer");
const clearing_1 = require("./modules/clearing");
const aftersale_1 = require("./modules/aftersale");
const notify_1 = require("./modules/notify");
const second_1 = require("./modules/second");
const address_1 = require("./modules/address");
const upload_1 = require("./modules/upload");
const isPostgres = !!process.env.DATABASE_URL;
const dbFile = path.join(__dirname, '..', 'wangmi.db');
if (!isPostgres && !fs.existsSync(dbFile))
    fs.writeFileSync(dbFile, '');
const dbConfig = isPostgres
    ? {
        type: 'postgres',
        url: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
        entities: entities_1.entities,
        synchronize: false, // 生产环境禁用自动同步，表结构变更请用 migration
    }
    : {
        type: 'sqljs',
        location: dbFile,
        autoSave: true,
        entities: entities_1.entities,
        synchronize: true, // 本地开发保留自动同步
    };
let AutoJietuanTask = class AutoJietuanTask {
    constructor(ds, group) {
        this.ds = ds;
        this.group = group;
    }
    start() {
        setInterval(async () => {
            try {
                const seriesRepo = this.ds.getRepository(entities_1.Series);
                const now = new Date();
                const due = await seriesRepo.find({
                    where: { status: '进行中', deadlineAt: (0, typeorm_2.LessThanOrEqual)(now) },
                });
                for (const s of due) {
                    try {
                        await this.group.jietuan(s.id, 1);
                        console.log(`[auto-jietuan] 系列 #${s.id} "${s.name}" 已自动截团`);
                    }
                    catch (e) {
                        console.error(`[auto-jietuan] 系列 #${s.id} 截团失败:`, e.message);
                    }
                }
            }
            catch (e) { /* 静默失败，不影响服务 */ }
        }, 60_000); // 每 60 秒检查一次
        console.log('[auto-jietuan] 自动截团定时任务已启动（每60秒）');
    }
};
exports.AutoJietuanTask = AutoJietuanTask;
exports.AutoJietuanTask = AutoJietuanTask = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_2.DataSource, group_1.GroupService])
], AutoJietuanTask);
let AppModule = class AppModule {
    constructor(ds, jwt, autoJietuan) {
        this.ds = ds;
        this.jwt = jwt;
        this.autoJietuan = autoJietuan;
    }
    /** 全局 JWT 解析中间件：有 token 则注入 req.user（路由内再按需校验） */
    configure(consumer) {
        consumer.apply((req, res, next) => {
            const auth = req.headers.authorization;
            if (auth?.startsWith('Bearer ')) {
                try {
                    req.user = this.jwt.verify(auth.slice(7));
                }
                catch { /* token 无效视为未登录 */ }
            }
            next();
        }).forRoutes({ path: '*', method: common_1.RequestMethod.ALL });
    }
    async onModuleInit() {
        // 启动自动截团定时任务
        this.autoJietuan.start();
        const cfgRepo = this.ds.getRepository('ShopConfig');
        if (!await cfgRepo.count())
            await cfgRepo.save(cfgRepo.create({}));
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
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            jwt_1.JwtModule.register({ secret: process.env.JWT_SECRET }),
            typeorm_1.TypeOrmModule.forRoot(dbConfig),
            typeorm_1.TypeOrmModule.forFeature(entities_1.entities),
            address_1.AddressModuleRef,
        ],
        controllers: [
            auth_1.AuthController, user_1.UserController, shop_1.ShopController, group_1.GroupController,
            balance_1.BalanceController, sale_1.SaleController, auction_1.AuctionController, transfer_1.TransferController,
            clearing_1.ClearingController, aftersale_1.AfterSaleController, notify_1.NotifyController, second_1.SecondController,
            address_1.AddressController, upload_1.UploadController,
        ],
        providers: [
            auth_1.AuthService, user_1.UserService, shop_1.ShopService, group_1.GroupService, balance_1.BalanceService,
            sale_1.SaleService, auction_1.AuctionService, transfer_1.TransferService, clearing_1.ClearingService,
            aftersale_1.AfterSaleService, notify_1.NotifyService, second_1.SecondService, address_1.AddressService,
            AutoJietuanTask,
        ],
    }),
    __metadata("design:paramtypes", [typeorm_2.DataSource, jwt_1.JwtService, AutoJietuanTask])
], AppModule);
