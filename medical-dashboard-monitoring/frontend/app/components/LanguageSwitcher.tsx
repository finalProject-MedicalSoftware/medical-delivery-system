'use client';

import { useLanguage, type Language } from './LanguageProvider';

/**
 * Saklar ID/EN gaya tifa-web, disesuaikan ke header terang:
 * wadah `bg-bg-elevated`, tombol aktif `bg-accent text-white`.
 */
export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  const btn = (lang: Language, label: string) => (
    <button
      type="button"
      onClick={() => setLanguage(lang)}
      aria-pressed={language === lang}
      className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
        language === lang
          ? 'bg-accent text-white shadow-sm'
          : 'text-txt-sec hover:text-txt-main hover:bg-card'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 bg-bg-elevated p-1 rounded-lg border border-border-base">
      {btn('id', 'ID')}
      {btn('en', 'EN')}
    </div>
  );
}
