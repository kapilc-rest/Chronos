import React, { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Globe, 
  Flame, 
  BookOpen, 
  Plus, 
  Sparkles 
} from 'lucide-react';
import { JournalEntry, MoodType, StorageConfig } from '../types';
import { formatDateToIso } from '../services/markdown';

interface CalendarViewProps {
  entries: JournalEntry[];
  config: StorageConfig;
  selectedDate: string | null;
  onSelectDate: (dateStr: string) => void;
  streak: { currentStreak: number; longestStreak: number };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MOOD_EMOJIS: Record<MoodType, string> = {
  great: '✨',
  productive: '⚡',
  reflective: '🌊',
  creative: '🎨',
  calm: '🌿',
  focused: '🎯',
  neutral: '☁️',
  tough: '🌧️',
};

export const CalendarView: React.FC<CalendarViewProps> = ({
  entries,
  config,
  selectedDate,
  onSelectDate,
  streak,
}) => {
  const today = new Date();
  const todayIso = formatDateToIso(today);

  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth());

  // Map of entries by date
  const entriesByDate = React.useMemo(() => {
    const map = new Map<string, JournalEntry>();
    for (const e of entries) {
      if (e.date) {
        map.set(e.date, e);
      }
    }
    return map;
  }, [entries]);

  // Navigate months
  const goToPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const jumpToToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    onSelectDate(formatDateToIso(now));
  };

  // Week days header depending on startOfWeek setting
  const weekDayLabels = config.startOfWeek === 'sun'
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Calculate days for the current calendar grid
  const calendarCells = React.useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

    let startDayIndex = firstDayOfMonth.getDay(); // 0 is Sunday
    if (config.startOfWeek === 'mon') {
      startDayIndex = (startDayIndex + 6) % 7; // 0 is Monday
    }

    const totalDaysInMonth = lastDayOfMonth.getDate();
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();

    const cells: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    // Preceding days from previous month
    for (let i = startDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const prevDate = new Date(currentYear, currentMonth - 1, dayNum);
      const dateStr = formatDateToIso(prevDate);
      cells.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayIso,
      });
    }

    // Days of current month
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const curDate = new Date(currentYear, currentMonth, day);
      const dateStr = formatDateToIso(curDate);
      cells.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: true,
        isToday: dateStr === todayIso,
      });
    }

    // Trailing days to fill remaining 7-column grid
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(currentYear, currentMonth + 1, i);
      const dateStr = formatDateToIso(nextDate);
      cells.push({
        dateStr,
        dayNum: i,
        isCurrentMonth: false,
        isToday: dateStr === todayIso,
      });
    }

    return cells;
  }, [currentYear, currentMonth, config.startOfWeek, todayIso]);

  // Month stats
  const currentMonthEntries = entries.filter(e => {
    if (!e.date) return false;
    const [y, m] = e.date.split('-').map(Number);
    return y === currentYear && m === currentMonth + 1;
  });

  const wordsThisMonth = currentMonthEntries.reduce((sum, e) => sum + (e.wordCount || 0), 0);
  const publicThisMonth = currentMonthEntries.filter(e => e.isPublic).length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner / Metrics strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Flame className="w-4 h-4 text-amber-500" />
            <span>Writing Streak</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-display tabular-nums text-slate-900 dark:text-white">
            {streak.currentStreak} <span className="text-xs font-normal text-slate-500">{streak.currentStreak === 1 ? 'day' : 'days'}</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Best streak: {streak.longestStreak} days</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <BookOpen className="w-4 h-4 text-emerald-500" />
            <span>Monthly Entries</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-display tabular-nums text-slate-900 dark:text-white">
            {currentMonthEntries.length}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Across {MONTH_NAMES[currentMonth]}</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Globe className="w-4 h-4 text-cyan-500" />
            <span>Published Posts</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-display tabular-nums text-slate-900 dark:text-white">
            {publicThisMonth}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Public blog articles</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Words Logged</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-display tabular-nums text-slate-900 dark:text-white">
            {wordsThisMonth.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">This month</p>
        </div>
      </div>

      {/* Main Calendar Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 sm:p-6 shadow-sm">
        {/* Calendar Navigation Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-slate-900 dark:text-white">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={goToPrevMonth}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={goToNextMonth}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden lg:inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mr-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Past dates are read-only · Today ({todayIso}) is editable</span>
            </span>

            <select
              value={currentMonth}
              onChange={(e) => setCurrentMonth(Number(e.target.value))}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx}>{name}</option>
              ))}
            </select>

            <select
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {Array.from({ length: 11 }, (_, i) => currentYear - 5 + i).map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>

            <button
              onClick={jumpToToday}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              Today
            </button>
          </div>
        </div>

        {/* Calendar Day of Week Header */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 pt-4 pb-2 text-center text-xs font-medium text-slate-400 dark:text-slate-500">
          {weekDayLabels.map(label => (
            <div key={label} className="py-1">
              {label}
            </div>
          ))}
        </div>

        {/* Calendar Cells Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {calendarCells.map((cell) => {
            const entry = entriesByDate.get(cell.dateStr);
            const hasEntry = Boolean(entry && entry.content && entry.content.trim().length > 0);
            const isSelected = selectedDate === cell.dateStr;
            const isFuture = cell.dateStr > todayIso;
            const isPast = cell.dateStr < todayIso;

            const cellTitle = cell.isToday
              ? "Today · Click to write or edit today's entry"
              : isFuture
              ? "Future date · Locked until this day arrives"
              : hasEntry
              ? "Past entry · Click to view (Read-Only)"
              : "Past date · Click to view (Read-Only)";

            return (
              <button
                key={cell.dateStr}
                onClick={() => onSelectDate(cell.dateStr)}
                title={cellTitle}
                className={`group relative aspect-square sm:aspect-[1.08/1] p-1.5 sm:p-2.5 rounded-xl text-left transition-all duration-150 flex flex-col justify-between border cursor-pointer select-none ${
                  cell.isCurrentMonth
                    ? isFuture
                      ? 'bg-slate-50/40 dark:bg-slate-900/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 text-slate-400'
                      : 'bg-slate-50/60 dark:bg-slate-900/40 hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
                    : 'bg-transparent text-slate-300 dark:text-slate-600 border-transparent hover:bg-slate-100/40 dark:hover:bg-slate-900/20 opacity-30'
                } ${
                  cell.isToday
                    ? 'ring-2 ring-emerald-500/70 border-emerald-500/50 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : isSelected
                    ? 'border-emerald-500 dark:border-emerald-500 ring-1 ring-emerald-500'
                    : 'border-slate-200/70 dark:border-slate-800/70'
                }`}
              >
                {/* Top Row: Day Number + Corner Mood / Public indicator */}
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-xs sm:text-sm font-semibold font-display tabular-nums inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full ${
                      cell.isToday
                        ? 'bg-emerald-600 text-white font-bold'
                        : isSelected
                        ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                        : cell.isCurrentMonth
                        ? 'text-slate-700 dark:text-slate-200'
                        : 'text-slate-400 dark:text-slate-600'
                    }`}
                  >
                    {cell.dayNum}
                  </span>

                  <div className="flex items-center gap-1 shrink-0">
                    {entry?.mood && (
                      <span className="text-xs sm:text-sm leading-none" title={`Mood: ${entry.mood}`}>
                        {MOOD_EMOJIS[entry.mood]}
                      </span>
                    )}
                    {entry?.isPublic && (
                      <span
                        className="text-cyan-500 dark:text-cyan-400"
                        title="Published as public blog"
                      >
                        <Globe className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Minimalist clean status dot (NO text clutter) */}
                <div className="w-full flex items-center justify-center h-2">
                  {hasEntry && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full transition-transform group-hover:scale-125 ${
                        entry?.isPublic ? 'bg-cyan-500 ring-2 ring-cyan-500/20' : 'bg-emerald-500 ring-2 ring-emerald-500/20'
                      }`}
                      title={entry?.isPublic ? 'Published public post' : 'Journal entry recorded'}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
