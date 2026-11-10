import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import { CatalogView } from './components/CatalogView';
import {
  CertificateModal,
  CertificateVerifyView,
} from './components/CertificateVerifyView';
import { ClassroomView } from './components/ClassroomView';
import { InstructorStudioView } from './components/InstructorStudioView';
import { type AppView, TopBar } from './components/TopBar';
import type { CertificateRecord, CourseSummary } from './types';

function MeridianAppShell() {
  const { user, certificates, authFetch, signOut } = useAuth();
  const [activeView, setActiveView] = useState<AppView>('catalog');
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const [activeCourseId, setActiveCourseId] = useState<number | null>(null);
  const [modalCertificate, setModalCertificate] = useState<CertificateRecord | null>(null);
  const [verifyHashPrefill, setVerifyHashPrefill] = useState('');

  const fetchCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (selectedCategory && selectedCategory !== 'All') {
        params.set('category', selectedCategory);
      }
      const queryStr = params.toString();
      const res = await authFetch(`/api/courses${queryStr ? `?${queryStr}` : ''}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load catalog');
      }
      setCourses(data.courses ?? []);
      setActiveCourseId((prev) =>
        prev ?? (data.courses && data.courses.length > 0 ? data.courses[0].id : null)
      );
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Unable to load courses');
    } finally {
      setCatalogLoading(false);
    }
  }, [authFetch, searchQuery, selectedCategory]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCatalog();
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchCatalog, user?.id]);

  const handleOpenCourse = (courseId: number) => {
    setActiveCourseId(courseId);
    setActiveView('classroom');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/45 to-indigo-50/40 text-slate-900">
      <TopBar
        activeView={activeView}
        onNavigate={(view) => {
          setActiveView(view);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        user={user}
        onOpenAuth={() => setAuthModalOpen(true)}
        onSignOut={signOut}
      />

      {activeView === 'catalog' && (
        <CatalogView
          courses={courses}
          loading={catalogLoading}
          error={catalogError}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onOpenCourse={handleOpenCourse}
          onOpenVerify={() => setActiveView('verify')}
        />
      )}

      {activeView === 'classroom' && activeCourseId !== null && (
        <ClassroomView
          courseId={activeCourseId}
          onBackToCatalog={() => setActiveView('catalog')}
          onRequireAuth={() => setAuthModalOpen(true)}
          onViewCertificate={(cert) => setModalCertificate(cert)}
        />
      )}

      {activeView === 'classroom' && activeCourseId === null && (
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <p className="text-sm text-slate-600">Select a course from the catalog to start learning.</p>
          <button
            type="button"
            onClick={() => setActiveView('catalog')}
            className="mt-4 rounded-lg bg-[#0F4C81] px-4 py-2 text-sm font-medium text-white cursor-pointer"
          >
            Browse Catalog
          </button>
        </div>
      )}

      {activeView === 'instructor' && (
        <InstructorStudioView
          onRequireAuth={() => setAuthModalOpen(true)}
          onCourseCreated={fetchCatalog}
        />
      )}

      {activeView === 'verify' && (
        <CertificateVerifyView
          initialHash={verifyHashPrefill}
          userCertificates={certificates}
        />
      )}

      <footer className="border-t border-slate-800 bg-gradient-to-r from-slate-900 via-[#0d2847] to-slate-900 text-slate-300">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="md:col-span-6">
              <p className="font-display text-xl font-semibold text-white">
                Meridian Academy
              </p>
              <p className="mt-2 text-sm text-sky-200">
                Meridian School of Engineering &amp; Applied Sciences · Developed by Bizimana Fabrice
              </p>
              <p className="mt-3 max-w-md text-xs leading-relaxed text-slate-400">
                University-grade engineering curricula featuring split-screen AI lesson coaching,
                instant rubric auto-grading, 15-minute signed media delivery, and SHA-256
                verifiable academic credentials.
              </p>
            </div>

            <div className="md:col-span-3">
              <h3 className="text-xs font-semibold text-white">Platform Navigation</h3>
              <ul className="mt-3 space-y-2 text-xs">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('catalog');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Course Catalog
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('classroom');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Learner Classroom
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('instructor');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Instructor Studio
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('verify');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Verify Credentials
                  </button>
                </li>
              </ul>
            </div>

            <div className="md:col-span-3">
              <h3 className="text-xs font-semibold text-white">Academic Disciplines</h3>
              <ul className="mt-3 space-y-2 text-xs text-slate-300">
                <li className="text-sky-300">Systems Engineering</li>
                <li className="text-violet-300">Machine Learning</li>
                <li className="text-teal-300">Software Architecture</li>
                <li className="text-amber-300">Quantum Computing</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-800/80 pt-6 text-xs text-slate-400 sm:flex-row">
            <span>
              Meridian School of Engineering &amp; Applied Sciences · Developed by Bizimana Fabrice
            </span>
            <span>Cohort Term 2026</span>
          </div>
        </div>
      </footer>

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      <CertificateModal
        certificate={modalCertificate}
        onClose={() => setModalCertificate(null)}
        onVerifyHash={(hash) => {
          setVerifyHashPrefill(hash);
          setActiveView('verify');
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MeridianAppShell />
    </AuthProvider>
  );
}
