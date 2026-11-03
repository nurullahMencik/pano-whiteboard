import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useUi } from '../store/ui'
import { cx } from './cx'


interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  shortcut?: string
  active?: boolean
  tipSide?: 'top' | 'bottom' | 'right' | 'left'
  children: ReactNode
}

/** Square icon button with an accessible name and a small tooltip (name + shortcut). */
export const IconButton = ({ label, shortcut, active, tipSide = 'bottom', className, children, ...rest }: IconButtonProps) => (
  <button
    type="button"
    aria-label={label}
    aria-keyshortcuts={shortcut}
    className={cx(
      'group relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-fg transition-colors',
      'hover:bg-accent-soft disabled:pointer-events-none disabled:opacity-35',
      active && 'bg-accent text-white hover:bg-accent dark:text-[#14161c]',
      className,
    )}
    {...rest}
  >
    {children}
    <span
      role="presentation"
      className={cx(
        'pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-lg bg-[#1b1f2a] px-2 py-1 text-xs font-medium text-white shadow-lg group-hover:block group-focus-visible:block dark:bg-[#eceef4] dark:text-[#1b1f2a]',
        tipSide === 'bottom' && 'left-1/2 top-full mt-2 -translate-x-1/2',
        tipSide === 'top' && 'bottom-full left-1/2 mb-2 -translate-x-1/2',
        tipSide === 'right' && 'left-full top-1/2 ml-2 -translate-y-1/2',
        tipSide === 'left' && 'right-full top-1/2 mr-2 -translate-y-1/2',
      )}
    >
      {label}
      {shortcut && <kbd className="ml-1.5 font-sans text-[11px] opacity-60">{shortcut}</kbd>}
    </span>
  </button>
)

export const Panel = ({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cx('rounded-2xl border border-line bg-panel shadow-panel backdrop-blur-md', className)} {...rest}>
    {children}
  </div>
)

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

/** Native <dialog>: focus trapping, Esc and the top layer come for free. */
export const Dialog = ({ open, title, onClose, children, wide }: DialogProps) => {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const t = useUi((s) => s.t)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cx(
        'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-auto rounded-2xl border border-line bg-panel-solid p-0 text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]',
        wide ? 'max-w-2xl' : 'max-w-md',
      )}
    >
      {open && (
        <div className="animate-pop p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('share.close')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-accent-soft hover:text-fg"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

export const Segmented = <T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | null
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (value: T) => void
  label: string
}) => (
  <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-bg-soft p-1">
    {options.map((option) => (
      <button
        key={String(option.value)}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        title={option.title}
        aria-label={option.title}
        onClick={() => onChange(option.value)}
        className={cx(
          'inline-flex min-h-8 min-w-9 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition-colors',
          value === option.value ? 'bg-panel-solid text-fg shadow-sm' : 'text-muted hover:text-fg',
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
)
