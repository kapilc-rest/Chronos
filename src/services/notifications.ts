import { Capacitor } from '@capacitor/core';
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
 * Lazy-loads the Capacitor LocalNotifications plugin ONLY on native platforms.
 * Never called at module load or in standard browser mode.
 */
async function getNativeLocalNotifications() {
  if (!isNativePlatform()) return null;
  try {
    const mod = await import('@capacitor/local-notifications');
    return mod.LocalNotifications;
  } catch (err) {
    console.warn('Native LocalNotifications plugin could not be loaded:', err);
    return null;
  }
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
    const LocalNotifications = await getNativeLocalNotifications();
    if (!LocalNotifications) return;

    await LocalNotifications.addListener('localNotificationActionPerformed', () => {
      window.location.hash = '#/today';
    });
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
    const LocalNotifications = await getNativeLocalNotifications();
    if (!LocalNotifications) return;

    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Daily Writing Reminders',
      description: 'Reminds you to write your daily reflection in Chronos Journal',
      importance: 5, // High importance (heads-up notification)
      visibility: 1, // Public on lock screen
      lights: true,
      lightColor: '#10b981',
      vibration: true,
    });
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
    const LocalNotifications = await getNativeLocalNotifications();
    if (!LocalNotifications) return;

    const todayIso = formatDateToIso(new Date());
    const id = getNotificationIdForDate(todayIso);
    await LocalNotifications.cancel({
      notifications: [{ id }],
    });
  } catch (err) {
    console.warn('Could not cancel today notification:', err);
  }
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
    const LocalNotifications = await getNativeLocalNotifications();
    if (!LocalNotifications) {
      return { success: false, scheduledCount: 0, error: 'LocalNotifications plugin unavailable' };
    }

    await ensureNativeChannel();

    // Check permissions strictly via LocalNotifications
    const permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== 'granted') {
      const requested = await LocalNotifications.requestPermissions();
      if (requested.display !== 'granted') {
        return { success: false, scheduledCount: 0, error: 'Android notification permission not granted' };
      }
    }

    // Cancel existing pending notifications to refill fresh schedule
    try {
      const pending = await LocalNotifications.getPending();
      if (pending && pending.notifications && pending.notifications.length > 0) {
        // Exclude the 1-minute test ID (999999) if active
        const toCancel = pending.notifications.filter(n => n.id !== 999999);
        if (toCancel.length > 0) {
          await LocalNotifications.cancel({ notifications: toCancel });
        }
      }
    } catch (e) {
      console.warn('Could not clear pending before scheduling:', e);
    }

    if (!settings.enabled) {
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
      await LocalNotifications.schedule({
        notifications: notificationsToSchedule,
      });
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
    const LocalNotifications = await getNativeLocalNotifications();
    if (!LocalNotifications) {
      return { success: false, error: 'LocalNotifications plugin is unavailable' };
    }

    await ensureNativeChannel();

    // Check / request permission first
    const permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== 'granted') {
      const requested = await LocalNotifications.requestPermissions();
      if (requested.display !== 'granted') {
        return { success: false, error: 'Notification permission denied. Please allow notifications in Android settings.' };
      }
    }

    const testDate = new Date(Date.now() + 60 * 1000);
    const testId = 999999;

    await LocalNotifications.schedule({
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
    });

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
  exactAlarmPermission: string;
  isExactAlarmSupported: boolean;
  pendingCount: number;
  nextScheduledTime?: string;
  error?: string;
}> {
  if (!isNativePlatform()) {
    const webPerm = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'not supported';
    return {
      isNative: false,
      notificationPermission: webPerm,
      exactAlarmPermission: 'n/a',
      isExactAlarmSupported: false,
      pendingCount: 0,
    };
  }

  try {
    const LocalNotifications = await getNativeLocalNotifications();
    if (!LocalNotifications) {
      return {
        isNative: true,
        notificationPermission: 'unavailable',
        exactAlarmPermission: 'unavailable',
        isExactAlarmSupported: false,
        pendingCount: 0,
        error: 'Capacitor LocalNotifications plugin not loaded',
      };
    }

    // 1. checkPermissions()
    const perms: any = await LocalNotifications.checkPermissions();
    const notifPerm = perms?.display || 'prompt';

    // 2. checkExactNotificationSetting()
    let exactStatus = 'granted';
    let isExactAlarmSupported = false;
    if (typeof (LocalNotifications as any).checkExactNotificationSetting === 'function') {
      isExactAlarmSupported = true;
      try {
        const exactRes = await (LocalNotifications as any).checkExactNotificationSetting();
        exactStatus = exactRes?.exact_alarm || 'granted';
      } catch {
        exactStatus = 'granted';
      }
    }

    // 3. getPending()
    let pendingCount = 0;
    let nextScheduledTime: string | undefined = undefined;
    try {
      const pending = await LocalNotifications.getPending();
      const list = pending?.notifications || [];
      pendingCount = list.length;

      const futureDates = list
        .map(n => {
          if (n.schedule?.at) {
            const d = new Date(n.schedule.at);
            return isNaN(d.getTime()) ? null : d;
          }
          return null;
        })
        .filter((d): d is Date => d !== null && d.getTime() > Date.now())
        .sort((a, b) => a.getTime() - b.getTime());

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
      console.warn('getPending error:', e);
    }

    return {
      isNative: true,
      notificationPermission: notifPerm,
      exactAlarmPermission: exactStatus,
      isExactAlarmSupported,
      pendingCount,
      nextScheduledTime,
    };
  } catch (err: any) {
    return {
      isNative: true,
      notificationPermission: 'error',
      exactAlarmPermission: 'error',
      isExactAlarmSupported: false,
      pendingCount: 0,
      error: err?.message || 'Error checking native status',
    };
  }
}

