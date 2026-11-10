import React, { useState } from 'react';
import { Award, CheckCircle2, Search, ShieldAlert, X } from 'lucide-react';
import type { CertificateRecord } from '../types';

export function CertificateModal({
  certificate,
  onClose,
  onVerifyHash,
}: {
  certificate: CertificateRecord | null;
  onClose: () => void;
  onVerifyHash: (hash: string) => void;
}) {
  if (!certificate) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-[#0F4C81]">
            <Award className="h-5 w-5" />
            <span className="text-xs font-semibold tracking-wide">
              MERIDIAN ACADEMY CREDENTIAL
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close certificate"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 border border-slate-200 bg-slate-50/70 p-8 text-center rounded-lg">
          <p className="text-xs font-medium text-slate-500">Certificate of Completion</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-slate-900">
            {certificate.recipientName}
          </h2>
          <p className="mt-3 text-sm text-slate-600">
            has successfully completed all lectures and graded assessments for
          </p>
          <p className="mt-2 font-display text-xl font-semibold text-[#0F4C81]">
            {certificate.courseTitle}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-600">
            <span className="tabular-nums">
              Final Score: <strong className="text-slate-900">{certificate.finalScore}%</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              Issued:{' '}
              <strong className="text-slate-900">
                {new Date(certificate.issuedAt).toLocaleDateString()}
              </strong>
            </span>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="text-[11px] font-medium text-slate-500">
              Cryptographic Verification Hash · Platform Developed by Bizimana Fabrice
            </p>
            <p className="mt-1 font-mono text-xs font-semibold text-slate-900 select-all">
              {certificate.verificationHash}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onVerifyHash(certificate.verificationHash);
            }}
            className="rounded-lg bg-[#0F4C81] px-4 py-2 text-xs font-medium text-white hover:bg-[#0c3c66] cursor-pointer"
          >
            Open Public Verification Record
          </button>
        </div>
      </div>
    </div>
  );
}

export function CertificateVerifyView({
  initialHash = '',
  userCertificates,
}: {
  initialHash?: string;
  userCertificates: CertificateRecord[];
}) {
  const [hashInput, setHashInput] = useState(initialHash);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{
    valid: boolean;
    certificate?: {
      verificationHash: string;
      recipientName: string;
      courseTitle: string;
      finalScore: number;
      issuedAt: string;
      courseCategory: string;
      instructorName: string;
    };
    error?: string;
  } | null>(null);

  const runVerification = async (targetHash: string) => {
    const clean = targetHash.trim();
    if (!clean) return;
    setChecking(true);
    setResult(null);
    try {
      const res = await fetch(`/api/certificates/verify/${encodeURIComponent(clean)}`);
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ valid: false, error: 'Network error while verifying hash.' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 pb-20 pt-12">
      <h1 className="font-display text-3xl font-semibold text-slate-900">
        Cryptographic Credential Verification
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Enter a Meridian Academy SHA-256 verification hash (format{' '}
        <code className="font-mono text-xs">MA-XXXXXXXX-XXXXXXXXXXXXXXXX</code>) to validate
        learner completion against the PostgreSQL credential registry.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runVerification(hashInput);
        }}
        className="mt-6 flex gap-3"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={hashInput}
            onChange={(e) => setHashInput(e.target.value)}
            placeholder="Paste verification hash (e.g., MA-7A19F0B2-...)"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 font-mono text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={checking || !hashInput.trim()}
          className="rounded-lg bg-[#0F4C81] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#0c3c66] cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          {checking ? 'Verifying...' : 'Verify Hash'}
        </button>
      </form>

      {result && (
        <div
          className={`mt-6 rounded-xl border p-6 ${
            result.valid && result.certificate
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-red-200 bg-red-50'
          }`}
        >
          {result.valid && result.certificate ? (
            <div className="space-y-3 text-emerald-950">
              <div className="flex items-center gap-2 font-semibold text-emerald-800">
                <CheckCircle2 className="h-5 w-5" />
                <span>Verified Authentic Credential</span>
              </div>
              <div className="grid grid-cols-1 gap-3 border-t border-emerald-200 pt-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-emerald-700">Recipient</p>
                  <p className="font-semibold">{result.certificate.recipientName}</p>
                </div>
                <div>
                  <p className="text-xs text-emerald-700">Course Completed</p>
                  <p className="font-semibold">{result.certificate.courseTitle}</p>
                </div>
                <div>
                  <p className="text-xs text-emerald-700">Faculty Lead</p>
                  <p className="font-medium">{result.certificate.instructorName}</p>
                </div>
                <div>
                  <p className="text-xs text-emerald-700">Final Assessment Score</p>
                  <p className="font-mono font-semibold tabular-nums">
                    {result.certificate.finalScore}%
                  </p>
                </div>
              </div>
              <p className="font-mono text-xs text-emerald-800">
                Hash: {result.certificate.verificationHash}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-medium text-red-900">
              <ShieldAlert className="h-5 w-5 text-red-700" />
              <span>{result.error || 'Certificate hash could not be verified.'}</span>
            </div>
          )}
        </div>
      )}

      {userCertificates.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Your Earned Credentials
          </h2>
          <div className="mt-3 space-y-3">
            {userCertificates.map((cert) => (
              <div
                key={cert.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium text-slate-900">{cert.courseTitle}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">
                    {cert.verificationHash}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHashInput(cert.verificationHash);
                    runVerification(cert.verificationHash);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  Verify Now
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
