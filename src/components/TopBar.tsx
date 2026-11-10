import React from 'react';
import type { UserProfile } from '../types';

export type AppView = 'catalog' | 'classroom' | 'instructor' | 'verify';

interface TopBarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  user: UserProfile | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
}

export function TopBar({
  activeView,
  onNavigate,
  user,
  onOpenAuth,
  onSignOut,
}: TopBarProps) {
  const navItems: Array<{ id: AppView; label: string }> = [
    { id: 'catalog', label: 'Catalog' },
    { id: 'classroom', label: 'Classroom' },
    { id: 'instructor', label: 'Instructor Studio' },
    { id: 'verify', label: 'Verify Credential' },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
        <button
          type="button"
          onClick={() => onNavigate('catalog')}
          className="font-display text-xl font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 rounded-sm"
        >
          Meridian Academy
        </button>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 rounded-sm ${
                  isActive
                    ? 'text-slate-900 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-[#0F4C81]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-sm text-slate-600 whitespace-nowrap shrink-0">
                {user.name}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0F4C81] hover:bg-[#0c3c66] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
