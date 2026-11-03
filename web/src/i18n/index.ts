import { en } from './en'
import { tr, type TranslationKey } from './tr'

export type Lang = 'tr' | 'en'
export type { TranslationKey }

const dictionaries: Record<Lang, Record<TranslationKey, string>> = { tr, en }

export type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string

export const createTranslator =
  (lang: Lang): Translate =>
  (key, params) => {
    const template = dictionaries[lang][key] ?? tr[key] ?? key
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
  }

export const LANGS: Lang[] = ['tr', 'en']
