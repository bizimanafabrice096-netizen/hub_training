import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.ts';
import { certificates, enrollments, users, type UserRole } from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import {
  type AuthRequest,
  getOrCreateFirebaseUser,
  requireAuth,
  signAppJwt,
} from '../middleware/auth.ts';
import { AppError, asyncHandler } from '../middleware/error.ts';

const router = Router();

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, name, role } = req.body ?? {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new AppError('A valid email address is required.', 400, 'INVALID_EMAIL');
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      throw new AppError('Password must be at least 8 characters.', 400, 'WEAK_PASSWORD');
    }
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      throw new AppError('Full name is required.', 400, 'INVALID_NAME');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError('An account with this email already exists.', 409, 'EMAIL_EXISTS');
    }

    const assignedRole: UserRole = role === 'INSTRUCTOR' ? 'INSTRUCTOR' : 'STUDENT';
    const passwordHash = await bcrypt.hash(password, 10);
    const uid = `local-${crypto.randomUUID()}`;

    const [created] = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        name: name.trim(),
        passwordHash,
        role: assignedRole,
      })
      .returning({
        id: users.id,
        uid: users.uid,
        email: users.email,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
      });

    const token = signAppJwt(created);
    res.status(201).json({ token, user: created });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      throw new AppError('Email and password are required.', 400, 'MISSING_CREDENTIALS');
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!userRow || !userRow.passwordHash) {
      throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(String(password), userRow.passwordHash);
    if (!valid) {
      throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    const user = {
      id: userRow.id,
      uid: userRow.uid,
      email: userRow.email,
      name: userRow.name,
      role: userRow.role,
      avatarUrl: userRow.avatarUrl,
    };

    const token = signAppJwt(user);
    res.json({ token, user });
  })
);

router.post(
  '/firebase',
  asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    const bodyToken = req.body?.idToken;
    const rawToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : bodyToken;

    if (!rawToken || typeof rawToken !== 'string') {
      throw new AppError('Firebase ID token is required.', 400, 'MISSING_TOKEN');
    }

    const decoded = await adminAuth.verifyIdToken(rawToken);
    const dbUser = await getOrCreateFirebaseUser({
      uid: decoded.uid,
      email: decoded.email || `${decoded.uid}@users.meridian.edu`,
      name: decoded.name || decoded.email?.split('@')[0] || 'Learner',
      avatarUrl: decoded.picture ?? null,
      requestedRole: req.body?.role === 'INSTRUCTOR' ? 'INSTRUCTOR' : 'STUDENT',
    });

    res.json({
      user: {
        id: dbUser.id,
        uid: dbUser.uid,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        avatarUrl: dbUser.avatarUrl,
      },
    });
  })
);

router.get(
  '/session',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.authUser!.id;
    const userEnrollments = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.userId, userId));

    const userCertificates = await db
      .select()
      .from(certificates)
      .where(eq(certificates.userId, userId));

    res.json({
      user: req.authUser,
      enrollments: userEnrollments,
      certificates: userCertificates,
    });
  })
);

router.patch(
  '/role',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const requested = req.body?.role;
    if (requested !== 'STUDENT' && requested !== 'INSTRUCTOR') {
      throw new AppError('Role must be STUDENT or INSTRUCTOR.', 400, 'INVALID_ROLE');
    }

    const [updated] = await db
      .update(users)
      .set({ role: requested })
      .where(eq(users.id, req.authUser!.id))
      .returning({
        id: users.id,
        uid: users.uid,
        email: users.email,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
      });

    const token = signAppJwt(updated);
    res.json({ user: updated, token });
  })
);

export default router;
