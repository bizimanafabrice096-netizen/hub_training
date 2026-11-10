import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
export type LessonType = 'VIDEO' | 'ARTICLE' | 'QUIZ';

export interface LessonAttachment {
  name: string;
  key: string;
  sizeLabel: string;
  mimeType: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface QuizData {
  passingScore: number;
  questions: QuizQuestion[];
}

export interface QuizQuestionFeedback {
  questionId: string;
  correct: boolean;
  selectedIndex: number;
  correctIndex: number;
  explanation: string;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  role: text('role').$type<UserRole>().notNull().default('STUDENT'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const courses = pgTable('courses', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  level: text('level').notNull().default('Intermediate'),
  thumbnailUrl: text('thumbnail_url').notNull(),
  durationHours: integer('duration_hours').notNull().default(8),
  published: boolean('published').notNull().default(true),
  instructorId: integer('instructor_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const modules = pgTable('modules', {
  id: serial('id').primaryKey(),
  courseId: integer('course_id')
    .references(() => courses.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  orderIndex: integer('order_index').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const lessons = pgTable('lessons', {
  id: serial('id').primaryKey(),
  moduleId: integer('module_id')
    .references(() => modules.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  lessonType: text('lesson_type').$type<LessonType>().notNull().default('VIDEO'),
  videoKey: text('video_key'),
  videoUrl: text('video_url'),
  durationMinutes: integer('duration_minutes').notNull().default(12),
  contentMarkdown: text('content_markdown').notNull(),
  attachments: jsonb('attachments').$type<LessonAttachment[]>().notNull().default([]),
  quizData: jsonb('quiz_data').$type<QuizData | null>(),
  orderIndex: integer('order_index').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const enrollments = pgTable(
  'enrollments',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    courseId: integer('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    progressPercent: integer('progress_percent').notNull().default(0),
    status: text('status').notNull().default('ACTIVE'),
    enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [uniqueIndex('enrollments_user_course_idx').on(table.userId, table.courseId)]
);

export const lessonProgress = pgTable(
  'lesson_progress',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    courseId: integer('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    lessonId: integer('lesson_id')
      .references(() => lessons.id, { onDelete: 'cascade' })
      .notNull(),
    completed: boolean('completed').notNull().default(true),
    watchedSeconds: integer('watched_seconds').notNull().default(0),
    completedAt: timestamp('completed_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('lesson_progress_user_lesson_idx').on(table.userId, table.lessonId)]
);

export const quizSubmissions = pgTable('quiz_submissions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  courseId: integer('course_id')
    .references(() => courses.id, { onDelete: 'cascade' })
    .notNull(),
  lessonId: integer('lesson_id')
    .references(() => lessons.id, { onDelete: 'cascade' })
    .notNull(),
  answers: jsonb('answers').$type<Record<string, number>>().notNull(),
  scorePercent: integer('score_percent').notNull(),
  passed: boolean('passed').notNull(),
  feedback: jsonb('feedback').$type<QuizQuestionFeedback[]>().notNull(),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
});

export const certificates = pgTable(
  'certificates',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    courseId: integer('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    verificationHash: text('verification_hash').notNull().unique(),
    recipientName: text('recipient_name').notNull(),
    courseTitle: text('course_title').notNull(),
    finalScore: integer('final_score').notNull().default(100),
    issuedAt: timestamp('issued_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('certificates_user_course_idx').on(table.userId, table.courseId)]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  coursesTaught: many(courses),
  enrollments: many(enrollments),
  lessonProgress: many(lessonProgress),
  quizSubmissions: many(quizSubmissions),
  certificates: many(certificates),
}));

export const coursesRelations = relations(courses, ({ one, many }) => ({
  instructor: one(users, {
    fields: [courses.instructorId],
    references: [users.id],
  }),
  modules: many(modules),
  enrollments: many(enrollments),
  certificates: many(certificates),
}));

export const modulesRelations = relations(modules, ({ one, many }) => ({
  course: one(courses, {
    fields: [modules.courseId],
    references: [courses.id],
  }),
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  module: one(modules, {
    fields: [lessons.moduleId],
    references: [modules.id],
  }),
  progressRecords: many(lessonProgress),
  quizSubmissions: many(quizSubmissions),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  user: one(users, {
    fields: [enrollments.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [enrollments.courseId],
    references: [courses.id],
  }),
}));

export const lessonProgressRelations = relations(lessonProgress, ({ one }) => ({
  user: one(users, {
    fields: [lessonProgress.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [lessonProgress.courseId],
    references: [courses.id],
  }),
  lesson: one(lessons, {
    fields: [lessonProgress.lessonId],
    references: [lessons.id],
  }),
}));

export const quizSubmissionsRelations = relations(quizSubmissions, ({ one }) => ({
  user: one(users, {
    fields: [quizSubmissions.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [quizSubmissions.courseId],
    references: [courses.id],
  }),
  lesson: one(lessons, {
    fields: [quizSubmissions.lessonId],
    references: [lessons.id],
  }),
}));

export const certificatesRelations = relations(certificates, ({ one }) => ({
  user: one(users, {
    fields: [certificates.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [certificates.courseId],
    references: [courses.id],
  }),
}));
