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

export const PROGRESS_FLOW = ['検討中', 'ES提出済', 'Webテスト', '1次面接', '2次面接', '最終面接', '内定'];
export const INTERN_FLOW = ['インターンES締切', 'インターン面接', 'インターン確定'];

/// 次の選考段階。これ以上進めないものは null。
///
/// Webテストは全社が課すわけではないので、テスト情報が登録されている企業でだけ
/// ES提出済 → Webテスト を挟む。無ければ従来どおり 1次面接へ進む。
export const nextStatus = (current: string, hasWebTest = false): string | null => {
  // ES締切は「提出前」の状態なので、進めると提出済になる
  if (current === 'ES締切') return 'ES提出済';
  if (current === 'ES提出済') return hasWebTest ? 'Webテスト' : '1次面接';
  const idx = PROGRESS_FLOW.indexOf(current);
  if (idx !== -1 && idx < PROGRESS_FLOW.length - 1) return PROGRESS_FLOW[idx + 1];
  const iIdx = INTERN_FLOW.indexOf(current);
  if (iIdx !== -1 && iIdx < INTERN_FLOW.length - 1) return INTERN_FLOW[iIdx + 1];
  return null;
};

// ─── 日程の重複検知 ────────────────────────────────────────────
//
// 一次面接はWeb 89.2%、最終面接は対面のみが73.0%。
// 同時に20社超を並行させるため、同日の予定が物理的に両立しない組み合わせが起きる。
// 対面が絡む場合は移動時間ぶんのバッファを見て警告する。

export type VenueType = 'online' | 'onsite';

export type TimedEvent = {
  id: string;
  company: string;
  date: string;
  endDate?: string;
  hour: string;
  minute: string;
  venueType?: VenueType;
};

/// 予定の想定所要時間（分）。実際の長さは分からないので一律で置く。
export const EVENT_DURATION_MIN = 60;
/// 対面が絡むときに前後へ足す移動時間（分）
export const TRAVEL_BUFFER_MIN = 60;

const minutesOf = (e: TimedEvent): number | null => {
  if (!e.hour) return null;
  const h = Number(e.hour), m = Number(e.minute || '0');
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

/// 2件がぶつかるか。時刻未定のものは判定できないので false。
/// 複数日の予定は期間が重なっていれば同日扱いにする。
export const eventsConflict = (a: TimedEvent, b: TimedEvent): boolean => {
  if (a.id === b.id || !a.date || !b.date) return false;
  // 期間が1日でも重なっていなければ衝突しない
  if (a.date > effectiveEnd(b) || b.date > effectiveEnd(a)) return false;
  const sa = minutesOf(a), sb = minutesOf(b);
  if (sa === null || sb === null) return false;
  // どちらかが対面なら移動時間を見る
  const buffer = (a.venueType === 'onsite' || b.venueType === 'onsite') ? TRAVEL_BUFFER_MIN : 0;
  const endA = sa + EVENT_DURATION_MIN + buffer;
  const endB = sb + EVENT_DURATION_MIN + buffer;
  return sa < endB && sb < endA;
};

/// ぶつかっている予定のIDを全て返す
export const findConflicts = (events: TimedEvent[]): Set<string> => {
  const hit = new Set<string>();
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      if (eventsConflict(events[i], events[j])) {
        hit.add(events[i].id);
        hit.add(events[j].id);
      }
    }
  }
  return hit;
};

// ─── 全企業横断の「やること」集約 ──────────────────────────────
//
// 締切は企業カードの中に散らばっていて、期限順に並べて見る手段が無かった。
// ES締切・Webテスト受検期限・内定承諾期限・辞退連絡・カスタムチェック項目を
// 1本のリストにまとめ、期限順で返す。

export type TodoKind = 'es' | 'webtest' | 'offer' | 'decline' | 'custom';

export type TodoItem = {
  key: string;
  kind: TodoKind;
  scheduleId: string;
  company: string;
  label: string;
  /// 期限。無期限のものは undefined（末尾に並ぶ）
  due?: string;
  /// 期限までの日数（今日=0、過ぎていれば負）。期限なしは undefined
  daysLeft?: number;
};

