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
  RefreshCw,
  Clock,
  FileText
} from 'lucide-react';
import { usePWAInstall } from '../usePWAInstall';
import { ReminderSettings, StorageConfig, JournalEntry } from '../types';
import { 
  getNativeDebugInfo,
  requestPlatformPermission,
  requestExactAlarmSettings,
  scheduleNative7DayReminders,
  scheduleTestNotificationIn1Minute,
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
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSchedulingTest, setIsSchedulingTest] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  // Native debug status state
  const [nativeDebug, setNativeDebug] = useState<{
    isNative: boolean;
    notificationPermission: string;
    exactAlarmPermission: string;
    isExactAlarmSupported: boolean;
    pendingCount: number;
    nextScheduledTime?: string;
    error?: string;
  }>({
    isNative: isNativePlatform(),
    notificationPermission: 'default',
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
    } catch (err: any) {
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

  if (!isOpen) return null;

  // Request platform permission (Native Android via LocalNotifications or Web Notification)
  const handleRequestPermission = async () => {
    try {
      const res = await requestPlatformPermission();
      setNotificationPermission(res.permission);
      await refreshDebugInfo();
      if (res.granted) {
        onShowToast('Notifications Enabled!', 'Notification permissions have been granted.', 'success');
        // Immediately schedule the next 7 days right away after permission is granted
        if (nativeDebug.isNative && reminders.enabled) {
          try {
            const scheduleRes = await scheduleNative7DayReminders(reminders, hasTodayEntry);
            if (scheduleRes.success) {
              onShowToast('Reminders Scheduled', `Next ${scheduleRes.scheduledCount} days scheduled in Android alarm manager.`, 'success');
            } else if (scheduleRes.error) {
              onShowToast('Scheduling Failed', scheduleRes.error, 'error');
            }
          } catch (err: any) {
            onShowToast('Scheduling Error', err?.message || 'Failed to schedule native reminders', 'error');
          }
        }
        await refreshDebugInfo();
      } else {
        onShowToast('Permission Denied', 'Please enable notifications in Android / browser settings.', 'error');
      }
    } catch (err: any) {
      onShowToast('Permission Error', err?.message || 'Could not request notification permission.', 'error');
    }
  };

  // Toggle Reminder handler with automatic native permission request
  const handleToggleReminders = async (enabled: boolean) => {
    const updated = { ...reminders, enabled };
    setReminders(updated);

    if (nativeDebug.isNative) {
      if (enabled) {
        try {
          let currentPerm = notificationPermission;
          // Request permission automatically when reminder toggle is turned on
          if (currentPerm !== 'granted') {
            const res = await requestPlatformPermission();
            currentPerm = res.permission;
            setNotificationPermission(res.permission);
            if (res.granted) {
              onShowToast('Permission Granted', 'Android notifications enabled.', 'success');
            } else {
              onShowToast('Permission Denied', 'Please enable notifications in Android Settings to receive reminders.', 'error');
            }
          }

          if (currentPerm === 'granted') {
            const scheduleRes = await scheduleNative7DayReminders(updated, hasTodayEntry);
            if (scheduleRes.success) {
              onShowToast('Reminders Scheduled', `Next ${scheduleRes.scheduledCount} days scheduled in Android alarm manager.`, 'success');
            } else if (scheduleRes.error) {
              onShowToast('Scheduling Failed', scheduleRes.error, 'error');
            }
          }
          await refreshDebugInfo();
        } catch (err: any) {
          onShowToast('Scheduling Error', err?.message || 'Failed to schedule reminders', 'error');
        }
      } else {
        try {
          await scheduleNative7DayReminders(updated, hasTodayEntry);
          await refreshDebugInfo();
          onShowToast('Reminders Paused', 'Daily reminder notifications disabled.', 'info');
        } catch (err: any) {
          onShowToast('Error', err?.message || 'Failed to cancel reminders', 'error');
        }
      }
    }
  };

  // Open Android exact alarm settings
  const handleRequestExactAlarms = async () => {
    try {
      await requestExactAlarmSettings();
      await refreshDebugInfo();
    } catch (err: any) {
      onShowToast('Error', err?.message || 'Could not open exact alarm settings', 'error');
    }
  };

  // Schedule Test in 1 Minute (Native)
  const handleScheduleTest1Minute = async () => {
    setIsSchedulingTest(true);
    try {
      const res = await scheduleTestNotificationIn1Minute();
      if (res.success) {
        onShowToast(
          'Test Reminder Scheduled',
          `Alert scheduled for ${res.scheduledTime || 'in 1 minute'}. You may minimize or lock your phone.`,
          'success'
        );
        await refreshDebugInfo();
      } else {
        onShowToast('Test Schedule Failed', res.error || 'Could not schedule 1-minute test.', 'error');
      }
    } catch (err: any) {
      onShowToast('Test Error', err?.message || 'Could not schedule test', 'error');
    } finally {
      setIsSchedulingTest(false);
    }
  };

  // Test Notification & Chime (Immediate)
  const handleTestNotification = () => {
    if (reminders.sound) {
      playHarmonicChime();
    }
    triggerBrowserNotification(
      'Daily Journal Reflection Test',
      'This is a sample alert! Your daily reminder is configured and working perfectly.'
    );
    onShowToast('Test Reminder Triggered', 'Harmonic chime played and notification triggered.', 'success');
  };

  // Save Settings
  const handleSave = async () => {
    try {
      onSaveReminders(reminders);
      onSaveConfig(cfg);
      if (nativeDebug.isNative) {
        const scheduleRes = await scheduleNative7DayReminders(reminders, hasTodayEntry);
        if (!scheduleRes.success && scheduleRes.error) {
          onShowToast('Scheduling Warning', scheduleRes.error, 'error');
        }
      }
      onShowToast('Settings Saved', 'All preferences have been updated.', 'success');
      onClose();
    } catch (err: any) {
      onShowToast('Save Error', err?.message || 'Failed to save settings', 'error');
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

    // Validate that items are objects with date and content
    const validItems = parsed.filter(
      item => item && typeof item === 'object' && typeof item.date === 'string' && typeof item.content === 'string'
    );

    if (validItems.length === 0) {
      onShowToast('Invalid Entries', 'No valid entries found. Each entry must have "date" (YYYY-MM-DD) and "content".', 'error');
      return false;
    }

    // Index existing entries by date for merging
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

  // Import JSON via file input (Android-compatible mime types)
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
    e.target.value = ''; // Reset input to allow re-uploading same file if desired
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
              {nativeDebug.isNative && notificationPermission === 'denied' && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span>Android 13+ notification permission is blocked. Scheduled daily reminders will not appear until notifications are enabled in Android Settings.</span>
                  </div>
                  <button
                    onClick={handleRequestPermission}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white shrink-0 transition-colors"
                  >
                    Allow Notifications
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
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white shrink-0 transition-colors"
                  >
                    Open Alarm Settings
                  </button>
                </div>
              )}

              {/* Native Android Status & Diagnostics Area (Requirement 3) */}
              {nativeDebug.isNative && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-emerald-500" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Native Android Diagnostics
                      </h4>
                    </div>
                    <button
                      onClick={refreshDebugInfo}
                      className="text-[11px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center gap-1 transition-colors"
                      title="Refresh status from LocalNotifications"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Refresh</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                      <span className="block text-[10px] text-slate-400 font-medium">Notification Perm</span>
                      <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold ${
                        notificationPermission === 'granted'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : notificationPermission === 'denied'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}>
                        {notificationPermission}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                      <span className="block text-[10px] text-slate-400 font-medium">Exact Alarm Setting</span>
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold ${
                          nativeDebug.exactAlarmPermission === 'granted'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}>
                          {nativeDebug.exactAlarmPermission}
                        </span>
                        {nativeDebug.exactAlarmPermission === 'denied' && (
                          <button
                            onClick={handleRequestExactAlarms}
                            className="text-[10px] text-amber-600 dark:text-amber-400 underline font-semibold"
                          >
                            Settings
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                      <span className="block text-[10px] text-slate-400 font-medium">Pending Alerts</span>
                      <span className="block mt-1 text-[12px] font-mono font-bold text-slate-800 dark:text-slate-200">
                        {nativeDebug.pendingCount} scheduled
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                      <span className="block text-[10px] text-slate-400 font-medium">Next Scheduled</span>
                      <span className="block mt-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate" title={nativeDebug.nextScheduledTime || 'None pending'}>
                        {nativeDebug.nextScheduledTime || 'None pending'}
                      </span>
                    </div>
                  </div>

                  {/* 1-Minute Test Scheduling Button */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 dark:border-slate-800/60">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Test background wake-up while app is minimized or device is locked:
                    </span>
                    <button
                      onClick={handleScheduleTest1Minute}
                      disabled={isSchedulingTest}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>{isSchedulingTest ? 'Scheduling...' : 'Schedule test in 1 minute'}</span>
                    </button>
                  </div>
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

              {/* Web Permission Status Box (Shown on web or if permission not granted) */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Notification Permission:
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                      notificationPermission === 'granted'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : notificationPermission === 'denied'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}>
                      {notificationPermission}
                    </span>
                  </div>

                  {notificationPermission !== 'granted' && isNotificationSupported() && (
                    <button
                      onClick={handleRequestPermission}
                      className="px-3 py-1 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                    >
                      Request Permission
                    </button>
                  )}
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-200/60 dark:border-slate-800/60">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Verify that sound and alerts trigger properly right now:
                  </span>
                  <button
                    onClick={handleTestNotification}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
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

          {/* TAB 4: Backup & Data (Requirements 2: Android-friendly file input, paste JSON, merge by date) */}
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
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5"
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
                      className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
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
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
};
