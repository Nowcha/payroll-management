import { useEffect, useState, type ReactNode } from 'react';
import { SUPPORTED_YEARS } from '../engine';
import { AppDataProvider, useAppData } from './state';
import { Notice, Select } from './ui';
import { DashboardScreen } from './screens/Dashboard';
import { PayslipsScreen } from './screens/Payslips';
import { CompareScreen } from './screens/Compare';
import { DeductionsScreen } from './screens/Deductions';
import { MedicalScreen } from './screens/Medical';
import { FurusatoScreen } from './screens/Furusato';
import { ResultScreen } from './screens/Result';
import { SettingsScreen } from './screens/Settings';

const ROUTES = [
  { path: 'dashboard', label: 'ダッシュボード', render: () => <DashboardScreen /> },
  { path: 'payslips', label: '給与明細', render: () => <PayslipsScreen /> },
  { path: 'compare', label: '比較', render: () => <CompareScreen /> },
  { path: 'deductions', label: '控除', render: () => <DeductionsScreen /> },
  { path: 'medical', label: '医療費', render: () => <MedicalScreen /> },
  { path: 'furusato', label: 'ふるさと納税', render: () => <FurusatoScreen /> },
  { path: 'result', label: '試算結果', render: () => <ResultScreen /> },
  { path: 'settings', label: '設定', render: () => <SettingsScreen /> },
] as const;

type RoutePath = (typeof ROUTES)[number]['path'];

function currentPath(): RoutePath {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return ROUTES.find((r) => r.path === hash)?.path ?? 'dashboard';
}

function useRoute(): RoutePath {
  const [path, setPath] = useState<RoutePath>(currentPath);
  useEffect(() => {
    const onHash = (): void => setPath(currentPath());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return path;
}

function Shell({ children, path }: { children: ReactNode; path: RoutePath }) {
  const { year, setYear, error } = useAppData();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 mb-6 border-b border-rule bg-paper/95 px-4 pt-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <a href="#/dashboard" className="text-lg font-black tracking-tight">
            還付金試算
            <span className="ml-1 align-top text-[10px] font-semibold text-ink-soft">
              給与明細ベース
            </span>
          </a>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-soft">年分</span>
            <span className="w-24">
              <Select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="対象の年分"
              >
                {SUPPORTED_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}年
                  </option>
                ))}
              </Select>
            </span>
          </label>
        </div>
        <nav aria-label="画面" className="-mx-4 mt-2 flex gap-1 overflow-x-auto px-4">
          {ROUTES.map((r) => (
            <a
              key={r.path}
              href={`#/${r.path}`}
              aria-current={r.path === path ? 'page' : undefined}
              className={`whitespace-nowrap border-b-[3px] px-2.5 py-2 text-sm font-semibold transition-colors ${
                r.path === path
                  ? 'border-ink text-ink'
                  : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {r.label}
            </a>
          ))}
        </nav>
      </header>
      {error && <Notice level="error">{error}</Notice>}
      <main>{children}</main>
      <footer className="mt-12 border-t border-rule pt-3 text-xs text-ink-soft">
        データはこのブラウザ（IndexedDB）にのみ保存され、外部に送信されません。試算は目安です。最終判断は源泉徴収票と確定申告書等作成コーナーで行ってください。
      </footer>
    </div>
  );
}

function Router() {
  const path = useRoute();
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0];
  return <Shell path={path}>{route.render()}</Shell>;
}

export function App() {
  return (
    <AppDataProvider>
      <Router />
    </AppDataProvider>
  );
}
