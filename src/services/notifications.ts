import { ReminderSettings } from '../types';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
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

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) {
    return 'denied';
  }
  try {
    return await Notification.requestPermission();
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return 'denied';
  }
}

export function triggerBrowserNotification(title: string, body: string, onClick?: () => void) {
  if (!isNotificationSupported()) return;

  if (Notification.permission === 'granted') {
    try {
      const notification = new Notification(title, {
        body,
        icon: 'https://api.iconify.design/lucide:book-open.svg?color=%2310b981',
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

export function checkAndTriggerReminder(
  settings: ReminderSettings,
  hasEntryForToday: boolean,
  onNotify: (title: string, message: string) => void
): boolean {
  if (!settings.enabled) return false;

  const now = new Date();
  const currentHours = String(now.getHours()).padStart(2, '0');
  const currentMinutes = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${currentHours}:${currentMinutes}`;

  const todayIso = now.toISOString().split('T')[0];

  // If already notified today, skip
  if (settings.lastNotifiedDate === todayIso) {
    return false;
  }

  // If currentTime matches or has passed the set time today
  if (currentTime === settings.time) {
    if (settings.sound) {
      playHarmonicChime();
    }

    const title = settings.title || 'Time to write today’s journal';
    const message = hasEntryForToday
      ? 'A quick evening reflection? Take a minute to add notes to today’s entry.'
      : (settings.message || 'Take 3 quiet minutes to capture your reflections, gratitude, and wins from today.');

    triggerBrowserNotification(title, message, () => {
      window.location.hash = '#/today';
    });

    onNotify(title, message);
    return true;
  }

  return false;
}
