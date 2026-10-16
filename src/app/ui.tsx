// Shared UI kit — "Calm Statement": neutral surfaces, one accent, colour only for state.
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { Icon, type IconName } from './icon';

export function yen(value: number): string {
  return value.toLocaleString('ja-JP');
}

export function Money({
  value,
  signed = false,
  className = '',
}: {
  value: number;
  signed?: boolean;
  className?: string;
}) {
  const sign = signed && value > 0 ? '+' : '';
  return (
    <span className={`figures whitespace-nowrap ${className}`}>
      {sign + yen(value)}
      <span className="ml-0.5 text-[0.62em] font-medium tracking-normal text-ink-faint">円</span>
    </span>
  );
}

export function Page({
  title,
  eyebrow,
  lead,
  actions,
  children,
}: {
  title: string;
  eyebrow?: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="page-title" className="fade-in space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-1">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-medium text-ink-soft">{eyebrow}</div>}
          <h1 id="page-title" className="text-[1.6rem] font-semibold tracking-tight">
            {title}
          </h1>
          {lead && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-soft">{lead}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Panel({
  title,
  aside,
  description,
  children,
  className = '',
}: {
  title?: string;
  aside?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-rule bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5 ${className}`}
    >
      {(title || aside) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-[0.95rem] font-semibold tracking-tight">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{description}</p>
            )}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = 'neutral' | 'refund' | 'owed' | 'caution' | 'accent';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  refund: 'text-refund',
  owed: 'text-owed',
  caution: 'text-ink',
  accent: 'text-accent',
};

export function Stat({
  label,
  value,
  tone = 'neutral',
  note,
  size = 'md',
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  note?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'text-lg',
    md: 'text-xl sm:text-[1.6rem]',
    lg: 'text-[2.4rem] sm:text-[3.2rem] leading-none',
  };
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-ink-soft">{label}</div>
      <div className={`mt-1 ${sizes[size]} font-semibold tracking-tight ${TONE_TEXT[tone]}`}>
        {value}
      </div>
      {note && <div className="mt-1 text-xs leading-relaxed text-ink-soft">{note}</div>}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const styles: Record<Tone, string> = {
    neutral: 'bg-paper-deep text-ink-soft',
    refund: 'bg-refund-soft text-refund',
    owed: 'bg-owed-soft text-owed',
    caution: 'bg-caution-soft text-ink',
    accent: 'bg-accent-soft text-accent',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

const NOTICE: Record<
  'error' | 'warn' | 'info',
  { icon: IconName; box: string; iconColor: string }
> = {
  error: { icon: 'error', box: 'bg-owed-soft', iconColor: 'text-owed' },
  warn: { icon: 'warning', box: 'bg-caution-soft', iconColor: 'text-caution' },
  info: { icon: 'info', box: 'bg-paper-deep', iconColor: 'text-ink-soft' },
};

export function Notice({
  level,
  children,
}: {
  level: 'error' | 'warn' | 'info';
  children: ReactNode;
}) {
  const { icon, box, iconColor } = NOTICE[level];
  return (
    <div
      role={level === 'error' ? 'alert' : 'status'}
      className={`flex gap-2.5 rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${box}`}
    >
      <Icon name={icon} filled className={`mt-px size-[18px] ${iconColor}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}) {
  const styles = {
    primary: 'bg-accent text-white shadow-sm hover:brightness-110 dark:text-paper',
    secondary: 'border border-rule bg-surface text-ink shadow-sm hover:bg-paper-deep',
    danger: 'border border-rule bg-surface text-owed hover:bg-owed-soft',
    ghost: 'text-ink-soft hover:bg-paper-deep hover:text-ink',
  };
  return (
    <button
      type="button"
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-[background-color,filter,transform] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-xs font-medium text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs leading-relaxed text-ink-faint">{hint}</span>}
    </label>
  );
}

const INPUT =
  'w-full rounded-lg border border-rule bg-surface px-3 py-2 text-sm text-ink shadow-[inset_0_1px_1px_oklch(0%_0_0/0.03)] transition-[border-color,box-shadow] duration-200 placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent-soft';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={INPUT} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${INPUT} pr-8`} {...props} />;
}

/** Integer-yen input. Empty input reports 0. */
export function YenInput({
  value,
  onChange,
  ...rest
}: { value: number; onChange: (v: number) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  return (
    <input
      inputMode="numeric"
      className={`${INPUT} figures text-right`}
      value={value === 0 ? '' : String(value)}
      placeholder="0"
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d-]/g, '');
        const parsed = Number(digits);
        onChange(digits === '' || digits === '-' || !Number.isSafeInteger(parsed) ? 0 : parsed);
      }}
      {...rest}
    />
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-4 rounded accent-[var(--color-accent)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/** Progress of a value against a limit (e.g. donations vs furusato limit). */
export function Meter({
  value,
  max,
  tone = 'accent',
}: {
  value: number;
  max: number;
  tone?: 'accent' | 'owed';
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-2 w-full overflow-hidden rounded-full bg-paper-deep"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${tone === 'owed' ? 'bg-owed' : 'bg-accent'}`}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}

export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">{children}</div>;
}

export const TH =
  'border-b border-rule px-2.5 py-2 text-left text-[11px] font-medium tracking-wide text-ink-soft whitespace-nowrap';
export const TD = 'border-b border-rule/70 px-2.5 py-2 align-top';
export const TD_NUM = `${TD} figures text-right whitespace-nowrap`;

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-rule px-4 py-8 text-center text-sm text-ink-soft">
      {children}
    </p>
  );
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
