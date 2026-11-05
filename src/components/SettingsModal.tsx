import React, { useState, useEffect } from 'react';
import { 
  X, 
  Bell, 
  Volume2, 
  Database, 
  User, 
  Calendar, 
  Download, 
  Upload, 
  Check, 
  Copy, 
  Play, 
  AlertCircle,
  ExternalLink,
  Smartphone
} from 'lucide-react';
import { usePWAInstall } from '../usePWAInstall';
import { ReminderSettings, StorageConfig, JournalEntry } from '../types';
import { 
  requestNotificationPermission, 
  isNotificationSupported, 
  playHarmonicChime,
  triggerBrowserNotification 
} from '../services/notifications';
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
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  useEffect(() => {
    if (isOpen) {
      setReminders(reminderSettings);
      setCfg(config);
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotificationPermission(Notification.permission);
      }
    }
  }, [isOpen, reminderSettings, config]);

  if (!isOpen) return null;

  // Request browser permission
  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      onShowToast('Notifications Enabled!', 'You will receive daily reminders at your chosen time.', 'success');
    } else {
      onShowToast('Permission Not Granted', 'Please check your browser settings to allow notifications.', 'error');
    }
  };

  // Test Notification & Chime
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
  const handleSave = () => {
    onSaveReminders(reminders);
    onSaveConfig(cfg);
    onShowToast('Settings Saved', 'All preferences have been updated.', 'success');
    onClose();
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

  // Import JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          onImportEntries(parsed);
          onShowToast('Journal Imported!', `${parsed.length} entries successfully loaded.`, 'success');
        } else {
          onShowToast('Invalid Format', 'JSON file must contain an array of journal entries.', 'error');
        }
      } catch (err) {
        onShowToast('Import Failed', 'Unable to parse JSON file.', 'error');
      }
    };
    reader.readAsText(file);
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
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Enable Daily Writing Notification
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Receive active-tab reminders and desktop notifications to maintain your journal habit.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reminders.enabled}
                    onChange={(e) => setReminders(prev => ({ ...prev, enabled: e.target.checked }))}
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

              {/* Browser Permission Status */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Browser Notification Permission:
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

          {/* TAB 4: Backup & Data */}
          {activeTab === 'backup' && (
            <div className="space-y-5">
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

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Import Journal from JSON
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Restore or merge entries from an exported Chronos JSON backup file.
                </p>
                <label className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose JSON Backup File</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportJson}
                    className="hidden"
                  />
                </label>
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
