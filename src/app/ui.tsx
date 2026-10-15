// Small shared UI kit (ledger style). Presentational only.
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

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
    <span className={`figures ${className}`}>
      {sign + yen(value)}
      <span className="ml-0.5 text-[0.7em] text-ink-soft">円</span>
    </span>
  );
}

export function Page({
  title,
  lead,
  actions,
  children,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="page-title" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-2">
        <div>
          <h1 id="page-title" className="text-2xl font-bold tracking-tight">
            {title}
          </h1>
          {lead && <p className="mt-1 text-sm text-ink-soft">{lead}</p>}
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
  children,
  className = '',
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-sm border border-rule bg-white/85 p-4 shadow-[3px_3px_0_var(--color-paper-deep)] ${className}`}
    >
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 className="text-base font-bold">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = 'neutral' | 'refund' | 'owed' | 'caution';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  refund: 'text-refund',
  owed: 'text-owed',
  caution: 'text-ink',
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
  size?: 'md' | 'lg';
}) {
  return (
    <div>
      <div className="text-xs font-semibold tracking-wide text-ink-soft">{label}</div>
      <div
        className={`${size === 'lg' ? 'text-4xl' : 'text-2xl'} font-bold leading-tight ${TONE_TEXT[tone]}`}
      >
        {value}
      </div>
      {note && <div className="mt-0.5 text-xs text-ink-soft">{note}</div>}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const styles: Record<Tone, string> = {
    neutral: 'border-rule bg-paper text-ink-soft',
    refund: 'border-refund/40 bg-refund-soft text-refund',
    owed: 'border-owed/40 bg-owed-soft text-owed',
    caution: 'border-caution/60 bg-caution/15 text-ink',
  };
  return (
    <span
      className={`inline-block rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

export function Notice({
  level,
  children,
}: {
  level: 'error' | 'warn' | 'info';
  children: ReactNode;
}) {
  const styles = {
    error: 'border-owed bg-owed-soft',
    warn: 'border-caution bg-caution/10',
    info: 'border-rule bg-paper',
  };
  return (
    <div
      role={level === 'error' ? 'alert' : 'status'}
      className={`border-l-4 px-3 py-2 text-sm ${styles[level]}`}
    >
      {children}
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
    primary: 'border-ink bg-ink text-paper hover:bg-ink/85',
    secondary: 'border-ink bg-white text-ink hover:bg-paper-deep',
    danger: 'border-owed bg-white text-owed hover:bg-owed-soft',
    ghost: 'border-transparent bg-transparent text-ink-soft hover:text-ink hover:bg-paper-deep',
  };
  return (
    <button
      type="button"
      className={`inline-flex min-h-9 items-center gap-1 rounded-sm border px-3 text-sm font-semibold transition-[transform,background-color] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
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
      <span className="mb-1 block font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

const INPUT = 'w-full rounded-sm border border-ink/30 px-2 py-1.5 text-sm focus:border-ink';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={INPUT} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={INPUT} {...props} />;
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
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-[var(--color-ink)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">{children}</div>;
}

export const TH = 'border-b-2 border-ink px-2 py-1.5 text-left text-xs font-bold whitespace-nowrap';
export const TD = 'border-b border-rule px-2 py-1.5 align-top';
export const TD_NUM = `${TD} figures text-right whitespace-nowrap`;

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-soft">{children}</p>;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
