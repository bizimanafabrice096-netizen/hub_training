import { desc, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.ts';
import {
  certificates,
  courses,
  enrollments,
  lessons,
  modules,
  quizSubmissions,
  users,
} from '../db/schema.ts';
import {
  type AuthRequest,
  requireAuth,
  requireRole,
} from '../middleware/auth.ts';
import { AppError, asyncHandler } from '../middleware/error.ts';

const router = Router();

router.get(
  '/instructor/analytics',
  requireAuth,
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req: AuthRequest, res) => {
    const instructorCourses =
      req.authUser!.role === 'ADMIN'
        ? await db.select().from(courses)
        : await db
            .select()
            .from(courses)
            .where(eq(courses.instructorId, req.authUser!.id));

    const courseIds = instructorCourses.map((c) => c.id);
    if (courseIds.length === 0) {
      return res.json({
        summary: {
          totalCourses: 0,
          totalEnrollments: 0,
          averageCompletionRate: 0,
          certificatesIssued: 0,
          averageQuizScore: 0,
        },
        courses: [],
        recentSubmissions: [],
      });
    }

    const allEnrollments = await db
      .select()
      .from(enrollments)
      .where(inArray(enrollments.courseId, courseIds));

    const allCertificates = await db
      .select()
      .from(certificates)
      .where(inArray(certificates.courseId, courseIds));

    const allModules = await db
      .select()
      .from(modules)
      .where(inArray(modules.courseId, courseIds));

    const moduleIds = allModules.map((m) => m.id);
    const allLessons =
      moduleIds.length > 0
        ? await db.select().from(lessons).where(inArray(lessons.moduleId, moduleIds))
        : [];

    const recentSubmissions = await db
      .select({
        id: quizSubmissions.id,
        courseId: quizSubmissions.courseId,
        lessonId: quizSubmissions.lessonId,
        scorePercent: quizSubmissions.scorePercent,
        passed: quizSubmissions.passed,
        submittedAt: quizSubmissions.submittedAt,
        studentName: users.name,
        studentEmail: users.email,
        lessonTitle: lessons.title,
        courseTitle: courses.title,
      })
      .from(quizSubmissions)
      .innerJoin(users, eq(quizSubmissions.userId, users.id))
      .innerJoin(lessons, eq(quizSubmissions.lessonId, lessons.id))
      .innerJoin(courses, eq(quizSubmissions.courseId, courses.id))
      .where(inArray(quizSubmissions.courseId, courseIds))
      .orderBy(desc(quizSubmissions.submittedAt))
      .limit(25);

    const totalEnrollments = allEnrollments.length;
    const completedEnrollments = allEnrollments.filter(
      (e) => e.status === 'COMPLETED' || e.progressPercent === 100
    ).length;
    const averageCompletionRate =
      totalEnrollments > 0
        ? Math.round(
            allEnrollments.reduce((sum, e) => sum + e.progressPercent, 0) /
              totalEnrollments
          )
        : 0;

    const averageQuizScore =
      recentSubmissions.length > 0
        ? Math.round(
            recentSubmissions.reduce((sum, s) => sum + s.scorePercent, 0) /
              recentSubmissions.length
          )
        : 0;

    const courseBreakdown = instructorCourses.map((course) => {
      const cEnrollments = allEnrollments.filter((e) => e.courseId === course.id);
      const cModules = allModules.filter((m) => m.courseId === course.id);
      const cModuleIds = new Set(cModules.map((m) => m.id));
      const cLessons = allLessons.filter((l) => cModuleIds.has(l.moduleId));
      const cCerts = allCertificates.filter((c) => c.courseId === course.id);
      const avgProgress =
        cEnrollments.length > 0
          ? Math.round(
              cEnrollments.reduce((sum, e) => sum + e.progressPercent, 0) /
                cEnrollments.length
            )
          : 0;

      return {
        id: course.id,
        title: course.title,
        category: course.category,
        level: course.level,
        moduleCount: cModules.length,
        lessonCount: cLessons.length,
        enrolledCount: cEnrollments.length,
        completedCount: cEnrollments.filter((e) => e.progressPercent === 100).length,
        averageProgressPercent: avgProgress,
        certificatesIssued: cCerts.length,
        modules: cModules.map((m) => ({
          id: m.id,
          title: m.title,
          lessons: cLessons
            .filter((l) => l.moduleId === m.id)
            .map((l) => ({
              id: l.id,
              title: l.title,
              lessonType: l.lessonType,
              durationMinutes: l.durationMinutes,
            })),
        })),
      };
    });

    res.json({
      summary: {
        totalCourses: instructorCourses.length,
        totalEnrollments,
        completedEnrollments,
        averageCompletionRate,
        certificatesIssued: allCertificates.length,
        averageQuizScore,
      },
      courses: courseBreakdown,
      recentSubmissions,
    });
  })
);

router.get(
  '/certificates/verify/:hash',
  asyncHandler(async (req, res) => {
    const hash = String(req.params.hash ?? '').trim();
    if (!hash) {
      throw new AppError('Verification hash is required.', 400, 'MISSING_HASH');
    }

    const [cert] = await db
      .select({
        id: certificates.id,
        verificationHash: certificates.verificationHash,
        recipientName: certificates.recipientName,
        courseTitle: certificates.courseTitle,
        finalScore: certificates.finalScore,
        issuedAt: certificates.issuedAt,
        courseCategory: courses.category,
        instructorName: users.name,
      })
      .from(certificates)
      .innerJoin(courses, eq(certificates.courseId, courses.id))
      .innerJoin(users, eq(courses.instructorId, users.id))
      .where(eq(certificates.verificationHash, hash))
      .limit(1);

    if (!cert) {
      return res.status(404).json({
        valid: false,
        error: 'No verified Meridian Academy certificate matches this hash.',
      });
    }

    res.json({
      valid: true,
      certificate: cert,
    });
  })
);

export default router;
