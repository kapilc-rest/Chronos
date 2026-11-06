import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Bell, 
  Volume2, 
  Database, 
  User, 
  Download, 
  Upload, 
  Check, 
  Copy, 
  Play, 
  AlertCircle,
  Smartphone,
  Globe,
  FileText,
  ExternalLink
} from 'lucide-react';
import { usePWAInstall } from '../usePWAInstall';
import { ReminderSettings, StorageConfig, JournalEntry } from '../types';
import { 
  getNativeDebugInfo,
  nativeDirectRequestPermission,
  openAndroidNotificationSettings,
  cancelAllPendingNotifications,
  initForegroundResumeListener,
  requestExactAlarmSettings,
  scheduleNative7DayReminders,
  isNotificationSupported, 
  playHarmonicChime,
  triggerBrowserNotification,
  isNativePlatform,
} from '../services/notifications';
import { 
  formatDateToIso,
  calculateWordCount,
  calculateReadingTime,
  generateSlug
} from '../services/markdown';
import { SUPABASE_SQL_SCHEMA, syncWithSupabase } from '../services/storage';

interface SettingsModalProps {
  isOpen: boolean;
  reminderSettings: ReminderSettings;
  config: StorageConfig;
  entries: JournalEntry[];
  onClose: () => void;
  onSaveReminders: (settings: ReminderSettings) => void;
  onSaveConfig: (config: StorageConfig) => void;
  onImportEntries: (imported: JournalEntry[]) => void;
  onShowToast: (title: string, description?: string, type?: 'success' | 'error' | 'info') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  reminderSettings,
  config,
  entries,
  onClose,
  onSaveReminders,
  onSaveConfig,
  onImportEntries,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'reminders' | 'cloud' | 'profile' | 'backup'>('reminders');
  const [reminders, setReminders] = useState<ReminderSettings>(reminderSettings);
  const [cfg, setCfg] = useState<StorageConfig>(config);
  const [notificationPermission, setNotificationPermission] = useState<string>('default');
  const [rawPermValue, setRawPermValue] = useState<string>('prompt');
  const [hasAttemptedRequestWhileDenied, setHasAttemptedRequestWhileDenied] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | undefined>(undefined);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  // Native debug status state
  const [nativeDebug, setNativeDebug] = useState<{
    isNative: boolean;
    notificationPermission: string;
    rawPermission: string;
    exactAlarmPermission: string;
    isExactAlarmSupported: boolean;
    pendingCount: number;
    nextScheduledTime?: string;
    lastError?: string;
  }>({
    isNative: isNativePlatform(),
    notificationPermission: 'default',
    rawPermission: 'prompt',
    exactAlarmPermission: 'granted',
    isExactAlarmSupported: false,
    pendingCount: 0,
  });

  const todayIso = useMemo(() => formatDateToIso(new Date()), []);
  const hasTodayEntry = useMemo(() => {
    return entries.some(e => e.date === todayIso && e.content && e.content.trim().length > 0);
  }, [entries, todayIso]);

