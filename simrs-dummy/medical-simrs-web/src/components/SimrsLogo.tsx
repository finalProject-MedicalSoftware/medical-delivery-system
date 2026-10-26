interface SimrsLogoProps {
  tileClassName?: string;
  iconClassName?: string;
  showWordmark?: boolean;
  title?: string;
  subtitle?: string;
  titleClassName?: string;
  subtitleClassName?: string;
}

/**
 * Logo SIMRS Dummy - ubin solid + glif salib medis yang menyatu
 * dengan garis denyut jantung (ECG). Tanpa gradien, tanpa glow.
 */
export default function SimrsLogo({
  tileClassName = "h-10 w-10 rounded-xl",
  iconClassName = "h-5 w-5",
  showWordmark = true,
  title = "SIMRS Dummy",
  subtitle = "Medical Delivery System",
  titleClassName = "text-slate-900",
  subtitleClassName = "text-slate-500",
}: SimrsLogoProps) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`inline-flex shrink-0 items-center justify-center bg-teal-600 ${tileClassName}`}
      >
        <svg
          viewBox="0 0 32 32"
          className={iconClassName}
          role="img"
          aria-label="Logo SIMRS"
        >
          <rect x="13" y="5" width="6" height="22" rx="2.5" fill="#ffffff" />
          <path
            d="M3 16h7l2.5-6 4 12 2.5-6H29"
            fill="none"
            stroke="#ffffff"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {showWordmark && (
        <span className="leading-tight">
          <span className={`block text-base font-bold ${titleClassName}`}>
            {title}
          </span>
          <span className={`block text-xs ${subtitleClassName}`}>
            {subtitle}
          </span>
        </span>
      )}
    </span>
  );
}
