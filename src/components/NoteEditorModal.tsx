import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  X,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Strikethrough,
  Quote,
  List,
  CheckSquare,
  Code,
  Link as LinkIcon,
  Minus,
  Globe,
  Copy,
  ExternalLink,
  Trash2,
  Save,
  Eye,
  Edit3,
  Columns,
  Check,
  Calendar,
  Smile,
  Lock
} from 'lucide-react';
import { JournalEntry, MoodType } from '../types';
import {
  formatHumanDate,
  generateSlug,
  calculateWordCount,
  calculateReadingTime,
  renderMarkdown
} from '../services/markdown';

interface NoteEditorModalProps {
  isOpen: boolean;
  dateStr: string;
  initialEntry?: JournalEntry | null;
  isReadOnly?: boolean;
  onClose: () => void;
  onSave: (entry: JournalEntry) => void;
  onDelete: (id: string, date: string) => void;
  onShowToast: (title: string, description?: string, type?: 'success' | 'error' | 'info') => void;
  onOpenPublicPost: (slug: string) => void;
}

const MOODS: Array<{ type: MoodType; label: string; emoji: string }> = [
  { type: 'great', label: 'Great', emoji: '✨' },
  { type: 'productive', label: 'Productive', emoji: '⚡' },
  { type: 'focused', label: 'Focused', emoji: '🎯' },
  { type: 'creative', label: 'Creative', emoji: '🎨' },
  { type: 'reflective', label: 'Reflective', emoji: '🌊' },
  { type: 'calm', label: 'Calm', emoji: '🌿' },
  { type: 'neutral', label: 'Neutral', emoji: '☁️' },
  { type: 'tough', label: 'Tough', emoji: '🌧️' },
];

const EMOJI_CATEGORIES = [
  {
    name: 'Emotions',
    emojis: ['😊', '✨', '🥰', '😌', '😎', '🥳', '🤔', '🙌', '💡', '🔥', '💪', '🙏', '❤️', '🥺', '😴', '🤯'],
  },
  {
    name: 'Focus & Work',
    emojis: ['⚡', '🎯', '🚀', '💻', '📝', '📚', '☕', '🗓️', '⏰', '⏳', '🏆', '🔑', '🎨', '🎧', '📊', '🛠️'],
  },
  {
    name: 'Nature & Life',
    emojis: ['🌿', '🌱', '🌸', '🌊', '☀️', '🌙', '☁️', '🌧️', '❄️', '🍀', '🧘', '🚶', '🏕️', '🪴', '🕊️', '🥑'],
  },
  {
    name: 'Symbols',
    emojis: ['⭐', '🌟', '💫', '💖', '✅', '❌', '📌', '📎', '💬', '🎉', '✌️', '👍', '👏', '🫶', '💯', '✨'],
  },
];

