import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { JournalEntry, ReminderSettings, StorageConfig } from '../types';
import { formatDateToIso, generateSlug, calculateWordCount, calculateReadingTime } from './markdown';

const STORAGE_KEYS = {
  ENTRIES: 'chronos_entries_v1',
  REMINDERS: 'chronos_reminders_v1',
  CONFIG: 'chronos_config_v1',
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  time: '21:00',
  sound: true,
  title: 'Daily Journal Reflection',
  message: 'How was your day? Take 3 minutes to reflect, record your highlights, and clear your mind.',
};

export const DEFAULT_CONFIG: StorageConfig = {
  provider: 'local',
  supabaseUrl: '',
  supabaseAnonKey: '',
  authorName: 'Alex Mercer',
  authorBio: 'Writer, designer, and daily thinker exploring technology, mindfulness, and creative habits.',
  startOfWeek: 'mon',
};

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(config: StorageConfig): SupabaseClient | null {
  if (config.provider !== 'supabase' || !config.supabaseUrl || !config.supabaseAnonKey) {
    return null;
  }
  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(config.supabaseUrl, config.supabaseAnonKey);
    } catch (err) {
      console.warn('Failed to initialize Supabase client:', err);
      return null;
    }
  }
  return supabaseInstance;
}

export function resetSupabaseClient() {
  supabaseInstance = null;
}

// Storage Operations - starts completely empty with zero pre-seeded notes
export function loadLocalEntries(): JournalEntry[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEYS.ENTRIES);
  if (!stored) {
    return [];
  }
  try {
    const parsed: JournalEntry[] = JSON.parse(stored);
    // Filter out any legacy pre-seeded demo notes so the slate is 100% clean
    const cleanEntries = parsed.filter(e => !e.id.startsWith('entry-seed-'));
    if (cleanEntries.length !== parsed.length) {
      saveLocalEntries(cleanEntries);
    }
    return cleanEntries;
  } catch (err) {
    console.error('Failed to parse stored entries:', err);
    return [];
  }
}

export function saveLocalEntries(entries: JournalEntry[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));
}

export function loadReminderSettings(): ReminderSettings {
  if (typeof window === 'undefined') return DEFAULT_REMINDER_SETTINGS;
  const stored = localStorage.getItem(STORAGE_KEYS.REMINDERS);
  if (!stored) return DEFAULT_REMINDER_SETTINGS;
  try {
    return { ...DEFAULT_REMINDER_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_REMINDER_SETTINGS;
  }
}

export function saveReminderSettings(settings: ReminderSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.REMINDERS, JSON.stringify(settings));
}

export function loadConfig(): StorageConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  const stored = localStorage.getItem(STORAGE_KEYS.CONFIG);
  if (!stored) return DEFAULT_CONFIG;
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: StorageConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
  resetSupabaseClient();
}

/**
 * Cloud Sync Operations with Supabase
 */
export async function syncWithSupabase(config: StorageConfig, localEntries: JournalEntry[]): Promise<{
  success: boolean;
  entries?: JournalEntry[];
  error?: string;
}> {
  const client = getSupabaseClient(config);
  if (!client) {
    return { success: false, error: 'Supabase credentials not configured' };
  }

  try {
    // 1. Fetch remote entries
    const { data, error } = await client
      .from('notes')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      // Remote is empty, push local entries
      if (localEntries.length > 0) {
        const rowsToInsert = localEntries.map(e => ({
          id: e.id,
          date: e.date,
          title: e.title,
          content: e.content,
          tags: e.tags,
          mood: e.mood,
          is_public: e.isPublic,
          slug: e.slug,
          created_at: e.createdAt,
          updated_at: e.updatedAt,
          word_count: e.wordCount,
          reading_time: e.readingTime,
        }));

        const { error: insertErr } = await client.from('notes').upsert(rowsToInsert);
        if (insertErr) {
          console.warn('Upsert to Supabase had issue:', insertErr);
        }
      }
      return { success: true, entries: localEntries };
    }

    // Map Supabase rows to JournalEntry
    const remoteEntries: JournalEntry[] = data.map((row: any) => ({
      id: row.id,
      date: row.date,
      title: row.title || '',
      content: row.content || '',
      tags: Array.isArray(row.tags) ? row.tags : [],
      mood: row.mood,
      isPublic: Boolean(row.is_public),
      slug: row.slug || `${row.date}-entry`,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),
      wordCount: row.word_count || calculateWordCount(row.content || ''),
      readingTime: row.reading_time || calculateReadingTime(calculateWordCount(row.content || '')),
    }));

    // Merge: For conflicts by ID or Date, choose the most recently updated
    const mergedMap = new Map<string, JournalEntry>();
    for (const entry of localEntries) {
      mergedMap.set(entry.date, entry);
    }
    for (const remote of remoteEntries) {
      const existing = mergedMap.get(remote.date);
      if (!existing || new Date(remote.updatedAt) > new Date(existing.updatedAt)) {
        mergedMap.set(remote.date, remote);
      }
    }

    const mergedList = Array.from(mergedMap.values()).sort((a, b) => b.date.localeCompare(a.date));
    saveLocalEntries(mergedList);

    return { success: true, entries: mergedList };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown network error' };
  }
}

