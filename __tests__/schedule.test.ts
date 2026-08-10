import {
  parseYmd, formatYmd, addDaysYmd, effectiveEnd, dateRangeStr,
  coversDate, expandDateRange, nextStatus, MAX_SPAN_DAYS,
  eventsConflict, findConflicts, collectTodos, daysBetween,
  EVENT_DURATION_MIN, TRAVEL_BUFFER_MIN, PREP_TEMPLATES, PROGRESS_FLOW,
  stageDistribution, startOfWeekYmd, weeklyActivity, weeklyTrend, STAGE_BUCKETS, layoutDayEvents,
  needsGdChoice, entryKind, reachCounts, stalledCompanies,
} from '../lib/schedule';

describe('日付ユーティリティ', () => {
  test('parseYmd はローカル時刻の0時として解釈する（UTCずれで前日にならない）', () => {
    const d = parseYmd('2026-05-09');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // 0始まり
    expect(d.getDate()).toBe(9);
  });

  test('formatYmd はゼロ埋めする', () => {
    expect(formatYmd(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('parseYmd と formatYmd は往復する', () => {
    for (const ymd of ['2026-01-01', '2026-05-09', '2026-12-31']) {
      expect(formatYmd(parseYmd(ymd))).toBe(ymd);
    }
  });

  test('addDaysYmd は月をまたぐ', () => {
    expect(addDaysYmd('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('addDaysYmd は閏年を正しく扱う', () => {
    expect(addDaysYmd('2028-02-28', 1)).toBe('2028-02-29'); // 閏年
    expect(addDaysYmd('2026-02-28', 1)).toBe('2026-03-01'); // 平年
  });

  test('addDaysYmd は負の値で戻れる', () => {
    expect(addDaysYmd('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('複数日の予定', () => {
  test('endDate が無ければ単日', () => {
    expect(effectiveEnd({ date: '2026-05-09' })).toBe('2026-05-09');
  });

  test('endDate が開始日より前なら開始日に丸める', () => {
    expect(effectiveEnd({ date: '2026-05-09', endDate: '2026-05-01' })).toBe('2026-05-09');
  });

  test('dateRangeStr は単日ならスラッシュ区切り1つ', () => {
    expect(dateRangeStr({ date: '2026-05-09' })).toBe('2026/05/09');
  });

  test('dateRangeStr は複数日なら範囲表記', () => {
    expect(dateRangeStr({ date: '2026-05-09', endDate: '2026-05-12' }))
      .toBe('2026/05/09〜2026/05/12');
  });

  test('dateRangeStr は endDate が開始日と同じなら範囲にしない', () => {
    expect(dateRangeStr({ date: '2026-05-09', endDate: '2026-05-09' })).toBe('2026/05/09');
  });

  test('coversDate は開始日・途中・終了日を含み、外は含まない', () => {
    const s = { date: '2026-05-09', endDate: '2026-05-12' };
    expect(coversDate(s, '2026-05-08')).toBe(false);
    expect(coversDate(s, '2026-05-09')).toBe(true);
    expect(coversDate(s, '2026-05-11')).toBe(true);
    expect(coversDate(s, '2026-05-12')).toBe(true);
    expect(coversDate(s, '2026-05-13')).toBe(false);
  });

  test('expandDateRange は両端を含む', () => {
    expect(expandDateRange({ date: '2026-05-09', endDate: '2026-05-12' }))
      .toEqual(['2026-05-09', '2026-05-10', '2026-05-11', '2026-05-12']);
  });

  test('expandDateRange は単日なら1件', () => {
    expect(expandDateRange({ date: '2026-05-09' })).toEqual(['2026-05-09']);
  });

  test('expandDateRange は日付なしなら空', () => {
    expect(expandDateRange({ date: '' })).toEqual([]);
  });

  test('expandDateRange は壊れたデータでも上限で止まる', () => {
    const out = expandDateRange({ date: '2026-01-01', endDate: '2099-12-31' });
    expect(out).toHaveLength(MAX_SPAN_DAYS);
  });

  test('expandDateRange は月をまたいでも連続する', () => {
    expect(expandDateRange({ date: '2026-01-30', endDate: '2026-02-02' }))
      .toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  });
});

describe('ステータス遷移', () => {
  test('本選考は順に進む', () => {
    expect(nextStatus('検討中')).toBe('ES提出済');
    expect(nextStatus('ES提出済')).toBe('Webテスト');
    expect(nextStatus('Webテスト', 'no')).toBe('1次面接');
    expect(nextStatus('1次面接')).toBe('2次面接');
    expect(nextStatus('2次面接')).toBe('最終面接');
    expect(nextStatus('最終面接')).toBe('内定');
  });

  test('ES締切からはES提出済へ飛ぶ', () => {
    expect(nextStatus('ES締切')).toBe('ES提出済');
  });

  test('インターンは別トラックで進む', () => {
    expect(nextStatus('インターンES締切')).toBe('インターン面接');
    expect(nextStatus('インターン面接')).toBe('インターン確定');
  });

  test('終端はこれ以上進めない', () => {
    expect(nextStatus('内定')).toBeNull();
    expect(nextStatus('インターン確定')).toBeNull();
  });

  test('本選考とインターンのトラックは混ざらない', () => {
    expect(nextStatus('インターン面接')).not.toBe('2次面接');
    expect(nextStatus('検討中')).not.toBe('インターン面接');
  });

  test('未知のステータスは null', () => {
    expect(nextStatus('不合格')).toBeNull();
    expect(nextStatus('内定辞退')).toBeNull();
    expect(nextStatus('')).toBeNull();
  });

  test('繰り返し進めると必ず終端に到達し、途中で戻らない', () => {
    for (const gd of ['yes', 'no'] as const) {
      let s: string | null = '検討中';
      const seen: string[] = [];
      while (s) {
        expect(seen).not.toContain(s); // ループしない
        seen.push(s);
        s = nextStatus(s, gd);
      }
      expect(seen[seen.length - 1]).toBe('内定');
    }
  });
});

// ─── 日程重複・やること集約・準備テンプレート ────────────────────

const ev = (id: string, hour: string, minute = '00', venueType?: 'online' | 'onsite') =>
  ({ id, company: id, date: '2026-05-09', hour, minute, venueType });

describe('Webテストを挟むステータス遷移', () => {
  test('ES提出済の次は常にWebテスト', () => {
    expect(nextStatus('ES提出済')).toBe('Webテスト');
  });

  test('Webテストの次はGDの有無で決まる', () => {
    expect(nextStatus('Webテスト', 'no')).toBe('1次面接');
    expect(nextStatus('Webテスト', 'yes')).toBe('GD');
  });

  test('GDありの企業は PROGRESS_FLOW をそのままなぞる', () => {
    let s: string | null = '検討中';
    const seen: string[] = [];
    while (s) {
      expect(seen).not.toContain(s);
      seen.push(s);
      s = nextStatus(s, 'yes');
    }
    expect(seen).toEqual(PROGRESS_FLOW);
  });
});

describe('日程の重複検知', () => {
  test('オンライン同士は所要時間ぶんだけ見る', () => {
    expect(eventsConflict(ev('a', '10', '00', 'online'), ev('b', '10', '30', 'online'))).toBe(true);
    expect(eventsConflict(ev('a', '10', '00', 'online'), ev('b', '11', '00', 'online'))).toBe(false);
  });

  test('対面が絡むと移動時間ぶん広く見る', () => {
    // 10:00開始と11:00開始。オンライン同士なら衝突しないが、対面が絡むと衝突する
    expect(eventsConflict(ev('a', '10', '00', 'onsite'), ev('b', '11', '00', 'online'))).toBe(true);
    expect(eventsConflict(ev('a', '10', '00', 'onsite'), ev('b', '13', '00', 'online'))).toBe(false);
  });

  test('日付が違えば衝突しない', () => {
    const a = { ...ev('a', '10'), date: '2026-05-09' };
    const b = { ...ev('b', '10'), date: '2026-05-10' };
    expect(eventsConflict(a, b)).toBe(false);
  });

  test('時刻未定は判定しない', () => {
    expect(eventsConflict(ev('a', ''), ev('b', '10'))).toBe(false);
  });

  test('自分自身とは衝突しない', () => {
    const a = ev('a', '10');
    expect(eventsConflict(a, a)).toBe(false);
  });

  test('findConflicts は衝突した両方のIDを返す', () => {
    const list = [ev('a', '10', '00', 'online'), ev('b', '10', '30', 'online'), ev('c', '15')];
    const hit = findConflicts(list);
    expect(hit.has('a')).toBe(true);
    expect(hit.has('b')).toBe(true);
    expect(hit.has('c')).toBe(false);
  });

  test('想定所要時間と移動バッファは定数として公開されている', () => {
    expect(EVENT_DURATION_MIN).toBeGreaterThan(0);
    expect(TRAVEL_BUFFER_MIN).toBeGreaterThan(0);
  });
});

describe('やること集約', () => {
  const today = '2026-05-09';
  const base = { id: '1', company: 'A社', status: '検討中', date: '' };

  test('ES締切はその日付が期限になる', () => {
    const t = collectTodos([{ ...base, status: 'ES締切', date: '2026-05-12' }], today);
    expect(t).toHaveLength(1);
    expect(t[0].kind).toBe('es');
    expect(t[0].daysLeft).toBe(3);
  });

  test('Webテストの期限はES締切とは別に出る', () => {
    const t = collectTodos([
      { ...base, status: 'ES締切', date: '2026-05-12', webTestDeadline: '2026-05-15' },
    ], today);
    expect(t.map(x => x.kind)).toEqual(['es', 'webtest']);
  });

  test('辞退を決めたが未連絡ならタスクに出る', () => {
    const t = collectTodos([{ ...base, status: '内定辞退' }], today);
    expect(t.map(x => x.kind)).toEqual(['decline']);
  });

  test('辞退連絡済みなら出ない', () => {
    const t = collectTodos([{ ...base, status: '内定辞退', declineContacted: true }], today);
    expect(t).toHaveLength(0);
  });

  test('チェック済みのカスタム項目は出ない', () => {
    const t = collectTodos([{
      ...base,
      customChecklist: [
        { id: 'c1', label: '済んだこと', checked: true },
        { id: 'c2', label: '未了のこと', checked: false, due: '2026-05-10' },
      ],
    }], today);
    expect(t).toHaveLength(1);
    expect(t[0].label).toBe('未了のこと');
  });

  test('期限が近い順に並び、期限なしは末尾', () => {
    const t = collectTodos([
      { ...base, id: '1', company: 'A社', customChecklist: [{ id: 'x', label: '期限なし', checked: false }] },
      { ...base, id: '2', company: 'B社', status: 'ES締切', date: '2026-05-20' },
      { ...base, id: '3', company: 'C社', status: 'ES締切', date: '2026-05-10' },
    ], today);
    expect(t.map(x => x.company)).toEqual(['C社', 'B社', 'A社']);
  });

  test('期限切れは負の日数になる', () => {
    const t = collectTodos([{ ...base, status: 'ES締切', date: '2026-05-01' }], today);
    expect(t[0].daysLeft).toBe(-8);
  });

  test('不合格・完了のWebテストは出さない', () => {
    const t = collectTodos([{ ...base, status: '不合格', webTestDeadline: '2026-05-20' }], today);
    expect(t).toHaveLength(0);
  });
});

describe('daysBetween', () => {
  test('月をまたいでも正しい', () => {
    expect(daysBetween('2026-01-30', '2026-02-02')).toBe(3);
  });
  test('同日は0', () => {
    expect(daysBetween('2026-05-09', '2026-05-09')).toBe(0);
  });
});

describe('準備テンプレート', () => {
  test('主要なステータスに雛形がある', () => {
    for (const s of ['ES締切', 'Webテスト', '1次面接', '最終面接', 'ワークショップ']) {
      expect(PREP_TEMPLATES[s]?.length).toBeGreaterThan(0);
    }
  });
  test('雛形に重複した文言が無い', () => {
    for (const [, items] of Object.entries(PREP_TEMPLATES)) {
      expect(new Set(items).size).toBe(items.length);
    }
  });
});

describe('複数日の予定の重複検知', () => {
  const span = (id: string, date: string, endDate: string, hour: string) =>
    ({ id, company: id, date, endDate, hour, minute: '00', venueType: 'online' as const });

  test('期間が重なっていれば開始日が違っても衝突する', () => {
    const a = span('a', '2026-05-09', '2026-05-12', '10');
    const b = { id: 'b', company: 'b', date: '2026-05-11', hour: '10', minute: '00', venueType: 'online' as const };
    expect(eventsConflict(a, b)).toBe(true);
  });

  test('期間が重ならなければ衝突しない', () => {
    const a = span('a', '2026-05-09', '2026-05-10', '10');
    const b = { id: 'b', company: 'b', date: '2026-05-12', hour: '10', minute: '00', venueType: 'online' as const };
    expect(eventsConflict(a, b)).toBe(false);
  });

  test('期間が重なっても時刻が離れていれば衝突しない', () => {
    const a = span('a', '2026-05-09', '2026-05-12', '10');
    const b = { id: 'b', company: 'b', date: '2026-05-11', hour: '15', minute: '00', venueType: 'online' as const };
    expect(eventsConflict(a, b)).toBe(false);
  });
});

describe('段階分布', () => {
  test('ステータスが対応するバケツに入る', () => {
    const d = stageDistribution([
      { status: '検討中' }, { status: 'ES締切' }, { status: 'ES提出済' },
      { status: 'Webテスト' }, { status: '1次面接' }, { status: '最終面接' },
      { status: '内定' }, { status: '内定承諾' },
    ]);
    const by = Object.fromEntries(d.map(x => [x.key, x.count]));
    expect(by.considering).toBe(1);
    expect(by.document).toBe(3);
    expect(by.interview).toBe(2);
    expect(by.offer).toBe(2);
  });

  test('選考が終わったものはどの段階にも入らない', () => {
    const d = stageDistribution([{ status: '不合格' }, { status: '内定辞退' }, { status: '完了' }]);
    expect(d.reduce((a, b) => a + b.count, 0)).toBe(0);
  });

  test('バケツ同士でステータスが重複していない', () => {
    const all = STAGE_BUCKETS.flatMap(b => b.statuses);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('週の初日', () => {
  test('月曜起点', () => {
    // 2026-08-08 は土曜
    expect(startOfWeekYmd('2026-08-08', 1)).toBe('2026-08-03');
  });
  test('日曜起点', () => {
    expect(startOfWeekYmd('2026-08-08', 0)).toBe('2026-08-02');
  });
  test('週の初日そのものなら動かない', () => {
    expect(startOfWeekYmd('2026-08-03', 1)).toBe('2026-08-03');
  });
});

describe('今週の動き', () => {
  const h = (...dates: string[]) => dates.map(d => ({ status: 'x', changedAt: `${d}T10:00:00.000Z` }));

  test('1件目は追加、2件目以降は前進として数える', () => {
    const r = weeklyActivity([
      { status: '1次面接', statusHistory: h('2026-08-04', '2026-08-05', '2026-08-06') },
    ], '2026-08-08', 1);
    expect(r.added).toBe(1);
    expect(r.advanced).toBe(2);
  });

  test('先週登録して今週進んだものは追加に数えない', () => {
    const r = weeklyActivity([
      { status: '1次面接', statusHistory: h('2026-07-28', '2026-08-05') },
    ], '2026-08-08', 1);
    expect(r.added).toBe(0);
    expect(r.advanced).toBe(1);
  });

  test('履歴が無いものは無視する', () => {
    const r = weeklyActivity([{ status: '検討中' }], '2026-08-08', 1);
    expect(r).toEqual({ added: 0, advanced: 0 });
  });
});

describe('バーチカル表示の配置', () => {
  const at = (id: string, hour: string, minute = '00') =>
    ({ id, company: id, date: '2026-05-09', hour, minute });

  test('重ならない予定は全て1列', () => {
    const r = layoutDayEvents([at('a', '10'), at('b', '13'), at('c', '15')]);
    expect(r).toHaveLength(3);
    expect(r.every(p => p.cols === 1 && p.col === 0)).toBe(true);
  });

  test('重なる2件は2列に分かれる', () => {
    const r = layoutDayEvents([at('a', '10', '00'), at('b', '10', '30')]);
    expect(r.map(p => p.col)).toEqual([0, 1]);
    expect(r.every(p => p.cols === 2)).toBe(true);
  });

  test('別々の重なりは列数を共有しない', () => {
    // 朝に2件重なり、夕方は1件だけ
    const r = layoutDayEvents([at('a', '10', '00'), at('b', '10', '30'), at('c', '18')]);
    const byId = Object.fromEntries(r.map(p => [p.event.id, p]));
    expect(byId.a.cols).toBe(2);
    expect(byId.b.cols).toBe(2);
    expect(byId.c.cols).toBe(1);
  });

  test('空いた列は使い回す', () => {
    // a:10:00-11:00, b:10:30-11:30, c:11:00-12:00 → c は a の列に入る
    const r = layoutDayEvents([at('a', '10', '00'), at('b', '10', '30'), at('c', '11', '00')]);
    const byId = Object.fromEntries(r.map(p => [p.event.id, p]));
    expect(byId.a.col).toBe(0);
    expect(byId.b.col).toBe(1);
    expect(byId.c.col).toBe(0);
  });

  test('時刻のない予定は除外される', () => {
    const r = layoutDayEvents([at('a', ''), at('b', '10')]);
    expect(r.map(p => p.event.id)).toEqual(['b']);
  });

  test('開始と終了は分で返る', () => {
    const r = layoutDayEvents([at('a', '09', '30')]);
    expect(r[0].startMin).toBe(570);
    expect(r[0].endMin).toBe(570 + 60);
  });

  test('入力の順番によらず結果が同じ', () => {
    const fwd = layoutDayEvents([at('a', '10', '00'), at('b', '10', '30')]);
    const rev = layoutDayEvents([at('b', '10', '30'), at('a', '10', '00')]);
    const key = (r: typeof fwd) => r.map(p => `${p.event.id}:${p.col}/${p.cols}`).sort().join(',');
    expect(key(fwd)).toBe(key(rev));
  });
});

// 就活は年をまたいで走るため、日付境界は落とすと痛い箇所。
describe('日付の境界', () => {
  test('月末から翌月へ渡る', () => {
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1);
    expect(addDaysYmd('2026-08-31', 1)).toBe('2026-09-01');
  });

  test('年をまたぐ', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-12-25', '2027-01-05')).toBe(11);
  });

  test('うるう年の2月をまたぐ', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2); // 2/29がある
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });

  test('同日は0、過去は負', () => {
    expect(daysBetween('2026-08-09', '2026-08-09')).toBe(0);
    expect(daysBetween('2026-08-09', '2026-08-08')).toBe(-1);
  });

  test('やることの残り日数は今日を0として数える', () => {
    const base = { id: '1', company: 'A社', status: 'ES締切', date: '2026-08-09' };
    expect(collectTodos([base], '2026-08-09')[0].daysLeft).toBe(0);
    expect(collectTodos([base], '2026-08-08')[0].daysLeft).toBe(1);
    expect(collectTodos([base], '2026-08-10')[0].daysLeft).toBe(-1);
  });

  test('月をまたいだ期間の予定も全日を覆う', () => {
    const s = { date: '2026-08-30', endDate: '2026-09-02' };
    expect(coversDate(s, '2026-08-31')).toBe(true);
    expect(coversDate(s, '2026-09-01')).toBe(true);
    expect(coversDate(s, '2026-09-03')).toBe(false);
  });

  test('年をまたいだ期間の予定も全日を覆う', () => {
    const s = { date: '2026-12-30', endDate: '2027-01-02' };
    expect(expandDateRange(s)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });

  test('時刻未設定は重複判定の対象外', () => {
    const a = { id: 'a', company: 'a', date: '2026-08-09', hour: '', minute: '' };
    const b = { id: 'b', company: 'b', date: '2026-08-09', hour: '', minute: '' };
    expect(eventsConflict(a, b)).toBe(false);
  });
});

describe('週ごとの前進', () => {
  const h = (...dates: string[]) => dates.map(d => ({ status: 'x', changedAt: `${d}T10:00:00.000Z` }));

  test('古い週から順に、指定した週数ぶん返る', () => {
    const r = weeklyTrend([], '2026-08-08', 1, 4);
    expect(r).toHaveLength(4);
    expect(r.map(w => w.from)).toEqual(['2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03']);
  });

  test('週ごとに正しく振り分けられる', () => {
    const r = weeklyTrend([
      { status: 'x', statusHistory: h('2026-07-20', '2026-07-28', '2026-08-04', '2026-08-05') },
    ], '2026-08-08', 1, 3);
    // 1件目(7/20)は登録なので数えない
    expect(r.find(w => w.from === '2026-07-27')?.count).toBe(1);
    expect(r.find(w => w.from === '2026-08-03')?.count).toBe(2);
  });

  test('範囲外の変更は数えない', () => {
    const r = weeklyTrend([
      { status: 'x', statusHistory: h('2026-01-01', '2026-01-05') },
    ], '2026-08-08', 1, 4);
    expect(r.every(w => w.count === 0)).toBe(true);
  });
});

describe('やることの完了', () => {
  const base = { id: '1', company: 'A社', status: 'ES締切', date: '2026-05-12' };

  test('Webテストを受検済みにすると一覧から消える', () => {
    const src = { ...base, status: '1次面接', webTestDeadline: '2026-05-15' };
    expect(collectTodos([src], '2026-05-09').some(t => t.kind === 'webtest')).toBe(true);
    expect(collectTodos([{ ...src, webTestDone: true }], '2026-05-09').some(t => t.kind === 'webtest')).toBe(false);
  });

  test('カスタム項目には対象IDが付く', () => {
    const src = { ...base, customChecklist: [{ id: 'c1', label: '適性検査', checked: false }] };
    const t = collectTodos([src], '2026-05-09').find(x => x.kind === 'custom');
    expect(t?.customId).toBe('c1');
  });
});

describe('Webテスト後の分岐', () => {
  test('GDありならGDへ、なしなら1次面接へ', () => {
    expect(nextStatus('Webテスト', 'yes')).toBe('GD');
    expect(nextStatus('Webテスト', 'no')).toBe('1次面接');
  });

  test('未確認のときは進めず、選ばせる合図を返す', () => {
    expect(nextStatus('Webテスト', 'unknown')).toBeNull();
    expect(needsGdChoice('Webテスト', 'unknown')).toBe(true);
  });

  test('未指定は未確認として扱う（既存データが勝手に飛ばされない）', () => {
    expect(nextStatus('Webテスト')).toBeNull();
    expect(needsGdChoice('Webテスト')).toBe(true);
  });

  test('Webテスト以外では選択を求めない', () => {
    for (const st of ['検討中', 'ES提出済', 'GD', '1次面接', '最終面接']) {
      expect(needsGdChoice(st, 'unknown')).toBe(false);
    }
  });

  test('GDの次は1次面接', () => {
    expect(nextStatus('GD')).toBe('1次面接');
  });
});

describe('予定の種別', () => {
  test('締切は deadline', () => {
    expect(entryKind('ES締切')).toBe('deadline');
    expect(entryKind('インターンES締切')).toBe('deadline');
  });

  test('出向くものは event', () => {
    for (const st of ['説明会', 'ワークショップ', 'GD', 'Webテスト', '1次面接', '2次面接', '最終面接', 'インターン面接']) {
      expect(entryKind(st)).toBe('event');
    }
  });

  test('状態は state', () => {
    for (const st of ['検討中', 'ES提出済', '内定', '内定承諾', 'インターン確定', '内定辞退', '不合格', '完了']) {
      expect(entryKind(st)).toBe('state');
    }
  });

  test('ユーザーが足した未知のステータスは予定として扱う', () => {
    expect(entryKind('リクルーター面談')).toBe('event');
    expect(entryKind('')).toBe('event');
  });

  test('選考の各段階はどれか1つの種別にだけ属する', () => {
    for (const st of PROGRESS_FLOW) {
      expect(['event', 'deadline', 'state']).toContain(entryKind(st));
    }
  });
});

describe('段階ごとの到達数', () => {
  const h = (...st: string[]) => st.map(x => ({ status: x, changedAt: '2026-08-01T00:00:00.000Z' }));

  test('先に進んでいても過去に通った段階として数える', () => {
    const r = reachCounts([
      { status: '最終面接', statusHistory: h('ES締切', 'ES提出済', '1次面接', '最終面接') },
      { status: 'ES提出済', statusHistory: h('ES締切', 'ES提出済') },
    ], ['ES締切', 'ES提出済', '1次面接', '最終面接']);
    const by = Object.fromEntries(r.map(x => [x.status, x.count]));
    expect(by['ES締切']).toBe(2);
    expect(by['ES提出済']).toBe(2);
    expect(by['1次面接']).toBe(1);
    expect(by['最終面接']).toBe(1);
  });

  test('履歴が無くても現在のステータスは数える', () => {
    const r = reachCounts([{ status: 'GD' }], ['GD']);
    expect(r[0].count).toBe(1);
  });
});

describe('止まっている企業', () => {
  const at = (ymd: string) => [{ status: 'x', changedAt: `${ymd}T00:00:00.000Z` }];

  test('指定日数より動いていないものを、古い順に返す', () => {
    const r = stalledCompanies([
      { id: '1', company: 'A社', status: 'x', statusHistory: at('2026-07-01') },
      { id: '2', company: 'B社', status: 'x', statusHistory: at('2026-08-05') },
      { id: '3', company: 'C社', status: 'x', statusHistory: at('2026-07-20') },
    ], '2026-08-09', 14);
    expect(r.map(x => x.item.company)).toEqual(['A社', 'C社']);
    expect(r[0].sinceDays).toBe(39);
  });

  test('履歴が無いものは判断できないので対象外', () => {
    expect(stalledCompanies([{ id: '1', company: 'A社', status: 'x' }], '2026-08-09')).toEqual([]);
  });
});
