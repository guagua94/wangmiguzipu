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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModuleRef = exports.AuthController = exports.AuthService = exports.LoginDto = exports.RegisterDto = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const jwt_1 = require("@nestjs/jwt");
const class_validator_1 = require("class-validator");
const bcrypt = __importStar(require("bcryptjs"));
const entities_1 = require("../entities");
const common_2 = require("../common");
class RegisterDto {
}
exports.RegisterDto = RegisterDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    __metadata("design:type", String)
], RegisterDto.prototype, "account", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(6),
    __metadata("design:type", String)
], RegisterDto.prototype, "password", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MinLength)(1),
    __metadata("design:type", String)
], RegisterDto.prototype, "cn", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterDto.prototype, "qq", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterDto.prototype, "wechat", void 0);
class LoginDto {
}
exports.LoginDto = LoginDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LoginDto.prototype, "account", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LoginDto.prototype, "password", void 0);
let AuthService = class AuthService {
    constructor(userRepo, jwt) {
        this.userRepo = userRepo;
        this.jwt = jwt;
    }
    sign(u) {
        return this.jwt.sign({ id: u.id, cn: u.cn, role: u.role, banned: u.banned });
    }
    async register(dto, ip, device) {
        if (await this.userRepo.findOne({ where: { account: dto.account } })) {
            return { error: '账号已存在' };
        }
        if (await this.userRepo.findOne({ where: { cn: dto.cn } })) {
            return { error: 'CN 已被占用（全站唯一）' };
        }
        const u = await this.userRepo.save(this.userRepo.create({
            account: dto.account,
            passwordHash: await bcrypt.hash(dto.password, 10),
            cn: dto.cn, qq: dto.qq || '', wechat: dto.wechat || '',
            role: 'member', registerIp: ip, registerDevice: device,
        }));
        // 风控：同 IP 短时多次注册 -> 提醒店主
        const oneDayAgo = new Date(Date.now() - 86400000);
        const recent = await this.userRepo.createQueryBuilder('u')
            .where('u.registerIp = :ip AND u.createdAt > :oneDayAgo', { ip, oneDayAgo }).getCount();
        if (recent >= 3) {
            const owner = await this.userRepo.findOne({ where: { role: 'owner' } });
            if (owner)
                await this.userRepo.manager.getRepository(entities_1.Notification).save(this.userRepo.manager.getRepository(entities_1.Notification).create({
                    userId: owner.id, title: '风控提醒',
                    body: `IP ${ip} 一日内注册 ${recent} 个账号，请核对是否与拉黑记录重合`,
                }));
        }
        return { token: this.sign(u), user: this.safe(u) };
    }
    async login(dto) {
        const u = await this.userRepo.findOne({ where: { account: dto.account } });
        if (!u || !(await bcrypt.compare(dto.password, u.passwordHash))) {
            return { error: '账号或密码错误' };
        }
        return { token: this.sign(u), user: this.safe(u) };
    }
    async me(uid) {
        const u = await this.userRepo.findOneByOrFail({ id: uid });
        return this.safe(u);
    }
    safe(u) {
        const { passwordHash, registerIp, registerDevice, ...rest } = u;
        return rest;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        jwt_1.JwtService])
], AuthService);
let AuthController = class AuthController {
    constructor(svc) {
        this.svc = svc;
    }
    register(dto, req) {
        return this.svc.register(dto, req.ip || '', req.headers['user-agent']?.slice(0, 120) || '');
    }
    login(dto) { return this.svc.login(dto); }
    async me(req) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.me(req.user.id);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [RegisterDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [LoginDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [AuthService])
], AuthController);
exports.AuthModuleRef = typeorm_1.TypeOrmModule.forFeature([entities_1.User]);
