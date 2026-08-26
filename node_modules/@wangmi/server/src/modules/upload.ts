import { Controller, Post, Req, BadRequestException, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { JwtUser, checkRole } from '../common';

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

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
    if (!file) throw new BadRequestException('未收到文件');
    return { url: `/uploads/${file.filename}` };
  }
}
