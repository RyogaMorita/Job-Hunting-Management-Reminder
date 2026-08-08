import {
  parseYmd, formatYmd, addDaysYmd, effectiveEnd, dateRangeStr,
  coversDate, expandDateRange, nextStatus, MAX_SPAN_DAYS,
  eventsConflict, findConflicts, collectTodos, daysBetween,
  EVENT_DURATION_MIN, TRAVEL_BUFFER_MIN, PREP_TEMPLATES, PROGRESS_FLOW,
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
    expect(nextStatus('ES提出済')).toBe('1次面接');
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
    let s: string | null = '検討中';
    const seen: string[] = [];
    while (s) {
      expect(seen).not.toContain(s); // ループしない
      seen.push(s);
      s = nextStatus(s);
    }
    expect(seen[seen.length - 1]).toBe('内定');
  });
});

// ─── 日程重複・やること集約・準備テンプレート ────────────────────

const ev = (id: string, hour: string, minute = '00', venueType?: 'online' | 'onsite') =>
  ({ id, company: id, date: '2026-05-09', hour, minute, venueType });

describe('Webテストを挟むステータス遷移', () => {
  test('テスト情報が無ければ ES提出済 → 1次面接（従来どおり）', () => {
    expect(nextStatus('ES提出済')).toBe('1次面接');
    expect(nextStatus('ES提出済', false)).toBe('1次面接');
  });

  test('テスト情報があれば ES提出済 → Webテスト', () => {
    expect(nextStatus('ES提出済', true)).toBe('Webテスト');
  });

  test('Webテストの次は1次面接', () => {
    expect(nextStatus('Webテスト')).toBe('1次面接');
  });

  test('Webテストを挟んでも終端に到達する', () => {
    let s: string | null = '検討中';
    const seen: string[] = [];
    while (s) {
      expect(seen).not.toContain(s);
      seen.push(s);
      s = nextStatus(s, s === 'ES提出済');
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
