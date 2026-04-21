import React, { useState, useEffect } from 'react';
import { 
  Camera, 
  Sparkles, 
  Copy, 
  History as HistoryIcon, 
  RefreshCw, 
  Moon, 
  Sun, 
  Upload, 
  X, 
  Check, 
  ChevronRight,
  Send,
  Trash2,
  Globe,
  Plus,
  MessageSquare,
  Search,
  Heart,
  User,
  Settings,
  Save,
  AlertCircle,
  Layout,
  PlusCircle,
  Pencil,
  FileText,
  Hash,
  Split,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Platform, 
  Tone, 
  Length, 
  GenerationOptions, 
  GeneratedCaption, 
  AppState 
} from './types';
import { generateCaptions, suggestHashtags } from './lib/gemini';
import { resizeImage } from './lib/image-utils';

const PLATFORMS: Platform[] = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'X/Twitter', 'Pinterest', 'Threads'];
const TONES: Tone[] = [
  'Fun & Playful', 'Professional', 'Witty/Humorous', 'Inspirational', 
  'Luxury/Elegant', 'Casual', 'Salesy/Promotional', 'Emotional', 'Educational'
];
const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Japanese', 'Korean', 'Urdu (اردو)'];

export default function App() {
  const [state, setState] = useState<AppState>({
    image: null,
    imageName: null,
    context: '',
    options: {
      platforms: ['Instagram'],
      tone: 'Fun & Playful',
      length: 'Medium',
      includeEmojis: true,
      includeHashtags: true,
      includeCTA: true,
      language: 'English',
      variationCount: 3,
    },
    abOptions: {
      platforms: ['Instagram'],
      tone: 'Professional',
      length: 'Medium',
      includeEmojis: true,
      includeHashtags: true,
      includeCTA: true,
      language: 'English',
      variationCount: 3,
    },
    abMode: false,
    results: [],
    history: [],
    templates: [],
    selectedTemplateId: null,
    isGenerating: false,
    visualAnalysis: null,
    theme: 'light',
    error: null,
    settings: {
      defaultLanguage: 'English',
      defaultTone: 'Fun & Playful',
      defaultPlatforms: ['Instagram'],
    }
  });

  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [activeTab, setActiveTab] = useState<'All' | 'Favorites'>('All');
  const [activeVariant, setActiveVariant] = useState<'A' | 'B'>('A');
  const [newTemplate, setNewTemplate] = useState({ name: '', structure: '' });
  const [isEditingTemplate, setIsEditingTemplate] = useState<string | null>(null);
  
  // Hashtag Analysis State
  const [showHashtags, setShowHashtags] = useState(false);
  const [analyzingCaption, setAnalyzingCaption] = useState<GeneratedCaption | null>(null);
  const [suggestedHashtags, setSuggestedHashtags] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hashtagError, setHashtagError] = useState<string | null>(null);

  // Load history, theme, and settings from local storage
  useEffect(() => {
    const savedHistory = localStorage.getItem('captionAI_history');
    const savedTheme = localStorage.getItem('captionAI_theme') as 'dark' | 'light';
    const savedSettings = localStorage.getItem('captionAI_settings');
    const savedTemplates = localStorage.getItem('captionAI_templates');
    
    if (savedHistory) {
      setState(prev => ({ ...prev, history: JSON.parse(savedHistory) }));
    }
    
    if (savedTemplates) {
      setState(prev => ({ ...prev, templates: JSON.parse(savedTemplates) }));
    }
    
    if (savedTheme) {
      setState(prev => ({ ...prev, theme: savedTheme }));
      if (savedTheme === 'dark') document.documentElement.classList.add('dark');
    }

    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setState(prev => ({ 
        ...prev, 
        settings,
        options: {
          ...prev.options,
          tone: settings.defaultTone,
          language: settings.defaultLanguage,
          platforms: settings.defaultPlatforms
        }
      }));
    }
  }, []);

  // Save settings to local storage
  const saveSettings = (settings: any) => {
    localStorage.setItem('captionAI_settings', JSON.stringify(settings));
    setState(prev => ({ ...prev, settings, error: null }));
    setShowSettings(false);
  };

  // Save history to local storage
  useEffect(() => {
    localStorage.setItem('captionAI_history', JSON.stringify(state.history));
  }, [state.history]);

  // Save templates to local storage
  useEffect(() => {
    localStorage.setItem('captionAI_templates', JSON.stringify(state.templates));
  }, [state.templates]);

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    setState(prev => ({ ...prev, theme: newTheme }));
    localStorage.setItem('captionAI_theme', newTheme);
    document.documentElement.classList.toggle('dark');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        // Optimize: Resize image client-side to reduce upload size and processing time
        const optimizedImage = await resizeImage(base64);
        
        setState(prev => ({ 
          ...prev, 
          image: optimizedImage,
          imageName: file.name,
          visualAnalysis: null // Reset analysis for new image
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!state.image && !state.context) return;
    
    setState(prev => ({ ...prev, isGenerating: true }));
    
    try {
      const template = state.templates.find(t => t.id === state.selectedTemplateId);
      
      const generateTask = async (options: GenerationOptions, variant?: 'A' | 'B') => {
        const result = await generateCaptions(
          state.image, 
          state.context, 
          options,
          template?.structure || null
        );
        return result.captions.map(c => ({ ...c, variant }));
      };

      let finalCaptions: GeneratedCaption[] = [];
      let finalVisualAnalysis: string | null = null;

      if (state.abMode && state.abOptions) {
        // Run both in parallel
        const [resA, resB] = await Promise.all([
          generateCaptions(state.image, state.context, state.options, template?.structure || null),
          generateCaptions(state.image, state.context, state.abOptions, template?.structure || null)
        ]);
        
        finalCaptions = [
          ...resA.captions.map(c => ({ ...c, variant: 'A' as const })),
          ...resB.captions.map(c => ({ ...c, variant: 'B' as const }))
        ];
        finalVisualAnalysis = resA.visualAnalysis; // Analysis should be same for both
      } else {
        const res = await generateCaptions(state.image, state.context, state.options, template?.structure || null);
        finalCaptions = res.captions;
        finalVisualAnalysis = res.visualAnalysis;
      }

      setState(prev => ({ 
        ...prev, 
        results: finalCaptions, 
        history: [...finalCaptions, ...prev.history].slice(0, 50),
        visualAnalysis: finalVisualAnalysis,
        isGenerating: false,
        error: null
      }));
    } catch (error: any) {
      console.error(error);
      setState(prev => ({ 
        ...prev, 
        isGenerating: false,
        error: error.message || "Failed to generate captions. Please check your image or context and try again."
      }));
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const togglePlatform = (p: Platform) => {
    setState(prev => {
      const targetOptions = activeVariant === 'A' ? 'options' : 'abOptions';
      const options = prev[targetOptions];
      if (!options) return prev;

      const platforms = options.platforms.includes(p)
        ? options.platforms.filter(item => item !== p)
        : [...options.platforms, p];
      
      return { 
        ...prev, 
        [targetOptions]: { ...options, platforms: platforms.length > 0 ? platforms : options.platforms } 
      };
    });
  };

  const deleteHistoryItem = (id: string) => {
    setState(prev => ({
      ...prev,
      history: prev.history.filter(item => item.id !== id)
    }));
  };

  const toggleFavorite = (id: string) => {
    setState(prev => {
      const updateList = (list: GeneratedCaption[]) => 
        list.map(item => item.id === id ? { ...item, isFavorite: !item.isFavorite } : item);
        
      return {
        ...prev,
        results: updateList(prev.results),
        history: updateList(prev.history)
      };
    });
  };

  const clearResults = () => {
    setState(prev => ({ ...prev, results: [], image: null, imageName: null, context: '', visualAnalysis: null }));
  };

  const handleAddTemplate = () => {
    if (!newTemplate.name || !newTemplate.structure) return;
    
    if (isEditingTemplate) {
      setState(prev => ({
        ...prev,
        templates: prev.templates.map(t => t.id === isEditingTemplate 
          ? { ...t, name: newTemplate.name, structure: newTemplate.structure } 
          : t)
      }));
      setIsEditingTemplate(null);
    } else {
      const template = {
        id: crypto.randomUUID(),
        name: newTemplate.name,
        structure: newTemplate.structure,
      };
      setState(prev => ({
        ...prev,
        templates: [...prev.templates, template]
      }));
    }
    setNewTemplate({ name: '', structure: '' });
  };

  const deleteTemplate = (id: string) => {
    setState(prev => ({
      ...prev,
      templates: prev.templates.filter(t => t.id !== id),
      selectedTemplateId: prev.selectedTemplateId === id ? null : prev.selectedTemplateId
    }));
  };

  const editTemplate = (template: any) => {
    setNewTemplate({ name: template.name, structure: template.structure });
    setIsEditingTemplate(template.id);
    setShowTemplates(true);
  };

  const handleAnalyzeHashtags = async (caption: GeneratedCaption) => {
    setAnalyzingCaption(caption);
    setShowHashtags(true);
    setIsAnalyzing(true);
    setSuggestedHashtags([]);
    setHashtagError(null);
    
    try {
      // Optimize: Use cached visual analysis instead of re-sending full image binary
      const suggestions = await suggestHashtags(caption.text, state.visualAnalysis, state.context, caption.language);
      setSuggestedHashtags(suggestions);
    } catch (err: any) {
      console.error("Failed to fetch hashtags", err);
      setHashtagError(err.message || "Failed to analyze hashtags.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleHashtag = (hashtag: string) => {
    if (!analyzingCaption) return;

    const currentText = analyzingCaption.text;
    const cleanHashtag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
    const hasHashtag = currentText.toLowerCase().includes(cleanHashtag.toLowerCase());

    let newText;
    if (hasHashtag) {
      // Remove it (and handle whitespace)
      const regex = new RegExp(`\\s*${cleanHashtag.replace('#', '\\#')}\\b`, 'gi');
      newText = currentText.replace(regex, '').trim();
    } else {
      // Add it
      newText = `${currentText} ${cleanHashtag}`.trim();
    }

    // Update local state for immediate feedback in modal
    setAnalyzingCaption(prev => prev ? { ...prev, text: newText } : null);

    // Update main state (results and history)
    setState(prev => {
      const updateList = (list: GeneratedCaption[]) => 
        list.map(item => item.id === analyzingCaption.id ? { ...item, text: newText } : item);
      
      return {
        ...prev,
        results: updateList(prev.results),
        history: updateList(prev.history)
      };
    });
  };

  const filteredHistory = state.history.filter(item => {
    const matchesSearch = item.text.toLowerCase().includes(historySearch.toLowerCase());
    const matchesTab = activeTab === 'All' || item.isFavorite;
    return matchesSearch && matchesTab;
  });

  const renderResults = (variant?: 'A' | 'B') => {
    const displayResults = variant 
      ? state.results.filter(c => c.variant === variant)
      : state.results;

    return (
      <AnimatePresence mode="popLayout">
        {state.isGenerating ? (
          Array.from({ length: 3 }).map((_, i) => (
            <motion.div 
              key={`skeleton-${variant}-${i}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="vibrant-card animate-pulse"
            >
              <div className="h-4 bg-white/5 rounded w-1/4 mb-4"></div>
              <div className="h-4 bg-white/5 rounded w-full mb-2"></div>
              <div className="h-4 bg-white/5 rounded w-full mb-2"></div>
              <div className="h-4 bg-white/5 rounded w-2/3"></div>
            </motion.div>
          ))
        ) : displayResults.length > 0 ? (
          displayResults.map((caption) => (
            <motion.div 
              key={caption.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="vibrant-card group relative"
            >
              {variant && (
                <div className={`absolute top-0 right-0 px-2 py-1 rounded-bl-xl text-[10px] font-bold uppercase tracking-widest border-l border-b border-border-subtle ${
                  variant === 'A' ? 'bg-accent-teal/10 text-accent-teal' : 'bg-accent-purple/10 text-accent-purple'
                }`}>
                  Variant {variant}
                </div>
              )}
              <div className="caption-text text-[15px] leading-relaxed mb-4 text-text-primary italic">
                "{caption.text}"
              </div>
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-4 pt-4 border-t border-border-subtle gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary bg-white/5 px-2 py-1 rounded">
                    {caption.platform} • {caption.tone}
                  </span>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button 
                    onClick={() => toggleFavorite(caption.id)}
                    className={`p-2 rounded-lg transition-all border ${
                      caption.isFavorite 
                        ? 'bg-rose-500/10 border-rose-500/50 text-rose-500' 
                        : 'bg-transparent border-border-subtle text-text-secondary hover:bg-white/5'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${caption.isFavorite ? 'fill-current' : ''}`} />
                  </button>
                  <button 
                    onClick={() => handleAnalyzeHashtags(caption)}
                    className="p-2 border border-border-subtle rounded-lg text-text-secondary hover:bg-white/5 hover:text-white transition-all"
                    title="Suggest Hashtags"
                  >
                    <Hash className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => copyToClipboard(caption.text, caption.id)}
                    className={`flex-1 sm:flex-none px-3 py-1.5 text-[12px] font-semibold border rounded-lg transition-all ${
                      copiedId === caption.id 
                        ? 'bg-accent-teal/10 border-accent-teal text-accent-teal' 
                        : 'bg-transparent border-border-subtle text-text-secondary hover:bg-white/5'
                    }`}
                  >
                    {copiedId === caption.id ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          !state.isGenerating && !variant && (
            <div className="flex flex-col items-center justify-center py-20 opacity-20">
              <Sparkles className="w-16 h-16 mb-4" />
              <p className="text-xl font-bold">Your captions will appear here</p>
            </div>
          )
        )}
      </AnimatePresence>
    );
  };

  return (
    <div className="min-h-screen md:h-screen flex flex-col md:overflow-hidden">
      {/* Navbar */}
      <header className="vibrant-glass shrink-0 h-16 flex items-center justify-between px-6 md:px-8 sticky top-0 z-50">
        <div className="logo text-lg md:text-xl font-extrabold tracking-tight flex items-center gap-2">
          <span className="bg-gradient-to-br from-accent-teal to-accent-purple bg-clip-text text-transparent">
            CaptionAI
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          <div className="text-accent-teal text-sm font-semibold cursor-pointer">Generator</div>
          <div className="text-text-secondary text-sm font-medium cursor-pointer hover:text-text-primary" onClick={() => setShowTemplates(true)}>Templates</div>
          <div className="text-text-secondary text-sm font-medium cursor-pointer hover:text-text-primary" onClick={() => setShowHistory(true)}>History</div>
        </nav>

        <div className="flex items-center gap-3">
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-white/5 transition-colors"
          >
            {state.theme === 'light' ? <Moon className="w-5 h-5 text-text-secondary" /> : <Sun className="w-5 h-5 text-text-secondary" />}
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-full hover:bg-white/5 transition-all text-text-secondary hover:text-text-primary"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-[380px_1fr] md:overflow-hidden relative">
        {/* Error Toast */}
        <AnimatePresence>
          {state.error && (
            <motion.div 
              initial={{ opacity: 0, y: -20, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: -20, x: '-50%' }}
              className="fixed top-20 left-1/2 z-[100] w-[90%] max-w-md bg-red-500 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                <div className="flex flex-col">
                  <p className="text-sm font-bold">{state.error.split(':')[0]}</p>
                  <p className="text-xs opacity-90">{state.error.split(':')[1] || state.error}</p>
                </div>
              </div>
              <button 
                onClick={() => setState(prev => ({ ...prev, error: null }))}
                className="hover:bg-white/10 p-1 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Left Sidebar: Generator Panel */}
        <aside className="vibrant-sidebar custom-scrollbar md:h-full md:overflow-y-auto shrink-0">
          <div className="space-y-6">
            {/* A/B Test Toggle */}
            <div className="p-4 bg-white/5 rounded-2xl border border-border-subtle">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Split className={`w-4 h-4 ${state.abMode ? 'text-accent-teal' : 'text-text-secondary'}`} />
                  <span className="text-xs font-bold uppercase tracking-wider">A/B Testing</span>
                </div>
                <button 
                  onClick={() => setState(prev => ({ ...prev, abMode: !prev.abMode }))}
                  className={`w-10 h-5 rounded-full transition-all relative ${state.abMode ? 'bg-accent-teal' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${state.abMode ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              <p className="text-[10px] text-text-secondary leading-relaxed">
                Compare two different settings side-by-side to find the perfect caption style.
              </p>
              
              {state.abMode && (
                <div className="flex gap-2 mt-4 p-1 bg-black/20 rounded-xl">
                  <button 
                    onClick={() => setActiveVariant('A')}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${activeVariant === 'A' ? 'bg-white/10 text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                  >
                    Variant A
                  </button>
                  <button 
                    onClick={() => setActiveVariant('B')}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${activeVariant === 'B' ? 'bg-white/10 text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                  >
                    Variant B
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="vibrant-label">Visual Content</label>
              <label className="vibrant-upload min-h-[160px] md:h-44 w-full relative">
                {state.image ? (
                  <div className="absolute inset-0 p-3">
                    <img 
                      src={state.image} 
                      alt="Preview" 
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        setState(prev => ({ ...prev, image: null, imageName: null }));
                      }}
                      className="absolute top-5 right-5 p-1 bg-black/60 rounded-full text-white hover:bg-black transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center transition-colors group-hover:bg-white/10 mb-2">
                      <Camera className="w-5 h-5 text-text-secondary" />
                    </div>
                    <p className="text-[13px] text-text-secondary font-medium">Drop image or click to upload</p>
                    <p className="text-[10px] text-text-secondary/60">Supports JPG, PNG, WebP</p>
                  </div>
                )}
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
              </label>
            </div>

            <div>
              <label className="vibrant-label">Additional Context</label>
              <textarea 
                value={state.context}
                onChange={(e) => setState(prev => ({ ...prev, context: e.target.value }))}
                placeholder="Describe your post... e.g. Hiking in the Alps with my best friends during summer sunset."
                className="vibrant-textarea h-24"
              />
            </div>

            <div>
              <label className="vibrant-label">Platforms</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map(p => {
                  const currentOptions = activeVariant === 'A' ? state.options : state.abOptions;
                  return (
                    <div
                      key={p}
                      onClick={() => togglePlatform(p)}
                      className={`vibrant-chip ${currentOptions?.platforms.includes(p) ? 'active' : ''}`}
                    >
                      {p}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="vibrant-label m-0">Caption Template</label>
                <button 
                  onClick={() => setShowTemplates(true)}
                  className="text-xs text-accent-teal hover:underline flex items-center gap-1"
                >
                  <PlusCircle className="w-3 h-3" /> Manage
                </button>
              </div>
              <select 
                value={state.selectedTemplateId || ''}
                onChange={(e) => setState(prev => ({ ...prev, selectedTemplateId: e.target.value || null }))}
                className="vibrant-input"
              >
                <option value="">No Template (AI Creative Mode)</option>
                {state.templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="vibrant-label">Tone</label>
                <select 
                  value={(activeVariant === 'A' ? state.options : state.abOptions)?.tone}
                  onChange={(e) => {
                    const target = activeVariant === 'A' ? 'options' : 'abOptions';
                    setState(prev => ({ ...prev, [target]: { ...prev[target]!, tone: e.target.value as Tone }}));
                  }}
                  className="vibrant-input"
                >
                  {TONES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="vibrant-label">Length</label>
                <select 
                  value={(activeVariant === 'A' ? state.options : state.abOptions)?.length}
                  onChange={(e) => {
                    const target = activeVariant === 'A' ? 'options' : 'abOptions';
                    setState(prev => ({ ...prev, [target]: { ...prev[target]!, length: e.target.value as Length }}));
                  }}
                  className="vibrant-input"
                >
                  <option value="Short">Short (1-2 lines)</option>
                  <option value="Medium">Medium (3-5 lines)</option>
                  <option value="Long">Long (Story)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="vibrant-label">Language</label>
              <select 
                value={(activeVariant === 'A' ? state.options : state.abOptions)?.language}
                onChange={(e) => {
                  const target = activeVariant === 'A' ? 'options' : 'abOptions';
                  setState(prev => ({ ...prev, [target]: { ...prev[target]!, language: e.target.value }}));
                }}
                className="vibrant-input"
              >
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-[13px] text-text-secondary group-hover:text-text-primary transition-colors">Include Emojis</span>
                <input 
                  type="checkbox" 
                  checked={(activeVariant === 'A' ? state.options : state.abOptions)?.includeEmojis}
                  onChange={(e) => {
                    const target = activeVariant === 'A' ? 'options' : 'abOptions';
                    setState(prev => ({ ...prev, [target]: { ...prev[target]!, includeEmojis: e.target.checked }}));
                  }}
                  className="w-4 h-4 rounded border-border-subtle bg-bg-card accent-accent-teal"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-[13px] text-text-secondary group-hover:text-text-primary transition-colors">Include Hashtags</span>
                <input 
                  type="checkbox" 
                  checked={(activeVariant === 'A' ? state.options : state.abOptions)?.includeHashtags}
                  onChange={(e) => {
                    const target = activeVariant === 'A' ? 'options' : 'abOptions';
                    setState(prev => ({ ...prev, [target]: { ...prev[target]!, includeHashtags: e.target.checked }}));
                  }}
                  className="w-4 h-4 rounded border-border-subtle bg-bg-card accent-accent-teal"
                />
              </label>
            </div>
          </div>

          <button 
            onClick={() => {
              handleGenerate();
              // Scroll to results on mobile after a short delay
              if (window.innerWidth < 768) {
                setTimeout(() => {
                  document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }
            }}
            disabled={(!state.image && !state.context) || state.isGenerating}
            className="btn-vibrant-generate mt-8 md:mt-auto flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
          >
            {state.isGenerating ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
            Generate Captions
          </button>
        </aside>

        {/* Right Panel: Results */}
        <section id="results-section" className="vibrant-results custom-scrollbar md:h-full md:overflow-y-auto">
          <div className="results-header flex items-end justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-text-secondary bg-clip-text text-transparent">
                {state.abMode ? 'A/B Comparison' : 'Generated for You'}
              </h2>
              <p className="text-text-secondary text-sm">
                {state.results.length > 0 
                  ? (state.abMode 
                      ? 'Compare Variant A (Left) vs Variant B (Right)' 
                      : `Based on your "${state.context.slice(0, 20)}..." context`) 
                  : 'Start by entering some context or uploading a photo'}
              </p>
            </div>
            {state.results.length > 0 && (
              <button 
                onClick={handleGenerate}
                className="px-3 py-1.5 border border-border-subtle rounded-lg text-xs font-semibold text-text-secondary flex items-center gap-1.5 hover:bg-white/5 hover:text-white transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Regenerate all
              </button>
            )}
          </div>

          <div className={`caption-grid ${state.abMode ? 'grid grid-cols-1 lg:grid-cols-2 gap-8 space-y-0' : 'space-y-5'}`}>
            {state.abMode ? (
              <>
                <div className="space-y-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="px-2 py-0.5 bg-accent-teal/10 text-accent-teal border border-accent-teal/50 rounded text-[10px] font-bold uppercase tracking-widest">Variant A</span>
                    <span className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">{state.options.tone} • {state.options.length}</span>
                  </div>
                  {renderResults('A')}
                </div>
                <div className="space-y-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="px-2 py-0.5 bg-accent-purple/10 text-accent-purple border border-accent-purple/50 rounded text-[10px] font-bold uppercase tracking-widest">Variant B</span>
                    <span className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">{(state.abOptions || state.options).tone} • {(state.abOptions || state.options).length}</span>
                  </div>
                  {renderResults('B')}
                </div>
              </>
            ) : (
              renderResults()
            )}
          </div>
        </section>
      </main>


      {/* Templates Modal */}
      <AnimatePresence>
        {showTemplates && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowTemplates(false);
                setIsEditingTemplate(null);
                setNewTemplate({ name: '', structure: '' });
              }}
              className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-2xl bg-bg-card border border-border-subtle rounded-3xl shadow-2xl z-[110] overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-purple to-accent-orange flex items-center justify-center text-white">
                      <Layout className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">Caption Templates</h2>
                      <p className="text-text-secondary text-sm">Create structures for the AI to follow</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setShowTemplates(false);
                      setIsEditingTemplate(null);
                      setNewTemplate({ name: '', structure: '' });
                    }}
                    className="p-2 hover:bg-white/5 rounded-full text-text-secondary"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  {/* Create/Edit Form */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-text-primary">
                      {isEditingTemplate ? 'Edit Template' : 'Create New Template'}
                    </h3>
                    <div>
                      <label className="vibrant-label">Template Name</label>
                      <input 
                        type="text" 
                        value={newTemplate.name}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. Engaging Hook"
                        className="vibrant-input"
                      />
                    </div>
                    <div>
                      <label className="vibrant-label">Structure</label>
                      <textarea 
                        value={newTemplate.structure}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, structure: e.target.value }))}
                        placeholder="[Hook]&#10;&#10;[Body text about {context}]&#10;&#10;[CTA]"
                        className="vibrant-textarea h-32"
                      />
                      <p className="text-[10px] text-text-secondary mt-2 leading-relaxed">
                        Use brackets like [Hook] to tell AI what to write. Mention {"{context}"} to focus on your input.
                      </p>
                    </div>
                    <button 
                      onClick={handleAddTemplate}
                      disabled={!newTemplate.name || !newTemplate.structure}
                      className="w-full btn-vibrant-generate flex items-center justify-center gap-2"
                    >
                      {isEditingTemplate ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      {isEditingTemplate ? 'Update Template' : 'Save Template'}
                    </button>
                  </div>

                  {/* Saved Templates List */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-text-primary">Your Templates</h3>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                      {state.templates.length === 0 ? (
                        <div className="text-center py-10 opacity-30">
                          <FileText className="w-12 h-12 mx-auto mb-2" />
                          <p className="text-sm">No templates saved yet</p>
                        </div>
                      ) : (
                        state.templates.map(template => (
                          <div 
                            key={template.id}
                            className={`p-3 rounded-xl border transition-all ${
                              state.selectedTemplateId === template.id 
                                ? 'bg-accent-teal/10 border-accent-teal' 
                                : 'bg-white/5 border-border-subtle'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-sm truncate pr-2">{template.name}</span>
                              <div className="flex gap-1 shrink-0">
                                <button 
                                  onClick={() => editTemplate(template)}
                                  className="p-1.5 hover:bg-white/10 rounded-lg text-text-secondary hover:text-white"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => deleteTemplate(template.id)}
                                  className="p-1.5 hover:bg-red-500/10 rounded-lg text-text-secondary hover:text-red-500"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <p className="text-[11px] text-text-secondary line-clamp-2 italic">
                              {template.structure}
                            </p>
                            <button 
                              onClick={() => {
                                setState(prev => ({ ...prev, selectedTemplateId: template.id }));
                                setShowTemplates(false);
                              }}
                              className="mt-2 text-[10px] font-bold uppercase tracking-wider text-accent-teal hover:underline"
                            >
                              Select This Template
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-lg bg-bg-card border border-border-subtle rounded-3xl shadow-2xl z-[110] overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-teal to-accent-purple flex items-center justify-center text-white">
                      <Settings className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">Settings</h2>
                      <p className="text-text-secondary text-sm">Customize your default preferences</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="p-2 hover:bg-white/5 rounded-full text-text-secondary"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="vibrant-label">Default Tone</label>
                      <select 
                        value={state.settings.defaultTone}
                        onChange={(e) => setState(prev => ({ ...prev, settings: { ...prev.settings, defaultTone: e.target.value as Tone } }))}
                        className="vibrant-input"
                      >
                        {TONES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="vibrant-label">Default Language</label>
                      <select 
                        value={state.settings.defaultLanguage}
                        onChange={(e) => setState(prev => ({ ...prev, settings: { ...prev.settings, defaultLanguage: e.target.value } }))}
                        className="vibrant-input"
                      >
                        {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="vibrant-label">Default Platforms</label>
                    <div className="flex flex-wrap gap-2">
                      {PLATFORMS.map(p => (
                        <div
                          key={p}
                          onClick={() => {
                            const current = state.settings.defaultPlatforms;
                            const next = current.includes(p) 
                              ? current.filter(x => x !== p)
                              : [...current, p];
                            if (next.length > 0) {
                              setState(prev => ({ ...prev, settings: { ...prev.settings, defaultPlatforms: next } }));
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                            state.settings.defaultPlatforms.includes(p)
                              ? 'bg-accent-teal/10 border-accent-teal text-accent-teal'
                              : 'bg-white/5 border-border-subtle text-text-secondary'
                          }`}
                        >
                          {p}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-10 flex gap-4">
                  <button 
                    onClick={() => saveSettings(state.settings)}
                    className="flex-1 btn-vibrant-generate flex items-center justify-center gap-2"
                  >
                    <Save className="w-5 h-5" />
                    Save Defaults
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* History Drawer */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-sm dark:bg-slate-900 bg-white shadow-2xl z-[70] flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HistoryIcon className="w-5 h-5 text-indigo-500" />
                    <h2 className="text-xl font-bold">History & Favorites</h2>
                  </div>
                  <button 
                    onClick={() => setShowHistory(false)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Search history..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                  
                  <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    <button 
                      onClick={() => setActiveTab('All')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'All' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      All
                    </button>
                    <button 
                      onClick={() => setActiveTab('Favorites')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'Favorites' ? 'bg-white dark:bg-slate-700 shadow-sm text-rose-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      Favorites
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-grow overflow-y-auto p-6 space-y-6">
                {filteredHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 opacity-50">
                    {activeTab === 'Favorites' ? <Heart className="w-12 h-12 mb-4" /> : <HistoryIcon className="w-12 h-12 mb-4" />}
                    <p>{historySearch ? 'No matches found' : activeTab === 'Favorites' ? 'No favorites yet' : 'No history yet'}</p>
                  </div>
                ) : (
                  filteredHistory.map(item => (
                    <div key={item.id} className="group relative bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-bold text-indigo-500 tracking-wider bg-indigo-50 dark:bg-indigo-900/40 px-2 py-0.5 rounded">
                            {item.platform}
                          </span>
                          {item.isFavorite && <Heart className="w-3 h-3 text-rose-500 fill-current" />}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3 italic mb-4">
                        "{item.text}"
                      </p>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => toggleFavorite(item.id)}
                          className={`p-2 border rounded-lg transition-colors ${item.isFavorite ? 'bg-rose-500/10 border-rose-500/50 text-rose-500' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500'}`}
                        >
                          <Heart className={`w-4 h-4 ${item.isFavorite ? 'fill-current' : ''}`} />
                        </button>
                        <button 
                          onClick={() => handleAnalyzeHashtags(item)}
                          className="p-2 border border-border-subtle rounded-lg text-slate-400 hover:text-indigo-500 transition-colors"
                          title="Suggest Hashtags"
                        >
                          <Hash className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => copyToClipboard(item.text, item.id)}
                          className="flex-grow py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                        >
                          <Copy className="w-3 h-3" />
                          {copiedId === item.id ? 'Copied' : 'Copy'}
                        </button>
                        <button 
                          onClick={() => deleteHistoryItem(item.id)}
                          className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <footer className="py-12 px-6 border-t border-slate-200 dark:border-slate-800 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="bg-slate-900 p-1 rounded-md">
            <Sparkles className="text-white w-3 h-3" />
          </div>
          <span className="font-bold text-slate-400">CaptionAI</span>
        </div>
        <p className="text-slate-500 text-sm">Made with ❤️ and Google Gemini AI</p>
        <div className="flex items-center justify-center gap-6 mt-6">
          <button 
            onClick={() => setShowPrivacy(true)}
            className="text-slate-400 hover:text-indigo-500 transition-colors text-xs font-medium uppercase tracking-widest"
          >
            Privacy
          </button>
          <button 
            onClick={() => setShowTerms(true)}
            className="text-slate-400 hover:text-indigo-500 transition-colors text-xs font-medium uppercase tracking-widest"
          >
            Terms
          </button>
          <a href="mailto:support@captionai.com" className="text-slate-400 hover:text-indigo-500 transition-colors text-xs font-medium uppercase tracking-widest">Contact</a>
        </div>
      </footer>

      {/* Hashtag Suggestion Modal */}
      <AnimatePresence>
        {showHashtags && analyzingCaption && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHashtags(false)}
              className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[120]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-2xl max-h-[90vh] bg-bg-card border border-border-subtle rounded-3xl shadow-2xl z-[130] overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-border-subtle flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white">
                    <Hash className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-text-primary">Hashtag Lab</h2>
                    <p className="text-text-secondary text-sm">Analyze and optimize your caption</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowHashtags(false)} 
                  className="p-2 hover:bg-white/5 rounded-full text-text-secondary transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 overflow-y-auto custom-scrollbar flex flex-col gap-8">
                {/* Caption Preview */}
                <div>
                  <label className="vibrant-label">Your Caption</label>
                  <div className="p-5 bg-white/5 border border-border-subtle rounded-2xl text-text-primary italic leading-relaxed whitespace-pre-wrap">
                    "{analyzingCaption.text}"
                  </div>
                </div>

                {/* Suggestions Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-accent-teal" />
                      Suggested for this post
                    </h3>
                    {isAnalyzing && (
                      <div className="flex items-center gap-2 text-accent-teal text-xs font-bold uppercase tracking-widest animate-pulse">
                         <RefreshCw className="w-3 h-3 animate-spin" />
                         AI Analyzing...
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {hashtagError ? (
                      <div className="w-full p-6 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 group">
                        <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                          <AlertCircle className="w-5 h-5 text-red-400" />
                        </div>
                        <div className="flex flex-col">
                          <p className="text-sm font-bold text-red-400">{hashtagError.split(':')[0]}</p>
                          <p className="text-xs text-red-400/70">{hashtagError.split(':')[1] || hashtagError}</p>
                        </div>
                      </div>
                    ) : isAnalyzing ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-8 w-24 bg-white/5 rounded-full animate-pulse" />
                      ))
                    ) : suggestedHashtags.length > 0 ? (
                      suggestedHashtags.map((hashtag) => {
                        const isAdded = analyzingCaption.text.toLowerCase().includes(hashtag.toLowerCase());
                        return (
                          <button
                            key={hashtag}
                            onClick={() => toggleHashtag(hashtag)}
                            className={`px-4 py-2 rounded-full text-xs font-bold border transition-all flex items-center gap-2 ${
                              isAdded 
                                ? 'bg-accent-teal border-accent-teal text-white shadow-lg shadow-accent-teal/20' 
                                : 'bg-white/5 border-border-subtle text-text-secondary hover:border-accent-teal hover:text-white'
                            }`}
                          >
                            {hashtag}
                            {isAdded ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          </button>
                        );
                      })
                    ) : (
                      <p className="text-sm text-text-secondary italic opacity-50">No suggestions available. Try refining your context.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-8 border-t border-border-subtle bg-white/[0.02] flex gap-4 shrink-0">
                <button 
                  onClick={() => {
                    const el = document.createElement('textarea');
                    el.value = analyzingCaption.text;
                    document.body.appendChild(el);
                    el.select();
                    document.execCommand('copy');
                    document.body.removeChild(el);
                    setCopiedId(analyzingCaption.id);
                    setTimeout(() => setCopiedId(null), 2000);
                  }}
                  className="flex-1 btn-vibrant-generate flex items-center justify-center gap-2"
                >
                  <Copy className="w-5 h-5" />
                  {copiedId === analyzingCaption.id ? 'Copied to Clipboard!' : 'Copy Final Caption'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Privacy Policy Modal */}
      <AnimatePresence>
        {showPrivacy && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPrivacy(false)}
              className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[120]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-2xl max-h-[80vh] bg-bg-card border border-border-subtle rounded-3xl shadow-2xl z-[130] overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-border-subtle flex items-center justify-between shrink-0">
                <h2 className="text-2xl font-bold">Privacy Policy</h2>
                <button onClick={() => setShowPrivacy(false)} className="p-2 hover:bg-white/5 rounded-full text-text-secondary">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-8 overflow-y-auto custom-scrollbar prose prose-invert max-w-none">
                <p className="text-sm text-text-secondary mb-4">Last Updated: April 18, 2026</p>
                <div className="space-y-6 text-text-primary">
                  <section>
                    <h3 className="text-lg font-semibold mb-2">1. Data Collection</h3>
                    <p>At CaptionAI, your privacy is our top priority. We want to be absolutely clear: <strong>we do not collect, store, or share any personal information about our users.</strong></p>
                  </section>
                  <section>
                    <h3 className="text-lg font-semibold mb-2">2. How We Handle Your Content</h3>
                    <p>When you upload an image or enter text to generate captions, that data is processed directly via the Google Gemini API. We do not store your images or text on our servers. Your data is used solely for the purpose of generating your request in real-time.</p>
                  </section>
                  <section>
                    <h3 className="text-lg font-semibold mb-2">3. Local Storage</h3>
                    <p>CaptionAI uses your browser's local storage to save your history, favorites, and templates. This data remains on your device and is never transmitted to us or any third party.</p>
                  </section>
                  <section>
                    <h3 className="text-lg font-semibold mb-2">4. Third-Party Services</h3>
                    <p>We use the Google Gemini API to power our AI features. By using CaptionAI, you are also bound by Google's Privacy Policy regarding the use of their AI services.</p>
                  </section>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Terms & Conditions Modal */}
      <AnimatePresence>
        {showTerms && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTerms(false)}
              className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[120]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-2xl max-h-[80vh] bg-bg-card border border-border-subtle rounded-3xl shadow-2xl z-[130] overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-border-subtle flex items-center justify-between shrink-0">
                <h2 className="text-2xl font-bold">Terms & Conditions</h2>
                <button onClick={() => setShowTerms(false)} className="p-2 hover:bg-white/5 rounded-full text-text-secondary">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-8 overflow-y-auto custom-scrollbar prose prose-invert max-w-none">
                <p className="text-sm text-text-secondary mb-4">Last Updated: April 18, 2026</p>
                <div className="space-y-6 text-text-primary">
                  <section>
                    <h3 className="text-lg font-semibold mb-2">1. Acceptance of Terms</h3>
                    <p>By accessing or using CaptionAI, you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the service.</p>
                  </section>
                  <section>
                    <h3 className="text-lg font-semibold mb-2">2. Use of Service</h3>
                    <p>CaptionAI is provided "as is" and for your personal or commercial use in generating social media captions. You are responsible for the content you generate and publish.</p>
                  </section>
                  <section>
                    <h3 className="text-lg font-semibold mb-2">3. No Data Collection</h3>
                    <p>We do not collect user data. All generated content and user settings are stored locally on your device.</p>
                  </section>
                  <section>
                    <h3 className="text-lg font-semibold mb-2">4. AI-Generated Content</h3>
                    <p>Captions are generated by artificial intelligence. While we strive for quality, we cannot guarantee the accuracy, appropriateness, or legality of the generated text. User discretion is advised.</p>
                  </section>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
