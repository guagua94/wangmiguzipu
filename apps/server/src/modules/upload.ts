import { Controller, Post, Req, BadRequestException, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { JwtUser, checkRole } from '../common';

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// 初始化 Cloudinary（未配置时退化为本地存储）
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const useCloudinary = cloudName && apiKey && apiSecret;
if (useCloudinary) {
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  console.log('[Cloudinary] configured, uploads will go to cloud.');
} else {
  console.log('[Cloudinary] not configured (missing env), uploads will use local storage.');
}

@Controller('upload')
export class UploadController {
  @Post('image')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        cb(null, UPLOAD_DIR);
      },
      filename: (_req, file, cb) => {
        const ext = extname(file.originalname) || '.png';
        cb(null, `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new BadRequestException('仅支持图片文件') as any, false);
    },
  }))
  async uploadImage(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, []);
    const file = (req as any).file;
    if (!file) throw new BadRequestException('请上传文件');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('文件大小不能超过10MB');
    if (!file.mimetype?.startsWith('image/')) throw new BadRequestException('只支持图片文件');

    if (useCloudinary) {
      try {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'wangmi',
          public_id: file.filename.replace(/\.[^.]+$/, ''),
        });
        // 上传成功后删除本地临时文件
        fs.unlink(file.path, () => {});
        return { url: result.secure_url };
      } catch (e) {
        console.error('[Cloudinary] upload failed:', e);
        throw new BadRequestException('图片上传失败，请重试');
      }
    } else {
      // 本地存储模式
      return { url: `/uploads/${file.filename}` };
    }
  }
}
