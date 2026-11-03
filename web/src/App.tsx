import { Suspense, lazy, useEffect } from 'react'
import { Toast } from './components/Toast'
import Home from './pages/Home'
import { NotFound } from './pages/NotFound'
import { parseRoute, useRoute } from './router'
import { useUi } from './store/ui'

const BoardPage = lazy(() => import('./board/BoardPage'))

const useThemeSync = () => {
  const theme = useUi((s) => s.theme)
  const setResolvedTheme = useUi((s) => s.setResolvedTheme)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.classList.toggle('dark', resolved === 'dark')
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#16181f' : '#f7f6f2')
      setResolvedTheme(resolved)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme, setResolvedTheme])
}

const BoardFallback = () => {
  const t = useUi((s) => s.t)
  return (
    <div className="flex h-full items-center justify-center bg-bg text-muted" role="status">
      {t('board.loading')}
    </div>
  )
}

export default function App() {
  useThemeSync()
  const lang = useUi((s) => s.lang)
  const route = parseRoute(useRoute())

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    if (route.name !== 'board') document.title = `Pano · ${useUi.getState().t('app.tagline')}`
  }, [route.name, lang])

  return (
    <>
      {route.name === 'home' && <Home />}
      {route.name === 'notFound' && <NotFound />}
      {route.name === 'board' && (
        <Suspense fallback={<BoardFallback />}>
          <BoardPage key={`${route.kind}/${route.id}`} kind={route.kind} id={route.id} />
        </Suspense>
      )}
      <Toast />
    </>
  )
}
