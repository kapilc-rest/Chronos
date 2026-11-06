import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as CapApp } from '@capacitor/app';
import { NativeSettings, AndroidSettings } from 'capacitor-native-settings';
import { ReminderSettings } from '../types';
import { formatDateToIso } from './markdown';

export const CHANNEL_ID = 'chronos-daily';

let audioCtx: AudioContext | null = null;
let listenerInitialized = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Synthesizes a soothing melodic 2-tone chime using Web Audio API
 */
export function playHarmonicChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // First bell tone (E5 ~ 659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.2, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 1.25);

    // Second harmonious tone (B5 ~ 987.77 Hz) slightly delayed
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.15);

    gain2.gain.setValueAtTime(0.001, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.18, now + 0.19);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 1.45);
  } catch (err) {
    console.warn('Audio chime playback failed:', err);
  }
}

/**
 * Returns true strictly if running as a native Capacitor app (Android / iOS).
 * Safe to call in any standard browser without throwing.
 */
export function isNativePlatform(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const winCap = (window as any).Capacitor;
    if (winCap && typeof winCap.isNativePlatform === 'function') {
      return winCap.isNativePlatform();
    }
    if (Capacitor && typeof Capacitor.isNativePlatform === 'function') {
      return Capacitor.isNativePlatform();
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Wraps any promise with a 5-second timeout using Promise.race.
 * On timeout or error, rejects with the exact error message.
 */
export async function withPluginTimeout<T>(
  promise: Promise<T>,
  actionName: string,
  timeoutMs = 5000
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${actionName} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Resolves the native LocalNotifications plugin instance safely.
 * Checks window.Capacitor.Plugins.LocalNotifications first, falls back to imported LocalNotifications.
 */
export function getNativeLocalNotifications(): any {
  if (!isNativePlatform()) return null;
  if (typeof window !== 'undefined') {
    const winCap = (window as any).Capacitor;
    if (winCap?.Plugins?.LocalNotifications) {
      return winCap.Plugins.LocalNotifications;
    }
  }
  return LocalNotifications;
}

/**
 * Computes a deterministic 32-bit positive integer ID from YYYY-MM-DD
 * Example: '2026-11-06' -> 261106
 */
export function getNotificationIdForDate(dateStr: string): number {
  try {
    const parts = dateStr.split('-').map(Number);
    const y = (parts[0] || 2026) % 100;
    const m = parts[1] || 1;
    const d = parts[2] || 1;
    return y * 10000 + m * 100 + d;
  } catch {
    return Math.floor(Math.random() * 100000);
  }
}

/**
 * Initializes the Capacitor notification action listener so tapping a notification navigates to today's entry
 */
export async function initNotificationActionListener(): Promise<void> {
  if (!isNativePlatform() || listenerInitialized) return;
  listenerInitialized = true;

  try {
    const plugin = getNativeLocalNotifications();
    if (!plugin) return;

    await withPluginTimeout(
      plugin.addListener('localNotificationActionPerformed', () => {
        window.location.hash = '#/today';
      }),
      'addListener(localNotificationActionPerformed)'
    );
  } catch (err) {
    console.warn('Could not register localNotificationActionPerformed listener:', err);
  }
}

/**
 * Ensures the Android high-importance notification channel exists
 */
export async function ensureNativeChannel(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const plugin = getNativeLocalNotifications();
    if (!plugin) return;

    await withPluginTimeout(
      plugin.createChannel({
        id: CHANNEL_ID,
        name: 'Daily Writing Reminders',
        description: 'Reminds you to write your daily reflection in Chronos Journal',
        importance: 5, // High importance (heads-up notification)
        visibility: 1, // Public on lock screen
        lights: true,
        lightColor: '#10b981',
        vibration: true,
      }),
      'createChannel(chronos-daily)'
    );
  } catch (err) {
    console.warn('Failed to create notification channel:', err);
  }
}

/**
 * Cancels today's pending local notification when an entry is saved with content
 */
export async function cancelTodayPendingNotification(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const plugin = getNativeLocalNotifications();
    if (!plugin) return;

    const todayIso = formatDateToIso(new Date());
    const id = getNotificationIdForDate(todayIso);
    await withPluginTimeout(
      plugin.cancel({
        notifications: [{ id }],
      }),
      'cancel(todayNotification)'
    );
  } catch (err) {
    console.warn('Could not cancel today notification:', err);
  }
}

/**
 * Cancels ALL pending native notifications using LocalNotifications.getPending() and LocalNotifications.cancel().
 * Called when the daily reminder toggle is switched OFF.
 */
export async function cancelAllPendingNotifications(): Promise<{ success: boolean; canceledCount: number; error?: string }> {
  if (!isNativePlatform()) return { success: true, canceledCount: 0 };
  try {
    const plugin = getNativeLocalNotifications();
    if (!plugin) return { success: true, canceledCount: 0 };

    const pending: any = await withPluginTimeout(
      plugin.getPending(),
      'LocalNotifications.getPending()'
    );
    const notifications = pending?.notifications || [];
    if (notifications.length > 0) {
      await withPluginTimeout(
        plugin.cancel({ notifications }),
        'LocalNotifications.cancel(all)'
      );
    }
    return { success: true, canceledCount: notifications.length };
  } catch (err: any) {
    console.warn('Failed to cancel all notifications:', err);
    return { success: false, canceledCount: 0, error: err?.message || 'Failed to cancel notifications' };
  }
}

/**
 * Opens the Android system notification settings for this application via capacitor-native-settings,
 * falling back to the application details page.
 */
export async function openAndroidNotificationSettings(): Promise<{ success: boolean; error?: string }> {
  if (!isNativePlatform()) {
    return { success: false, error: 'Not running on a native platform' };
  }

  try {
    const plugin: any = (typeof window !== 'undefined' && (window as any).Capacitor?.Plugins?.NativeSettings) || NativeSettings;
    await withPluginTimeout(
      plugin.openAndroid({
        option: AndroidSettings.AppNotification,
      }),
      'NativeSettings.openAndroid(AppNotification)',
      5000
    );
    return { success: true };
  } catch (err1) {
    console.warn('NativeSettings.openAndroid(AppNotification) failed, trying ApplicationDetails:', err1);
    try {
      const plugin: any = (typeof window !== 'undefined' && (window as any).Capacitor?.Plugins?.NativeSettings) || NativeSettings;
      await withPluginTimeout(
        plugin.openAndroid({
          option: AndroidSettings.ApplicationDetails,
        }),
        'NativeSettings.openAndroid(ApplicationDetails)',
        5000
      );
      return { success: true };
    } catch (err2: any) {
      console.warn('NativeSettings.openAndroid(ApplicationDetails) failed:', err2);
      return { success: false, error: err2?.message || 'Could not open Android settings' };
    }
  }
}

/**
 * Listens for appStateChange when returning to foreground (active).
 * Automatically re-checks notification permissions and triggers callback.
 */
export function initForegroundResumeListener(
  onForeground: (isGranted: boolean, rawStatus: string) => void
): () => void {
  if (!isNativePlatform()) return () => {};

  try {
    const appPlugin: any = (typeof window !== 'undefined' && (window as any).Capacitor?.Plugins?.App) || CapApp;
    if (!appPlugin || typeof appPlugin.addListener !== 'function') return () => {};

    const handle = appPlugin.addListener('appStateChange', async (state: any) => {
      if (state?.isActive) {
        try {
          const plugin = getNativeLocalNotifications();
          if (plugin) {
            const perms: any = await withPluginTimeout(
              plugin.checkPermissions(),
              'LocalNotifications.checkPermissions(foreground)'
            );
            const rawDisplay = (perms?.display || 'prompt') as string;
            const isGranted = rawDisplay === 'granted';
            onForeground(isGranted, rawDisplay);
          }
        } catch (err) {
          console.warn('Foreground permission check error:', err);
        }
      }
    });

    return () => {
      if (handle && typeof handle.then === 'function') {
        handle.then((h: any) => h?.remove?.()).catch(() => {});
      } else if (handle && typeof (handle as any).remove === 'function') {
        (handle as any).remove();
      }
    };
  } catch (err) {
    console.warn('Failed to register appStateChange listener:', err);
    return () => {};
  }
}

/**
 * Calls LocalNotifications.requestPermissions() directly in native mode,
 * then calls checkPermissions() again and returns raw results.
 */
export async function nativeDirectRequestPermission(): Promise<{
  requestResult: any;
  checkResult: any;
  rawDisplay: string;
  granted: boolean;
}> {
  if (!isNativePlatform()) {
    throw new Error('nativeDirectRequestPermission is only supported on native platforms');
  }

  const plugin = getNativeLocalNotifications();
  if (!plugin) {
    throw new Error('LocalNotifications plugin is unavailable on this device');
  }

  // 1. Request permissions with 5-second timeout
  const reqResult: any = await withPluginTimeout(
    plugin.requestPermissions(),
    'LocalNotifications.requestPermissions()'
  );

  // 2. Check permissions immediately after to verify state
  const checkResult: any = await withPluginTimeout(
    plugin.checkPermissions(),
    'LocalNotifications.checkPermissions()'
  );

  const rawDisplay = (checkResult?.display || reqResult?.display || 'prompt') as string;
  const granted = rawDisplay === 'granted';

  return {
    requestResult: reqResult,
    checkResult,
    rawDisplay,
    granted,
  };
}

/**
 * Schedules the next 7 days of daily reminder notifications on Android/iOS via Capacitor
 */
export async function scheduleNative7DayReminders(
  settings: ReminderSettings,
  hasTodayEntry: boolean
): Promise<{ success: boolean; scheduledCount: number; error?: string }> {
  if (!isNativePlatform()) {
    return { success: false, scheduledCount: 0, error: 'Not on native platform' };
  }

  try {
    const plugin = getNativeLocalNotifications();
    if (!plugin) {
      return { success: false, scheduledCount: 0, error: 'LocalNotifications plugin unavailable' };
    }

    await ensureNativeChannel();

    // Check permissions strictly via LocalNotifications with 5s timeout
    const permStatus: any = await withPluginTimeout(
      plugin.checkPermissions(),
      'LocalNotifications.checkPermissions()'
    );

    if (permStatus?.display !== 'granted') {
      const requested: any = await withPluginTimeout(
        plugin.requestPermissions(),
        'LocalNotifications.requestPermissions()'
      );
      if (requested?.display !== 'granted') {
        return { 
          success: false, 
          scheduledCount: 0, 
          error: `Android notification permission not granted (status: "${requested?.display || 'unknown'}")` 
        };
      }
    }

    // Cancel existing pending notifications to refill fresh schedule
    try {
      const pending: any = await withPluginTimeout(
        plugin.getPending(),
        'LocalNotifications.getPending()'
      );
      if (pending && pending.notifications && pending.notifications.length > 0) {
        // Exclude 1-minute test ID (999999) if active
        const toCancel = pending.notifications.filter((n: any) => n.id !== 999999);
        if (toCancel.length > 0) {
          await withPluginTimeout(
            plugin.cancel({ notifications: toCancel }),
            'LocalNotifications.cancel(pending)'
          );
        }
      }
    } catch (e) {
      console.warn('Could not clear pending before scheduling:', e);
    }

    if (!settings.enabled) {
      await cancelAllPendingNotifications();
      return { success: true, scheduledCount: 0 };
    }

    const [targetHours, targetMinutes] = (settings.time || '21:00').split(':').map(Number);
    const notificationsToSchedule = [];
    const now = new Date();

    for (let i = 0; i < 7; i++) {
      const targetDate = new Date();
      targetDate.setDate(now.getDate() + i);
      targetDate.setHours(targetHours, targetMinutes, 0, 0);

      const dateStr = formatDateToIso(targetDate);
      const id = getNotificationIdForDate(dateStr);

      // If today and already passed or today's entry already exists with content, skip today
      if (i === 0) {
        if (hasTodayEntry) {
          continue;
        }
        if (targetDate.getTime() <= now.getTime()) {
          continue;
        }
      }

      notificationsToSchedule.push({
        id,
        title: settings.title || 'Time to write today’s journal',
        body: settings.message || 'Take 3 quiet minutes to capture your reflections, gratitude, and wins from today.',
        channelId: CHANNEL_ID,
        schedule: {
          at: targetDate,
          allowWhileIdle: true,
        },
        extra: {
          date: dateStr,
          url: '#/today',
        },
      });
    }

    if (notificationsToSchedule.length > 0) {
      await withPluginTimeout(
        plugin.schedule({
          notifications: notificationsToSchedule,
        }),
        'LocalNotifications.schedule(7-day)'
      );
    }

    return { success: true, scheduledCount: notificationsToSchedule.length };
  } catch (err: any) {
    console.error('Failed to schedule native reminders:', err);
    return { success: false, scheduledCount: 0, error: err?.message || 'Failed to schedule native reminders' };
  }
}

/**
 * Schedules a one-time test notification 60 seconds into the future for verification
 */
export async function scheduleTestNotificationIn1Minute(): Promise<{
  success: boolean;
  scheduledTime?: string;
  error?: string;
}> {
  if (!isNativePlatform()) {
    return { success: false, error: 'Only available on native Android platform' };
  }

  try {
    const plugin = getNativeLocalNotifications();
    if (!plugin) {
      return { success: false, error: 'LocalNotifications plugin is unavailable' };
    }

    await ensureNativeChannel();

    // Check / request permission first with 5s timeout
    const permStatus: any = await withPluginTimeout(
      plugin.checkPermissions(),
      'LocalNotifications.checkPermissions()'
    );

    if (permStatus?.display !== 'granted') {
      const requested: any = await withPluginTimeout(
        plugin.requestPermissions(),
        'LocalNotifications.requestPermissions()'
      );
      if (requested?.display !== 'granted') {
        return { 
          success: false, 
          error: `Notification permission denied (status: "${requested?.display || 'unknown'}"). Please allow notifications in Android settings.` 
        };
      }
    }

    const testDate = new Date(Date.now() + 60 * 1000);
    const testId = 999999;

    await withPluginTimeout(
      plugin.schedule({
        notifications: [
          {
            id: testId,
            title: 'Chronos Daily Reminder (Test)',
            body: 'This is your scheduled test reminder from 1 minute ago! Tap here to write today’s reflection.',
            channelId: CHANNEL_ID,
            schedule: {
              at: testDate,
              allowWhileIdle: true,
            },
            extra: {
              url: '#/today',
            },
          },
        ],
      }),
      'LocalNotifications.schedule(1-minute test)'
    );

    const timeStr = testDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return { success: true, scheduledTime: timeStr };
  } catch (err: any) {
    console.error('Failed to schedule 1-minute test:', err);
    return { success: false, error: err?.message || 'Failed to schedule 1-minute test' };
  }
}

/**
 * High-level helper called when app opens, settings change, or entry is saved
 */
export async function syncReminders(
  settings: ReminderSettings,
  hasTodayEntry: boolean
): Promise<{ success: boolean; scheduledCount?: number; error?: string }> {
  if (!isNativePlatform()) return { success: true };
  try {
    await initNotificationActionListener();
    if (hasTodayEntry) {
      await cancelTodayPendingNotification();
    }
    return await scheduleNative7DayReminders(settings, hasTodayEntry);
  } catch (err: any) {
    console.warn('Native reminder sync caught error:', err);
    return { success: false, error: err?.message || 'Failed to sync reminders' };
  }
}

/**
 * Retrieves detailed debug information for the Native Settings UI
 */
export async function getNativeDebugInfo(): Promise<{
  isNative: boolean;
  notificationPermission: string;
  rawPermission: string;
  exactAlarmPermission: string;
  isExactAlarmSupported: boolean;
  pendingCount: number;
  nextScheduledTime?: string;
  lastError?: string;
}> {
  if (!isNativePlatform()) {
    const webPerm = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'not supported';
    return {
      isNative: false,
      notificationPermission: webPerm,
      rawPermission: webPerm,
      exactAlarmPermission: 'n/a',
      isExactAlarmSupported: false,
      pendingCount: 0,
    };
  }

  let lastError: string | undefined = undefined;

  try {
    const plugin = getNativeLocalNotifications();
    if (!plugin) {
      return {
        isNative: true,
        notificationPermission: 'unavailable',
        rawPermission: 'unavailable',
        exactAlarmPermission: 'unavailable',
        isExactAlarmSupported: false,
        pendingCount: 0,
        lastError: 'Capacitor LocalNotifications plugin not loaded',
      };
    }

    // 1. checkPermissions() with 5s timeout
    let notifPerm = 'prompt';
    try {
      const perms: any = await withPluginTimeout(
        plugin.checkPermissions(),
        'LocalNotifications.checkPermissions()'
      );
      notifPerm = perms?.display || 'prompt';
    } catch (e: any) {
      lastError = e?.message || 'checkPermissions failed';
      notifPerm = 'error';
    }

    // 2. checkExactNotificationSetting() with 5s timeout
    let exactStatus = 'granted';
    let isExactAlarmSupported = false;
    if (typeof plugin.checkExactNotificationSetting === 'function') {
      isExactAlarmSupported = true;
      try {
        const exactRes: any = await withPluginTimeout(
          plugin.checkExactNotificationSetting(),
          'LocalNotifications.checkExactNotificationSetting()'
        );
        exactStatus = exactRes?.exact_alarm || 'granted';
      } catch (e: any) {
        exactStatus = 'error';
        if (!lastError) lastError = e?.message || 'checkExactNotificationSetting failed';
      }
    }

    // 3. getPending() with 5s timeout
    let pendingCount = 0;
    let nextScheduledTime: string | undefined = undefined;
    try {
      const pending: any = await withPluginTimeout(
        plugin.getPending(),
        'LocalNotifications.getPending()'
      );
      const list = pending?.notifications || [];
      pendingCount = list.length;

      const futureDates = list
        .map((n: any) => {
          if (n.schedule?.at) {
            const d = new Date(n.schedule.at);
            return isNaN(d.getTime()) ? null : d;
          }
          return null;
        })
        .filter((d: any): d is Date => d !== null && d.getTime() > Date.now())
        .sort((a: Date, b: Date) => a.getTime() - b.getTime());

      if (futureDates.length > 0) {
        nextScheduledTime = futureDates[0].toLocaleString([], {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    } catch (e: any) {
      if (!lastError) lastError = e?.message || 'getPending failed';
    }

    return {
      isNative: true,
      notificationPermission: notifPerm,
      rawPermission: notifPerm,
      exactAlarmPermission: exactStatus,
      isExactAlarmSupported,
      pendingCount,
      nextScheduledTime,
      lastError,
    };
  } catch (err: any) {
    return {
      isNative: true,
      notificationPermission: 'error',
      rawPermission: 'error',
      exactAlarmPermission: 'error',
      isExactAlarmSupported: false,
      pendingCount: 0,
      lastError: err?.message || 'Error checking native status',
    };
  }
}

/**
 * Requests notification permissions for either Native or Web
 */
export async function requestPlatformPermission(): Promise<{
  granted: boolean;
  permission: string;
}> {
  if (isNativePlatform()) {
    try {
      const res = await nativeDirectRequestPermission();
      return {
        granted: res.granted,
        permission: res.rawDisplay,
      };
    } catch {
      return { granted: false, permission: 'denied' };
    }
  }

  // Web platform
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const perm = await Notification.requestPermission();
      return {
        granted: perm === 'granted',
        permission: perm,
      };
    } catch {
      return { granted: false, permission: 'denied' };
    }
  }

  return { granted: false, permission: 'denied' };
}

/**
 * Redirects user to exact alarm settings if needed (Android 12+) with 5s timeout
 */
export async function requestExactAlarmSettings(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const plugin = getNativeLocalNotifications();
    if (plugin && typeof plugin.changeExactNotificationSetting === 'function') {
      await withPluginTimeout(
        plugin.changeExactNotificationSetting(),
        'LocalNotifications.changeExactNotificationSetting()'
      );
    }
  } catch (err) {
    console.warn('Could not open exact alarm setting:', err);
    throw err;
  }
}

export function isNotificationSupported(): boolean {
  if (isNativePlatform()) return true;
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function triggerBrowserNotification(title: string, body: string, onClick?: () => void) {
  if (isNativePlatform()) {
    const plugin = getNativeLocalNotifications();
    if (plugin) {
      withPluginTimeout(
        plugin.schedule({
          notifications: [
            {
              id: Math.floor(Math.random() * 1000000),
              title,
              body,
              channelId: CHANNEL_ID,
              schedule: { at: new Date(Date.now() + 500) },
            },
          ],
        }),
        'LocalNotifications.schedule(triggerBrowserNotification)'
      ).catch((err) => console.warn('Native notification trigger failed:', err));
    }
    return;
  }

  if (!isNotificationSupported()) return;

  if (Notification.permission === 'granted') {
    try {
      const notification = new Notification(title, {
        body,
        icon: './icon.svg',
        tag: 'chronos-daily-reminder',
      });

      if (onClick) {
        notification.onclick = () => {
          window.focus();
          onClick();
          notification.close();
        };
      }
    } catch (err) {
      console.warn('Failed to dispatch desktop notification:', err);
    }
  }
}

/**
 * Web polling reminder
 */
export function checkAndTriggerReminder(
  settings: ReminderSettings,
  hasEntryForToday: boolean,
  onNotify: (title: string, message: string) => void
): boolean {
  if (!settings.enabled) return false;
  if (hasEntryForToday) return false;

  const now = new Date();
  const todayIso = formatDateToIso(now);

  const storedLastNotified = typeof window !== 'undefined' ? localStorage.getItem('chronos_last_notified_date') : null;
  if (settings.lastNotifiedDate === todayIso || storedLastNotified === todayIso) {
    return false;
  }

  const currentHours = String(now.getHours()).padStart(2, '0');
  const currentMinutes = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${currentHours}:${currentMinutes}`;

  if (currentTime >= (settings.time || '21:00')) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chronos_last_notified_date', todayIso);
    }

    if (settings.sound) {
      playHarmonicChime();
    }

    const title = settings.title || 'Time to write today’s journal';
    const message = settings.message || 'Take 3 quiet minutes to capture your reflections, gratitude, and wins from today.';

    triggerBrowserNotification(title, message, () => {
      window.location.hash = '#/today';
    });

    onNotify(title, message);
    return true;
  }

  return false;
}
