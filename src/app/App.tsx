import { useEffect, useState, type ReactNode } from 'react';
import { SUPPORTED_YEARS } from '../engine';
import { AppDataProvider, useAppData } from './state';
import { Icon, type IconName } from './icon';
import { Notice } from './ui';
import { DashboardScreen } from './screens/Dashboard';
import { PayslipsScreen } from './screens/Payslips';
import { CompareScreen } from './screens/Compare';
import { DeductionsScreen } from './screens/Deductions';
import { MedicalScreen } from './screens/Medical';
import { FurusatoScreen } from './screens/Furusato';
import { ResultScreen } from './screens/Result';
import { SettingsScreen } from './screens/Settings';

interface Route {
  path: string;
  label: string;
  icon: IconName;
  /** Shown in the mobile bottom bar; the rest live under "その他". */
  primary: boolean;
  render: () => ReactNode;
}

const ROUTES: readonly Route[] = [
  {
    path: 'dashboard',
    label: 'ホーム',
    icon: 'space_dashboard',
    primary: true,
    render: () => <DashboardScreen />,
  },
  {
    path: 'payslips',
    label: '給与明細',
    icon: 'receipt_long',
    primary: true,
    render: () => <PayslipsScreen />,
  },
  {
    path: 'furusato',
    label: 'ふるさと納税',
    icon: 'redeem',
    primary: true,
    render: () => <FurusatoScreen />,
  },
  {
    path: 'result',
    label: '試算結果',
    icon: 'calculate',
    primary: true,
    render: () => <ResultScreen />,
  },
  {
    path: 'compare',
    label: '比較',
    icon: 'bar_chart',
    primary: false,
    render: () => <CompareScreen />,
  },
  {
    path: 'deductions',
    label: '控除',
    icon: 'family_restroom',
    primary: false,
    render: () => <DeductionsScreen />,
  },
  {
    path: 'medical',
    label: '医療費',
    icon: 'ecg_heart',
    primary: false,
    render: () => <MedicalScreen />,
  },
  {
    path: 'settings',
    label: '設定',
    icon: 'settings',
    primary: false,
    render: () => <SettingsScreen />,
  },
];

function currentPath(): string {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return ROUTES.find((r) => r.path === hash)?.path ?? 'dashboard';
}

function useRoute(): string {
  const [path, setPath] = useState<string>(currentPath);
  useEffect(() => {
    const onHash = (): void => {
      setPath(currentPath());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return path;
}

function YearSwitch() {
  const { year, setYear } = useAppData();
  return (
    <div role="radiogroup" aria-label="対象の年分" className="flex rounded-lg bg-paper-deep p-0.5">
      {SUPPORTED_YEARS.map((y) => (
        <button
          key={y}
          type="button"
          role="radio"
          aria-checked={y === year}
          onClick={() => setYear(y)}
          className={`figures rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200 ${
            y === year ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
          }`}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

function Brand() {
  return (
    <a href="#/dashboard" className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-white shadow-sm dark:text-paper">
        <Icon name="calculate" filled className="size-[18px]" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-tight">還付金試算</span>
        <span className="block text-[10px] text-ink-soft">給与明細ベース</span>
      </span>
    </a>
  );
}

function NavLink({
  route,
  active,
  compact = false,
}: {
  route: Route;
  active: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <a
        href={`#/${route.path}`}
        aria-current={active ? 'page' : undefined}
        className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors ${
          active ? 'text-accent' : 'text-ink-soft'
        }`}
      >
        <Icon name={route.icon} filled={active} className="size-6" />
        {route.label}
      </a>
    );
  }
  return (
    <a
      href={`#/${route.path}`}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200 ${
        active
          ? 'bg-surface font-medium text-ink shadow-sm'
          : 'text-ink-soft hover:bg-paper-deep hover:text-ink'
      }`}
    >
      <Icon name={route.icon} filled={active} className={`size-5 ${active ? 'text-accent' : ''}`} />
      {route.label}
    </a>
  );
}

function MoreSheet({ path, onClose }: { path: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="その他の画面"
    >
      <button
        type="button"
        aria-label="閉じる"
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="fade-in absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-rule bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[var(--shadow-pop)]">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">その他</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="rounded-lg p-1.5 text-ink-soft hover:bg-paper-deep"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ROUTES.filter((r) => !r.primary).map((r) => {
            return (
              <a
                key={r.path}
                href={`#/${r.path}`}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-sm ${
                  r.path === path ? 'border-accent bg-accent-soft text-accent' : 'border-rule'
                }`}
              >
                <Icon name={r.icon} filled={r.path === path} />
                {r.label}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PrivacyNote() {
  return (
    <p className="flex gap-2 text-[11px] leading-relaxed text-ink-faint">
      <Icon name="verified_user" className="mt-px size-4" />
      データはこの端末のブラウザにのみ保存され、外部に送信されません。試算は目安です。
    </p>
  );
}

function Shell({ children, path }: { children: ReactNode; path: string }) {
  const { error } = useAppData();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = !ROUTES.find((r) => r.path === path)?.primary;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-rule px-4 py-5 lg:flex">
        <Brand />
        <div>
          <div className="mb-2 px-1 text-[11px] font-medium text-ink-faint">対象の年分</div>
          <YearSwitch />
        </div>
        <nav aria-label="画面" className="flex flex-col gap-0.5">
          {ROUTES.map((r) => (
            <NavLink key={r.path} route={r} active={r.path === path} />
          ))}
        </nav>
        <div className="mt-auto">
          <PrivacyNote />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-rule bg-paper/85 px-4 py-2.5 backdrop-blur-md lg:hidden">
          <Brand />
          <YearSwitch />
        </header>
        <main className="mx-auto max-w-6xl px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">
          {error && (
            <div className="mb-4">
              <Notice level="error">{error}</Notice>
            </div>
          )}
          {children}
          <div className="mt-12 lg:hidden">
            <PrivacyNote />
          </div>
        </main>
      </div>

      <nav
        aria-label="画面"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-rule bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {ROUTES.filter((r) => r.primary).map((r) => (
          <NavLink key={r.path} route={r} active={r.path === path} compact />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium ${moreActive ? 'text-accent' : 'text-ink-soft'}`}
        >
          <Icon name="more_horiz" className="size-6" />
          その他
        </button>
      </nav>
      {moreOpen && <MoreSheet path={path} onClose={() => setMoreOpen(false)} />}
    </div>
  );
}

function Router() {
  const path = useRoute();
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0];
  return <Shell path={path}>{route?.render()}</Shell>;
}

export function App() {
  return (
    <AppDataProvider>
      <Router />
    </AppDataProvider>
  );
}