export async function persistEntryToCloud(config: StorageConfig, entry: JournalEntry): Promise<boolean> {
  const client = getSupabaseClient(config);
  if (!client) return false;

  try {
    const { error } = await client.from('notes').upsert({
      id: entry.id,
      date: entry.date,
      title: entry.title,
      content: entry.content,
      tags: entry.tags,
      mood: entry.mood,
      is_public: entry.isPublic,
      slug: entry.slug,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
      word_count: entry.wordCount,
      reading_time: entry.readingTime,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function deleteEntryFromCloud(config: StorageConfig, entryId: string): Promise<boolean> {
  const client = getSupabaseClient(config);
  if (!client) return false;

  try {
    const { error } = await client.from('notes').delete().eq('id', entryId);
    return !error;
  } catch {
    return false;
  }
}

export function calculateStreak(entries: JournalEntry[]): { currentStreak: number; longestStreak: number } {
  if (!entries || entries.length === 0) return { currentStreak: 0, longestStreak: 0 };

  const datesWithEntries = new Set(
    entries
      .filter(e => e.content && e.content.trim().length > 0)
      .map(e => e.date)
  );

  if (datesWithEntries.size === 0) return { currentStreak: 0, longestStreak: 0 };

  const today = new Date();
  const todayIso = formatDateToIso(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = formatDateToIso(yesterday);

  let currentStreak = 0;
  let checkDate = datesWithEntries.has(todayIso) ? today : (datesWithEntries.has(yesterdayIso) ? yesterday : null);

  if (checkDate) {
    let d = new Date(checkDate);
    while (true) {
      const iso = formatDateToIso(d);
      if (datesWithEntries.has(iso)) {
        currentStreak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
  }

  // Calculate longest streak
  const sortedDates = Array.from(datesWithEntries).sort();
  let longestStreak = 0;
  let tempStreak = 0;
  let prevTime: number | null = null;

  for (const dateStr of sortedDates) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const time = new Date(y, m - 1, d).getTime();
    const oneDayMs = 86400000;

    if (prevTime === null) {
      tempStreak = 1;
    } else {
      const diff = Math.round((time - prevTime) / oneDayMs);
      if (diff === 1) {
        tempStreak++;
      } else if (diff > 1) {
        tempStreak = 1;
      }
    }
    prevTime = time;
    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
    }
  }

  return { currentStreak, longestStreak };
}

export const SUPABASE_SQL_SCHEMA = `-- Run this in your Supabase SQL Editor to create the notes table:
create table if not exists public.notes (
  id text primary key,
  date text not null unique,
  title text,
  content text,
  tags text[] default '{}',
  mood text,
  is_public boolean default false,
  slug text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  word_count integer default 0,
  reading_time integer default 1
);

-- Enable Row Level Security
alter table public.notes enable row level security;

-- Policy: Anyone can read public notes (for the public blog)
create policy "Allow public read of public notes"
  on public.notes for select
  using (is_public = true);

-- Policy: Allow all operations with anon key for personal journal
create policy "Allow all operations for anon"
  on public.notes for all
  using (true)
  with check (true);
`;
