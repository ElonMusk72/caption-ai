export type Platform = 'Instagram' | 'TikTok' | 'Facebook' | 'LinkedIn' | 'X/Twitter' | 'Pinterest' | 'Threads';

export type Tone = 
  | 'Professional' 
  | 'Fun & Playful' 
  | 'Witty/Humorous' 
  | 'Inspirational' 
  | 'Luxury/Elegant' 
  | 'Casual' 
  | 'Salesy/Promotional' 
  | 'Emotional' 
  | 'Educational';

export type Length = 'Short' | 'Medium' | 'Long';

export interface GenerationOptions {
  platforms: Platform[];
  tone: Tone;
  length: Length;
  includeEmojis: boolean;
  includeHashtags: boolean;
  includeCTA: boolean;
  language: string;
  variationCount: number;
}

export interface GeneratedCaption {
  id: string;
  text: string;
  platform: Platform;
  tone: Tone;
  timestamp: number;
  isFavorite?: boolean;
  variant?: 'A' | 'B';
}

export interface UserSettings {
  defaultTone: Tone;
  defaultLanguage: string;
  defaultPlatforms: Platform[];
}

export interface CaptionTemplate {
  id: string;
  name: string;
  structure: string; // e.g. "[Hook] \n\n[Body] \n\n[Call to Action]"
}

export interface AppState {
  image: string | null; // Base64
  imageName: string | null;
  context: string;
  options: GenerationOptions;
  abOptions: GenerationOptions | null; // Separate options for A/B testing
  abMode: boolean;
  results: GeneratedCaption[];
  history: GeneratedCaption[];
  templates: CaptionTemplate[];
  selectedTemplateId: string | null;
  isGenerating: boolean;
  visualAnalysis: string | null;
  theme: 'dark' | 'light';
  error: string | null;
  settings: UserSettings;
}
