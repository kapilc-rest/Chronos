import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Calendar, Globe, Lock, Tag, ArrowRight } from 'lucide-react';
import { JournalEntry, SearchFilter } from '../types';
import { formatShortDate } from '../services/markdown';

interface SearchModalProps {
  isOpen: boolean;
  entries: JournalEntry[];
  onClose: () => void;
  onSelectEntry: (dateStr: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  entries,
  onClose,
  onSelectEntry,
}) => {
  const [filter, setFilter] = useState<SearchFilter>({
    query: '',
    visibility: 'all',
    dateRange: 'all',
  });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      for (const t of e.tags || []) {
        set.add(t);
      }
    }
    return Array.from(set).sort();
  }, [entries]);

  // Filter entries
  const searchResults = useMemo(() => {
    const q = filter.query.trim().toLowerCase();
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    return entries.filter(e => {
      // Visibility filter
      if (filter.visibility === 'public' && !e.isPublic) return false;
      if (filter.visibility === 'private' && e.isPublic) return false;

      // Tag filter
      if (filter.tag && (!e.tags || !e.tags.includes(filter.tag))) return false;

      // Date range filter
      if (filter.dateRange !== 'all') {
        const [y, m, d] = e.date.split('-').map(Number);
        const entryDate = new Date(y, m - 1, d);

        if (filter.dateRange === 'this_month') {
          if (entryDate.getFullYear() !== now.getFullYear() || entryDate.getMonth() !== now.getMonth()) {
            return false;
          }
        } else if (filter.dateRange === 'past_30') {
          if (entryDate < thirtyDaysAgo) return false;
        } else if (filter.dateRange === 'past_year') {
          if (entryDate < oneYearAgo) return false;
        }
      }

      // Keyword search across title, content, and tags
      if (q) {
        const inTitle = (e.title || '').toLowerCase().includes(q);
        const inContent = (e.content || '').toLowerCase().includes(q);
        const inTags = (e.tags || []).some(t => t.toLowerCase().includes(q));
        if (!inTitle && !inContent && !inTags) return false;
      }

      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, filter]);

  // Helper to highlight matching text
  const highlightMatch = (text: string, query: string) => {
    if (!query || !text) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-amber-400/30 dark:bg-amber-400/20 text-inherit font-semibold rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Helper to extract a relevant snippet
  const getExcerpt = (content: string, query: string) => {
    if (!content) return '';
    const clean = content.replace(/^[#>*_\-\s]+/gm, ' ').replace(/\n+/g, ' ');
    if (!query) {
      return clean.slice(0, 140) + (clean.length > 140 ? '...' : '');
    }
    const idx = clean.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) {
      return clean.slice(0, 140) + (clean.length > 140 ? '...' : '');
    }
    const start = Math.max(0, idx - 40);
    const end = Math.min(clean.length, idx + 100);
    return (start > 0 ? '...' : '') + clean.slice(start, end) + (end < clean.length ? '...' : '');
  };

  // Handle escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 md:pt-16 animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[82vh]">
        {/* Search Input Bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/80">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={filter.query}
            onChange={(e) => setFilter(prev => ({ ...prev, query: e.target.value }))}
            placeholder="Search all notes, ideas, tags, or keywords..."
            className="flex-1 bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm sm:text-base border-0 focus:outline-none focus:ring-0"
          />
          {filter.query && (
            <button
              onClick={() => setFilter(prev => ({ ...prev, query: '' }))}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1.5 py-0.5 rounded"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter controls row */}
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50/30 dark:bg-slate-950/20">
          {/* Visibility filter tabs */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              onClick={() => setFilter(prev => ({ ...prev, visibility: 'all' }))}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filter.visibility === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-medium'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter(prev => ({ ...prev, visibility: 'public' }))}
              className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                filter.visibility === 'public'
                  ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-xs font-medium'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Globe className="w-3 h-3" /> Public
            </button>
            <button
              onClick={() => setFilter(prev => ({ ...prev, visibility: 'private' }))}
              className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                filter.visibility === 'private'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-medium'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Lock className="w-3 h-3" /> Private
            </button>
          </div>

          {/* Date range dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Date:</span>
            <select
              value={filter.dateRange}
              onChange={(e) => setFilter(prev => ({ ...prev, dateRange: e.target.value as any }))}
              className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">All Time</option>
              <option value="this_month">This Month</option>
              <option value="past_30">Past 30 Days</option>
              <option value="past_year">Past Year</option>
            </select>
          </div>
        </div>

        {/* Tags filter strip if available */}
        {allTags.length > 0 && (
          <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-xs">
            <Tag className="w-3 h-3 text-slate-400 shrink-0" />
            <button
              onClick={() => setFilter(prev => ({ ...prev, tag: undefined }))}
              className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors ${
                !filter.tag
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Tags
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setFilter(prev => ({ ...prev, tag: prev.tag === tag ? undefined : tag }))}
                className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors ${
                  filter.tag === tag
                    ? 'bg-emerald-600 text-white font-medium'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Results List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
          {searchResults.length === 0 ? (
            <div className="p-8 text-center text-slate-400 dark:text-slate-500 space-y-2">
              <Search className="w-8 h-8 mx-auto opacity-40" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No journal entries matched your search</p>
              <p className="text-xs">Try adjusting your keywords or clearing the active filters.</p>
            </div>
          ) : (
            searchResults.map(entry => {
              const excerpt = getExcerpt(entry.content, filter.query);

              return (
                <button
                  key={entry.id}
                  onClick={() => {
                    onClose();
                    onSelectEntry(entry.date);
                  }}
                  className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-start justify-between gap-4 group cursor-pointer"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    {/* Header info */}
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatShortDate(entry.date)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{entry.wordCount} words</span>
                      {entry.isPublic && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-cyan-500 flex items-center gap-1 font-medium">
                            <Globe className="w-3 h-3" /> Public Blog
                          </span>
                        </>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-sm sm:text-base font-semibold font-display text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors truncate">
                      {highlightMatch(entry.title || 'Untitled Entry', filter.query)}
                    </h3>

                    {/* Excerpt */}
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                      {highlightMatch(excerpt, filter.query)}
                    </p>

                    {/* Tags */}
                    {entry.tags && entry.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {entry.tags.map(t => (
                          <span key={t} className="text-[11px] text-slate-400 dark:text-slate-500">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/80 text-xs text-slate-400 flex items-center justify-between">
          <span>{searchResults.length} {searchResults.length === 1 ? 'entry found' : 'entries found'}</span>
          <span>Click any entry to open in editor</span>
        </div>
      </div>
    </div>
  );
};
