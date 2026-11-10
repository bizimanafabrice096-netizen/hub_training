import React, { useCallback, useEffect, useState } from 'react';
import { Lock, Plus, UploadCloud } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { InstructorAnalyticsPayload, LessonType } from '../types';

interface InstructorStudioViewProps {
  onRequireAuth: () => void;
  onCourseCreated: () => void;
}

export function InstructorStudioView({
  onRequireAuth,
  onCourseCreated,
}: InstructorStudioViewProps) {
  const { user, authFetch, switchRole } = useAuth();
  const [analytics, setAnalytics] = useState<InstructorAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switchingRole, setSwitchingRole] = useState(false);

  // Create Course form
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Systems Engineering');
  const [level, setLevel] = useState('Intermediate');
  const [durationHours, setDurationHours] = useState(8);
  const [creatingCourse, setCreatingCourse] = useState(false);

  // Add Lesson + Pre-signed Video Upload state
  const [targetCourseId, setTargetCourseId] = useState<number | ''>('');
  const [targetModuleId, setTargetModuleId] = useState<number | ''>('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonType, setLessonType] = useState<LessonType>('VIDEO');
  const [lessonMarkdown, setLessonMarkdown] = useState(
    '## Key Objectives\n\nOutline the primary concepts covered in this module lecture.'
  );
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [uploadedVideoKey, setUploadedVideoKey] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [addingLesson, setAddingLesson] = useState(false);

  const loadAnalytics = useCallback(async () => {
    if (!user || (user.role !== 'INSTRUCTOR' && user.role !== 'ADMIN')) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/instructor/analytics');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load instructor analytics');
      }
      setAnalytics(data);
      if (data.courses?.length > 0 && !targetCourseId) {
        setTargetCourseId(data.courses[0].id);
        if (data.courses[0].modules?.length > 0) {
          setTargetModuleId(data.courses[0].modules[0].id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load analytics');
    } finally {
      setLoading(false);
    }
  }, [authFetch, targetCourseId, user]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleEnableInstructorRole = async () => {
    setSwitchingRole(true);
    setError(null);
    try {
      await switchRole('INSTRUCTOR');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role update failed');
    } finally {
      setSwitchingRole(false);
    }
  };

  const handlePresignedUpload = async () => {
    if (!selectedVideoFile || !targetCourseId) return;
    setUploadStatus('Requesting 15-minute pre-signed upload URL...');
    setError(null);
    try {
      const presignRes = await authFetch('/api/media/presign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: Number(targetCourseId),
          fileName: selectedVideoFile.name,
          contentType: selectedVideoFile.type || 'video/mp4',
        }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok) {
        throw new Error(presignData.error || 'Pre-sign failed');
      }

      setUploadStatus(`Uploading directly to ${presignData.provider} (TTL: 15 min)...`);
      const putRes = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': selectedVideoFile.type || 'video/mp4' },
        body: selectedVideoFile,
      });

      if (!putRes.ok) {
        throw new Error('Media upload failed');
      }

      setUploadedVideoKey(presignData.key);
      setUploadStatus(`Uploaded securely (${presignData.key})`);
    } catch (err) {
      setUploadStatus(null);
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingCourse(true);
    setError(null);
    try {
      const res = await authFetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          subtitle,
          description,
          category,
          level,
          durationHours,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Course creation failed');
      }
      setTitle('');
      setSubtitle('');
      setDescription('');
      setTargetCourseId(data.course.id);
      setTargetModuleId(data.module.id);
      await loadAnalytics();
      onCourseCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Course creation failed');
    } finally {
      setCreatingCourse(false);
    }
  };

  const handleAddLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCourseId || !targetModuleId) return;
    setAddingLesson(true);
    setError(null);
    try {
      const res = await authFetch(
        `/api/courses/${targetCourseId}/modules/${targetModuleId}/lessons`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: lessonTitle,
            lessonType,
            videoKey: lessonType === 'VIDEO' ? uploadedVideoKey : null,
            durationMinutes: 14,
            contentMarkdown: lessonMarkdown,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add lesson');
      }
      setLessonTitle('');
      setSelectedVideoFile(null);
      setUploadedVideoKey(null);
      setUploadStatus(null);
      await loadAnalytics();
      onCourseCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lesson creation failed');
    } finally {
      setAddingLesson(false);
    }
  };

  if (!user) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <h1 className="font-display text-3xl font-semibold text-slate-900">
            Instructor Analytics &amp; Authoring Studio
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-600">
            Sign in with an Instructor account to monitor student enrollment, completion rates,
            auto-graded quiz submissions, and pre-signed lecture uploads.
          </p>
          <button
            type="button"
            onClick={onRequireAuth}
            className="mt-6 rounded-lg bg-[#0F4C81] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#0c3c66] cursor-pointer"
          >
            Sign In to Continue
          </button>
        </div>
      </main>
    );
  }

  if (user.role !== 'INSTRUCTOR' && user.role !== 'ADMIN') {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <h1 className="font-display text-3xl font-semibold text-slate-900">
            Instructor Access Required
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-600">
            Your account ({user.email}) is currently assigned the <strong>Student</strong>{' '}
            role. Switch to Instructor mode to publish courses and inspect cohort analytics.
          </p>
          {error && (
            <p className="mt-3 text-sm text-red-700">{error}</p>
          )}
          <button
            type="button"
            onClick={handleEnableInstructorRole}
            disabled={switchingRole}
            className="mt-6 rounded-lg bg-[#0F4C81] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#0c3c66] cursor-pointer disabled:opacity-50"
          >
            {switchingRole ? 'Updating Role...' : 'Switch to Instructor Role'}
          </button>
        </div>
      </main>
    );
  }

  const selectedCourseObj = analytics?.courses.find((c) => c.id === targetCourseId);

  return (
    <main className="mx-auto max-w-7xl px-6 pb-20 pt-10 space-y-8">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Faculty Workspace · {user.email}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-slate-900">
            Instructor Analytics Canvas
          </h1>
        </div>
        <button
          type="button"
          onClick={loadAnalytics}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
        >
          {loading ? 'Refreshing...' : 'Refresh Metrics'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* 4 Distinct Multi-Color KPI Insight Cards */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-100/70 p-6">
          <p className="text-xs font-semibold text-sky-800">Total Enrolled Students</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {analytics?.summary.totalEnrollments ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-700 tabular-nums">
            Across {analytics?.summary.totalCourses ?? 0} published courses
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-100/70 p-6">
          <p className="text-xs font-semibold text-emerald-800">Average Completion Rate</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {analytics?.summary.averageCompletionRate ?? 0}%
          </p>
          <p className="mt-1 text-xs text-slate-700">Mean learner progress</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100/70 p-6">
          <p className="text-xs font-semibold text-amber-800">Certificates Issued</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {analytics?.summary.certificatesIssued ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-700">Cryptographic SHA-256 credentials</p>
        </div>
        <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-100/70 p-6">
          <p className="text-xs font-semibold text-violet-800">Average Quiz Score</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {analytics?.summary.averageQuizScore ?? 0}%
          </p>
          <p className="mt-1 text-xs text-slate-700">Auto-graded assessments</p>
        </div>
      </section>

      {/* Visual Cohort & Assessment Insights Charts */}
      {analytics && analytics.courses.length > 0 && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-xl border border-sky-200/80 bg-gradient-to-b from-white to-sky-50/40 p-6 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Cohort Progress by Course
                </h2>
                <p className="text-xs text-slate-500">
                  Color-coded average completion rates across active curricula
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-sky-600" />
                  Systems
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-violet-600" />
                  ML
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-teal-600" />
                  Architecture
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-amber-600" />
                  Quantum
                </span>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {analytics.courses.map((c) => {
                const barColor =
                  c.category === 'Machine Learning'
                    ? 'bg-violet-600'
                    : c.category === 'Software Architecture'
                      ? 'bg-teal-600'
                      : c.category === 'Quantum Computing'
                        ? 'bg-amber-600'
                        : 'bg-sky-600';

                return (
                  <div key={c.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-800 truncate">{c.title}</span>
                      <span className="font-mono tabular-nums text-slate-600 shrink-0">
                        {c.averageProgressPercent}% · {c.enrolledCount} learners
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${Math.max(4, c.averageProgressPercent)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-violet-200/80 bg-gradient-to-b from-white to-violet-50/40 p-6 lg:col-span-5">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Assessment Mastery Breakdown
            </h2>
            <p className="text-xs text-slate-500">
              Distribution of recent graded quiz outcomes by performance band
            </p>

            {(() => {
              const subs = analytics.recentSubmissions;
              const total = subs.length;
              const mastery = subs.filter((s) => s.scorePercent >= 90).length;
              const proficient = subs.filter(
                (s) => s.scorePercent >= 70 && s.scorePercent < 90
              ).length;
              const needsReview = subs.filter((s) => s.scorePercent < 70).length;
              const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

              return (
                <div className="mt-5 space-y-5">
                  <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
                    {total > 0 ? (
                      <>
                        <div
                          className="bg-emerald-600 transition-all"
                          style={{ width: `${pct(mastery)}%` }}
                          title={`High Mastery (90-100%): ${mastery}`}
                        />
                        <div
                          className="bg-sky-600 transition-all"
                          style={{ width: `${pct(proficient)}%` }}
                          title={`Proficient (70-89%): ${proficient}`}
                        />
                        <div
                          className="bg-rose-600 transition-all"
                          style={{ width: `${pct(needsReview)}%` }}
                          title={`Needs Review (<70%): ${needsReview}`}
                        />
                      </>
                    ) : (
                      <div className="h-full w-full bg-slate-200" />
                    )}
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="inline-flex items-center gap-2 font-medium text-emerald-800">
                        <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" />
                        High Mastery (90%–100%)
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {mastery} ({pct(mastery)}%)
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="inline-flex items-center gap-2 font-medium text-sky-800">
                        <span className="h-2.5 w-2.5 rounded-xs bg-sky-600" />
                        Proficient Passing (70%–89%)
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {proficient} ({pct(proficient)}%)
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 font-medium text-rose-800">
                        <span className="h-2.5 w-2.5 rounded-xs bg-rose-600" />
                        Needs Review (&lt;70%)
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {needsReview} ({pct(needsReview)}%)
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {/* Course Performance Data Grid */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Course Cohorts &amp; Completion Rates
          </h2>
        </div>

        {!analytics || analytics.courses.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-600">
            You have not published any courses yet. Use the Course Builder below to publish
            your first curriculum.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <tr>
                  <th className="px-6 py-3">Course Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Lessons</th>
                  <th className="px-4 py-3 text-right">Enrolled</th>
                  <th className="px-4 py-3 text-right">Avg Progress</th>
                  <th className="px-6 py-3 text-right">Certificates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.courses.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5 font-medium text-slate-900">{c.title}</td>
                    <td className="px-4 py-3.5 text-slate-600">{c.category}</td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-700">
                      {c.lessonCount}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-700">
                      {c.enrolledCount}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-900">
                      {c.averageProgressPercent}%
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono tabular-nums text-slate-700">
                      {c.certificatesIssued}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Authoring Workspace: Create Course + Add Lesson / Pre-signed Media Upload */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleCreateCourse}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-[#0F4C81]" />
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Publish New Course
            </h2>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Course Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., High-Throughput Storage Engines"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Subtitle</label>
            <input
              type="text"
              required
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="LSM-trees, B+Trees, WAL recovery, and NVMe I/O scheduling."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900"
              >
                <option>Systems Engineering</option>
                <option>Machine Learning</option>
                <option>Software Architecture</option>
                <option>Quantum Computing</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Level</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900"
              >
                <option>Foundational</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Hours</label>
              <input
                type="number"
                min={1}
                max={100}
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Syllabus Description
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed learning outcomes and prerequisites..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={creatingCourse}
            className="w-full rounded-lg bg-[#0F4C81] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0c3c66] cursor-pointer disabled:opacity-50"
          >
            {creatingCourse ? 'Publishing...' : 'Create Course & Initial Module'}
          </button>
        </form>

        <form
          onSubmit={handleAddLesson}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Add Lesson &amp; Secure Video Upload
            </h2>
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Lock className="h-3.5 w-3.5" />
              15-min signed upload
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Target Course</label>
              <select
                value={targetCourseId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setTargetCourseId(id);
                  const found = analytics?.courses.find((c) => c.id === id);
                  setTargetModuleId(found?.modules[0]?.id ?? '');
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900"
              >
                <option value="">Select course...</option>
                {analytics?.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Target Module</label>
              <select
                value={targetModuleId}
                onChange={(e) => setTargetModuleId(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900"
              >
                <option value="">Select module...</option>
                {selectedCourseObj?.modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-700">Lesson Title</label>
              <input
                type="text"
                required
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
                placeholder="e.g., Write-Ahead Log Recovery"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Format</label>
              <select
                value={lessonType}
                onChange={(e) => setLessonType(e.target.value as LessonType)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900"
              >
                <option value="VIDEO">VIDEO</option>
                <option value="ARTICLE">ARTICLE</option>
              </select>
            </div>
          </div>

          {lessonType === 'VIDEO' && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  onChange={(e) => setSelectedVideoFile(e.target.files?.[0] ?? null)}
                  className="text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-800 hover:file:bg-slate-300"
                />
                <button
                  type="button"
                  disabled={!selectedVideoFile || !targetCourseId}
                  onClick={handlePresignedUpload}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  Upload via Pre-Signed URL
                </button>
              </div>
              {uploadStatus && (
                <p className="mt-2 font-mono text-[11px] text-emerald-800">{uploadStatus}</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Lesson Notes (Markdown)
            </label>
            <textarea
              required
              rows={3}
              value={lessonMarkdown}
              onChange={(e) => setLessonMarkdown(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900"
            />
          </div>

          <button
            type="submit"
            disabled={addingLesson || !targetCourseId || !targetModuleId}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 cursor-pointer disabled:opacity-50"
          >
            {addingLesson ? 'Saving Lesson...' : 'Attach Lesson to Module'}
          </button>
        </form>
      </section>

      {/* Assignment & Quiz Submissions Management Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Recent Graded Submissions
          </h2>
        </div>
        {!analytics || analytics.recentSubmissions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-600">
            No student quiz submissions recorded for your courses yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <tr>
                  <th className="px-6 py-3">Learner</th>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Assessment</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-6 py-3 text-right">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.recentSubmissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-slate-900">{sub.studentName}</p>
                      <p className="text-xs text-slate-500">{sub.studentEmail}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{sub.courseTitle}</td>
                    <td className="px-4 py-3.5 text-slate-600">{sub.lessonTitle}</td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums font-medium text-slate-900">
                      {sub.scorePercent}%
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`text-xs font-medium ${
                          sub.passed ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {sub.passed ? 'Passed' : 'Retry Needed'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs tabular-nums text-slate-500">
                      {new Date(sub.submittedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