  const refreshDebugInfo = async () => {
    try {
      const debug = await getNativeDebugInfo();
      setNativeDebug(debug);
      setNotificationPermission(debug.notificationPermission);
      setRawPermValue(debug.rawPermission);
      if (debug.rawPermission === 'granted') {
        setHasAttemptedRequestWhileDenied(false);
      }
      if (debug.lastError) {
        setLastError(debug.lastError);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setLastError(msg);
      console.warn('Could not refresh native debug info:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setReminders(reminderSettings);
      setCfg(config);
      refreshDebugInfo();
    }
  }, [isOpen, reminderSettings, config]);

  // Foreground resume listener via @capacitor/app appStateChange
  // When user returns from Android Settings, re-check permissions and update UI automatically,
  // and schedule next 7 days if granted!
  useEffect(() => {
    if (!isOpen) return;

    const cleanup = initForegroundResumeListener(async (isGranted, rawStatus) => {
      setNotificationPermission(rawStatus);
      setRawPermValue(rawStatus);
      if (isGranted) {
        setHasAttemptedRequestWhileDenied(false);
        if (reminders.enabled) {
          scheduleNative7DayReminders(reminders, hasTodayEntry).catch(e => {
            console.warn('Foreground schedule error:', e);
          });
        }
      }
      await refreshDebugInfo().catch(() => {});
    });

    return () => cleanup();
  }, [isOpen, reminders.enabled, hasTodayEntry]);

  if (!isOpen) return null;

  // Open Android system notification settings via capacitor-native-settings
  const handleOpenAndroidSettings = async () => {
    try {
      const res = await openAndroidNotificationSettings();
      if (!res.success) {
        onShowToast('Settings Navigation', 'Settings > Apps > Chronos > Notifications', 'info');
      }
    } catch {
      onShowToast('Settings Navigation', 'Settings > Apps > Chronos > Notifications', 'info');
    }
  };

  // Requirement 1: Native Permission Request handling
  // If denied, call requestPermissions() once; if still denied without showing dialog,
  // replace button with "Open Android Settings" and short message.
  const handleRequestPermission = async () => {
    try {
      if (isNativePlatform()) {
        const res = await nativeDirectRequestPermission();
        setNotificationPermission(res.rawDisplay);
        setRawPermValue(res.rawDisplay);
        setLastError(undefined);

        if (res.granted) {
          setHasAttemptedRequestWhileDenied(false);
          onShowToast('Permission Granted', 'Notifications enabled for Chronos.', 'success');
          if (reminders.enabled) {
            scheduleNative7DayReminders(reminders, hasTodayEntry)
              .then(scheduleRes => {
                if (scheduleRes.success) {
                  onShowToast('Reminders Scheduled', `Next ${scheduleRes.scheduledCount} days scheduled in Android alarm manager.`, 'success');
                } else if (scheduleRes.error) {
                  setLastError(scheduleRes.error);
                  onShowToast('Scheduling Failed', scheduleRes.error, 'error');
                }
              })
              .catch(e => {
                const msg = e?.message || String(e);
                setLastError(msg);
                onShowToast('Scheduling Error', msg, 'error');
              });
          }
        } else {
          // Still denied without showing a system dialog
          setHasAttemptedRequestWhileDenied(true);
          onShowToast(
            'Notifications Blocked',
            'Notifications are blocked. Please enable them in Android Settings.',
            'info'
          );
        }
      } else {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          const perm = await Notification.requestPermission();
          setNotificationPermission(perm);
          setRawPermValue(perm);
          onShowToast('Permission Result', `Browser notification permission: "${perm}"`, perm === 'granted' ? 'success' : 'info');
        } else {
          onShowToast('Not Supported', 'Web Notification API is not supported in this browser.', 'info');
        }
      }
      await refreshDebugInfo().catch(() => {});
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      setLastError(errMsg);
      setHasAttemptedRequestWhileDenied(true);
      onShowToast('Permission Error', errMsg, 'error');
    }
  };

  // Requirement 2: Toggle Reminders
  // When turned OFF: cancel ALL pending native notifications with cancel / getPending, show toast "Reminders turned off"
  // When turned ON: reschedule the next 7 days
  const handleToggleReminders = async (enabled: boolean) => {
    const updated = { ...reminders, enabled };
    setReminders(updated);

    if (nativeDebug.isNative) {
      if (enabled) {
        try {
          if (rawPermValue !== 'granted') {
            const res = await nativeDirectRequestPermission();
            setNotificationPermission(res.rawDisplay);
            setRawPermValue(res.rawDisplay);
            if (!res.granted) {
              setHasAttemptedRequestWhileDenied(true);
            }
          }

          scheduleNative7DayReminders(updated, hasTodayEntry)
            .then(scheduleRes => {
              if (scheduleRes.success) {
                onShowToast('Reminders Scheduled', `Next ${scheduleRes.scheduledCount} days scheduled in Android alarm manager.`, 'success');
              } else if (scheduleRes.error) {
                setLastError(scheduleRes.error);
                onShowToast('Scheduling Failed', scheduleRes.error, 'error');
              }
            })
            .catch(err => {
              const msg = err?.message || String(err);
              setLastError(msg);
              onShowToast('Scheduling Error', msg, 'error');
            })
            .finally(() => {
              refreshDebugInfo().catch(() => {});
            });
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          setLastError(errMsg);
          onShowToast('Permission Error', errMsg, 'error');
        }
      } else {
        // Toggle OFF: cancel ALL pending native notifications and show toast "Reminders turned off"
        cancelAllPendingNotifications()
          .then(() => {
            onShowToast('Reminders turned off', undefined, 'info');
          })
          .catch(err => {
            const msg = err?.message || String(err);
            setLastError(msg);
            onShowToast('Cancel Error', msg, 'error');
          })
          .finally(() => {
            refreshDebugInfo().catch(() => {});
          });
      }
    }
  };

