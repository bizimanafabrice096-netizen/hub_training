export type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
export type LessonType = 'VIDEO' | 'ARTICLE' | 'QUIZ';

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
}

export interface CourseSummary {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  level: string;
  thumbnailUrl: string;
  durationHours: number;
  instructorId: number;
  instructorName: string;
  instructorBio: string | null;
  moduleCount: number;
  lessonCount: number;
  enrolledCount: number;
  userEnrollment: {
    progressPercent: number;
    status: string;
  } | null;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface LessonItem {
  id: number;
  moduleId: number;
  title: string;
  lessonType: LessonType;
  videoKey: string | null;
  videoUrl: string | null;
  durationMinutes: number;
  contentMarkdown: string;
  attachments: Array<{
    name: string;
    key: string;
    sizeLabel: string;
    mimeType: string;
  }>;
  quizData: {
    passingScore: number;
    questions: QuizQuestion[];
  } | null;
  orderIndex: number;
}

export interface ModuleItem {
  id: number;
  courseId: number;
  title: string;
  summary: string;
  orderIndex: number;
  lessons: LessonItem[];
}

export interface CertificateRecord {
  id: number;
  userId: number;
  courseId: number;
  verificationHash: string;
  recipientName: string;
  courseTitle: string;
  finalScore: number;
  issuedAt: string;
}

export interface QuizFeedbackItem {
  questionId: string;
  correct: boolean;
  selectedIndex: number;
  correctIndex: number;
  explanation: string;
}

export interface QuizSubmissionRecord {
  id: number;
  lessonId: number;
  scorePercent: number;
  passed: boolean;
  feedback: QuizFeedbackItem[];
  submittedAt: string;
}

export interface CourseDetailPayload {
  course: {
    id: number;
    slug: string;
    title: string;
    subtitle: string;
    description: string;
    category: string;
    level: string;
    thumbnailUrl: string;
    durationHours: number;
    instructorId: number;
    instructorName: string;
    instructorBio: string | null;
    modules: ModuleItem[];
  };
  enrollment: {
    id: number;
    progressPercent: number;
    status: string;
    enrolledAt: string;
    completedAt: string | null;
  } | null;
  completedLessonIds: number[];
  submissions: QuizSubmissionRecord[];
  certificate: CertificateRecord | null;
}

export interface InstructorAnalyticsPayload {
  summary: {
    totalCourses: number;
    totalEnrollments: number;
    completedEnrollments?: number;
    averageCompletionRate: number;
    certificatesIssued: number;
    averageQuizScore: number;
  };
  courses: Array<{
    id: number;
    title: string;
    category: string;
    level: string;
    moduleCount: number;
    lessonCount: number;
    enrolledCount: number;
    completedCount: number;
    averageProgressPercent: number;
    certificatesIssued: number;
    modules: Array<{
      id: number;
      title: string;
      lessons: Array<{
        id: number;
        title: string;
        lessonType: LessonType;
        durationMinutes: number;
      }>;
    }>;
  }>;
  recentSubmissions: Array<{
    id: number;
    courseId: number;
    lessonId: number;
    scorePercent: number;
    passed: boolean;
    submittedAt: string;
    studentName: string;
    studentEmail: string;
    lessonTitle: string;
    courseTitle: string;
  }>;
}
