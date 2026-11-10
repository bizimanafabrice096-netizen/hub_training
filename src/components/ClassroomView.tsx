import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  FileText,
  Lock,
  Play,
  Send,
  ShieldCheck,
  Video,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type {
  CertificateRecord,
  CourseDetailPayload,
  LessonItem,
  QuizFeedbackItem,
} from '../types';

interface ClassroomViewProps {
  courseId: number;
  onBackToCatalog: () => void;
  onRequireAuth: () => void;
  onViewCertificate: (cert: CertificateRecord) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function ClassroomView({
  courseId,
  onBackToCatalog,
  onRequireAuth,
  onViewCertificate,
}: ClassroomViewProps) {
  const { user, authFetch, refreshSession } = useAuth();
  const [detail, setDetail] = useState<CourseDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<number | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Signed media state
  const [signedVideoUrl, setSignedVideoUrl] = useState<string | null>(null);
  const [signedUrlExpiresAt, setSignedUrlExpiresAt] = useState<string | null>(null);
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);

  // Quiz state
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState<{
    scorePercent: number;
    passed: boolean;
    passingScore: number;
    feedback: QuizFeedbackItem[];
  } | null>(null);

  // AI Coach state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [promptInput, setPromptInput] = useState('');
  const [streamingAi, setStreamingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const loadCourseDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/courses/${courseId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load course');
      }
      setDetail(data);
      const flatLessons: LessonItem[] = (data.course.modules ?? []).flatMap(
        (m: { lessons: LessonItem[] }) => m.lessons
      );
      if (flatLessons.length > 0) {
        setActiveLessonId((prev) =>
          prev && flatLessons.some((l) => l.id === prev) ? prev : flatLessons[0].id
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load classroom');
    } finally {
      setLoading(false);
    }
  }, [authFetch, courseId]);

  useEffect(() => {
    loadCourseDetail();
  }, [loadCourseDetail, user?.id]);

  const allLessons = useMemo(() => {
    if (!detail) return [];
    return detail.course.modules.flatMap((m) => m.lessons);
  }, [detail]);

  const activeLesson = useMemo(() => {
    return allLessons.find((l) => l.id === activeLessonId) ?? allLessons[0] ?? null;
  }, [allLessons, activeLessonId]);

  // Request 15-minute presigned playback URL whenever active video lesson changes
  useEffect(() => {
    setSignedVideoUrl(null);
    setSignedUrlExpiresAt(null);
    setVideoLoadFailed(false);

    if (!activeLesson || activeLesson.lessonType !== 'VIDEO' || !activeLesson.videoKey || !user) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(
          `/api/media/presign-playback?key=${encodeURIComponent(activeLesson.videoKey!)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setSignedVideoUrl(data.url);
          setSignedUrlExpiresAt(data.expiresAt);
        }
      } catch {
        // Non-fatal fallback to interactive lecture stage
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeLesson, authFetch, user]);

  // Reset quiz result state when switching lessons
  useEffect(() => {
    setQuizResult(null);
    setQuizAnswers({});
    setAiError(null);
  }, [activeLessonId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, streamingAi]);

  const handleEnroll = async () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    setEnrolling(true);
    try {
      const res = await authFetch(`/api/courses/${courseId}/enroll`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Enrollment failed');
      }
      await loadCourseDetail();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrollment failed');
    } finally {
      setEnrolling(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!activeLesson) return;

    setCompleting(true);
    try {
      const res = await authFetch(
        `/api/courses/${courseId}/lessons/${activeLesson.id}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ watchedSeconds: activeLesson.durationMinutes * 60 }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not update progress');
      }
      await loadCourseDetail();
      await refreshSession();
      if (data.certificate) {
        onViewCertificate(data.certificate);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save completion');
    } finally {
      setCompleting(false);
    }
  };

