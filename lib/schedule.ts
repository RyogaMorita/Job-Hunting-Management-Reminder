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
/// ES提出済の次は常に Webテスト。
/// 以前はテスト情報を登録した企業だけ挟んでいたが、「未登録」と「テストが無い」は
/// 別物で、入力していないだけの企業まで飛ばしてしまう。
/// テストが無い企業は手動で 1次面接 に進めてもらう。
export const nextStatus = (current: string): string | null => {
  // ES締切は「提出前」の状態なので、進めると提出済になる
  if (current === 'ES締切') return 'ES提出済';
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

// ─── バーチカル（時間軸）表示の配置計算 ────────────────────────
//
// 重なった予定は横に並べないと読めない。
// 重なりの連鎖ごとに束ね、束の中で列を割り当てる。
// 描画側で計算すると再レンダリングのたびに走るので、ここで済ませて結果だけ渡す。

export type PlacedEvent<T> = {
  event: T;
  /// 0時からの分
  startMin: number;
  endMin: number;
  /// 何列目か（0始まり）と、その重なりの束が何列あるか
  col: number;
  cols: number;
};

export const layoutDayEvents = <T extends TimedEvent>(events: T[]): PlacedEvent<T>[] => {
  type Item = { event: T; startMin: number; endMin: number };
  const timed: Item[] = [];
  for (const e of events) {
    const s = minutesOf(e);
    if (s === null) continue;
    timed.push({ event: e, startMin: s, endMin: s + EVENT_DURATION_MIN });
  }
  timed.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const out: PlacedEvent<T>[] = [];
  let cluster: Item[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    // 各列の「最後に埋まっている終了時刻」を持ち、空いた列から詰める
    const colEnds: number[] = [];
    const placed = cluster.map(item => {
      let col = colEnds.findIndex(end => end <= item.startMin);
      if (col === -1) { col = colEnds.length; colEnds.push(item.endMin); }
      else colEnds[col] = item.endMin;
      return { ...item, col, cols: 0 };
    });
    for (const p of placed) p.cols = colEnds.length;
    out.push(...placed);
    cluster = [];
    clusterEnd = -1;
  };

  for (const item of timed) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flush();
  return out;
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
  /// kind === 'custom' のときだけ、対象のカスタム項目ID
  customId?: string;
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
  /// Webテストを受け終えたか。受検期限のやることを消すために持つ
  webTestDone?: boolean;
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
    if (s.webTestDeadline && !s.webTestDone && s.status !== '不合格' && s.status !== '完了') {
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
      push({ key: `cc_${s.id}_${c.id}`, kind: 'custom', scheduleId: s.id, company: s.company, label: c.label, due: c.due, customId: c.id });
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

// ─── ダッシュボード集計 ────────────────────────────────────────
//
// 内定率だけだと内定が出るまで数字が動かず、ダッシュボードが置物になる。
// 内定前でも動く指標として「今どの段階に何社いるか」と「今週どれだけ動いたか」を出す。

export const STAGE_BUCKETS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'considering', label: '検討中', statuses: ['検討中'] },
  { key: 'document', label: '書類', statuses: ['ES締切', 'ES提出済', 'Webテスト'] },
  { key: 'interview', label: '面接', statuses: ['GD', '1次面接', '2次面接', '最終面接'] },
  { key: 'offer', label: '内定', statuses: ['内定', '内定承諾'] },
];

export type StageSource = {
  status: string;
  statusHistory?: { status: string; changedAt: string }[];
};

/// 段階ごとの社数。選考が終わったもの（不合格・辞退・完了）はどのバケツにも入らない。
export const stageDistribution = (items: StageSource[]): { key: string; label: string; count: number }[] =>
  STAGE_BUCKETS.map(b => ({
    key: b.key,
    label: b.label,
    count: items.filter(s => b.statuses.includes(s.status)).length,
  }));

/// 週の初日。weekStart は 0=日曜, 1=月曜。
export const startOfWeekYmd = (todayYmd: string, weekStart: number): string => {
  const dow = parseYmd(todayYmd).getDay();
  return addDaysYmd(todayYmd, -((dow - weekStart + 7) % 7));
};

/// 今週の動き。
/// statusHistory の1件目は登録時に積まれるので「追加」、それ以降を「進んだ」として数える。
export const weeklyActivity = (
  items: StageSource[], todayYmd: string, weekStart: number,
): { added: number; advanced: number } => {
  const from = startOfWeekYmd(todayYmd, weekStart);
  let added = 0, advanced = 0;
  for (const s of items) {
    const h = s.statusHistory ?? [];
    if (h.length === 0) continue;
    if (h[0].changedAt.slice(0, 10) >= from) added++;
    advanced += h.slice(1).filter(e => e.changedAt.slice(0, 10) >= from).length;
  }
  return { added, advanced };
};

/// 直近 weeks 週ぶんの「進んだ回数」。古い週から順に返す。
/// 内定が出るまで動かない指標ばかりだと分析が置物になるため、毎週動くものを出す。
export const weeklyTrend = (
  items: StageSource[], todayYmd: string, weekStart: number, weeks = 4,
): { from: string; count: number }[] => {
  const thisWeek = startOfWeekYmd(todayYmd, weekStart);
  const out: { from: string; count: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDaysYmd(thisWeek, -7 * i);
    const to = addDaysYmd(from, 7);
    let count = 0;
    for (const s of items) {
      const h = s.statusHistory ?? [];
      // 1件目は登録なので「進んだ」には数えない
      count += h.slice(1).filter(e => {
        const d = e.changedAt.slice(0, 10);
        return d >= from && d < to;
      }).length;
    }
    out.push({ from, count });
  }
  return out;
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
