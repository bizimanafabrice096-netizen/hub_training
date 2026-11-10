import fs from 'node:fs';
import express, { Router } from 'express';
import {
  type AuthRequest,
  requireAuth,
  requireRole,
} from '../middleware/auth.ts';
import { AppError, asyncHandler } from '../middleware/error.ts';
import {
  createPresignedPlaybackUrl,
  createPresignedUploadUrl,
  resolveLocalMediaPath,
  saveLocalMediaBuffer,
  verifyLocalMediaToken,
} from '../services/media.ts';

const router = Router();

router.post(
  '/presign-upload',
  requireAuth,
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { courseId, fileName, contentType } = req.body ?? {};
    if (!courseId || !fileName || !contentType) {
      throw new AppError(
        'courseId, fileName, and contentType are required.',
        400,
        'VALIDATION_ERROR'
      );
    }

    const presigned = await createPresignedUploadUrl({
      courseId: Number(courseId),
      fileName: String(fileName),
      contentType: String(contentType),
    });

    res.json(presigned);
  })
);

router.put(
  '/upload',
  express.raw({ type: '*/*', limit: '100mb' }),
  asyncHandler(async (req, res) => {
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    const exp = Number(req.query.exp);
    const sig = typeof req.query.sig === 'string' ? req.query.sig : '';

    const valid = verifyLocalMediaToken({
      key,
      action: 'upload',
      expiresAtUnix: exp,
      signature: sig,
    });

    if (!valid) {
      throw new AppError(
        'Upload URL signature is invalid or has expired (15-minute limit).',
        403,
        'INVALID_SIGNED_URL'
      );
    }

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? '');
    if (buffer.length === 0) {
      throw new AppError('Empty media payload.', 400, 'EMPTY_PAYLOAD');
    }

    await saveLocalMediaBuffer(key, buffer);
    res.status(200).json({ uploaded: true, key, bytes: buffer.length });
  })
);

router.get(
  '/presign-playback',
  requireAuth,
  asyncHandler(async (req, res) => {
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    if (!key) {
      throw new AppError('Media key is required.', 400, 'MISSING_KEY');
    }

    const playback = await createPresignedPlaybackUrl({ key });
    res.json(playback);
  })
);

router.get(
  '/stream',
  asyncHandler(async (req, res) => {
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    const exp = Number(req.query.exp);
    const sig = typeof req.query.sig === 'string' ? req.query.sig : '';

    const valid = verifyLocalMediaToken({
      key,
      action: 'read',
      expiresAtUnix: exp,
      signature: sig,
    });

    if (!valid) {
      throw new AppError(
        'Media access token is invalid or expired (15-minute TTL).',
        403,
        'EXPIRED_MEDIA_TOKEN'
      );
    }

    const filePath = await resolveLocalMediaPath(key);
    if (!filePath) {
      throw new AppError('Media object not uploaded yet.', 404, 'MEDIA_NOT_FOUND');
    }

    const stat = fs.statSync(filePath);
    const total = stat.size;
    const range = req.headers.range;
    const contentType = key.endsWith('.webm')
      ? 'video/webm'
      : key.endsWith('.pdf')
        ? 'application/pdf'
        : 'video/mp4';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type': contentType,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  })
);

export default router;