export type TodoSource = {
  id: string;
  company: string;
  status: string;
  date: string;
  webTestDeadline?: string;
  offerDeadline?: string;
  declineContacted?: boolean;
  customChecklist?: { id: string; label: string; checked: boolean; due?: string }[];
};

export const daysBetween = (fromYmd: string, toYmd: string): number => {
  const a = parseYmd(fromYmd).getTime();
  const b = parseYmd(toYmd).getTime();
  return Math.round((b - a) / 86400000);
};

export const collectTodos = (items: TodoSource[], todayYmd: string): TodoItem[] => {
  const out: TodoItem[] = [];
  const push = (t: Omit<TodoItem, 'daysLeft'>) => {
    out.push({ ...t, daysLeft: t.due ? daysBetween(todayYmd, t.due) : undefined });
  };

  for (const s of items) {
    if (s.status === 'ES締切' && s.date) {
      push({ key: `es_${s.id}`, kind: 'es', scheduleId: s.id, company: s.company, label: 'ESを提出する', due: s.date });
    }
    if (s.webTestDeadline && s.status !== '不合格' && s.status !== '完了') {
      push({ key: `wt_${s.id}`, kind: 'webtest', scheduleId: s.id, company: s.company, label: 'Webテストを受検する', due: s.webTestDeadline });
    }
    if (s.offerDeadline && s.status === '内定') {
      push({ key: `of_${s.id}`, kind: 'offer', scheduleId: s.id, company: s.company, label: '内定を承諾するか決める', due: s.offerDeadline });
    }
    // 内々定保有者の57.4%が辞退を伝えられていないという調査があるため、
    // 辞退を決めたのに未連絡のものは明示的にタスクとして出す
    if (s.status === '内定辞退' && !s.declineContacted) {
      push({ key: `dc_${s.id}`, kind: 'decline', scheduleId: s.id, company: s.company, label: '辞退の連絡をする' });
    }
    for (const c of s.customChecklist ?? []) {
      if (c.checked) continue;
      push({ key: `cc_${s.id}_${c.id}`, kind: 'custom', scheduleId: s.id, company: s.company, label: c.label, due: c.due });
    }
  }

  // 期限が近いものを上に。期限なしは末尾
  return out.sort((a, b) => {
    if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : a.company.localeCompare(b.company);
    if (a.due) return -1;
    if (b.due) return 1;
    return a.company.localeCompare(b.company);
  });
};

// ─── ステータス別の準備テンプレート ────────────────────────────
//
// 選んだ段階に応じて「やっておくこと」の雛形を出し、
// タップでその企業のカスタムチェック項目に追加できるようにする。

export const PREP_TEMPLATES: Record<string, string[]> = {
  '説明会': ['質問を3つ用意する', '企業の事業内容を調べる', '参加方法（会場/URL）を確認する'],
  'ワークショップ': ['持ち物を確認する', '自己紹介を用意する', '参加方法（会場/URL）を確認する'],
  'ES締切': ['設問を書き出す', 'ガクチカを推敲する', '志望動機を書く', '誤字脱字を確認する', '提出前にコピーを保存する'],
  'Webテスト': ['出題形式を確認する', '受検会場・予約日時を確認する', '問題集を1周する', '電卓とメモを用意する'],
  'GD': ['頻出テーマを調べる', '役割（司会/書記/タイムキーパー）を決めておく'],
  '1次面接': ['提出したESを読み返す', '自己紹介1分を練習する', '逆質問を3つ用意する', '会場/接続を確認する'],
  '2次面接': ['提出したESを読み返す', '一次で聞かれたことを振り返る', '逆質問を用意する'],
  '最終面接': ['提出したESを読み返す', '志望動機を言語化し直す', '入社後にやりたいことを整理する', '会場と経路を確認する'],
  '内定': ['労働条件通知書を確認する', '承諾期限を確認する', '他社の選考状況を整理する'],
  'インターンES締切': ['設問を書き出す', '参加理由を書く', '提出前にコピーを保存する'],
  'インターン面接': ['提出したESを読み返す', '参加理由を説明できるようにする'],
};
