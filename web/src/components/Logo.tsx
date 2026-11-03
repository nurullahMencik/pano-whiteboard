/** Pano mark: a rounded board with a hand-drawn stroke and a sticky corner. */
export const LogoMark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="var(--accent)" />
    <path
      d="M8 19.5c2.2-4.6 4.6-7 6.6-6.4 2.4.7.4 6.4 2.8 6.9 1.9.4 3.4-3.2 5.6-5.5"
      fill="none"
      stroke="#fff"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect x="18.5" y="18.5" width="9" height="9" rx="2" fill="#ffd43b" transform="rotate(9 23 23)" />
  </svg>
)

export const Logo = ({ size = 28 }: { size?: number }) => (
  <span className="inline-flex items-center gap-2 text-[17px] font-bold tracking-tight">
    <LogoMark size={size} />
    Pano
  </span>
)
