// 選考ステータスと日付まわりの純粋関数。
// 画面から切り離してあるのでテストできる（__tests__/schedule.test.ts）。
// ウィジェット側（targets/shukatsu-widget/Models.swift）にも同じロジックがあるため、
// 片方を変えたらもう片方も合わせること。

/// 日付を持つものの最小構造。App.tsx の Schedule はこれを満たす。
export type DateSpan = { date: string; endDate?: string };

// ─── 日付ユーティリティ ────────────────────────────────────────

export const parseYmd = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const formatYmd = (dt: Date): string => {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const addDaysYmd = (ymd: string, n: number): string => {
  const dt = parseYmd(ymd);
  dt.setDate(dt.getDate() + n);
  return formatYmd(dt);
};

/// 終了日。未設定や開始日より前なら開始日を返す。
export const effectiveEnd = (s: DateSpan): string =>
  s.endDate && s.endDate >= s.date ? s.endDate : s.date;

/// 複数日なら "2026/05/09〜2026/05/12"、単日なら "2026/05/09"
export const dateRangeStr = (s: DateSpan): string => {
  const start = s.date.replace(/-/g, '/');
  if (!s.endDate || s.endDate <= s.date) return start;
  return `${start}〜${s.endDate.replace(/-/g, '/')}`;
};

/// その予定が指定日にかかっているか
export const coversDate = (s: DateSpan, ymd: string): boolean =>
  !!s.date && s.date <= ymd && ymd <= effectiveEnd(s);

/// 開始日から終了日までの日付を列挙する。
/// endDate が壊れたデータで極端に先だった場合に無限に伸びないよう上限を設ける。
export const MAX_SPAN_DAYS = 120;

export const expandDateRange = (s: DateSpan): string[] => {
  if (!s.date) return [];
  const end = effectiveEnd(s);
  const out: string[] = [];
  let cur = s.date;
  while (cur <= end && out.length < MAX_SPAN_DAYS) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
};

// ─── ステータス遷移 ────────────────────────────────────────────

export const PROGRESS_FLOW = ['検討中', 'ES提出済', '1次面接', '2次面接', '最終面接', '内定'];
export const INTERN_FLOW = ['インターンES締切', 'インターン面接', 'インターン確定'];

/// 次の選考段階。これ以上進めないものは null。
export const nextStatus = (current: string): string | null => {
  // ES締切は「提出前」の状態なので、進めると提出済になる
  if (current === 'ES締切') return 'ES提出済';
  const idx = PROGRESS_FLOW.indexOf(current);
  if (idx !== -1 && idx < PROGRESS_FLOW.length - 1) return PROGRESS_FLOW[idx + 1];
  const iIdx = INTERN_FLOW.indexOf(current);
  if (iIdx !== -1 && iIdx < INTERN_FLOW.length - 1) return INTERN_FLOW[iIdx + 1];
  return null;
};
