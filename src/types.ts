export type MoodType = 'great' | 'productive' | 'reflective' | 'creative' | 'calm' | 'focused' | 'neutral' | 'tough';

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  content: string; // Markdown text
  tags: string[];
  mood?: MoodType;
  isPublic: boolean;
  slug: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  readingTime: number; // in minutes
}

export interface ReminderSettings {
  enabled: boolean;
  time: string; // "21:00" (24h format)
  sound: boolean;
  title: string;
  message: string;
  lastNotifiedDate?: string;
}

export interface StorageConfig {
  provider: 'local' | 'supabase';
  supabaseUrl: string;
  supabaseAnonKey: string;
  authorName: string;
  authorBio: string;
  startOfWeek: 'mon' | 'sun';
}

export interface SearchFilter {
  query: string;
  tag?: string;
  visibility: 'all' | 'public' | 'private';
  dateRange: 'all' | 'this_month' | 'past_30' | 'past_year';
}
