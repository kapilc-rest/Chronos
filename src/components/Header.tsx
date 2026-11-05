import React from 'react';
import { Calendar, Search, Globe, Settings, Moon, Sun, PenSquare, LogOut, Download } from 'lucide-react';
import { usePWAInstall } from '../usePWAInstall';

interface HeaderProps {
  currentView: 'calendar' | 'blog' | 'entry';
  onNavigate: (view: 'calendar' | 'blog') => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenToday: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  publicPostsCount: number;
  user?: string | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  onOpenSearch,
  onOpenSettings,
  onOpenToday,
  isDarkMode,
  onToggleTheme,
  publicPostsCount,
  user,
  onLogout,
}) => {
  const { isInstallable, install } = usePWAInstall();
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark (Single text element) */}
        <button
          onClick={() => onNavigate('calendar')}
          className="text-lg font-bold font-display tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
          <span>Chronos</span>
        </button>

        {/* Zone 2: 4-5 Clean single-line nav links */}
        <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          <button
            onClick={() => onNavigate('calendar')}
            className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              currentView === 'calendar'
                ? 'text-emerald-600 dark:text-emerald-400 font-semibold border-b-2 border-emerald-500'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Calendar</span>
          </button>

          <button
            onClick={onOpenSearch}
            className="flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 group"
          >
            <Search className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200" />
            <span>Search</span>
            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
              ⌘K
            </kbd>
          </button>

          <button
            onClick={() => onNavigate('blog')}
            className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              currentView === 'blog'
                ? 'text-emerald-600 dark:text-emerald-400 font-semibold border-b-2 border-emerald-500'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Public Blog</span>
            {publicPostsCount > 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">
                ({publicPostsCount})
              </span>
            )}
          </button>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action + Theme Toggle + Logout */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isInstallable && (
            <button
              onClick={install}
              className="px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Install Chronos Journal to your home screen or desktop"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Install App</span>
            </button>
          )}

          <button
            onClick={onToggleTheme}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
              title={`Logged in as ${user || 'User'}. Click to Logout`}
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onOpenToday}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 rounded-lg shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PenSquare className="w-3.5 h-3.5" />
            <span>Today's Journal</span>
          </button>
        </div>
      </div>
    </header>
  );
};
