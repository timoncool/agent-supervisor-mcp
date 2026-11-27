import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "ru" | "en" | "zh";
export const LANGS: Lang[] = ["ru", "en", "zh"];

export type Params = Record<string, string | number>;
export type Msg = string | ((p: Params) => string);
export type Messages = Record<string, Msg>;

// One dictionary module per area of the board (web/src/i18n/<area>.ts). English
// is the reference shape: ru and zh must carry exactly the same keys.
export type Dictionary<M extends Messages> = { en: M; ru: { [K in keyof M]: Msg }; zh: { [K in keyof M]: Msg } };

export function defineMessages<M extends Messages>(dict: Dictionary<M>): Dictionary<M> {
  return dict;
}

const STORAGE_KEY = "csv.lang";

export function detectLang(language: string | undefined = typeof navigator === "undefined" ? undefined : navigator.language): Lang {
  const tag = (language ?? "").toLowerCase();
  if (tag.startsWith("ru")) return "ru";
  if (tag.startsWith("zh")) return "zh";
  return "en";
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LANGS as string[]).includes(saved)) return saved as Lang;
  } catch {
    // storage blocked: fall back to the browser language
  }
  return detectLang();
}

// Module-level copy of the language for code outside React (lib/format.ts).
// The provider remounts the tree on change, so every caller re-reads it.
let current: Lang = initialLang();

export function currentLang(): Lang {
  return current;
}

export function tr<M extends Messages>(dict: Dictionary<M>, key: keyof M & string, params: Params = {}, lang: Lang = current): string {
  const msg = dict[lang][key];
  return typeof msg === "function" ? msg(params) : msg;
}

// Russian has three count forms; Intl picks the right one for the language.
export function plural(n: number, forms: { one: string; few?: string; many?: string; other: string }, lang: Lang = current): string {
  const rule = new Intl.PluralRules(lang).select(n) as keyof typeof forms;
  return forms[rule] ?? forms.other;
}

interface LangState {
  lang: Lang;
  setLang: (lang: Lang, options?: { refocus?: boolean }) => void;
}

const LangContext = createContext<LangState>({ lang: current, setLang: () => {} });

// The tree remounts on a language change, so the control that made the change
// is a new node: focus is handed back to it by id.
let refocusAfterChange = false;
export const LANG_TRIGGER_ID = "lang-select-trigger";

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  const setLang = useCallback((next: Lang, options: { refocus?: boolean } = {}) => {
    if (next === current) return;
    current = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // per-viewer convenience only
    }
    refocusAfterChange = options.refocus === true;
    setLangState(next);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
    if (refocusAfterChange) {
      refocusAfterChange = false;
      document.getElementById(LANG_TRIGGER_ID)?.focus();
    }
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return (
    <LangContext.Provider value={value}>
      <Fragment key={lang}>{children}</Fragment>
    </LangContext.Provider>
  );
}

export function useLang(): LangState {
  return useContext(LangContext);
}

export function useT<M extends Messages>(dict: Dictionary<M>): (key: keyof M & string, params?: Params) => string {
  const { lang } = useLang();
  return useCallback((key: keyof M & string, params?: Params) => tr(dict, key, params, lang), [dict, lang]);
}

export const LANG_NAMES: Record<Lang, { short: string; full: string }> = {
  ru: { short: "RU", full: "Русский" },
  en: { short: "EN", full: "English" },
  zh: { short: "中文", full: "中文" }
};
