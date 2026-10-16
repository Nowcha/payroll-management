// Material Symbols (Google Fonts, Rounded, weight 400), bundled locally from
// @material-symbols/svg-400 (Apache-2.0) instead of loading fonts.googleapis.com:
// the app makes no external requests (CSP: default-src 'self') and works offline.
// Each symbol is a single <path>; only the path data is extracted, never injected as HTML.
import arrowForward from '@material-symbols/svg-400/rounded/arrow_forward.svg?raw';
import barChart from '@material-symbols/svg-400/rounded/bar_chart.svg?raw';
import barChartFill from '@material-symbols/svg-400/rounded/bar_chart-fill.svg?raw';
import calculate from '@material-symbols/svg-400/rounded/calculate.svg?raw';
import calculateFill from '@material-symbols/svg-400/rounded/calculate-fill.svg?raw';
import checkCircle from '@material-symbols/svg-400/rounded/check_circle.svg?raw';
import close from '@material-symbols/svg-400/rounded/close.svg?raw';
import ecgHeart from '@material-symbols/svg-400/rounded/ecg_heart.svg?raw';
import ecgHeartFill from '@material-symbols/svg-400/rounded/ecg_heart-fill.svg?raw';
import error from '@material-symbols/svg-400/rounded/error.svg?raw';
import eventUpcoming from '@material-symbols/svg-400/rounded/event_upcoming.svg?raw';
import familyRestroom from '@material-symbols/svg-400/rounded/family_restroom.svg?raw';
import familyRestroomFill from '@material-symbols/svg-400/rounded/family_restroom-fill.svg?raw';
import info from '@material-symbols/svg-400/rounded/info.svg?raw';
import moreHoriz from '@material-symbols/svg-400/rounded/more_horiz.svg?raw';
import progressActivity from '@material-symbols/svg-400/rounded/progress_activity.svg?raw';
import receiptLong from '@material-symbols/svg-400/rounded/receipt_long.svg?raw';
import receiptLongFill from '@material-symbols/svg-400/rounded/receipt_long-fill.svg?raw';
import redeem from '@material-symbols/svg-400/rounded/redeem.svg?raw';
import redeemFill from '@material-symbols/svg-400/rounded/redeem-fill.svg?raw';
import settings from '@material-symbols/svg-400/rounded/settings.svg?raw';
import settingsFill from '@material-symbols/svg-400/rounded/settings-fill.svg?raw';
import spaceDashboard from '@material-symbols/svg-400/rounded/space_dashboard.svg?raw';
import spaceDashboardFill from '@material-symbols/svg-400/rounded/space_dashboard-fill.svg?raw';
import uploadFile from '@material-symbols/svg-400/rounded/upload_file.svg?raw';
import verifiedUser from '@material-symbols/svg-400/rounded/verified_user.svg?raw';
import warning from '@material-symbols/svg-400/rounded/warning.svg?raw';

const RAW = {
  arrow_forward: [arrowForward],
  bar_chart: [barChart, barChartFill],
  calculate: [calculate, calculateFill],
  check_circle: [checkCircle],
  close: [close],
  ecg_heart: [ecgHeart, ecgHeartFill],
  error: [error],
  event_upcoming: [eventUpcoming],
  family_restroom: [familyRestroom, familyRestroomFill],
  info: [info],
  more_horiz: [moreHoriz],
  progress_activity: [progressActivity],
  receipt_long: [receiptLong, receiptLongFill],
  redeem: [redeem, redeemFill],
  settings: [settings, settingsFill],
  space_dashboard: [spaceDashboard, spaceDashboardFill],
  upload_file: [uploadFile],
  verified_user: [verifiedUser],
  warning: [warning],
} as const;

export type IconName = keyof typeof RAW;

const VIEW_BOX = '0 -960 960 960';

function pathOf(svg: string): string {
  const d = /<path[^>]*\sd="([^"]+)"/.exec(svg)?.[1];
  if (!d) throw new Error('Material Symbol without a single path');
  return d;
}

const PATHS = Object.fromEntries(
  Object.entries(RAW).map(([name, variants]) => [name, variants.map(pathOf)]),
) as Record<IconName, string[]>;

export function Icon({
  name,
  filled = false,
  className = 'size-5',
  label,
}: {
  name: IconName;
  /** Use the FILL=1 variant when the symbol has one (e.g. the active navigation item). */
  filled?: boolean;
  className?: string;
  /** Accessible name; omitted icons are decorative. */
  label?: string;
}) {
  const variants = PATHS[name];
  const d = (filled ? variants[1] : undefined) ?? variants[0];
  return (
    <svg
      viewBox={VIEW_BOX}
      className={`shrink-0 fill-current ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={d} />
    </svg>
  );
}
