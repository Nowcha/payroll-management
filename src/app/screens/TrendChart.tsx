// F-08: monthly trend of one item. Actual = solid, forecast = dashed. Two series, one axis.
import { useState } from 'react';
import { yen } from '../ui';

export interface TrendPoint {
  month: number;
  value: number | null;
  isForecast: boolean;
}

export interface TrendSeries {
  label: string;
  color: string;
  points: TrendPoint[];
}

const W = 640;
const H = 240;
const PAD = { top: 16, right: 56, bottom: 28, left: 64 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * exp >= v / 4) ?? 10;
  return Math.ceil(v / (step * exp)) * step * exp;
}

export function TrendChart({ series, title }: { series: TrendSeries[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = series.flatMap((s) => s.points.map((p) => p.value ?? 0));
  const max = niceMax(Math.max(0, ...values));
  const min = Math.min(0, ...values);
  const x = (m: number): number => PAD.left + ((m - 1) / 11) * (W - PAD.left - PAD.right);
  const y = (v: number): number =>
    PAD.top + ((max - v) / (max - min || 1)) * (H - PAD.top - PAD.bottom);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + (max - min) * t);

  const path = (pts: TrendPoint[]): string =>
    pts
      .filter((p) => p.value !== null)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.month).toFixed(1)},${y(p.value ?? 0).toFixed(1)}`)
      .join(' ');

  /** Split a series into the actual run and the forecast run (sharing the joint point). */
  const runs = (s: TrendSeries): { actual: TrendPoint[]; forecast: TrendPoint[] } => {
    const firstForecast = s.points.findIndex((p) => p.isForecast);
    if (firstForecast === -1) return { actual: s.points, forecast: [] };
    return {
      actual: s.points.slice(0, firstForecast),
      forecast: s.points.slice(Math.max(0, firstForecast - 1)),
    };
  };

  return (
    <figure>
      <figcaption className="mb-2 flex flex-wrap items-center gap-4 text-xs text-ink-soft">
        <span className="font-bold text-ink">{title}</span>
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="18" y2="3" stroke={s.color} strokeWidth="2" />
            </svg>
            {s.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden="true">
            <line
              x1="0"
              y1="3"
              x2="18"
              y2="3"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          </svg>
          予測
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${title}の月次推移`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-rule)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={y(t) + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--color-ink-soft)"
              className="figures"
            >
              {yen(Math.round(t))}
            </text>
          </g>
        ))}
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <text
            key={m}
            x={x(m)}
            y={H - 8}
            textAnchor="middle"
            fontSize="10"
            fill="var(--color-ink-soft)"
          >
            {m}月
          </text>
        ))}
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--color-ink-soft)"
            strokeWidth="1"
          />
        )}
        {series.map((s) => {
          const { actual, forecast } = runs(s);
          const last = [...s.points].reverse().find((p) => p.value !== null);
          return (
            <g key={s.label}>
              <path
                d={path(actual)}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {forecast.length > 1 && (
                <path
                  d={path(forecast)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  strokeLinecap="round"
                />
              )}
              {hover !== null && s.points[hover - 1]?.value !== null && s.points[hover - 1] && (
                <circle
                  cx={x(hover)}
                  cy={y(s.points[hover - 1]?.value ?? 0)}
                  r="4"
                  fill={s.color}
                  stroke="white"
                  strokeWidth="2"
                />
              )}
              {last && (
                <text
                  x={x(last.month) + 6}
                  y={y(last.value ?? 0) + 4}
                  fontSize="10"
                  fill="var(--color-ink-soft)"
                >
                  {s.label}
                </text>
              )}
            </g>
          );
        })}
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <rect
            key={m}
            x={x(m) - (W - PAD.left - PAD.right) / 22}
            y={PAD.top}
            width={(W - PAD.left - PAD.right) / 11}
            height={H - PAD.top - PAD.bottom}
            fill="transparent"
            onMouseEnter={() => setHover(m)}
            onTouchStart={() => setHover(m)}
          />
        ))}
      </svg>
      {hover !== null && (
        <div className="mt-1 flex flex-wrap gap-4 text-xs" aria-live="polite">
          <span className="font-bold">{hover}月</span>
          {series.map((s) => {
            const p = s.points[hover - 1];
            return (
              <span key={s.label}>
                {s.label}：
                <span className="figures">
                  {p?.value === null || p === undefined ? '—' : `${yen(p.value)}円`}
                </span>
                {p?.isForecast ? '（予測）' : ''}
              </span>
            );
          })}
        </div>
      )}
    </figure>
  );
}
