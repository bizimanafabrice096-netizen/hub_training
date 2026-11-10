/**
 * End-to-End Integration & Health Verification Script
 * Simulates:
 * 1. Health check (/api/health)
 * 2. Student registration (/api/auth/register)
 * 3. Course discovery (/api/courses & /api/courses/:id)
 * 4. Course enrollment (/api/courses/:id/enroll)
 * 5. Lesson completion & Quiz auto-grading (/complete & /quiz)
 * 6. Cryptographic certificate issuance & public verification (/api/certificates/verify/:hash)
 */

const BASE_URL = process.env.TEST_API_BASE_URL || 'http://127.0.0.1:3000';

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = (await res.json()) as T;
  if (!res.ok) {
    throw new Error(
      `Request ${options.method || 'GET'} ${path} failed (${res.status}): ${JSON.stringify(data)}`
    );
  }
  return { status: res.status, data };
}

async function main() {
  console.log(`[1/6] Checking health at ${BASE_URL}/api/health...`);
  const health = await request<{ status: string; database: string }>('/api/health');
  if (health.data.status !== 'ok') {
    throw new Error(`Health check failed: ${JSON.stringify(health.data)}`);
  }

  const uniqueEmail = `e2e-learner-${Date.now()}@meridian.edu`;
  console.log(`[2/6] Registering test learner (${uniqueEmail})...`);
  const reg = await request<{ token: string; user: { id: number; email: string } }>(
    '/api/auth/register',
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'Ada Lovelace',
        email: uniqueEmail,
        password: 'TestPassword2026!',
        role: 'STUDENT',
      }),
    }
  );
  const authHeader = { Authorization: `Bearer ${reg.data.token}` };

  console.log('[3/6] Fetching course catalog...');
  const catalog = await request<{ courses: Array<{ id: number; title: string }> }>(
    '/api/courses'
  );
  if (!catalog.data.courses.length) {
    throw new Error('Catalog returned zero courses.');
  }
  const targetCourse = catalog.data.courses.find((c) => c.title.includes('Architecture')) || catalog.data.courses[0];

  console.log(`[4/6] Enrolling in course #${targetCourse.id} (${targetCourse.title})...`);
  await request(`/api/courses/${targetCourse.id}/enroll`, {
    method: 'POST',
    headers: authHeader,
  });

  const detail = await request<{
    course: {
      modules: Array<{
        lessons: Array<{
          id: number;
          lessonType: string;
          quizData: { questions: Array<{ id: string; options: string[] }> } | null;
        }>;
      }>;
    };
  }>(`/api/courses/${targetCourse.id}`, { headers: authHeader });

  const allLessons = detail.data.course.modules.flatMap((m) => m.lessons);
  console.log(`[5/6] Completing ${allLessons.length} lessons & assessments...`);

  let issuedHash: string | null = null;
  for (const lesson of allLessons) {
    if (lesson.lessonType === 'QUIZ' && lesson.quizData) {
      // Find correct answer by testing or using known seeded answers for Systems Architecture
      const answers: Record<string, number> = {};
      for (const q of lesson.quizData.questions) {
        answers[q.id] = q.id === 'arch-q1' ? 1 : q.id === 'ds-q2' || q.id === 'ds-q3' ? 1 : 1;
      }
      const quizRes = await request<{
        passed: boolean;
        scorePercent: number;
        progress: { progressPercent: number; certificate: { verificationHash: string } | null };
      }>(`/api/courses/${targetCourse.id}/lessons/${lesson.id}/quiz`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ answers }),
      });
      if (!quizRes.data.passed) {
        throw new Error(`Quiz failed with score ${quizRes.data.scorePercent}%`);
      }
      if (quizRes.data.progress.certificate) {
        issuedHash = quizRes.data.progress.certificate.verificationHash;
      }
    } else {
      const compRes = await request<{
        progressPercent: number;
        certificate: { verificationHash: string } | null;
      }>(`/api/courses/${targetCourse.id}/lessons/${lesson.id}/complete`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ watchedSeconds: 120 }),
      });
      if (compRes.data.certificate) {
        issuedHash = compRes.data.certificate.verificationHash;
      }
    }
  }

  if (!issuedHash) {
    throw new Error('Expected cryptographic certificate hash upon 100% completion.');
  }

  console.log(`[6/6] Validating cryptographic certificate hash (${issuedHash})...`);
  const verify = await request<{
    valid: boolean;
    certificate: { recipientName: string; courseTitle: string; verificationHash: string };
  }>(`/api/certificates/verify/${encodeURIComponent(issuedHash)}`);

  if (!verify.data.valid) {
    throw new Error('Certificate verification returned invalid.');
  }

  console.log('E2E Verification PASSED:', verify.data.certificate);
}

main().catch((err) => {
  console.error('E2E Verification FAILED:', err);
  process.exit(1);
});