  // Open Android exact alarm settings
  const handleRequestExactAlarms = async () => {
    try {
      await requestExactAlarmSettings();
      await refreshDebugInfo();
      onShowToast('Alarm Settings', 'Please ensure Chronos is allowed to schedule exact alarms.', 'info');
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      setLastError(errMsg);
      onShowToast('Error', errMsg, 'error');
    }
  };

  // Test Notification & Chime (Immediate web/chime test)
  const handleTestNotification = () => {
    if (reminders.sound) {
      playHarmonicChime();
    }
    triggerBrowserNotification(
      'Daily Journal Reflection Test',
      'This is a sample alert! Your daily reminder is configured and working.'
    );
    onShowToast('Test Reminder Triggered', 'Harmonic chime played and notification triggered.', 'success');
  };

  // Non-blocking Save Preferences
  const handleSave = () => {
    onSaveReminders(reminders);
    onSaveConfig(cfg);
    onShowToast('Settings Saved', 'All preferences have been updated.', 'success');
    onClose();

    if (nativeDebug.isNative) {
      setTimeout(() => {
        if (!reminders.enabled) {
          cancelAllPendingNotifications().catch(e => console.warn('Cancel error:', e));
        } else {
          scheduleNative7DayReminders(reminders, hasTodayEntry)
            .then(scheduleRes => {
              if (!scheduleRes.success && scheduleRes.error) {
                setLastError(scheduleRes.error);
                onShowToast('Reminder Notice', scheduleRes.error, 'error');
              }
            })
            .catch(err => {
              const msg = err?.message || String(err);
              setLastError(msg);
              onShowToast('Native Scheduling Error', msg, 'error');
            });
        }
      }, 50);
    }
  };