/**
 * Checks platform permission details for Settings UI
 */
export async function getReminderPermissionInfo(): Promise<{
  isNative: boolean;
  notificationPermission: string;
  exactAlarmPermission?: string;
  isExactAlarmSupported?: boolean;
}> {
  const debug = await getNativeDebugInfo();
  return {
    isNative: debug.isNative,
    notificationPermission: debug.notificationPermission,
    exactAlarmPermission: debug.exactAlarmPermission,
    isExactAlarmSupported: debug.isExactAlarmSupported,
  };
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
      const LocalNotifications = await getNativeLocalNotifications();
      if (LocalNotifications) {
        const res = await LocalNotifications.requestPermissions();
        return {
          granted: res.display === 'granted',
          permission: res.display,
        };
      }
    } catch (err) {
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
 * Redirects user to exact alarm settings if needed (Android 12+)
 */
export async function requestExactAlarmSettings(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const LocalNotifications = await getNativeLocalNotifications();
    if (LocalNotifications && typeof (LocalNotifications as any).changeExactNotificationSetting === 'function') {
      await (LocalNotifications as any).changeExactNotificationSetting();
    }
  } catch (err) {
    console.warn('Could not open exact alarm setting:', err);
  }
}

export function isNotificationSupported(): boolean {
  if (isNativePlatform()) return true;
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function triggerBrowserNotification(title: string, body: string, onClick?: () => void) {
  if (isNativePlatform()) {
    getNativeLocalNotifications().then((LocalNotifications) => {
      if (LocalNotifications) {
        LocalNotifications.schedule({
          notifications: [
            {
              id: Math.floor(Math.random() * 1000000),
              title,
              body,
              channelId: CHANNEL_ID,
              schedule: { at: new Date(Date.now() + 500) },
            },
          ],
        }).catch((err) => console.warn('Native notification trigger failed:', err));
      }
    }).catch(() => {});
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
 * Web polling reminder:
 * - Uses local date (formatDateToIso).
 * - Fires at most once per day via lastNotifiedDate check in localStorage & settings.
 * - Skips if today's entry already has content.
 * - Uses currentTime >= settings.time so if opened after the reminder time, shows a single notification.
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

  // Check in-memory setting and persistent localStorage
  const storedLastNotified = typeof window !== 'undefined' ? localStorage.getItem('chronos_last_notified_date') : null;
  if (settings.lastNotifiedDate === todayIso || storedLastNotified === todayIso) {
    return false;
  }

  const currentHours = String(now.getHours()).padStart(2, '0');
  const currentMinutes = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${currentHours}:${currentMinutes}`;

  // If current local time has reached or passed settings.time today
  if (currentTime >= (settings.time || '21:00')) {
    // Record in localStorage immediately so it never fires more than once today
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
