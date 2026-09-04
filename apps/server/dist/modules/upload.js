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
exports.UploadController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const path_1 = require("path");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const cloudinary_1 = require("cloudinary");
const common_2 = require("../common");
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
// 初始化 Cloudinary（未配置时退化为本地存储）
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const useCloudinary = cloudName && apiKey && apiSecret;
if (useCloudinary) {
    cloudinary_1.v2.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    console.log('[Cloudinary] configured, uploads will go to cloud.');
}
else {
    console.log('[Cloudinary] not configured (missing env), uploads will use local storage.');
}
let UploadController = class UploadController {
    async uploadImage(req) {
        (0, common_2.checkRole)(req.user, []);
        const file = req.file;
        if (!file)
            throw new common_1.BadRequestException('请上传文件');
        if (file.size > 10 * 1024 * 1024)
            throw new common_1.BadRequestException('文件大小不能超过10MB');
        if (!file.mimetype?.startsWith('image/'))
            throw new common_1.BadRequestException('只支持图片文件');
        if (useCloudinary) {
            try {
                const result = await cloudinary_1.v2.uploader.upload(file.path, {
                    folder: 'wangmi',
                    public_id: file.filename.replace(/\.[^.]+$/, ''),
                });
                // 上传成功后删除本地临时文件
                fs.unlink(file.path, () => { });
                return { url: result.secure_url };
            }
            catch (e) {
                console.error('[Cloudinary] upload failed:', e);
                throw new common_1.BadRequestException('图片上传失败，请重试');
            }
        }
        else {
            // 本地存储模式
            return { url: `/uploads/${file.filename}` };
        }
    }
};
exports.UploadController = UploadController;
__decorate([
    (0, common_1.Post)('image'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: (_req, _file, cb) => {
                if (!fs.existsSync(UPLOAD_DIR))
                    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
                cb(null, UPLOAD_DIR);
            },
            filename: (_req, file, cb) => {
                const ext = (0, path_1.extname)(file.originalname) || '.png';
                cb(null, `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
            },
        }),
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (file.mimetype.startsWith('image/'))
                cb(null, true);
            else
                cb(new common_1.BadRequestException('仅支持图片文件'), false);
        },
    })),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UploadController.prototype, "uploadImage", null);
exports.UploadController = UploadController = __decorate([
    (0, common_1.Controller)('upload')
], UploadController);