  // Test Supabase Sync
  const handleTestCloudSync = async () => {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      onShowToast('Missing Credentials', 'Please enter your Supabase Project URL and Anon Key.', 'error');
      return;
    }
    setIsSyncing(true);
    const result = await syncWithSupabase(cfg, entries);
    setIsSyncing(false);
    if (result.success) {
      onShowToast('Supabase Connected!', 'Journal entries synchronized with your Cloud database.', 'success');
      if (result.entries) {
        onImportEntries(result.entries);
      }
    } else {
      onShowToast('Cloud Connection Failed', result.error || 'Please verify URL, key, and SQL table.', 'error');
    }
  };

  // Copy SQL Schema
  const handleCopySchema = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
      setCopiedSchema(true);
      onShowToast('SQL Schema Copied', 'Paste into your Supabase SQL Editor and run it.', 'success');
      setTimeout(() => setCopiedSchema(false), 2000);
    } catch {
      onShowToast('Failed to copy', undefined, 'error');
    }
  };

  // Export JSON
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(entries, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `chronos-journal-backup-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    onShowToast('Journal Exported', `${entries.length} entries saved as JSON file.`, 'success');
  };

  // Core Import & Merge logic by date
  const processAndMergeEntries = (parsed: any): boolean => {
    if (!Array.isArray(parsed)) {
      onShowToast('Invalid Format', 'Backup data must be a JSON array of journal entries.', 'error');
      return false;
    }

    const validItems = parsed.filter(
      item => item && typeof item === 'object' && typeof item.date === 'string' && typeof item.content === 'string'
    );

    if (validItems.length === 0) {
      onShowToast('Invalid Entries', 'No valid entries found. Each entry must have "date" (YYYY-MM-DD) and "content".', 'error');
      return false;
    }

    const entryMap = new Map<string, JournalEntry>();
    entries.forEach(e => entryMap.set(e.date, { ...e }));

    let addedCount = 0;
    let updatedCount = 0;

    for (const item of validItems) {
      const cleanDate = item.date.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) continue;

      const title = typeof item.title === 'string' ? item.title : '';
      const content = item.content;
      const wordCount = typeof item.wordCount === 'number' ? item.wordCount : calculateWordCount(content);
      const readingTime = typeof item.readingTime === 'number' ? item.readingTime : calculateReadingTime(wordCount);
      const slug = typeof item.slug === 'string' ? item.slug : generateSlug(title, cleanDate);

      if (entryMap.has(cleanDate)) {
        const existing = entryMap.get(cleanDate)!;
        entryMap.set(cleanDate, {
          ...existing,
          title: title || existing.title,
          content,
          tags: Array.isArray(item.tags) ? item.tags : existing.tags,
          isPublic: typeof item.isPublic === 'boolean' ? item.isPublic : existing.isPublic,
          slug: slug || existing.slug,
          mood: item.mood || existing.mood,
          updatedAt: item.updatedAt || new Date().toISOString(),
          wordCount,
          readingTime,
        });
        updatedCount++;
      } else {
        entryMap.set(cleanDate, {
          id: item.id || `entry-${cleanDate}-${Math.random().toString(36).substring(2, 9)}`,
          date: cleanDate,
          title,
          content,
          tags: Array.isArray(item.tags) ? item.tags : [],
          isPublic: !!item.isPublic,
          slug,
          mood: item.mood,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
          wordCount,
          readingTime,
        });
        addedCount++;
      }
    }

    const mergedList = Array.from(entryMap.values()).sort((a, b) => b.date.localeCompare(a.date));
    onImportEntries(mergedList);
    onShowToast(
      'Import & Merge Complete',
      `Processed ${addedCount + updatedCount} entries (${addedCount} added, ${updatedCount} updated). Total entries: ${mergedList.length}.`,
      'success'
    );
    return true;
  };

  // Import JSON via file input
  const handleImportFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        processAndMergeEntries(parsed);
      } catch {
        onShowToast('Import Failed', 'Unable to parse JSON file. Please ensure it is valid JSON.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Import JSON via pasted text fallback
  const handleImportPastedJson = () => {
    if (!pastedJson.trim()) return;
    try {
      const parsed = JSON.parse(pastedJson);
      const ok = processAndMergeEntries(parsed);
      if (ok) {
        setPastedJson('');
      }
    } catch {
      onShowToast('Import Failed', 'Invalid JSON syntax. Please verify the pasted text.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/80">
          <h2 className="text-base sm:text-lg font-bold font-display text-slate-900 dark:text-white">
            Chronos Settings &amp; Configuration
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-6 py-2 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-2 overflow-x-auto text-xs bg-slate-50/30 dark:bg-slate-950/20">
          <button
            onClick={() => setActiveTab('reminders')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'reminders'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Daily Reminders</span>
          </button>

          <button
            onClick={() => setActiveTab('cloud')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'cloud'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Supabase Cloud Sync</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'profile'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Author &amp; Blog</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'backup'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Backup &amp; Export</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* TAB 1: Reminders */}
          {activeTab === 'reminders' && (
            <div className="space-y-5">
              {/* Reminder Engine Platform Mode Indicator */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-start gap-3">
                <div className={`p-2.5 rounded-lg ${nativeDebug.isNative ? 'bg-emerald-500/15 text-emerald-500' : 'bg-cyan-500/15 text-cyan-500'} shrink-0 mt-0.5`}>
                  {nativeDebug.isNative ? <Smartphone className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Engine Mode:
                    </span>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 ${
                      nativeDebug.isNative
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${nativeDebug.isNative ? 'bg-emerald-500' : 'bg-cyan-500'}`} />
                      <span>{nativeDebug.isNative ? 'Native Android' : 'Web (only works while app is open)'}</span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                    {nativeDebug.isNative
                      ? 'Android background reminders enabled. Chronos schedules 7 days of notifications ahead with high importance so you receive alerts even when the app is completely closed.'
                      : 'Browser active-tab mode. Reminders will trigger via active-tab alerts and audio chime when Chronos is open in your browser or PWA window.'}
                  </p>
                </div>
              </div>

              {/* Android 13+ Notification Permission Alert Banner (if denied) */}
              {nativeDebug.isNative && rawPermValue === 'denied' && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span>Notifications are blocked. Open Settings &gt; Notifications and turn them on for Chronos.</span>
                  </div>
                  <button
                    onClick={handleOpenAndroidSettings}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white shrink-0 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Android Settings</span>
                  </button>
                </div>
              )}

              {/* Android 12+ Exact Alarms Permission Alert Banner (if denied) */}
              {nativeDebug.isNative && nativeDebug.isExactAlarmSupported && nativeDebug.exactAlarmPermission === 'denied' && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>Exact alarm scheduling is restricted by Android battery optimization. Reminders may be delayed slightly.</span>
                  </div>
                  <button
                    onClick={handleRequestExactAlarms}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white shrink-0 transition-colors cursor-pointer"
                  >
                    Open Alarm Settings
                  </button>
                </div>
              )}

              {/* Main Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Enable Daily Writing Notification
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Receive daily reminders at your chosen time to maintain your journaling streak.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reminders.enabled}
                    onChange={(e) => handleToggleReminders(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Time Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Notification Time (24h)
                  </label>
                  <input
                    type="time"
                    value={reminders.time}
                    onChange={(e) => setReminders(prev => ({ ...prev, time: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <p className="text-[11px] text-slate-400">Triggered once every day at this exact hour.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Audio Chime
                  </label>
                  <div className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <span className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 text-emerald-500" /> Melodic bell chime
                    </span>
                    <input
                      type="checkbox"
                      checked={reminders.sound}
                      onChange={(e) => setReminders(prev => ({ ...prev, sound: e.target.checked }))}
                      className="rounded text-emerald-600 focus:ring-0"
                    />
                  </div>
                </div>
              </div>

              {/* Permission Status Box with Requirement 1 logic */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Notification Permission:
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-mono font-semibold ${
                      rawPermValue === 'granted'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : rawPermValue === 'denied'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}>
                      {rawPermValue}
                    </span>
                  </div>

                  {/* Native Android Permission Action Buttons */}
                  {nativeDebug.isNative ? (
                    rawPermValue === 'granted' ? (
                      /* When granted: show Manage in Android Settings button instead of Request Permission */
                      <button
                        onClick={handleOpenAndroidSettings}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        <span>Manage in Android Settings</span>
                      </button>
                    ) : (rawPermValue === 'denied' && hasAttemptedRequestWhileDenied) ? (
                      /* When denied and requested once: replace Request Permission button with Open Android Settings */
                      <button
                        onClick={handleOpenAndroidSettings}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Android Settings</span>
                      </button>
                    ) : (
                      /* Initial / prompt state: Request Permission */
                      <button
                        onClick={handleRequestPermission}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-xs"
                      >
                        Request Permission
                      </button>
                    )
                  ) : (
                    /* Web mode: Request Permission if not granted */
                    rawPermValue !== 'granted' && (
                      <button
                        onClick={handleRequestPermission}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-xs"
                      >
                        Request Permission
                      </button>
                    )
                  )}
                </div>

                {/* Sub-messages for permission statuses */}
                {nativeDebug.isNative && rawPermValue === 'granted' && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Notifications are active. Permission can only be turned off in Android system settings.
                  </p>
                )}

                {nativeDebug.isNative && rawPermValue === 'denied' && hasAttemptedRequestWhileDenied && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    Notifications are blocked. Open Settings &gt; Notifications and turn them on for Chronos.
                  </p>
                )}

                <div className="pt-2 flex items-center justify-between border-t border-slate-200/60 dark:border-slate-800/60">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Verify that sound and alerts trigger properly right now:
                  </span>
                  <button
                    onClick={handleTestNotification}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Test Reminder Now</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Supabase Cloud Database */}
          {activeTab === 'cloud' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Cloud Database (Supabase)
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Chronos works offline-first using <span className="font-semibold text-slate-700 dark:text-slate-300">localStorage</span> by default. 
                  Connect your free Supabase database below to enable seamless cross-device synchronization and live cloud storage for private notes and public blog posts.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Storage Provider
                  </label>
                  <select
                    value={cfg.provider}
                    onChange={(e) => setCfg(prev => ({ ...prev, provider: e.target.value as any }))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
                  >
                    <option value="local">Local Storage (Fast, Offline-first, Zero Setup)</option>
                    <option value="supabase">Supabase Cloud Database (Live Sync &amp; Multi-device)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Supabase Project URL
                  </label>
                  <input
                    type="text"
                    value={cfg.supabaseUrl}
                    onChange={(e) => setCfg(prev => ({ ...prev, supabaseUrl: e.target.value }))}
                    placeholder="https://xyzabcdefg.supabase.co"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Supabase Anon Public Key
                  </label>
                  <input
                    type="password"
                    value={cfg.supabaseAnonKey}
                    onChange={(e) => setCfg(prev => ({ ...prev, supabaseAnonKey: e.target.value }))}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleTestCloudSync}
                    disabled={isSyncing}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>{isSyncing ? 'Connecting...' : 'Test & Sync Now'}</span>
                  </button>

                  <button
                    onClick={handleCopySchema}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1.5"
                  >
                    {copiedSchema ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSchema ? 'SQL Copied!' : 'Copy SQL Table Schema'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Author & Blog Profile */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Author Display Name
                </label>
                <input
                  type="text"
                  value={cfg.authorName}
                  onChange={(e) => setCfg(prev => ({ ...prev, authorName: e.target.value }))}
                  placeholder="Your Name (e.g. Alex Mercer)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400">Shown as byline on public blog posts.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Author Short Bio
                </label>
                <textarea
                  value={cfg.authorBio}
                  onChange={(e) => setCfg(prev => ({ ...prev, authorBio: e.target.value }))}
                  rows={3}
                  placeholder="Short bio for your public article footer..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none resize-none"
                />
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Calendar Week Start Day
                </label>
                <select
                  value={cfg.startOfWeek}
                  onChange={(e) => setCfg(prev => ({ ...prev, startOfWeek: e.target.value as any }))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
                >
                  <option value="mon">Monday</option>
                  <option value="sun">Sunday</option>
                </select>
              </div>
            </div>
          )}

          {/* TAB 4: Backup & Data */}
          {activeTab === 'backup' && (
            <div className="space-y-5">
              {/* Export Section */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Export Journal to JSON
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Download a full backup of all your historical entries, markdown contents, tags, and public blog posts.
                </p>
                <button
                  onClick={handleExportJson}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Backup File ({entries.length} entries)</span>
                </button>
              </div>

              {/* Import Section */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Import &amp; Merge Journal Entries
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Import journal entries from a JSON backup file or by pasting raw JSON text. Entries are <span className="font-semibold text-slate-700 dark:text-slate-300">merged by date</span>: matching dates are updated with incoming content, and new dates are added seamlessly.
                </p>

                {/* File picker without restrictive accept that Android greys out */}
                <div>
                  <label className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer transition-colors shadow-xs">
                    <Upload className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Choose Backup File</span>
                    <input
                      type="file"
                      accept="application/json,text/plain,.json,.txt,*/*"
                      onChange={handleImportFileInput}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-slate-400 mt-1">Supports JSON or text backups exported from Chronos.</p>
                </div>

                {/* Paste JSON Backup fallback textarea */}
                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>Paste JSON backup</span>
                    </label>
                    {pastedJson && (
                      <button
                        onClick={() => setPastedJson('')}
                        className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <textarea
                    value={pastedJson}
                    onChange={(e) => setPastedJson(e.target.value)}
                    rows={4}
                    placeholder='[&#10;  {&#10;    "date": "2026-11-06",&#10;    "content": "Today I reflected on..."&#10;  }&#10;]'
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleImportPastedJson}
                      disabled={!pastedJson.trim()}
                      className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Import &amp; Merge Pasted JSON</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Progressive Web App installation info */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Progressive Web App (PWA)
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Chronos is fully configured as an installable PWA with offline caching and standalone home screen execution.
                </p>
                {isInstallable && (
                  <button
                    onClick={install}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Install Chronos to Home Screen</span>
                  </button>
                )}
                {isInstalled && (
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    <span>Chronos is running as an installed standalone app.</span>
                  </div>
                )}
                {!isInstallable && !isInstalled && isIOS && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 p-2.5 rounded-lg">
                    To install on iOS: tap the <span className="font-semibold text-slate-700 dark:text-slate-200">Share icon</span> in Safari, then tap <span className="font-semibold text-slate-700 dark:text-slate-200">"Add to Home Screen"</span>.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50/50 dark:bg-slate-900/80">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
};
