import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.ts';
import {
  certificates,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  modules,
  quizSubmissions,
  users,
} from '../db/schema.ts';
import { ensureSeeded } from '../db/seed.ts';
import {
  type AuthRequest,
  optionalAuth,
  requireAuth,
  requireRole,
} from '../middleware/auth.ts';
import { AppError, asyncHandler } from '../middleware/error.ts';
import {
  gradeQuizSubmission,
  recalculateCourseProgressAndIssueCertificate,
} from '../services/grading.ts';

const router = Router();

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureSeeded();

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category =
      typeof req.query.category === 'string' ? req.query.category.trim() : '';

    const conditions = [eq(courses.published, true)];
    if (category && category !== 'All') {
      conditions.push(eq(courses.category, category));
    }
    if (search) {
      conditions.push(
        or(
          ilike(courses.title, `%${search}%`),
          ilike(courses.subtitle, `%${search}%`),
          ilike(courses.category, `%${search}%`)
        )!
      );
    }

    const courseRows = await db
      .select({
        id: courses.id,
        slug: courses.slug,
        title: courses.title,
        subtitle: courses.subtitle,
        description: courses.description,
        category: courses.category,
        level: courses.level,
        thumbnailUrl: courses.thumbnailUrl,
        durationHours: courses.durationHours,
        instructorId: courses.instructorId,
        instructorName: users.name,
        instructorBio: users.bio,
        createdAt: courses.createdAt,
      })
      .from(courses)
      .innerJoin(users, eq(courses.instructorId, users.id))
      .where(and(...conditions))
      .orderBy(asc(courses.id));

    const courseIds = courseRows.map((c) => c.id);
    const allModules =
      courseIds.length > 0
        ? await db.select().from(modules).where(inArray(modules.courseId, courseIds))
        : [];
    const moduleIds = allModules.map((m) => m.id);
    const allLessons =
      moduleIds.length > 0
        ? await db
            .select({ id: lessons.id, moduleId: lessons.moduleId })
            .from(lessons)
            .where(inArray(lessons.moduleId, moduleIds))
        : [];
    const allEnrollments =
      courseIds.length > 0
        ? await db
            .select({
              courseId: enrollments.courseId,
              userId: enrollments.userId,
              progressPercent: enrollments.progressPercent,
              status: enrollments.status,
            })
            .from(enrollments)
            .where(inArray(enrollments.courseId, courseIds))
        : [];

    const moduleByCourse = new Map<number, number[]>();
    for (const m of allModules) {
      const list = moduleByCourse.get(m.courseId) ?? [];
      list.push(m.id);
      moduleByCourse.set(m.courseId, list);
    }

    const lessonCountByModule = new Map<number, number>();
    for (const l of allLessons) {
      lessonCountByModule.set(l.moduleId, (lessonCountByModule.get(l.moduleId) ?? 0) + 1);
    }

    const enrollmentCountByCourse = new Map<number, number>();
    const userEnrollmentByCourse = new Map<
      number,
      { progressPercent: number; status: string }
    >();

    for (const e of allEnrollments) {
      enrollmentCountByCourse.set(
        e.courseId,
        (enrollmentCountByCourse.get(e.courseId) ?? 0) + 1
      );
      if (req.authUser && e.userId === req.authUser.id) {
        userEnrollmentByCourse.set(e.courseId, {
          progressPercent: e.progressPercent,
          status: e.status,
        });
      }
    }

    const enriched = courseRows.map((course) => {
      const modIds = moduleByCourse.get(course.id) ?? [];
      const lessonCount = modIds.reduce(
        (sum, mId) => sum + (lessonCountByModule.get(mId) ?? 0),
        0
      );
      return {
        ...course,
        moduleCount: modIds.length,
        lessonCount,
        enrolledCount: enrollmentCountByCourse.get(course.id) ?? 0,
        userEnrollment: userEnrollmentByCourse.get(course.id) ?? null,
      };
    });

    res.json({ courses: enriched });
  })
);

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureSeeded();

    const courseId = Number(req.params.id);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      throw new AppError('Invalid course ID.', 400, 'INVALID_COURSE_ID');
    }

    const [course] = await db
      .select({
        id: courses.id,
        slug: courses.slug,
        title: courses.title,
        subtitle: courses.subtitle,
        description: courses.description,
        category: courses.category,
        level: courses.level,
        thumbnailUrl: courses.thumbnailUrl,
        durationHours: courses.durationHours,
        published: courses.published,
        instructorId: courses.instructorId,
        instructorName: users.name,
        instructorBio: users.bio,
      })
      .from(courses)
      .innerJoin(users, eq(courses.instructorId, users.id))
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new AppError('Course not found.', 404, 'COURSE_NOT_FOUND');
    }

    const isOwnerOrAdmin =
      req.authUser &&
      (req.authUser.role === 'ADMIN' || req.authUser.id === course.instructorId);

    const courseModules = await db
      .select()
      .from(modules)
      .where(eq(modules.courseId, courseId))
      .orderBy(asc(modules.orderIndex), asc(modules.id));

    const moduleIds = courseModules.map((m) => m.id);
    const courseLessons =
      moduleIds.length > 0
        ? await db
            .select()
            .from(lessons)
            .where(inArray(lessons.moduleId, moduleIds))
            .orderBy(asc(lessons.orderIndex), asc(lessons.id))
        : [];

    const lessonsByModule = new Map<number, typeof courseLessons>();
    for (const lesson of courseLessons) {
      const sanitizedLesson = isOwnerOrAdmin
        ? lesson
        : {
            ...lesson,
            quizData: lesson.quizData
              ? {
                  passingScore: lesson.quizData.passingScore,
                  questions: lesson.quizData.questions.map((q) => ({
                    id: q.id,
                    prompt: q.prompt,
                    options: q.options,
                    correctIndex: -1,
                    explanation: '',
                  })),
                }
              : null,
          };
      const arr = lessonsByModule.get(lesson.moduleId) ?? [];
      arr.push(sanitizedLesson);
      lessonsByModule.set(lesson.moduleId, arr);
    }

    let enrollment = null;
    let completedLessonIds: number[] = [];
    let submissions: (typeof quizSubmissions.$inferSelect)[] = [];
    let certificate = null;

    if (req.authUser) {
      const [enr] = await db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.userId, req.authUser.id),
            eq(enrollments.courseId, courseId)
          )
        )
        .limit(1);
      enrollment = enr ?? null;

      const progRows = await db
        .select({ lessonId: lessonProgress.lessonId })
        .from(lessonProgress)
        .where(
          and(
            eq(lessonProgress.userId, req.authUser.id),
            eq(lessonProgress.courseId, courseId),
            eq(lessonProgress.completed, true)
          )
        );
      completedLessonIds = progRows.map((r) => r.lessonId);

      submissions = await db
        .select()
        .from(quizSubmissions)
        .where(
          and(
            eq(quizSubmissions.userId, req.authUser.id),
            eq(quizSubmissions.courseId, courseId)
          )
        )
        .orderBy(desc(quizSubmissions.submittedAt));

      const [cert] = await db
        .select()
        .from(certificates)
        .where(
          and(
            eq(certificates.userId, req.authUser.id),
            eq(certificates.courseId, courseId)
          )
        )
        .limit(1);
      certificate = cert ?? null;
    }

    res.json({
      course: {
        ...course,
        modules: courseModules.map((m) => ({
          ...m,
          lessons: lessonsByModule.get(m.id) ?? [],
        })),
      },
      enrollment,
      completedLessonIds,
      submissions,
      certificate,
    });
  })
);

