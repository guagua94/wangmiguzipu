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
exports.NotifyModuleRef = exports.NotifyController = exports.NotifyService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../entities");
const common_2 = require("../common");
let NotifyService = class NotifyService {
    constructor(repo) {
        this.repo = repo;
    }
    async push(userId, title, body) {
        await this.repo.save(this.repo.create({ userId, title, body }));
    }
    async list(uid) {
        return this.repo.find({ where: { userId: uid }, order: { id: 'desc' }, take: 50 });
    }
    async readAll(uid) {
        await this.repo.update({ userId: uid }, { read: true });
        return { ok: true };
    }
    async readOne(uid, id) {
        const n = await this.repo.findOneByOrFail({ id });
        if (n.userId !== uid)
            return { error: '无权操作' };
        await this.repo.update(id, { read: true });
        return { ok: true };
    }
    async unreadCount(uid) {
        return this.repo.count({ where: { userId: uid, read: false } });
    }
    async deleteOne(uid, id) {
        const n = await this.repo.findOneByOrFail({ id });
        if (n.userId !== uid)
            return { error: '无权操作' };
        await this.repo.delete(id);
        return { ok: true };
    }
};
exports.NotifyService = NotifyService;
exports.NotifyService = NotifyService = __decorate([
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.Notification)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], NotifyService);
let NotifyController = class NotifyController {
    constructor(svc) {
        this.svc = svc;
    }
    async list(req) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.list(req.user.id);
    }
    async readAll(req) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.readAll(req.user.id);
    }
    async readOne(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.readOne(req.user.id, b.id);
    }
    async deleteOne(req, b) {
        (0, common_2.checkRole)(req.user, []);
        return this.svc.deleteOne(req.user.id, b.id);
    }
    async unreadCount(req) {
        (0, common_2.checkRole)(req.user, []);
        return { count: await this.svc.unreadCount(req.user.id) };
    }
};
exports.NotifyController = NotifyController;
__decorate([
    (0, common_1.Get)('list'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotifyController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('read-all'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotifyController.prototype, "readAll", null);
__decorate([
    (0, common_1.Post)('read-one'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], NotifyController.prototype, "readOne", null);
__decorate([
    (0, common_1.Post)('delete-one'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], NotifyController.prototype, "deleteOne", null);
__decorate([
    (0, common_1.Get)('unread-count'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotifyController.prototype, "unreadCount", null);
exports.NotifyController = NotifyController = __decorate([
    (0, common_1.Controller)('notify'),
    __metadata("design:paramtypes", [NotifyService])
], NotifyController);
exports.NotifyModuleRef = typeorm_1.TypeOrmModule.forFeature([entities_1.Notification]);
