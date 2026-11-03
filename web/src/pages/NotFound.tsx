import { Logo } from '../components/Logo'
import { hrefFor, navigate } from '../router'
import { useUi } from '../store/ui'

export const NotFound = () => {
  const t = useUi((s) => s.t)
  return (
    <main className="flex h-full flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
      <Logo size={36} />
      <h1 className="text-2xl font-bold">{t('board.notFound')}</h1>
      <a
        href={hrefFor('')}
        onClick={(e) => {
          e.preventDefault()
          navigate('')
        }}
        className="rounded-xl bg-accent px-5 py-3 font-semibold text-white hover:bg-accent-hover dark:text-[#14161c]"
      >
        {t('board.backHome')}
      </a>
    </main>
  )
}
