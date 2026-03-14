export const Language = {
  JAPANESE: 'JAPANESE',
  ENGLISH: 'ENGLISH',
  BOTH: 'BOTH',
} as const;

export type Language = (typeof Language)[keyof typeof Language];

export function coversJapanese(lang: Language): boolean {
  return lang === Language.JAPANESE || lang === Language.BOTH;
}

export function coversEnglish(lang: Language): boolean {
  return lang === Language.ENGLISH || lang === Language.BOTH;
}