  const handleSubmitQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!activeLesson || !activeLesson.quizData) return;

    setQuizSubmitting(true);
    setError(null);
    try {
      const res = await authFetch(
        `/api/courses/${courseId}/lessons/${activeLesson.id}/quiz`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: quizAnswers }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Quiz grading failed');
      }
      setQuizResult({
        scorePercent: data.scorePercent,
        passed: data.passed,
        passingScore: data.passingScore,
        feedback: data.feedback,
      });
      await loadCourseDetail();
      await refreshSession();
      if (data.progress?.certificate) {
        onViewCertificate(data.progress.certificate);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quiz submission failed');
    } finally {
      setQuizSubmitting(false);
    }
  };

  const sendCoachPrompt = async (promptText: string) => {
    if (!activeLesson || !promptText.trim() || streamingAi) return;
    const trimmed = promptText.trim();
    const priorHistory = [...chatMessages];
    setChatMessages((prev) => [
      ...prev,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: '' },
    ]);
    setPromptInput('');
    setStreamingAi(true);
    setAiError(null);

    try {
      const res = await authFetch('/api/ai/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId: activeLesson.id,
          prompt: trimmed,
          history: priorHistory,
        }),
      });

      if (!res.ok || !res.body) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.error || 'AI Coach stream failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const chunkBlock of lines) {
          const dataLine = chunkBlock
            .split('\n')
            .find((line) => line.startsWith('data: '));
          if (!dataLine) continue;
          const jsonText = dataLine.slice(6);
          const evt = JSON.parse(jsonText) as {
            type: 'chunk' | 'done' | 'error';
            text?: string;
            error?: string;
          };

          if (evt.type === 'chunk' && evt.text) {
            setChatMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant') {
                copy[copy.length - 1] = {
                  ...last,
                  content: last.content + evt.text,
                };
              }
              return copy;
            });
          } else if (evt.type === 'error') {
            throw new Error(evt.error || 'AI Coach encountered an error');
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach AI Coach';
      setAiError(msg);
      setChatMessages((prev) => {
        const copy = [...prev];
        if (copy.length > 0 && copy[copy.length - 1].content === '') {
          copy.pop();
        }
        return copy;
      });
    } finally {
      setStreamingAi(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="font-medium">{error}</p>
          <button
            type="button"
            onClick={onBackToCatalog}
            className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-900 cursor-pointer"
          >
            Back to Catalog
          </button>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  const { course, enrollment, completedLessonIds, certificate } = detail;
  const completedSet = new Set(completedLessonIds);
  const progressPercent = enrollment?.progressPercent ?? 0;
  const isActiveCompleted = activeLesson ? completedSet.has(activeLesson.id) : false;

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-12 pt-6 sm:px-6">
      {/* Classroom Header & Progress Bar */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBackToCatalog}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Catalog
          </button>
          <h1 className="mt-1.5 font-display text-2xl font-semibold text-slate-900 truncate">
            {course.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{course.instructorName}</span>
            <span aria-hidden="true">·</span>
            <span>{course.category}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {completedLessonIds.length} of {allLessons.length} lessons completed ({progressPercent}%)
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="w-44">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-[#0F4C81] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {!enrollment ? (
            <button
              type="button"
              onClick={handleEnroll}
              disabled={enrolling}
              className="rounded-lg bg-[#0F4C81] px-4 py-2 text-xs font-medium text-white hover:bg-[#0c3c66] cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {enrolling ? 'Enrolling...' : user ? 'Enroll in Course' : 'Sign In to Enroll'}
            </button>
          ) : certificate ? (
            <button
              type="button"
              onClick={() => onViewCertificate(certificate)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800 cursor-pointer whitespace-nowrap"
            >
              <Award className="h-4 w-4" />
              View Verified Certificate
            </button>
          ) : (
            <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
              Enrolled · In Progress
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Horizontal Curriculum Lesson Switcher with Color-Coded Progress Insights */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {allLessons.map((lesson, idx) => {
            const isCurrent = activeLesson?.id === lesson.id;
            const done = completedSet.has(lesson.id);
            const typeAccent =
              lesson.lessonType === 'QUIZ'
                ? 'border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100'
                : lesson.lessonType === 'VIDEO'
                  ? 'border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100'
                  : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100';

            return (
              <button
                key={lesson.id}
                type="button"
                onClick={() => setActiveLessonId(lesson.id)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isCurrent
                    ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                    : done
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                      : typeAccent
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                ) : lesson.lessonType === 'VIDEO' ? (
                  <Video className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="tabular-nums">
                  {idx + 1}. {lesson.title}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-600 shrink-0">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-xs bg-emerald-600" />
            Completed
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-xs bg-sky-600" />
            Video
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-xs bg-amber-600" />
            Reading
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-xs bg-violet-600" />
            Quiz
          </span>
        </div>
      </div>

      {/* Split-Screen Classroom Layout: Left (Media/Notes/Quiz) | Right (Live AI Coach) */}
      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT PANE: Video Player / Lesson Markdown / Auto-Graded Quiz */}
        <section className="lg:col-span-7 space-y-6">
          {activeLesson ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{activeLesson.lessonType}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{activeLesson.durationMinutes} min</span>
                    {isActiveCompleted && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-emerald-700">Completed</span>
                      </>
                    )}
                  </div>
                  <h2 className="mt-1 font-display text-2xl font-semibold text-slate-900">
                    {activeLesson.title}
                  </h2>
                </div>

                {activeLesson.lessonType !== 'QUIZ' && (
                  <button
                    type="button"
                    onClick={handleMarkComplete}
                    disabled={completing || isActiveCompleted}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      isActiveCompleted
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                        : 'bg-[#0F4C81] text-white hover:bg-[#0c3c66]'
                    } disabled:opacity-60`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {isActiveCompleted
                      ? 'Lesson Completed'
                      : completing
                        ? 'Saving...'
                        : 'Mark Lesson Complete'}
                  </button>
                )}
              </div>

              {/* Secure Media Player for VIDEO lessons */}
              {activeLesson.lessonType === 'VIDEO' && (
                <div className="mt-5">
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
                    {signedVideoUrl && !videoLoadFailed ? (
                      <video
                        key={signedVideoUrl}
                        src={signedVideoUrl}
                        controls
                        onError={() => setVideoLoadFailed(true)}
                        className="aspect-video w-full bg-black"
                      />
                    ) : (
                      <div className="flex aspect-video w-full flex-col items-center justify-center p-8 text-center text-slate-200">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-sky-400">
                          <Play className="h-6 w-6 translate-x-0.5" />
                        </div>
                        <p className="mt-4 font-display text-lg font-medium text-white">
                          {activeLesson.title}
                        </p>
                        <p className="mt-1 max-w-md text-xs text-slate-400">
                          {user
                            ? 'Protected media vault ready. Instructors can upload MP4/WebM lectures directly via 15-minute expiring pre-signed URLs in Instructor Studio.'
                            : 'Sign in to acquire a 15-minute expiring pre-signed media stream token.'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-slate-400" />
                      {signedUrlExpiresAt
                        ? `Pre-signed media token active (expires ${new Date(signedUrlExpiresAt).toLocaleTimeString()})`
                        : '15-minute expiring signed URL protection enabled'}
                    </span>
                    <span className="font-mono text-[11px]">
                      {activeLesson.videoKey || 'lecture-stream'}
                    </span>
                  </div>
                </div>
              )}

              {/* Lesson Markdown Notes */}
              <div className="prose-academic mt-6">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {activeLesson.contentMarkdown}
                </ReactMarkdown>
              </div>

              {/* Attachments */}
              {activeLesson.attachments && activeLesson.attachments.length > 0 && (
                <div className="mt-6 border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-semibold text-slate-700">Lesson Attachments</h3>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {activeLesson.attachments.map((att) => (
                      <div
                        key={att.key}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                      >
                        <FileText className="h-3.5 w-3.5 text-slate-500" />
                        <span className="font-medium">{att.name}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-500">{att.sizeLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Auto-Graded Quiz Section */}
              {activeLesson.lessonType === 'QUIZ' && activeLesson.quizData && (
                <form
                  onSubmit={handleSubmitQuiz}
                  className="mt-6 space-y-6 border-t border-slate-200 pt-6"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg font-semibold text-slate-900">
                      Graded Assessment
                    </h3>
                    <span className="text-xs font-medium text-slate-600 tabular-nums">
                      Passing threshold: {activeLesson.quizData.passingScore}%
                    </span>
                  </div>

                  {activeLesson.quizData.questions.map((q, qIdx) => {
                    const selected = quizAnswers[q.id];
                    const gradedItem = quizResult?.feedback.find(
                      (f) => f.questionId === q.id
                    );

                    return (
                      <div
                        key={q.id}
                        className="rounded-lg border border-slate-200 bg-slate-50/70 p-4"
                      >
                        <p className="text-sm font-medium text-slate-900">
                          {qIdx + 1}. {q.prompt}
                        </p>
                        <div className="mt-3 space-y-2">
                          {q.options.map((opt, optIdx) => {
                            const checked = selected === optIdx;
                            return (
                              <label
                                key={optIdx}
                                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                                  checked
                                    ? 'border-[#0F4C81] bg-white text-slate-900'
                                    : 'border-slate-200 bg-white/60 text-slate-700 hover:bg-white'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`question-${q.id}`}
                                  checked={checked}
                                  onChange={() =>
                                    setQuizAnswers((prev) => ({
                                      ...prev,
                                      [q.id]: optIdx,
                                    }))
                                  }
                                  className="mt-0.5 accent-[#0F4C81]"
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>

                        {gradedItem && (
                          <div
                            className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                              gradedItem.correct
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                : 'border-amber-200 bg-amber-50 text-amber-900'
                            }`}
                          >
                            <p className="font-semibold">
                              {gradedItem.correct ? 'Correct' : 'Incorrect'}
                            </p>
                            <p className="mt-0.5 leading-relaxed">{gradedItem.explanation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {quizResult && (
                    <div
                      className={`rounded-lg border p-4 text-sm ${
                        quizResult.passed
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-amber-200 bg-amber-50 text-amber-900'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span>
                          {quizResult.passed
                            ? 'Assessment Passed'
                            : 'Score Below Passing Threshold — Retry Available'}
                        </span>
                        <span className="font-mono tabular-nums">
                          {quizResult.scorePercent}% (Required: {quizResult.passingScore}%)
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={
                      quizSubmitting ||
                      Object.keys(quizAnswers).length < activeLesson.quizData.questions.length
                    }
                    className="w-full rounded-lg bg-[#0F4C81] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0c3c66] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {quizSubmitting
                      ? 'Grading Submission...'
                      : user
                        ? 'Submit Assessment for Auto-Grading'
                        : 'Sign In to Submit Assessment'}
                  </button>
                </form>
              )}
            </div>
          ) : null}
        </section>

        {/* RIGHT PANE: Live Streaming AI Coach Widget */}
        <aside className="lg:col-span-5">
          <div className="sticky top-24 flex h-[640px] flex-col rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  AI Lesson Coach
                </h3>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#0F4C81]" />
                  Grounded in current lesson
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 truncate">
                Context: {activeLesson?.title}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {chatMessages.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-sm leading-relaxed text-slate-600">
                    Ask a question about derivations, architecture trade-offs, or exam
                    preparation for this lesson. Responses stream directly in structured
                    Markdown.
                  </p>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-500">Suggested prompts</p>
                    {[
                      'Summarize the core invariants from this lesson in 3 bullets.',
                      'Give me a concrete production failure scenario related to this topic.',
                      'Ask me one diagnostic question to test my understanding.',
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => sendCoachPrompt(suggestion)}
                        className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-3.5 text-sm ${
                      msg.role === 'user'
                        ? 'ml-8 bg-[#0F4C81] text-white'
                        : 'mr-4 border border-slate-200 bg-slate-50 text-slate-800'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="leading-relaxed">{msg.content}</p>
                    ) : (
                      <div className="prose-academic text-sm">
                        {msg.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        ) : (
                          <span className="text-xs text-slate-400">Formulating response...</span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}

              {aiError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
                >
                  {aiError}
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendCoachPrompt(promptInput);
              }}
              className="border-t border-slate-200 p-4"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Ask the AI Coach about this lesson..."
                  disabled={streamingAi}
                  className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:outline-none focus:ring-1 focus:ring-[#0F4C81]"
                />
                <button
                  type="submit"
                  disabled={streamingAi || !promptInput.trim()}
                  aria-label="Send prompt to AI Coach"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F4C81] text-white hover:bg-[#0c3c66] transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
