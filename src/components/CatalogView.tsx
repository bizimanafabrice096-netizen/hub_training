import React, { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Search } from 'lucide-react';
import type { CourseSummary } from '../types';

interface CatalogViewProps {
  courses: CourseSummary[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  onOpenCourse: (courseId: number) => void;
  onOpenVerify: () => void;
}

export function CatalogView({
  courses,
  loading,
  error,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onSelectCategory,
  onOpenCourse,
  onOpenVerify,
}: CatalogViewProps) {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const categories = useMemo(() => {
    const base = new Set<string>([
      'All',
      'Systems Engineering',
      'Machine Learning',
      'Software Architecture',
      'Quantum Computing',
    ]);
    for (const c of courses) {
      base.add(c.category);
    }
    return Array.from(base);
  }, [courses]);

  const getCategoryPalette = (category: string) => {
    switch (category) {
      case 'Systems Engineering':
        return {
          text: 'text-sky-800',
          bar: 'bg-sky-600',
          cardBg: 'bg-gradient-to-b from-sky-50/70 via-white to-blue-50/60 border-sky-200',
        };
      case 'Machine Learning':
        return {
          text: 'text-violet-800',
          bar: 'bg-violet-600',
          cardBg: 'bg-gradient-to-b from-violet-50/70 via-white to-indigo-50/60 border-violet-200',
        };
      case 'Software Architecture':
        return {
          text: 'text-teal-800',
          bar: 'bg-teal-600',
          cardBg: 'bg-gradient-to-b from-teal-50/70 via-white to-emerald-50/60 border-teal-200',
        };
      case 'Quantum Computing':
        return {
          text: 'text-amber-800',
          bar: 'bg-amber-600',
          cardBg: 'bg-gradient-to-b from-amber-50/70 via-white to-orange-50/60 border-amber-200',
        };
      default:
        return {
          text: 'text-[#0F4C81]',
          bar: 'bg-[#0F4C81]',
          cardBg: 'bg-white border-slate-200',
        };
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-6 pb-20 pt-8">
      {/* Editorial 2-Column Hero on Multi-Tone Surface */}
      <section className="grid grid-cols-1 items-stretch gap-8 rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-indigo-50/70 to-emerald-50/60 p-6 sm:p-10 lg:grid-cols-12">
        <div className="flex flex-col justify-between py-1 lg:col-span-6">
          <div>
            <p className="text-sm font-semibold text-[#0F4C81]">
              Engineering &amp; Applied Sciences Curriculum
            </p>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Rigorous technical mastery, guided by live coaching.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-700">
              Study university-grade curricula across distributed systems, mathematical machine
              learning, software architecture, and quantum hardware—paired with real-time AI
              tutoring, automated assessments, and cryptographically verifiable credentials.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#course-catalog"
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F4C81] px-5 py-3 text-sm font-medium text-white hover:bg-[#0c3c66] transition-colors whitespace-nowrap shrink-0"
            >
              Explore Curriculum
              <ArrowRight className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={onOpenVerify}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Verify a Certificate
            </button>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="relative h-72 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 sm:h-88 lg:h-full lg:min-h-[360px]">
            {!failedImages['hero'] ? (
              <img
                src="/src/assets/images/hero_academy_studio_1794298061900.jpg"
                alt="Sunlit university seminar library with students studying architectural notes"
                referrerPolicy="no-referrer"
                onError={() => setFailedImages((prev) => ({ ...prev, hero: true }))}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 p-8 text-center text-slate-200">
                <BookOpen className="h-10 w-10 text-sky-400" />
                <p className="mt-3 font-display text-lg">Meridian Seminar Library</p>
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between text-xs text-white/90">
              <span>Cohort Term 2026</span>
              <span aria-hidden="true">·</span>
              <span>Interactive Classroom &amp; Graded Verification</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Distinct Multi-Color Insight Cards */}
      <section className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-100/70 p-6">
          <p className="text-xs font-semibold text-sky-800">Interactive Classroom</p>
          <p className="mt-2 font-display text-lg font-semibold text-slate-900 tabular-nums">
            Split-Screen AI Coach
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
            Streaming Markdown guidance grounded directly in each lesson&apos;s notes.
          </p>
        </div>
        <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-100/70 p-6">
          <p className="text-xs font-semibold text-violet-800">Assessment Engine</p>
          <p className="mt-2 font-display text-lg font-semibold text-slate-900 tabular-nums">
            Instant Auto-Grading
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
            Immediate rubric evaluation with per-question explanations and progress sync.
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100/70 p-6">
          <p className="text-xs font-semibold text-amber-800">Media Protection</p>
          <p className="mt-2 font-display text-lg font-semibold text-slate-900 tabular-nums">
            15-Minute Signed URLs
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
            Time-limited upload and playback credentials prevent unauthorized direct linking.
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-100/70 p-6">
          <p className="text-xs font-semibold text-emerald-800">Credentials</p>
          <p className="mt-2 font-display text-lg font-semibold text-slate-900 tabular-nums">
            SHA-256 Verification
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
            Cryptographic completion certificates issued automatically at 100% progress.
          </p>
        </div>
      </section>

      {/* Catalog Search & Category Filter */}
      <section id="course-catalog" className="mt-14">
        <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-display text-3xl font-semibold text-slate-900">
              Course Catalog
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Select a course to enter the split-screen classroom and earn a verified credential.
            </p>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search courses or topics..."
              aria-label="Search courses"
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:outline-none focus:ring-1 focus:ring-[#0F4C81]"
            />
          </div>
        </div>

        {/* Interactive Segmented Filter Controls */}
        <div className="mt-5 flex flex-wrap items-center gap-1.5 rounded-lg bg-white border border-slate-200 p-1 w-fit">
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => onSelectCategory(cat)}
                className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#0F4C81] text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white p-6"
              />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-12 text-center">
            <p className="font-display text-lg font-medium text-slate-900">
              No courses match your current filter
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Clear your search query or switch back to All categories.
            </p>
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                onSelectCategory('All');
              }}
              className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {courses.map((course) => {
              const enrolled = course.userEnrollment !== null;
              const progress = course.userEnrollment?.progressPercent ?? 0;
              const palette = getCategoryPalette(course.category);

              return (
                <article
                  key={course.id}
                  className={`flex flex-col overflow-hidden rounded-xl border transition-colors hover:border-slate-400 ${palette.cardBg}`}
                >
                  <div className={`h-1.5 w-full ${palette.bar}`} />
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-900">
                    {!failedImages[`c-${course.id}`] ? (
                      <img
                        src={course.thumbnailUrl}
                        alt={course.title}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [`c-${course.id}`]: true }))
                        }
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 p-6 text-slate-200">
                        <BookOpen className="h-8 w-8 text-sky-400" />
                        <span className="mt-2 text-sm font-medium">{course.category}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col justify-between p-6">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className={`font-semibold ${palette.text}`}>
                          {course.category}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{course.level}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{course.durationHours} hrs</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{course.lessonCount} lessons</span>
                      </div>

                      <h3 className="mt-2.5 font-display text-xl font-semibold text-slate-900">
                        {course.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-700">
                        {course.subtitle}
                      </p>
                    </div>

                    <div className="mt-6 border-t border-slate-200/70 pt-4">
                      {enrolled && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-[11px] font-medium text-slate-700 mb-1">
                            <span>Course Progress</span>
                            <span className="font-mono tabular-nums">{progress}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full transition-all ${
                                progress === 100 ? 'bg-emerald-600' : palette.bar
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-slate-900">
                            {course.instructorName}
                          </p>
                          <p className="text-xs text-slate-600 tabular-nums">
                            {course.enrolledCount} enrolled learners
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onOpenCourse(course.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F4C81] px-4 py-2 text-xs font-medium text-white hover:bg-[#0c3c66] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {enrolled ? (
                            progress === 100 ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Review Course
                              </>
                            ) : (
                              <>Resume ({progress}%)</>
                            )
                          ) : (
                            <>Open Classroom</>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
