"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopModuleRef = exports.ShopController = exports.ShopService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../entities");
const common_2 = require("../common");
let ShopService = class ShopService {
    constructor(repo) {
        this.repo = repo;
    }
    async get() {
        let c = await this.repo.findOneBy({ id: 1 });
        if (!c)
            c = await this.repo.save(this.repo.create({}));
        return c;
    }
    async save(patch) {
        const c = await this.get();
        Object.assign(c, patch);
        await this.repo.save(c);
        return c;
    }
};
exports.ShopService = ShopService;
exports.ShopService = ShopService = __decorate([
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.ShopConfig)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], ShopService);
let ShopController = class ShopController {
    constructor(svc) {
        this.svc = svc;
    }
    async get() { return this.svc.get(); }
    async save(req, b) {
        (0, common_2.checkRole)(req.user, ['owner']);
        return this.svc.save(b);
    }
};
exports.ShopController = ShopController;
__decorate([
    (0, common_1.Get)('config'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "get", null);
__decorate([
    (0, common_1.Post)('config'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "save", null);
exports.ShopController = ShopController = __decorate([
    (0, common_1.Controller)('shop'),
    __metadata("design:paramtypes", [ShopService])
], ShopController);
exports.ShopModuleRef = typeorm_1.TypeOrmModule.forFeature([entities_1.ShopConfig]);
