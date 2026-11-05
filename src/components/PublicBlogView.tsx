import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Share2, 
  Copy, 
  Check, 
  Calendar, 
  Clock, 
  Globe, 
  Twitter, 
  BookOpen, 
  Sparkles,
  Search
} from 'lucide-react';
import { JournalEntry, StorageConfig } from '../types';
import { formatHumanDate, formatShortDate, renderMarkdown } from '../services/markdown';

interface PublicBlogViewProps {
  slug?: string;
  entries: JournalEntry[];
  config: StorageConfig;
  onNavigateHome: () => void;
  onSelectPost: (slug: string) => void;
  onShowToast: (title: string, description?: string, type?: 'success' | 'error' | 'info') => void;
}

export const PublicBlogView: React.FC<PublicBlogViewProps> = ({
  slug,
  entries,
  config,
  onNavigateHome,
  onSelectPost,
  onShowToast,
}) => {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Find all public entries
  const publicEntries = entries.filter(e => e.isPublic).sort((a, b) => b.date.localeCompare(a.date));

  // If a specific slug is requested, locate that post
  const currentPost = slug
    ? publicEntries.find(e => e.slug === slug || e.id === slug)
    : null;

  // Handle Copy Link
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      onShowToast('Link Copied to Clipboard', window.location.href, 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onShowToast('Unable to copy link', undefined, 'error');
    }
  };

  // Handle Native Web Share API
  const handleShare = async () => {
    if (!currentPost) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: currentPost.title || 'Journal Post',
          text: `Read "${currentPost.title}" by ${config.authorName}`,
          url: window.location.href,
        });
      } catch (err) {
        // User cancelled or share failed
      }
    } else {
      handleCopyLink();
    }
  };

  // Single Post Reading View
  if (slug) {
    if (!currentPost) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
            <Globe className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold font-display text-slate-900 dark:text-white">
              Article Not Found
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto">
              This journal entry may have been unpublished, kept private, or the link may be outdated.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-4">
            <button
              onClick={() => onSelectPost('')}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              Browse All Public Posts
            </button>
            <button
              onClick={onNavigateHome}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Back to Calendar
            </button>
          </div>
        </div>
      );
    }

    return (
      <article className="min-h-screen py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Top navigation row */}
          <div className="flex items-center justify-between gap-4 pb-6 border-b border-slate-200/80 dark:border-slate-800/80">
            <button
              onClick={() => onSelectPost('')}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>All Public Articles</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyLink}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
                title="Copy shareable link"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Link'}</span>
              </button>

              <button
                onClick={handleShare}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                title="Share article"
              >
                <Share2 className="w-4 h-4" />
              </button>

              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                  `"${currentPost.title}" by ${config.authorName}\n${window.location.href}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                title="Share on Twitter"
              >
                <Twitter className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Article Header */}
          <header className="space-y-4 pt-2">
            {/* Metadata row with zero pills */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {formatHumanDate(currentPost.date)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {currentPost.readingTime} min read
              </span>
              <span aria-hidden="true">·</span>
              <span>{currentPost.wordCount} words</span>
              {currentPost.mood && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">Mood: {currentPost.mood}</span>
                </>
              )}
            </div>

            {/* Title */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold font-display tracking-tight text-slate-900 dark:text-white leading-[1.15] text-balance">
              {currentPost.title || 'Untitled Journal Entry'}
            </h1>

            {/* Author Byline */}
            <div className="flex items-center gap-3 pt-2">
              <div className="w-10 h-10 rounded-full bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-display font-bold text-sm">
                {config.authorName.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
                  {config.authorName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                  Published from Chronos Calendar
                </p>
              </div>
            </div>
          </header>

          {/* Article Body */}
          <div className="py-6 border-y border-slate-100 dark:border-slate-800/80">
            <div
              className="markdown-content font-serif-prose text-base sm:text-lg text-slate-800 dark:text-slate-200"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(currentPost.content) }}
            />
          </div>

          {/* Tags row */}
          {currentPost.tags && currentPost.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">Filed under:</span>
              {currentPost.tags.map(t => (
                <span key={t} className="text-slate-500 dark:text-slate-400">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Author Card Footer */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-display font-bold text-base">
                {config.authorName.charAt(0)}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  About {config.authorName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {config.authorBio}
                </p>
              </div>
            </div>
            <div className="pt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-200/60 dark:border-slate-800/60">
              <span>Published on Chronos Journal</span>
              <button
                onClick={onNavigateHome}
                className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
              >
                Go to Journal Calendar →
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  // Filtered public archive list
  const filteredArchive = publicEntries.filter(entry => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const inTitle = (entry.title || '').toLowerCase().includes(q);
    const inContent = (entry.content || '').toLowerCase().includes(q);
    const inTags = (entry.tags || []).some(t => t.toLowerCase().includes(q));
    return inTitle || inContent || inTags;
  });

  // Archive / Directory View
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Header section */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-cyan-600 dark:text-cyan-400 font-medium">
              <Globe className="w-4 h-4" />
              <span>Public Journal &amp; Essays</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold font-display tracking-tight text-slate-900 dark:text-white mt-1">
              Field Notes &amp; Published Essays
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Curated thoughts, observations, and reflections published directly from the personal calendar.
            </p>
          </div>

          <button
            onClick={onNavigateHome}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shrink-0 self-start"
          >
            Open My Calendar
          </button>
        </div>

        {/* Search within public archive */}
        <div className="pt-2 max-w-md">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search published articles..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>
      </div>

      {/* Articles Grid / List */}
      {filteredArchive.length === 0 ? (
        <div className="p-12 text-center text-slate-400 space-y-3 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
          <BookOpen className="w-10 h-10 mx-auto opacity-40 text-slate-400" />
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">
            No public articles published yet
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Open any date entry on your calendar and toggle "Publish as Public Blog Post" to publish articles here.
          </p>
          <button
            onClick={onNavigateHome}
            className="mt-2 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
          >
            Create Your First Post
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredArchive.map(post => {
            const previewSnippet = post.content
              .replace(/^[#>*_\-\s]+/gm, ' ')
              .replace(/\n+/g, ' ')
              .slice(0, 160) + '...';

            return (
              <div
                key={post.id}
                onClick={() => onSelectPost(post.slug)}
                className="group p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-emerald-500/50 dark:hover:border-emerald-500/40 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between cursor-pointer"
              >
                <div className="space-y-3">
                  {/* Clean unboxed metadata with dot separators */}
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{formatShortDate(post.date)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{post.readingTime} min read</span>
                    {post.mood && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{post.mood}</span>
                      </>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-bold font-display tracking-tight text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
                    {post.title || 'Untitled Post'}
                  </h3>

                  {/* Excerpt */}
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
                    {previewSnippet}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {(post.tags || []).slice(0, 3).map(tag => (
                      <span key={tag} className="text-[11px] text-slate-400 dark:text-slate-500">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    Read article →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
