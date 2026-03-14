import { ja } from './ja.js';
import { en } from './en.js';

export interface Translations {
  app: { title: string };
  nav: { members: string; schedules: string; assignments: string };
  members: Record<string, string>;
  schedules: Record<string, string>;
  assignments: Record<string, string>;
  common: Record<string, string>;
}

const translations: Record<string, Translations> = { ja, en };

export function getTranslations(lang: string): Translations {
  return translations[lang] ?? ja;
}