export const NoteEditorModal: React.FC<NoteEditorModalProps> = ({
  isOpen,
  dateStr,
  initialEntry,
  isReadOnly = false,
  onClose,
  onSave,
  onDelete,
  onShowToast,
  onOpenPublicPost,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [mood, setMood] = useState<MoodType | undefined>(undefined);
  const [isPublic, setIsPublic] = useState(false);
  const [slug, setSlug] = useState('');
  const [viewMode, setViewMode] = useState<'write' | 'split' | 'preview'>('split');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [copiedLink, setCopiedLink] = useState(false);

  // Emoji picker state
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [activeEmojiCategory, setActiveEmojiCategory] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const autoSaveTimerRef = useRef<any>(null);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setIsEmojiPickerOpen(false);
      }
    };
    if (isEmojiPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEmojiPickerOpen]);

  // Load entry data when opening modal or date changes
  useEffect(() => {
    if (!isOpen) return;

    if (initialEntry) {
      setTitle(initialEntry.title || '');
      setContent(initialEntry.content || '');
      setTags(initialEntry.tags || []);
      setMood(initialEntry.mood);
      setIsPublic(initialEntry.isPublic || false);
      setSlug(initialEntry.slug || generateSlug(initialEntry.title || 'entry', dateStr));
    } else {
      setTitle('');
      setContent('');
      setTags([]);
      setMood(undefined);
      setIsPublic(false);
      setSlug(generateSlug('', dateStr));
    }
    setViewMode(isReadOnly ? 'preview' : 'split');
    setSaveStatus('saved');
    setIsEmojiPickerOpen(false);
  }, [isOpen, dateStr, initialEntry, isReadOnly]);

  // Handle auto-saving on content changes
  const triggerAutoSave = (updatedData?: Partial<JournalEntry>) => {
    if (isReadOnly) return;
    setSaveStatus('saving');
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      const currentTitle = updatedData?.title !== undefined ? updatedData.title : title;
      const currentContent = updatedData?.content !== undefined ? updatedData.content : content;
      const currentTags = updatedData?.tags !== undefined ? updatedData.tags : tags;
      const currentMood = updatedData?.mood !== undefined ? updatedData.mood : mood;
      const currentIsPublic = updatedData?.isPublic !== undefined ? updatedData.isPublic : isPublic;
      const currentSlug = updatedData?.slug !== undefined ? updatedData.slug : slug;

      const words = calculateWordCount(currentContent);
      const readTime = calculateReadingTime(words);

      const entry: JournalEntry = {
        id: initialEntry?.id || `entry-${dateStr}`,
        date: dateStr,
        title: currentTitle,
        content: currentContent,
        tags: currentTags,
        mood: currentMood,
        isPublic: currentIsPublic,
        slug: currentSlug || generateSlug(currentTitle, dateStr),
        createdAt: initialEntry?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wordCount: words,
        readingTime: readTime,
      };

      onSave(entry);
      setSaveStatus('saved');
    }, 700);
  };

  // Insert emoji at cursor position
  const handleInsertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? content.length;
      const end = textarea.selectionEnd ?? content.length;
      const newContent = content.substring(0, start) + emoji + content.substring(end);

      setContent(newContent);
      triggerAutoSave({ content: newContent });

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 10);
    } else {
      const newContent = content ? `${content} ${emoji}` : emoji;
      setContent(newContent);
      triggerAutoSave({ content: newContent });
    }
    setIsEmojiPickerOpen(false);
  };

  // Markdown toolbar actions
  const insertMarkdown = (before: string, after: string = '', defaultPlaceholder: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end) || defaultPlaceholder;

    const replacement = `${before}${selectedText}${after}`;
    const newContent = content.substring(0, start) + replacement + content.substring(end);

    setContent(newContent);
    triggerAutoSave({ content: newContent });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 10);
  };

  // Add tag
  const handleAddTag = () => {
    const cleaned = tagInput.trim().toLowerCase().replace(/^#/, '');
    if (cleaned && !tags.includes(cleaned)) {
      const nextTags = [...tags, cleaned];
      setTags(nextTags);
      setTagInput('');
      triggerAutoSave({ tags: nextTags });
    }
  };

  // Remove tag
  const handleRemoveTag = (tagToRemove: string) => {
    const nextTags = tags.filter(t => t !== tagToRemove);
    setTags(nextTags);
    triggerAutoSave({ tags: nextTags });
  };

  // Toggle public publishing
  const handleTogglePublish = (publish: boolean) => {
    setIsPublic(publish);
    let newSlug = slug;
    if (publish && !slug) {
      newSlug = generateSlug(title, dateStr);
      setSlug(newSlug);
    }
    triggerAutoSave({ isPublic: publish, slug: newSlug });

    if (publish) {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
      });
      onShowToast('Published to Public Blog!', 'Anyone with the public link can read this article.', 'success');
    } else {
      onShowToast('Unpublished', 'Article is now private in your journal.', 'info');
    }
  };

  // Copy shareable public link
  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}#/blog/${slug}`
    : `#/blog/${slug}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedLink(true);
      onShowToast('Public Link Copied!', publicUrl, 'success');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      onShowToast('Failed to copy link', undefined, 'error');
    }
  };

  // Handle immediate manual save
  const handleManualSave = () => {
    if (isReadOnly) return;
    const words = calculateWordCount(content);
    const readTime = calculateReadingTime(words);
    const finalSlug = slug || generateSlug(title, dateStr);

    const entry: JournalEntry = {
      id: initialEntry?.id || `entry-${dateStr}`,
      date: dateStr,
      title,
      content,
      tags,
      mood,
      isPublic,
      slug: finalSlug,
      createdAt: initialEntry?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      wordCount: words,
      readingTime: readTime,
    };

    onSave(entry);
    setSaveStatus('saved');
    onShowToast('Entry Saved', 'Your changes have been safely recorded.', 'success');
  };

  // Handle Delete
  const handleDelete = () => {
    if (isReadOnly) return;
    if (window.confirm('Are you sure you want to delete this journal entry? This action cannot be undone.')) {
      onDelete(initialEntry?.id || `entry-${dateStr}`, dateStr);
      onClose();
    }
  };

  // Keyboard escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (isEmojiPickerOpen) {
          setIsEmojiPickerOpen(false);
        } else {
          onClose();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!isReadOnly) {
          handleManualSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isEmojiPickerOpen, title, content, tags, mood, isPublic, slug, isReadOnly]);

  if (!isOpen) return null;

  const currentWordCount = calculateWordCount(content);
  const currentReadTime = calculateReadingTime(currentWordCount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/60 backdrop-blur-sm overflow-hidden animate-in fade-in duration-150">
      {/* Modal Dialog Container with bounded height and strict flexbox containment */}
      <div className="relative w-full max-w-4xl h-[94vh] sm:h-auto sm:max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        
        {/* Modal Header (Fixed, non-scrolling) */}
        <div className="shrink-0 px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <Calendar className="w-4 h-4 text-emerald-500 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900 dark:text-white truncate">
              {formatHumanDate(dateStr)}
            </h2>
            {isReadOnly && (
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                <Lock className="w-3 h-3" />
                <span>Read-Only</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Save status indicator */}
            {!isReadOnly && (
              <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline-flex items-center gap-1">
                {saveStatus === 'saving' && 'Saving...'}
                {saveStatus === 'saved' && (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Saved</span>
                  </>
                )}
              </span>
            )}

            {/* View Mode Segmented Controls */}
            <div className="hidden sm:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                onClick={() => setViewMode('write')}
                className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'write'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Write Only"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'split'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Split Editor & Preview"
              >
                <Columns className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Preview Only"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / Scrollable Area (Scrolls cleanly on mobile with zero cut-off) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Read-only reminder notice */}
          {isReadOnly && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0 text-amber-500" />
              <span>
                {initialEntry && initialEntry.content && initialEntry.content.trim().length > 0
                  ? "This past entry is in read-only mode. Past reflections cannot be altered to preserve an authentic timeline."
                  : "No journal entry was recorded on this past date. Past dates are read-only and cannot be backdated."}
              </span>
            </div>
          )}

          {/* Title Input */}
          <div>
            <input
              type="text"
              value={title}
              readOnly={isReadOnly}
              onChange={(e) => {
                if (isReadOnly) return;
                setTitle(e.target.value);
                triggerAutoSave({ title: e.target.value });
              }}
              placeholder={isReadOnly ? 'Untitled Entry' : 'Entry Title (e.g. Reflections on creative focus...)'}
              className={`w-full text-lg sm:text-2xl font-bold font-display tracking-tight text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 bg-transparent border-0 focus:outline-none focus:ring-0 px-0 ${
                isReadOnly ? 'cursor-default' : ''
              }`}
            />
          </div>

          {/* Mood, Emoji Picker & Tag Row */}
          <div className="flex flex-wrap items-center gap-3 py-2 border-y border-slate-100 dark:border-slate-800/80">
            {/* Mood selector */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mr-1">Mood:</span>
              <div className="flex items-center gap-1 flex-wrap">
                {MOODS.map(m => (
                  <button
                    key={m.type}
                    disabled={isReadOnly}
                    onClick={() => {
                      if (isReadOnly) return;
                      const newMood = mood === m.type ? undefined : m.type;
                      setMood(newMood);
                      triggerAutoSave({ mood: newMood });
                    }}
                    className={`px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1 ${
                      mood === m.type
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30 font-semibold'
                        : isReadOnly
                        ? 'text-slate-400 opacity-60 cursor-default'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    title={m.label}
                  >
                    <span>{m.emoji}</span>
                    <span className="hidden md:inline">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dedicated Emoji Picker Trigger (Only when editable) */}
            {!isReadOnly && (
              <div className="relative" ref={emojiPickerRef}>
                <button
                  type="button"
                  onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-all flex items-center gap-1.5 ${
                    isEmojiPickerOpen
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="Open Emoji Picker"
                >
                  <Smile className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-medium">Emoji</span>
                </button>

                {/* Emoji Picker Popover */}
                {isEmojiPickerOpen && (
                  <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 z-50 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-3 space-y-2 animate-in fade-in zoom-in-95 duration-100">
                    {/* Category switcher */}
                    <div className="flex items-center gap-1 pb-2 border-b border-slate-100 dark:border-slate-800 overflow-x-auto text-[11px]">
                      {EMOJI_CATEGORIES.map((cat, idx) => (
                        <button
                          key={cat.name}
                          onClick={() => setActiveEmojiCategory(idx)}
                          className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors ${
                            activeEmojiCategory === idx
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>

                    {/* Emoji Grid */}
                    <div className="grid grid-cols-6 gap-1 max-h-48 overflow-y-auto p-1">
                      {EMOJI_CATEGORIES[activeEmojiCategory].emojis.map((emoji, index) => (
                        <button
                          key={`${emoji}-${index}`}
                          type="button"
                          onClick={() => handleInsertEmoji(emoji)}
                          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-lg hover:scale-115 transition-transform"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>

                    <p className="text-[10px] text-slate-400 text-center pt-1 border-t border-slate-100 dark:border-slate-800">
                      Click an emoji to insert directly into your notes
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tags display and entry */}
            <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-[180px]">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mr-1">Tags:</span>
              {tags.map(t => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md"
                >
                  #{t}
                  {!isReadOnly && (
                    <button
                      onClick={() => handleRemoveTag(t)}
                      className="hover:text-rose-500 transition-colors"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {!isReadOnly && (
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="+ tag..."
                  className="text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-600 bg-transparent border-0 focus:outline-none w-20"
                />
              )}
            </div>
          </div>

          {/* Markdown Toolbar (Only when editable) */}
          {!isReadOnly && viewMode !== 'preview' && (
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
              <button
                onClick={() => insertMarkdown('**', '**', 'bold text')}
                className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Bold (**text**)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertMarkdown('*', '*', 'italic text')}
                className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Italic (*text*)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertMarkdown('# ', '', 'Heading 1')}
                className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Heading 1 (# Heading)"
              >
                <Heading1 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertMarkdown('## ', '', 'Heading 2')}
                className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Heading 2 (## Heading)"
              >
                <Heading2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertMarkdown('~~', '~~', 'strikethrough')}
                className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Strikethrough (~~text~~)"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800 mx-1" />

              <button
                onClick={() => insertMarkdown('> ', '', 'Quoted thought')}
                className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Quote (> quote)"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertMarkdown('- ', '', 'Bullet point')}
                className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Bullet List (- item)"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertMarkdown('- [ ] ', '', 'Task to complete')}
                className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Task checkbox (- [ ] task)"
              >
                <CheckSquare className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertMarkdown('```\n', '\n```', 'code here')}
                className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Code block"
              >
                <Code className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertMarkdown('[', '](https://)', 'Link text')}
                className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Hyperlink"
              >
                <LinkIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertMarkdown('\n---\n', '', '')}
                className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Horizontal Rule (---)"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Editor / Preview Area */}
          <div className="min-h-[220px]">
            {viewMode === 'write' && (
              <textarea
                ref={textareaRef}
                value={content}
                readOnly={isReadOnly}
                onChange={(e) => {
                  if (isReadOnly) return;
                  setContent(e.target.value);
                  triggerAutoSave({ content: e.target.value });
                }}
                placeholder={isReadOnly ? 'No content in this historical entry.' : 'Write your stream of consciousness, notes, reflections, or blog post in Markdown...'}
                className={`w-full h-56 sm:h-72 md:h-80 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 font-sans focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-y leading-relaxed ${
                  isReadOnly ? 'cursor-default' : ''
                }`}
              />
            )}

            {viewMode === 'preview' && (
              <div className="w-full min-h-[240px] max-h-[50vh] overflow-y-auto p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/40 text-slate-800 dark:text-slate-200 markdown-content font-serif-prose">
                {content ? (
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
                ) : (
                  <p className="text-slate-400 italic">No content in this journal entry.</p>
                )}
              </div>
            )}

            {viewMode === 'split' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <textarea
                  ref={textareaRef}
                  value={content}
                  readOnly={isReadOnly}
                  onChange={(e) => {
                    if (isReadOnly) return;
                    setContent(e.target.value);
                    triggerAutoSave({ content: e.target.value });
                  }}
                  placeholder={isReadOnly ? 'No content in this historical entry.' : 'Write in Markdown here...'}
                  className={`w-full h-56 sm:h-72 md:h-80 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 font-code text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none leading-relaxed ${
                    isReadOnly ? 'cursor-default' : ''
                  }`}
                />
                <div className="w-full h-56 sm:h-72 md:h-80 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/40 text-slate-800 dark:text-slate-200 overflow-y-auto markdown-content font-serif-prose text-sm">
                  {content ? (
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
                  ) : (
                    <p className="text-slate-400 italic">No content in this journal entry.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Word Count & Read Time Bar */}
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
            <div className="flex items-center gap-3">
              <span>{currentWordCount} words</span>
              <span aria-hidden="true">·</span>
              <span>{currentReadTime} min read</span>
            </div>

            {initialEntry && !isReadOnly && (
              <button
                onClick={handleDelete}
                className="text-rose-500 hover:text-rose-600 dark:text-rose-400 flex items-center gap-1 hover:underline transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Entry</span>
              </button>
            )}
          </div>

          {/* Prominent Public Blog Publishing Card */}
          <div className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500 shrink-0 mt-0.5">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Publish as Public Blog Post
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Instantly create a shareable, distraction-free reading link for unauthenticated readers.
                  </p>
                </div>
              </div>

              {/* Modern Switch Toggle */}
              <label className={`relative inline-flex items-center ${isReadOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} shrink-0`}>
                <input
                  type="checkbox"
                  checked={isPublic}
                  disabled={isReadOnly}
                  onChange={(e) => {
                    if (isReadOnly) return;
                    handleTogglePublish(e.target.checked);
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-cyan-500"></div>
              </label>
            </div>

            {/* If Public is Enabled: Slug & Shareable URL */}
            {isPublic && (
              <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
                    URL Slug:
                  </span>
                  <input
                    type="text"
                    value={slug}
                    readOnly={isReadOnly}
                    onChange={(e) => {
                      if (isReadOnly) return;
                      const newSlug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                      setSlug(newSlug);
                      triggerAutoSave({ slug: newSlug });
                    }}
                    placeholder="custom-slug"
                    className="flex-1 px-3 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400 truncate flex-1">
                    {publicUrl}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleCopyLink}
                      className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 text-slate-700 dark:text-slate-300"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                    </button>
                    <button
                      onClick={() => {
                        onClose();
                        onOpenPublicPost(slug);
                      }}
                      className="px-2.5 py-1 text-xs font-medium rounded-md bg-cyan-600 hover:bg-cyan-500 text-white transition-colors flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>View Live Post</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer (Fixed, non-scrolling, never cut off) */}
        <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xs">
          <p className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block">
            Press <kbd className="font-mono bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">Esc</kbd> to close · auto-saves
          </p>
          <div className="flex items-center gap-2 ml-auto">
            {isReadOnly ? (
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg shadow-xs transition-colors"
              >
                Close (Read-Only)
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    handleManualSave();
                    onClose();
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Done</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