router.post(
  '/',
  requireAuth,
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req: AuthRequest, res) => {
    const {
      title,
      subtitle,
      description,
      category,
      level,
      durationHours,
      thumbnailUrl,
      initialModuleTitle,
      initialLessonTitle,
      initialLessonContent,
    } = req.body ?? {};

    if (!title || !subtitle || !description || !category) {
      throw new AppError(
        'title, subtitle, description, and category are required.',
        400,
        'VALIDATION_ERROR'
      );
    }

    const baseSlug = String(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const [createdCourse] = await db
      .insert(courses)
      .values({
        slug,
        title: String(title).trim(),
        subtitle: String(subtitle).trim(),
        description: String(description).trim(),
        category: String(category).trim(),
        level: typeof level === 'string' && level ? level : 'Intermediate',
        durationHours: Number(durationHours) > 0 ? Number(durationHours) : 8,
        thumbnailUrl:
          typeof thumbnailUrl === 'string' && thumbnailUrl
            ? thumbnailUrl
            : '/src/assets/images/course_product_architecture_1794298063212.jpg',
        published: true,
        instructorId: req.authUser!.id,
      })
      .returning();

    const [createdModule] = await db
      .insert(modules)
      .values({
        courseId: createdCourse.id,
        title:
          typeof initialModuleTitle === 'string' && initialModuleTitle.trim()
            ? initialModuleTitle.trim()
            : 'Module 1: Core Foundations',
        summary: 'Foundational concepts and guided exercises.',
        orderIndex: 1,
      })
      .returning();

    const [createdLesson] = await db
      .insert(lessons)
      .values({
        moduleId: createdModule.id,
        title:
          typeof initialLessonTitle === 'string' && initialLessonTitle.trim()
            ? initialLessonTitle.trim()
            : '1. Course Introduction & Objectives',
        lessonType: 'ARTICLE',
        durationMinutes: 12,
        contentMarkdown:
          typeof initialLessonContent === 'string' && initialLessonContent.trim()
            ? initialLessonContent.trim()
            : `## Welcome to ${createdCourse.title}\n\n${createdCourse.description}`,
        attachments: [],
        quizData: null,
        orderIndex: 1,
      })
      .returning();

    res.status(201).json({
      course: createdCourse,
      module: createdModule,
      lesson: createdLesson,
    });
  })
);

