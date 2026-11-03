import { Monitor, Moon, Sun } from 'lucide-react'
import { useUi, type ThemePref } from '../store/ui'
import { IconButton } from './ui'

const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }

export const ThemeToggle = ({ tipSide = 'bottom' }: { tipSide?: 'top' | 'bottom' | 'left' | 'right' }) => {
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const t = useUi((s) => s.t)
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  const label = `${t('board.theme')}: ${t(`board.theme.${theme}`)}`
  return (
    <IconButton label={label} tipSide={tipSide} onClick={() => setTheme(NEXT_THEME[theme])}>
      <Icon size={19} aria-hidden />
    </IconButton>
  )
}

export const LangToggle = ({ tipSide = 'bottom' }: { tipSide?: 'top' | 'bottom' | 'left' | 'right' }) => {
  const lang = useUi((s) => s.lang)
  const setLang = useUi((s) => s.setLang)
  const t = useUi((s) => s.t)
  const next = lang === 'tr' ? 'en' : 'tr'
  return (
    <IconButton label={`${t('board.language')}: ${next.toUpperCase()}`} tipSide={tipSide} onClick={() => setLang(next)}>
      <span className="text-[13px] font-bold tracking-wide" aria-hidden>
        {next.toUpperCase()}
      </span>
    </IconButton>
  )
}

export const PrefsControls = () => (
  <>
    <LangToggle />
    <ThemeToggle />
  </>
)
