import {
  parseYmd, formatYmd, addDaysYmd, effectiveEnd, dateRangeStr,
  coversDate, expandDateRange, nextStatus, MAX_SPAN_DAYS,
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