router.post(
  '/:id/modules',
  requireAuth,
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req: AuthRequest, res) => {
    const courseId = Number(req.params.id);
    const { title, summary } = req.body ?? {};
    if (!title) {
      throw new AppError('Module title is required.', 400, 'VALIDATION_ERROR');
    }

    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new AppError('Course not found.', 404, 'COURSE_NOT_FOUND');
    }
    if (req.authUser!.role !== 'ADMIN' && course.instructorId !== req.authUser!.id) {
      throw new AppError('You do not own this course.', 403, 'FORBIDDEN');
    }

    const existingModules = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.courseId, courseId));

    const [createdModule] = await db
      .insert(modules)
      .values({
        courseId,
        title: String(title).trim(),
        summary: typeof summary === 'string' ? summary.trim() : '',
        orderIndex: existingModules.length + 1,
      })
      .returning();

    res.status(201).json({ module: createdModule });
  })
);

router.post(
  '/:id/modules/:moduleId/lessons',
  requireAuth,
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req: AuthRequest, res) => {
    const courseId = Number(req.params.id);
    const moduleId = Number(req.params.moduleId);
    const {
      title,
      lessonType,
      videoKey,
      durationMinutes,
      contentMarkdown,
      attachments,
      quizData,
    } = req.body ?? {};

    if (!title || !contentMarkdown) {
      throw new AppError(
        'Lesson title and contentMarkdown are required.',
        400,
        'VALIDATION_ERROR'
      );
    }

    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new AppError('Course not found.', 404, 'COURSE_NOT_FOUND');
    }
    if (req.authUser!.role !== 'ADMIN' && course.instructorId !== req.authUser!.id) {
      throw new AppError('You do not own this course.', 403, 'FORBIDDEN');
    }

    const existingLessons = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(eq(lessons.moduleId, moduleId));

    const validType =
      lessonType === 'VIDEO' || lessonType === 'QUIZ' ? lessonType : 'ARTICLE';

    const [createdLesson] = await db
      .insert(lessons)
      .values({
        moduleId,
        title: String(title).trim(),
        lessonType: validType,
        videoKey: typeof videoKey === 'string' && videoKey ? videoKey : null,
        durationMinutes: Number(durationMinutes) > 0 ? Number(durationMinutes) : 10,
        contentMarkdown: String(contentMarkdown),
        attachments: Array.isArray(attachments) ? attachments : [],
        quizData: quizData ?? null,
        orderIndex: existingLessons.length + 1,
      })
      .returning();

    res.status(201).json({ lesson: createdLesson });
  })
);

router.post(
  '/:id/enroll',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const courseId = Number(req.params.id);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      throw new AppError('Invalid course ID.', 400, 'INVALID_COURSE_ID');
    }

    const [course] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new AppError('Course not found.', 404, 'COURSE_NOT_FOUND');
    }

    const [enrollment] = await db
      .insert(enrollments)
      .values({
        userId: req.authUser!.id,
        courseId,
        progressPercent: 0,
        status: 'ACTIVE',
      })
      .onConflictDoUpdate({
        target: [enrollments.userId, enrollments.courseId],
        set: { userId: req.authUser!.id },
      })
      .returning();

    res.status(201).json({ enrollment });
  })
);

router.post(
  '/:id/lessons/:lessonId/complete',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const courseId = Number(req.params.id);
    const lessonId = Number(req.params.lessonId);
    const watchedSeconds = Number(req.body?.watchedSeconds ?? 0);

    const [enr] = await db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, req.authUser!.id),
          eq(enrollments.courseId, courseId)
        )
      )
      .limit(1);

    if (!enr) {
      await db.insert(enrollments).values({
        userId: req.authUser!.id,
        courseId,
        progressPercent: 0,
        status: 'ACTIVE',
      });
    }

    await db
      .insert(lessonProgress)
      .values({
        userId: req.authUser!.id,
        courseId,
        lessonId,
        completed: true,
        watchedSeconds: Number.isFinite(watchedSeconds) ? watchedSeconds : 0,
      })
      .onConflictDoUpdate({
        target: [lessonProgress.userId, lessonProgress.lessonId],
        set: {
          completed: true,
          watchedSeconds: Number.isFinite(watchedSeconds) ? watchedSeconds : 0,
          completedAt: new Date(),
        },
      });

    const summary = await recalculateCourseProgressAndIssueCertificate(
      req.authUser!.id,
      courseId
    );

    res.json(summary);
  })
);

router.post(
  '/:id/lessons/:lessonId/quiz',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const courseId = Number(req.params.id);
    const lessonId = Number(req.params.lessonId);
    const answers = req.body?.answers;

    if (!answers || typeof answers !== 'object') {
      throw new AppError('Quiz answers object is required.', 400, 'INVALID_ANSWERS');
    }

    const [enr] = await db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, req.authUser!.id),
          eq(enrollments.courseId, courseId)
        )
      )
      .limit(1);

    if (!enr) {
      await db.insert(enrollments).values({
        userId: req.authUser!.id,
        courseId,
        progressPercent: 0,
        status: 'ACTIVE',
      });
    }

    const result = await gradeQuizSubmission({
      userId: req.authUser!.id,
      courseId,
      lessonId,
      answers,
    });

    res.json(result);
  })
);

export default router;
