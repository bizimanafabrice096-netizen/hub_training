import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const SIGNED_URL_TTL_SECONDS = 15 * 60; // Strict 15-minute expiration
const LOCAL_MEDIA_DIR = path.resolve(process.cwd(), '.media_storage');

function getMediaSecret(): string {
  return (
    process.env.MEDIA_SIGNING_SECRET ||
    process.env.JWT_SECRET ||
    'meridian-academy-media-signing-secret'
  );
}

function hasAwsS3Config(): boolean {
  return Boolean(
    process.env.AWS_S3_BUCKET &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY
  );
}

function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.AWS_REGION || 'eu-west-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
}

export function signLocalMediaToken(params: {
  key: string;
  action: 'upload' | 'read';
  expiresAtUnix: number;
}): string {
  const payload = `${params.action}:${params.key}:${params.expiresAtUnix}`;
  return crypto
    .createHmac('sha256', getMediaSecret())
    .update(payload)
    .digest('hex');
}

export function verifyLocalMediaToken(params: {
  key: string;
  action: 'upload' | 'read';
  expiresAtUnix: number;
  signature: string;
}): boolean {
  if (!Number.isFinite(params.expiresAtUnix)) return false;
  const nowUnix = Math.floor(Date.now() / 1000);
  if (nowUnix > params.expiresAtUnix) return false;

  const expected = signLocalMediaToken({
    key: params.key,
    action: params.action,
    expiresAtUnix: params.expiresAtUnix,
  });

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(params.signature || '', 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export async function createPresignedUploadUrl(params: {
  courseId: number;
  fileName: string;
  contentType: string;
}): Promise<{
  provider: 'aws-s3' | 'signed-local-vault';
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
  expiresAt: string;
}> {
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `courses/${params.courseId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeName}`;
  const expiresAtUnix = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  const expiresAt = new Date(expiresAtUnix * 1000).toISOString();

  if (hasAwsS3Config()) {
    const client = getS3Client();
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      ContentType: params.contentType,
    });
    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });
    return {
      provider: 'aws-s3',
      key,
      uploadUrl,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      expiresAt,
    };
  }

  const signature = signLocalMediaToken({
    key,
    action: 'upload',
    expiresAtUnix,
  });

  return {
    provider: 'signed-local-vault',
    key,
    uploadUrl: `/api/media/upload?key=${encodeURIComponent(key)}&exp=${expiresAtUnix}&sig=${signature}`,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    expiresAt,
  };
}

export async function createPresignedPlaybackUrl(params: {
  key: string;
}): Promise<{
  provider: 'aws-s3' | 'signed-local-vault';
  url: string;
  expiresInSeconds: number;
  expiresAt: string;
}> {
  const expiresAtUnix = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  const expiresAt = new Date(expiresAtUnix * 1000).toISOString();

  if (hasAwsS3Config()) {
    const client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: params.key,
    });
    let url = await getSignedUrl(client, command, {
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });
    if (process.env.CLOUDFRONT_DOMAIN) {
      const parsed = new URL(url);
      parsed.hostname = process.env.CLOUDFRONT_DOMAIN.replace(/^https?:\/\//, '');
      url = parsed.toString();
    }
    return {
      provider: 'aws-s3',
      url,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      expiresAt,
    };
  }

  const signature = signLocalMediaToken({
    key: params.key,
    action: 'read',
    expiresAtUnix,
  });

  return {
    provider: 'signed-local-vault',
    url: `/api/media/stream?key=${encodeURIComponent(params.key)}&exp=${expiresAtUnix}&sig=${signature}`,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    expiresAt,
  };
}

export async function saveLocalMediaBuffer(key: string, data: Buffer): Promise<string> {
  const safeRelative = key.replace(/\.\./g, '');
  const targetPath = path.join(LOCAL_MEDIA_DIR, safeRelative);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, data);
  return targetPath;
}

export async function resolveLocalMediaPath(key: string): Promise<string | null> {
  const safeRelative = key.replace(/\.\./g, '');
  const targetPath = path.join(LOCAL_MEDIA_DIR, safeRelative);
  try {
    await fs.access(targetPath);
    return targetPath;
  } catch {
    return null;
  }
}
