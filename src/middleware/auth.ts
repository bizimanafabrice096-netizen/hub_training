import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users, type UserRole } from '../db/schema.ts';

export interface AuthenticatedUser {
  id: number;
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

interface JwtPayload {
  userId: number;
  uid: string;
  email: string;
  role: UserRole;
}

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'meridian-academy-jwt-dev-secret-change-in-prod';
}

export function signAppJwt(user: {
  id: number;
  uid: string;
  email: string;
  role: UserRole;
}): string {
  return jwt.sign(
    {
      userId: user.id,
      uid: user.uid,
      email: user.email,
      role: user.role,
    } satisfies JwtPayload,
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

export async function getOrCreateFirebaseUser(params: {
  uid: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  requestedRole?: UserRole;
}) {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.uid, params.uid))
    .limit(1);

  if (existing.length > 0) {
    const updated = await db
      .update(users)
      .set({
        email: params.email,
        name: params.name || existing[0].name,
        avatarUrl: params.avatarUrl ?? existing[0].avatarUrl,
      })
      .where(eq(users.id, existing[0].id))
      .returning();
    return updated[0];
  }

  // Upsert on email if an account with the same email already exists
  const byEmail = await db
    .select()
    .from(users)
    .where(eq(users.email, params.email))
    .limit(1);

  if (byEmail.length > 0) {
    const updated = await db
      .update(users)
      .set({
        uid: params.uid,
        name: params.name || byEmail[0].name,
        avatarUrl: params.avatarUrl ?? byEmail[0].avatarUrl,
      })
      .where(eq(users.id, byEmail[0].id))
      .returning();
    return updated[0];
  }

  const safeRole: UserRole =
    params.requestedRole === 'INSTRUCTOR' ? 'INSTRUCTOR' : 'STUDENT';

  const inserted = await db
    .insert(users)
    .values({
      uid: params.uid,
      email: params.email,
      name: params.name || params.email.split('@')[0],
      role: safeRole,
      avatarUrl: params.avatarUrl ?? null,
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email: params.email,
      },
    })
    .returning();

  return inserted[0];
}

async function resolveBearerToken(token: string): Promise<AuthenticatedUser | null> {
  // 1. Try application JWT first
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    if (decoded && decoded.userId) {
      const [row] = await db
        .select({
          id: users.id,
          uid: users.uid,
          email: users.email,
          name: users.name,
          role: users.role,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, decoded.userId))
        .limit(1);
      if (row) return row;
    }
  } catch {
    // Not an app JWT — fall through to Firebase ID Token verification
  }

  // 2. Verify Firebase ID Token
  try {
    const decodedFirebase = await adminAuth.verifyIdToken(token);
    const dbUser = await getOrCreateFirebaseUser({
      uid: decodedFirebase.uid,
      email: decodedFirebase.email || `${decodedFirebase.uid}@users.meridian.edu`,
      name: decodedFirebase.name || decodedFirebase.email?.split('@')[0] || 'Learner',
      avatarUrl: decodedFirebase.picture ?? null,
    });
    return {
      id: dbUser.id,
      uid: dbUser.uid,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      avatarUrl: dbUser.avatarUrl,
    };
  } catch {
    return null;
  }
}

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) {
      const resolved = await resolveBearerToken(token);
      if (resolved) {
        req.authUser = resolved;
      }
    }
  }
  next();
};

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing bearer token' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const resolved = await resolveBearerToken(token);
  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  req.authUser = resolved;
  next();
};

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      return res.status(403).json({
        error: `Forbidden: Requires one of roles [${allowedRoles.join(', ')}]`,
      });
    }
    next();
  };
};
