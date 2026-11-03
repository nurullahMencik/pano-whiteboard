import { useEffect, useState } from 'react'
import { useUi } from '../store/ui'

/** One polite live region for short confirmations and errors. */
export const Toast = () => {
  const toast = useUi((s) => s.toast)
  const [hiddenId, setHiddenId] = useState<number | null>(null)
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setHiddenId(toast.id), 2800)
    return () => clearTimeout(timer)
  }, [toast])
  const visible = toast !== null && hiddenId !== toast.id
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-4 sm:bottom-8">
      {visible && (
        <div className="animate-pop rounded-xl bg-[#1b1f2a] px-4 py-2.5 text-sm font-medium text-white shadow-xl dark:bg-[#eceef4] dark:text-[#1b1f2a]">
          {toast.message}
        </div>
      )}
    </div>
  )
}
