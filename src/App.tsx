import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { CalendarView } from './components/CalendarView';
import { NoteEditorModal } from './components/NoteEditorModal';
import { SearchModal } from './components/SearchModal';
import { PublicBlogView } from './components/PublicBlogView';
import { SettingsModal } from './components/SettingsModal';
import { LoginScreen } from './components/LoginScreen';
import { ToastContainer, ToastMessage } from './components/Toast';
import { JournalEntry, ReminderSettings, StorageConfig } from './types';
import {
  loadLocalEntries,
  saveLocalEntries,
  loadReminderSettings,
  saveReminderSettings,
  loadConfig,
  saveConfig,
  calculateStreak,
  persistEntryToCloud,
  deleteEntryFromCloud,
} from './services/storage';
import { formatDateToIso } from './services/markdown';
import { 
  checkAndTriggerReminder, 
  syncReminders, 
  cancelTodayPendingNotification,
  cancelAllPendingNotifications,
  initForegroundResumeListener 
} from './services/notifications';
import { getCurrentUser, logoutUser } from './services/auth';

export default function App() {
  const [entries, setEntries] = useState<JournalEntry[]>(() => loadLocalEntries());
  const [config, setConfig] = useState<StorageConfig>(() => loadConfig());
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(() => loadReminderSettings());

  // Authentication state
  const [authUser, setAuthUser] = useState<string | null>(() => getCurrentUser());

  // Views & Modals state
  const [currentView, setCurrentView] = useState<'calendar' | 'blog'>('calendar');
  const [publicBlogSlug, setPublicBlogSlug] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isEditorReadOnly, setIsEditorReadOnly] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chronos_theme') !== 'light';
    }
    return true;
  });

  // Calculate writing streaks
  const streak = useMemo(() => calculateStreak(entries), [entries]);

  // Public posts count
  const publicPostsCount = useMemo(() => entries.filter(e => e.isPublic).length, [entries]);

  // Toast dispatcher
  const showToast = useCallback((title: string, description?: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, title, description, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Theme toggle
  const toggleTheme = useCallback(() => {
    setIsDarkMode(prev => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('chronos_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('chronos_theme', 'light');
      }
      return next;
    });
  }, []);

  // Sync theme with DOM on mount
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Login handler
  const handleLogin = (userId: string) => {
    setAuthUser(userId);
    showToast(`Welcome, ${userId}!`, 'Your calendar journal is ready.', 'success');
  };

  // Logout handler
  const handleLogout = () => {
    logoutUser();
    setAuthUser(null);
    setIsEditorOpen(false);
    setIsSearchOpen(false);
    setIsSettingsOpen(false);
    showToast('Logged out', 'You have been safely signed out.', 'info');
  };

  // URL Hash Routing support (e.g. #/blog/:slug, #/blog, #/today, #/calendar)
  const handleHashChange = useCallback(() => {
    const hash = window.location.hash || '';

    if (hash.startsWith('#/blog/')) {
      const slug = hash.replace('#/blog/', '').trim();
      setCurrentView('blog');
      setPublicBlogSlug(slug);
      setIsEditorOpen(false);
    } else if (hash === '#/blog') {
      setCurrentView('blog');
      setPublicBlogSlug('');
      setIsEditorOpen(false);
    } else if (hash === '#/today') {
      const todayIso = formatDateToIso(new Date());
      setSelectedDate(todayIso);
      setIsEditorReadOnly(false);
      setIsEditorOpen(true);
      setCurrentView('calendar');
    } else {
      setCurrentView('calendar');
      setPublicBlogSlug('');
    }
  }, []);

  useEffect(() => {
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [handleHashChange]);

  // Keyboard shortcut listener (Cmd/Ctrl + K for search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (authUser) {
          setIsSearchOpen(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authUser]);

  // Time-based Daily Reminder polling loop & Native schedule syncing
  useEffect(() => {
    if (!authUser) return;

    const todayIso = formatDateToIso(new Date());
    const hasTodayEntry = entries.some(e => e.date === todayIso && e.content && e.content.trim().length > 0);

    // Sync native 7-day schedule (or cancel today if already written)
    syncReminders(reminderSettings, hasTodayEntry);

    const checkReminder = () => {
      try {
        checkAndTriggerReminder(
          reminderSettings,
          hasTodayEntry,
          (title, message) => {
            showToast(title, message, 'info');
            const updatedSettings = {
              ...reminderSettings,
              lastNotifiedDate: todayIso,
            };
            setReminderSettings(updatedSettings);
            saveReminderSettings(updatedSettings);
          }
        );
      } catch (err) {
        console.warn('Error in checkReminder:', err);
      }
    };

    // Check immediately and on a regular 25s interval (single timer cleaned up on unmount)
    checkReminder();
    const interval = setInterval(checkReminder, 25000);
    return () => clearInterval(interval);
  }, [authUser, reminderSettings, entries, showToast]);

  // When app returns to foreground, re-check permissions and schedule next 7 days if granted
  useEffect(() => {
    if (!authUser) return;

    const cleanup = initForegroundResumeListener(async (isGranted) => {
      if (isGranted && reminderSettings.enabled) {
        const todayIso = formatDateToIso(new Date());
        const hasTodayEntry = entries.some(e => e.date === todayIso && e.content && e.content.trim().length > 0);
        syncReminders(reminderSettings, hasTodayEntry).catch(e => {
          console.warn('Foreground sync error:', e);
        });
      }
    });

    return () => cleanup();
  }, [authUser, reminderSettings, entries]);

  // Handlers for Navigation
  const navigateToView = (view: 'calendar' | 'blog') => {
    setCurrentView(view);
    if (view === 'calendar') {
      window.location.hash = '#/';
      setPublicBlogSlug('');
    } else {
      window.location.hash = '#/blog';
    }
  };

  // Open Today - Always editable
  const handleOpenToday = () => {
    const todayIso = formatDateToIso(new Date());
    setSelectedDate(todayIso);
    setIsEditorReadOnly(false);
    setIsEditorOpen(true);
  };

  // Date Selection Rule: Past dates are read-only, future dates locked, today editable
  const handleSelectDate = (dateStr: string) => {
    const todayIso = formatDateToIso(new Date());

    if (dateStr > todayIso) {
      showToast(
        'Future Date Locked',
        "Future dates cannot be edited until that day arrives. You can only write today's journal entry.",
        'info'
      );
      return;
    }

    if (dateStr < todayIso) {
      // Past dates are no longer locked out - open note modal in read-only mode
      setSelectedDate(dateStr);
      setIsEditorReadOnly(true);
      setIsEditorOpen(true);
      return;
    }

    // Today's entry is fully editable
    setSelectedDate(dateStr);
    setIsEditorReadOnly(false);
    setIsEditorOpen(true);
  };

  // Save entry handler - Enforces today-only editing
  const handleSaveEntry = (entry: JournalEntry) => {
    const todayIso = formatDateToIso(new Date());

    if (isEditorReadOnly || entry.date !== todayIso) {
      showToast('Action Blocked', "Only today's entry can be created or updated.", 'error');
      return;
    }

    setEntries(prev => {
      const index = prev.findIndex(e => e.date === entry.date);
      let updated: JournalEntry[];
      if (index >= 0) {
        updated = [...prev];
        updated[index] = entry;
      } else {
        updated = [entry, ...prev];
      }
      saveLocalEntries(updated);
      return updated;
    });

    // When today's entry is saved with content, cancel today's pending notification & re-fill 7-day schedule
    if (entry.content && entry.content.trim().length > 0) {
      try {
        cancelTodayPendingNotification();
        syncReminders(reminderSettings, true).then(res => {
          if (!res.success && res.error) {
            showToast('Reminder Notice', res.error, 'error');
          }
        }).catch(err => {
          showToast('Reminder Error', err?.message || 'Could not update reminder schedule', 'error');
        });
      } catch (err: any) {
        showToast('Reminder Error', err?.message || 'Could not update reminder schedule', 'error');
      }
    }

    // Cloud sync if enabled
    if (config.provider === 'supabase') {
      persistEntryToCloud(config, entry).catch(err => {
        console.warn('Background cloud persist error:', err);
      });
    }
  };

  // Delete entry handler
  const handleDeleteEntry = (entryId: string, date: string) => {
    const todayIso = formatDateToIso(new Date());

    if (isEditorReadOnly || date !== todayIso) {
      showToast('Action Blocked', "Historical entries are locked and cannot be deleted.", 'error');
      return;
    }

    setEntries(prev => {
      const updated = prev.filter(e => e.date !== date && e.id !== entryId);
      saveLocalEntries(updated);
      return updated;
    });

    if (config.provider === 'supabase') {
      deleteEntryFromCloud(config, entryId).catch(err => {
        console.warn('Background cloud delete error:', err);
      });
    }

    showToast('Entry Deleted', 'The journal entry for today was removed.', 'info');
  };

  // Save Settings Handlers
  const handleSaveReminders = (newSettings: ReminderSettings) => {
    setReminderSettings(newSettings);
    saveReminderSettings(newSettings);
    const todayIso = formatDateToIso(new Date());
    const hasTodayEntry = entries.some(e => e.date === todayIso && e.content && e.content.trim().length > 0);
    setTimeout(() => {
      if (!newSettings.enabled) {
        cancelAllPendingNotifications().catch(e => console.warn('Cancel error:', e));
      } else {
        syncReminders(newSettings, hasTodayEntry)
          .then(res => {
            if (!res.success && res.error) {
              showToast('Reminder Notice', res.error, 'error');
            }
          })
          .catch(err => {
            showToast('Reminder Sync Error', err?.message || 'Could not schedule native reminders', 'error');
          });
      }
    }, 50);
  };

  const handleSaveConfig = (newConfig: StorageConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  const handleImportEntries = (imported: JournalEntry[]) => {
    setEntries(imported);
    saveLocalEntries(imported);
  };

  // Find active entry for editor
  const activeEntry = useMemo(() => {
    if (!selectedDate) return null;
    return entries.find(e => e.date === selectedDate) || null;
  }, [selectedDate, entries]);

  // If unauthenticated and NOT viewing a public blog post, show the LoginScreen
  if (!authUser && currentView !== 'blog') {
    return (
      <div className="min-h-screen bg-slate-100/60 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
        <LoginScreen onLogin={handleLogin} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/60 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-700 dark:selection:text-emerald-300">
      {/* 3-Zone Top Navigation Contract */}
      <Header
        currentView={currentView}
        onNavigate={navigateToView}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenToday={handleOpenToday}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        publicPostsCount={publicPostsCount}
        user={authUser}
        onLogout={authUser ? handleLogout : undefined}
      />

      {/* Main View Area */}
      <main className="flex-1">
        {currentView === 'calendar' ? (
          <CalendarView
            entries={entries}
            config={config}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            streak={streak}
          />
        ) : (
          <PublicBlogView
            slug={publicBlogSlug}
            entries={entries}
            config={config}
            onNavigateHome={() => {
              if (authUser) {
                navigateToView('calendar');
              } else {
                window.location.hash = '#/';
                setCurrentView('calendar');
              }
            }}
            onSelectPost={(slug) => {
              setPublicBlogSlug(slug);
              window.location.hash = slug ? `#/blog/${slug}` : '#/blog';
            }}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* Date-Anchored Note Editor Modal */}
      {selectedDate && (
        <NoteEditorModal
          isOpen={isEditorOpen}
          dateStr={selectedDate}
          initialEntry={activeEntry}
          isReadOnly={isEditorReadOnly}
          onClose={() => setIsEditorOpen(false)}
          onSave={handleSaveEntry}
          onDelete={handleDeleteEntry}
          onShowToast={showToast}
          onOpenPublicPost={(slug) => {
            setCurrentView('blog');
            setPublicBlogSlug(slug);
            window.location.hash = `#/blog/${slug}`;
          }}
        />
      )}

      {/* Full-Text Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        entries={entries}
        onClose={() => setIsSearchOpen(false)}
        onSelectEntry={(dateStr) => {
          const todayIso = formatDateToIso(new Date());
          if (dateStr > todayIso) {
            showToast('Future Date Locked', 'You can only write journal entries for today.', 'info');
            return;
          }
          setSelectedDate(dateStr);
          setIsEditorReadOnly(dateStr < todayIso);
          setIsEditorOpen(true);
        }}
      />

      {/* Settings & Configuration Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        reminderSettings={reminderSettings}
        config={config}
        entries={entries}
        onClose={() => setIsSettingsOpen(false)}
        onSaveReminders={handleSaveReminders}
        onSaveConfig={handleSaveConfig}
        onImportEntries={handleImportEntries}
        onShowToast={showToast}
      />

      {/* Toast Notification Container (Centered at bottom) */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Quiet, minimalist footer */}
      <footer className="py-6 border-t border-slate-200/60 dark:border-slate-900 text-center text-xs text-slate-400 dark:text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>Chronos · Calendar Journal, Daily Reminders &amp; Public Publishing</p>
          <div className="flex items-center gap-4">
            {authUser ? (
              <>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  Configure Reminders
                </button>
                <span aria-hidden="true">·</span>
                <button
                  onClick={handleLogout}
                  className="hover:text-rose-500 transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  window.location.hash = '#/';
                  setCurrentView('calendar');
                }}
                className="hover:text-emerald-500 transition-colors"
              >
                Sign In
              </button>
            )}
            <span aria-hidden="true">·</span>
            <button
              onClick={() => navigateToView('blog')}
              className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              Public Blog
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
