import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.ts';
import { courses, lessons, modules } from '../db/schema.ts';
import { optionalAuth } from '../middleware/auth.ts';
import { AppError, asyncHandler } from '../middleware/error.ts';
import { streamAiCoachResponse } from '../services/ai-coach.ts';

const router = Router();

router.post(
  '/coach',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { lessonId, prompt, history } = req.body ?? {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new AppError('A student prompt is required.', 400, 'MISSING_PROMPT');
    }
    if (!lessonId || !Number.isInteger(Number(lessonId))) {
      throw new AppError('A valid lessonId is required.', 400, 'MISSING_LESSON_ID');
    }

    const [lessonRow] = await db
      .select({
        lessonTitle: lessons.title,
        lessonContent: lessons.contentMarkdown,
        courseTitle: courses.title,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(eq(lessons.id, Number(lessonId)))
      .limit(1);

    if (!lessonRow) {
      throw new AppError('Lesson context not found.', 404, 'LESSON_NOT_FOUND');
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      await streamAiCoachResponse({
        courseTitle: lessonRow.courseTitle,
        lessonTitle: lessonRow.lessonTitle,
        lessonContent: lessonRow.lessonContent,
        studentPrompt: prompt.trim(),
        history: Array.isArray(history) ? history : [],
        onChunk: (text) => {
          sendEvent({ type: 'chunk', text });
        },
      });
      sendEvent({ type: 'done' });
      res.end();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'AI Coach failed to respond.';
      sendEvent({ type: 'error', error: message });
      res.end();
    }
  })
);

export default router;
