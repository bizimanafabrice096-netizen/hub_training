import crypto from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
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
  type QuizQuestionFeedback,
} from '../db/schema.ts';

function getCertificateSecret(): string {
  return (
    process.env.CERTIFICATE_HMAC_SECRET ||
    process.env.JWT_SECRET ||
    'meridian-academy-certificate-hmac-dev-key'
  );
}

export function generateCertificateHash(params: {
  userId: number;
  courseId: number;
  recipientName: string;
  courseTitle: string;
  issuedAtIso: string;
}): string {
  const payload = `${params.userId}:${params.courseId}:${params.recipientName}:${params.courseTitle}:${params.issuedAtIso}:${crypto.randomBytes(16).toString('hex')}`;
  const digest = crypto
    .createHmac('sha256', getCertificateSecret())
    .update(payload)
    .digest('hex');
  return `MA-${digest.slice(0, 8).toUpperCase()}-${digest.slice(8, 24).toUpperCase()}`;
}

export async function recalculateCourseProgressAndIssueCertificate(
  userId: number,
  courseId: number
): Promise<{
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  certificate: typeof certificates.$inferSelect | null;
}> {
  const courseModules = await db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, courseId));

  const moduleIds = courseModules.map((m) => m.id);
  if (moduleIds.length === 0) {
    return { progressPercent: 0, completedLessons: 0, totalLessons: 0, certificate: null };
  }

  const allLessons = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(inArray(lessons.moduleId, moduleIds));

  const totalLessons = allLessons.length;
  if (totalLessons === 0) {
    return { progressPercent: 0, completedLessons: 0, totalLessons: 0, certificate: null };
  }

  const completedRows = await db
    .select({ lessonId: lessonProgress.lessonId })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.courseId, courseId),
        eq(lessonProgress.completed, true)
      )
    );

  const completedSet = new Set(completedRows.map((r) => r.lessonId));
  const completedLessons = allLessons.filter((l) => completedSet.has(l.id)).length;
  const progressPercent = Math.min(100, Math.round((completedLessons / totalLessons) * 100));
  const isCompleted = progressPercent === 100;

  await db
    .update(enrollments)
    .set({
      progressPercent,
      status: isCompleted ? 'COMPLETED' : 'ACTIVE',
      completedAt: isCompleted ? new Date() : null,
    })
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));

  let certificate: typeof certificates.$inferSelect | null = null;

  if (isCompleted) {
    const existingCerts = await db
      .select()
      .from(certificates)
      .where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId)))
      .limit(1);

    if (existingCerts.length > 0) {
      certificate = existingCerts[0];
    } else {
      const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const [courseRow] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);

      if (userRow && courseRow) {
        const userQuizzes = await db
          .select({ scorePercent: quizSubmissions.scorePercent })
          .from(quizSubmissions)
          .where(and(eq(quizSubmissions.userId, userId), eq(quizSubmissions.courseId, courseId)));

        const finalScore =
          userQuizzes.length > 0
            ? Math.round(
                userQuizzes.reduce((sum, q) => sum + q.scorePercent, 0) / userQuizzes.length
              )
            : 100;

        const issuedAt = new Date();
        const verificationHash = generateCertificateHash({
          userId,
          courseId,
          recipientName: userRow.name,
          courseTitle: courseRow.title,
          issuedAtIso: issuedAt.toISOString(),
        });

        const inserted = await db
          .insert(certificates)
          .values({
            userId,
            courseId,
            verificationHash,
            recipientName: userRow.name,
            courseTitle: courseRow.title,
            finalScore,
            issuedAt,
          })
          .onConflictDoNothing()
          .returning();

        if (inserted.length > 0) {
          certificate = inserted[0];
        } else {
          const refetched = await db
            .select()
            .from(certificates)
            .where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId)))
            .limit(1);
          certificate = refetched[0] ?? null;
        }
      }
    }
  }

  return { progressPercent, completedLessons, totalLessons, certificate };
}

export async function gradeQuizSubmission(params: {
  userId: number;
  courseId: number;
  lessonId: number;
  answers: Record<string, number>;
}) {
  const [lesson] = await db
    .select()
    .from(lessons)
    .where(eq(lessons.id, params.lessonId))
    .limit(1);

  if (!lesson || !lesson.quizData) {
    throw new Error('Quiz not found for this lesson.');
  }

  const questions = lesson.quizData.questions;
  if (!questions || questions.length === 0) {
    throw new Error('Quiz has no configured questions.');
  }

  let correctCount = 0;
  const feedback: QuizQuestionFeedback[] = questions.map((q) => {
    const selectedIndex =
      typeof params.answers[q.id] === 'number' ? params.answers[q.id] : -1;
    const correct = selectedIndex === q.correctIndex;
    if (correct) {
      correctCount += 1;
    }
    return {
      questionId: q.id,
      correct,
      selectedIndex,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
    };
  });

  const scorePercent = Math.round((correctCount / questions.length) * 100);
  const passed = scorePercent >= lesson.quizData.passingScore;

  const [submission] = await db
    .insert(quizSubmissions)
    .values({
      userId: params.userId,
      courseId: params.courseId,
      lessonId: params.lessonId,
      answers: params.answers,
      scorePercent,
      passed,
      feedback,
    })
    .returning();

  if (passed) {
    await db
      .insert(lessonProgress)
      .values({
        userId: params.userId,
        courseId: params.courseId,
        lessonId: params.lessonId,
        completed: true,
        watchedSeconds: 0,
      })
      .onConflictDoUpdate({
        target: [lessonProgress.userId, lessonProgress.lessonId],
        set: {
          completed: true,
          completedAt: new Date(),
        },
      });
  }

  const progress = await recalculateCourseProgressAndIssueCertificate(
    params.userId,
    params.courseId
  );

  return {
    submission,
    scorePercent,
    passed,
    passingScore: lesson.quizData.passingScore,
    correctCount,
    totalQuestions: questions.length,
    feedback,
    progress,
  };
}
