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
exports.AddressModuleRef = exports.AddressController = exports.AddressService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../entities");
const common_2 = require("../common");
let AddressService = class AddressService {
    constructor(repo) {
        this.repo = repo;
    }
    /** 列出我的地址（默认地址排最前） */
    async list(uid) {
        const list = await this.repo.find({ where: { userId: uid }, order: { isDefault: 'desc', id: 'desc' } });
        return list;
    }
    /** 新增地址 */
    async create(uid, b) {
        if (!b.recipientName?.trim())
            throw new common_1.BadRequestException('请填写收件人姓名');
        if (!b.phone?.trim())
            throw new common_1.BadRequestException('请填写手机号');
        if (!/^1\d{10}$/.test(b.phone.trim()))
            throw new common_1.BadRequestException('手机号格式不正确');
        if (!b.region?.trim())
            throw new common_1.BadRequestException('请填写省市区');
        if (!b.detail?.trim())
            throw new common_1.BadRequestException('请填写详细地址');
        // 如果设为默认，先取消其他默认
        if (b.isDefault)
            await this.repo.update({ userId: uid }, { isDefault: false });
        const isFirst = await this.repo.count({ where: { userId: uid } }) === 0;
        const addr = this.repo.create({
            userId: uid,
            recipientName: b.recipientName.trim(),
            phone: b.phone.trim(),
            region: b.region.trim(),
            detail: b.detail.trim(),
            isDefault: b.isDefault || isFirst, // 第一个地址自动设为默认
        });
        return this.repo.save(addr);
    }
    /** 编辑地址 */
    async update(uid, id, b) {
        const addr = await this.repo.findOneByOrFail({ id, userId: uid });
        if (!b.recipientName?.trim())
            throw new common_1.BadRequestException('请填写收件人姓名');
        if (!b.phone?.trim())
            throw new common_1.BadRequestException('请填写手机号');
        if (!/^1\d{10}$/.test(b.phone.trim()))
            throw new common_1.BadRequestException('手机号格式不正确');
        if (!b.region?.trim())
            throw new common_1.BadRequestException('请填写省市区');
        if (!b.detail?.trim())
            throw new common_1.BadRequestException('请填写详细地址');
        if (b.isDefault && !addr.isDefault) {
            await this.repo.update({ userId: uid }, { isDefault: false });
        }
        addr.recipientName = b.recipientName.trim();
        addr.phone = b.phone.trim();
        addr.region = b.region.trim();
        addr.detail = b.detail.trim();
        addr.isDefault = b.isDefault || false;
        return this.repo.save(addr);
    }
    /** 删除地址 */
    async remove(uid, id) {
        const addr = await this.repo.findOneByOrFail({ id, userId: uid });
        await this.repo.remove(addr);
        // 如果删的是默认地址，把剩余的第一条设为默认
        if (addr.isDefault) {
            const rest = await this.repo.find({ where: { userId: uid }, order: { id: 'desc' }, take: 1 });
            if (rest.length)
                await this.repo.update(rest[0].id, { isDefault: true });
        }
        return { ok: true };
    }
    /** 设为默认 */
    async setDefault(uid, id) {
        const addr = await this.repo.findOneByOrFail({ id, userId: uid });
        await this.repo.update({ userId: uid }, { isDefault: false });
        addr.isDefault = true;
        return this.repo.save(addr);
    }
    /** 获取默认地址 */
    async getDefault(uid) {
        return this.repo.findOne({ where: { userId: uid, isDefault: true } });
    }
    /** 团长查看某团员的地址列表 */
    async listByUser(uid) {
        return this.repo.find({ where: { userId: uid }, order: { isDefault: 'desc', id: 'desc' } });
    }
};
exports.AddressService = AddressService;
exports.AddressService = AddressService = __decorate([
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.Address)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AddressService);
let AddressController = class AddressController {
    constructor(svc) {
        this.svc = svc;
    }
    /** 列出我的地址 */
    async list(req) {
        return this.svc.list(req.user.id);
    }
    /** 新增 */
    async create(req, b) {
        return this.svc.create(req.user.id, b);
    }
    /** 编辑 */
    async update(req, b) {
        return this.svc.update(req.user.id, b.id, b);
    }
    /** 删除 */
    async remove(req, b) {
        return this.svc.remove(req.user.id, b.id);
    }
    /** 设为默认 */
    async setDefault(req, b) {
        return this.svc.setDefault(req.user.id, b.id);
    }
    /** 团长查看某团员的地址 */
    async listByUser(req, uid) {
        (0, common_2.checkRole)(req.user, ['owner', 'admin']);
        return this.svc.listByUser(+uid);
    }
};
exports.AddressController = AddressController;
__decorate([
    (0, common_1.Get)('list'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AddressController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('create'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AddressController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('update'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AddressController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('delete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AddressController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('default'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AddressController.prototype, "setDefault", null);
__decorate([
    (0, common_1.Get)('user/:uid'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('uid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AddressController.prototype, "listByUser", null);
exports.AddressController = AddressController = __decorate([
    (0, common_1.Controller)('address'),
    __metadata("design:paramtypes", [AddressService])
], AddressController);
exports.AddressModuleRef = typeorm_1.TypeOrmModule.forFeature([entities_1.Address]);
