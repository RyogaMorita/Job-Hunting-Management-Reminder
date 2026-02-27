import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  SafeAreaView, Modal, TextInput, Alert, KeyboardAvoidingView,
  Platform, Switch, FlatList
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

// 通知ハンドラ設定
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── 定数 ─────────────────────────────────────────────
const STORAGE_KEY = '@schedules_v8';
const GENRES_KEY = '@genres_v8';
const TDU_BLUE = '#003366';
const ACCENT = '#1a6bcc';

const STATUS_OPTIONS = ['検討中', 'ES作成', 'ES提出済', '1次面接', '2次面接', '最終面接', '内定', '内定辞退', '不合格'];
const STATUS_PRIORITY: Record<string, number> = {
  '内定': 6, '最終面接': 5, '2次面接': 4, '1次面接': 3,
  'ES提出済': 2, 'ES作成': 1, '検討中': 0, '内定辞退': -1, '不合格': -2,
};
const STATUS_SORT_ORDER = ['内定', '最終面接', '2次面接', '1次面接', 'ES提出済', 'ES作成', '検討中', '内定辞退', '不合格'];
const RANK_OPTIONS = ['S', 'A', 'B', 'C'];
const SORT_OPTIONS = ['登録順', '直近順', '五十音', '志望度', 'ステータス', 'ジャンル'];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

// 選考チェックリスト（固定）
const CHECKLIST_STEPS = ['ES提出', '1次面接', '2次面接', '最終面接', '内定'];
const CUSTOM_ITEMS_KEY = '@custom_checklist_items';

// ステータスごとのカード背景色
const statusCardColor = (status: string): string => {
  if (status === '内定') return '#fff0f0'; // 赤系
  if (status === '内定辞退') return '#f0f0f0'; // 灰色
  if (status === '不合格') return '#f0f0f0'; // 灰色
  return '#ffffff';
};
const statusCardBorder = (status: string): string => {
  if (status === '内定') return '#f5a0a0';
  if (['内定辞退', '不合格'].includes(status)) return '#cccccc';
  return '#eeeeee';
};

// ─── 型定義 ───────────────────────────────────────────
interface Genre {
  id: string;
  name: string;
  color: string; // hex
}

interface Schedule {
  id: string;
  company: string;
  date: string;
  hour: string;
  minute: string;
  status: string;
  note: string;
  url: string;
  password: string;
  rank: string;
  genreId: string;
  checklist: Record<string, boolean>;
  customChecklist: { id: string; label: string; checked: boolean }[];
}

type TabType = 'calendar' | 'list' | 'settings';
type SortType = '登録順' | '直近順' | '五十音' | '志望度' | 'ステータス' | 'ジャンル';

// ─── デフォルトジャンル ──────────────────────────────
const DEFAULT_GENRES: Genre[] = [
  { id: 'it', name: 'IT・通信', color: '#4A90D9' },
  { id: 'finance', name: '金融・保険', color: '#27AE60' },
  { id: 'mfg', name: '製造・メーカー', color: '#E67E22' },
  { id: 'trade', name: '商社・流通', color: '#8E44AD' },
  { id: 'consult', name: 'コンサル', color: '#E74C3C' },
  { id: 'infra', name: 'インフラ・建設', color: '#795548' },
  { id: 'real', name: '不動産', color: '#009688' },
  { id: 'retail', name: '小売・流通', color: '#FF5722' },
  { id: 'food', name: '食品・飲料', color: '#FFC107' },
  { id: 'media', name: 'マスコミ・広告', color: '#9C27B0' },
  { id: 'gov', name: '公務員・団体', color: '#607D8B' },
  { id: 'edu', name: '教育・学術', color: '#00BCD4' },
  { id: 'medical', name: '医療・福祉', color: '#4CAF50' },
  { id: 'transport', name: '物流・運輸', color: '#FF9800' },
  { id: 'other', name: 'その他', color: '#7F8C8D' },
];

// ─── カラーパレット（ジャンル色選択用） ──────────────
const COLOR_PALETTE = [
  '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C',
  '#3498DB', '#4A90D9', '#9B59B6', '#8E44AD', '#2C3E50',
  '#27AE60', '#16A085', '#2980B9', '#7F8C8D', '#BDC3C7',
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [genres, setGenres] = useState<Genre[]>(DEFAULT_GENRES);

  // カレンダー
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [calDaySelected, setCalDaySelected] = useState(false);

  // 持ち駒一覧
  const [searchQuery, setSearchQuery] = useState('');
  const [sortType, setSortType] = useState<SortType>('登録順');
  const [filterGenreId, setFilterGenreId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [filterPanelVisible, setFilterPanelVisible] = useState<boolean>(false);

  // 登録/編集モーダル
  const [isModalVisible, setModalVisible] = useState(false);
  const [isDetailVisible, setDetailVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Schedule | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [selStatus, setSelStatus] = useState('検討中');
  const [selDate, setSelDate] = useState(new Date().toISOString().split('T')[0]);
  const [selHour, setSelHour] = useState('');
  const [selMinute, setSelMinute] = useState('');
  const [note, setNote] = useState('');
  const [url, setUrl] = useState('');
  const [password, setPassword] = useState('');
  const [rank, setRank] = useState('B');
  const [selGenreId, setSelGenreId] = useState('other');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  // チェックリストモーダル
  const [checkModalItem, setCheckModalItem] = useState<Schedule | null>(null);
  const [newCheckLabel, setNewCheckLabel] = useState('');

  // ジャンル管理モーダル
  const [genreModalVisible, setGenreModalVisible] = useState(false);
  const [editGenre, setEditGenre] = useState<Genre | null>(null);
  const [genreName, setGenreName] = useState('');
  const [genreColor, setGenreColor] = useState('#4A90D9');

  // 時間プルダウン
  const [hourPickerVisible, setHourPickerVisible] = useState(false);
  const [minutePickerVisible, setMinutePickerVisible] = useState(false);

  // 通知設定
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [notifyDays, setNotifyDays] = useState('1');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const s = await AsyncStorage.getItem(STORAGE_KEY);
      if (s) setSchedules(JSON.parse(s));
      const g = await AsyncStorage.getItem(GENRES_KEY);
      if (g) setGenres(JSON.parse(g));
      const sort = await AsyncStorage.getItem('@sort_type');
      if (sort) setSortType(sort as SortType);
      const ne = await AsyncStorage.getItem('@notify_enabled');
      if (ne !== null) setNotifyEnabled(JSON.parse(ne));
      const nd = await AsyncStorage.getItem('@notify_days');
      if (nd) setNotifyDays(nd);
    } catch (e) { Alert.alert('エラー', '読み込み失敗'); }
  };

  const saveSchedules = async (data: Schedule[]) => {
    setSchedules(data);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };
  const saveGenres = async (data: Genre[]) => {
    setGenres(data);
    await AsyncStorage.setItem(GENRES_KEY, JSON.stringify(data));
  };

  // ─── 統計 ────────────────────────────────────────
  const activeCount = useMemo(() => schedules.filter(s => !['内定', '内定辞退', '不合格'].includes(s.status)).length, [schedules]);
  const internalCount = useMemo(() => schedules.filter(s => s.status === '内定').length, [schedules]);

  const upcomingSchedules = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return schedules
      .filter(s => s.date >= today && !['内定辞退', '不合格'].includes(s.status))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [schedules]);

  // ─── カレンダーマーキング ──────────────────────
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    schedules.forEach(s => {
      const genre = genres.find(g => g.id === s.genreId);
      const dot = genre ? genre.color : TDU_BLUE;
      if (!marks[s.date]) marks[s.date] = { dots: [] };
      if (!marks[s.date].dots) marks[s.date].dots = [];
      marks[s.date].dots.push({ color: dot });
    });
    marks[selectedDate] = { ...(marks[selectedDate] || {}), selected: true, selectedColor: TDU_BLUE };
    return marks;
  }, [schedules, selectedDate, genres]);

  // 日付→企業マップ（同日はステータス優先度が高い順に並べる）
  const dateCompanyMap = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    schedules.forEach(s => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    Object.keys(map).forEach(d => {
      map[d].sort((a, b) => (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0));
    });
    return map;
  }, [schedules]);

  // ─── 持ち駒フィルタ・ソート ────────────────────
  const filteredSorted = useMemo(() => {
    let list = [...schedules];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(s => s.company.toLowerCase().includes(q));
    }
    if (filterGenreId !== 'all') list = list.filter(s => s.genreId === filterGenreId);
    if (filterStatus !== 'all') list = list.filter(s => s.status === filterStatus);

    switch (sortType) {
      case '直近順': list.sort((a, b) => a.date.localeCompare(b.date)); break;
      case '五十音': list.sort((a, b) => a.company.localeCompare(b.company, 'ja')); break;
      case '志望度': {
        const o = { S: 0, A: 1, B: 2, C: 3 };
        list.sort((a, b) => (o[a.rank as keyof typeof o] ?? 3) - (o[b.rank as keyof typeof o] ?? 3));
        break;
      }
      case 'ステータス':
        list.sort((a, b) => {
          const sd = STATUS_SORT_ORDER.indexOf(a.status) - STATUS_SORT_ORDER.indexOf(b.status);
          if (sd !== 0) return sd;
          // ステータスが同じなら志望度が高い方を上に
          const ro = { S: 0, A: 1, B: 2, C: 3 };
          return (ro[a.rank as keyof typeof ro] ?? 3) - (ro[b.rank as keyof typeof ro] ?? 3);
        });
        break;
      case 'ジャンル': list.sort((a, b) => a.genreId.localeCompare(b.genreId)); break;
    }
    if (!sortAsc) list.reverse();
    return list;
  }, [schedules, searchQuery, filterGenreId, filterStatus, sortType, sortAsc]);

  const filteredByDate = useMemo(() => schedules.filter(s => s.date === selectedDate), [schedules, selectedDate]);

  // ─── 保存 ────────────────────────────────────────
  const handleSave = async () => {
    if (companyName.trim() === '') return;

    const INACTIVE = ['内定辞退', '不合格'];
    const newIsInactive = INACTIVE.includes(selStatus);
    const name = companyName.trim();

    // 同名の既存エントリ（編集中のものを除く）
    const sameNameEntries = schedules.filter(
      s => s.company.trim() === name && s.id !== (selectedItem?.id ?? '')
    );

    if (sameNameEntries.length > 0) {
      const existingInactive = sameNameEntries.find(s => INACTIVE.includes(s.status));
      const existingPriority = Math.max(...sameNameEntries.map(s => STATUS_PRIORITY[s.status] ?? 0));
      const newPriority = STATUS_PRIORITY[selStatus] ?? 0;

      if (newIsInactive) {
        // 新規が不合格/内定辞退 → 既存の同名エントリを全削除して新規のみ残す
        Alert.alert(
          `${selStatus}として登録`,
          `「${name}」の既存エントリを削除し、${selStatus}のみ残します。`,
          [
            { text: 'キャンセル', style: 'cancel' },
            { text: '登録', onPress: () => doSaveMerge(sameNameEntries.map(s => s.id)) },
          ]
        );
      } else if (existingInactive) {
        // 既存が不合格/内定辞退 → 追加しない
        Alert.alert(
          '登録できません',
          `「${name}」はすでに「${existingInactive.status}」として登録されています。
別の企業名で登録するか、既存エントリを編集してください。`
        );
      } else if (newPriority > existingPriority) {
        // 新規のステータスが高い → 既存を削除して新規のみ
        Alert.alert(
          'ステータス更新',
          `「${name}」の既存エントリ（${sameNameEntries.map(s => s.status).join('、')}）を削除し、${selStatus}として更新しますか？`,
          [
            { text: 'キャンセル', style: 'cancel' },
            { text: '更新', onPress: () => doSaveMerge(sameNameEntries.map(s => s.id)) },
          ]
        );
      } else {
        // 新規のステータスが低い or 同じ → 別エントリとして追加確認
        Alert.alert(
          '重複確認',
          `「${name}」（${sameNameEntries.map(s => s.status).join('、')}）がすでに存在します。
別エントリーとして追加しますか？`,
          [
            { text: 'キャンセル', style: 'cancel' },
            { text: '追加する', onPress: () => doSave() },
          ]
        );
      }
      return;
    }
    doSave();
  };

  // 指定IDの既存エントリを削除してから保存
  const doSaveMerge = async (deleteIds: string[]) => {
    const filtered = schedules.filter(s => !deleteIds.includes(s.id));
    const ns: Schedule = {
      id: selectedItem ? selectedItem.id : Date.now().toString(),
      company: companyName.trim(), date: selDate,
      hour: selHour, minute: selMinute,
      status: selStatus, note: note.trim(),
      url: url.trim(), password: password.trim(),
      rank, genreId: selGenreId, checklist,
      customChecklist: selectedItem?.customChecklist ?? [],
    };
    const updated = selectedItem
      ? filtered.map(s => s.id === selectedItem.id ? ns : s)
      : [...filtered, ns];
    await saveSchedules(updated);
    await scheduleNotification(ns);
    closeModal();
  };

  const doSave = async () => {
    const ns: Schedule = {
      id: selectedItem ? selectedItem.id : Date.now().toString(),
      company: companyName.trim(), date: selDate,
      hour: selHour, minute: selMinute,
      status: selStatus, note: note.trim(),
      url: url.trim(), password: password.trim(),
      rank, genreId: selGenreId, checklist,
      customChecklist: selectedItem?.customChecklist ?? [],
    };
    const updated = selectedItem
      ? schedules.map(s => s.id === selectedItem.id ? ns : s)
      : [...schedules, ns];
    await saveSchedules(updated);
    await scheduleNotification(ns);
    closeModal();
  };

  // ── 通知スケジュール ──────────────────────────────
  const scheduleNotification = async (item: Schedule) => {
    if (!notifyEnabled) return;
    if (!item.date) return;
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;

      // 既存の同IDの通知をキャンセル
      const notifId = `notif_${item.id}`;
      await Notifications.cancelScheduledNotificationAsync(notifId).catch(() => { });

      const [y, m, d] = item.date.split('-').map(Number);
      const hour = item.hour ? parseInt(item.hour) : 9;
      const minute = item.minute ? parseInt(item.minute) : 0;

      const notifyDate = new Date(y, m - 1, d - parseInt(notifyDays), hour, minute, 0);
      if (notifyDate <= new Date()) return; // 過去は無視

      await Notifications.scheduleNotificationAsync({
        identifier: notifId,
        content: {
          title: `📋 ${item.company}`,
          body: `${item.status}の予定が${notifyDays === '0' ? '今日' : notifyDays + '日後'}です（${item.date} ${item.hour ? item.hour + ':' + item.minute : ''}）`,
          sound: true,
        },
        trigger: { date: notifyDate },
      });
    } catch (e) {
      console.log('通知設定エラー:', e);
    }
  };

  // 削除時に通知もキャンセル
  const cancelNotification = async (id: string) => {
    await Notifications.cancelScheduledNotificationAsync(`notif_${id}`).catch(() => { });
  };

  const closeModal = () => {
    setModalVisible(false); setDetailVisible(false); setSelectedItem(null);
    setCompanyName(''); setNote(''); setSelStatus('検討中');
    setSelHour(''); setSelMinute(''); setUrl(''); setPassword('');
    setRank('B'); setSelGenreId('other'); setChecklist({});
  };

  const openAdd = () => {
    setSelDate(selectedDate);
    setModalVisible(true);
  };

  const openDetail = (item: Schedule) => {
    setSelectedItem(item); setCompanyName(item.company);
    setNote(item.note ?? ''); setSelStatus(item.status);
    setSelDate(item.date); setSelHour(item.hour ?? '');
    setSelMinute(item.minute ?? ''); setUrl(item.url ?? '');
    setPassword(item.password ?? ''); setRank(item.rank ?? 'B');
    setSelGenreId(item.genreId ?? 'other');
    setChecklist(item.checklist ?? {});
    setDetailVisible(true);
  };

  const deleteSchedule = (id: string) => {
    Alert.alert('削除', 'このデータを削除しますか？', [
      { text: '戻る', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          await cancelNotification(id);
          const filtered = schedules.filter(s => s.id !== id);
          await saveSchedules(filtered); closeModal();
        }
      }
    ]);
  };

  // チェックリスト更新
  const toggleCheck = async (item: Schedule, step: string) => {
    const updated = schedules.map(s => {
      if (s.id !== item.id) return s;
      const newCL = { ...(s.checklist ?? {}), [step]: !(s.checklist ?? {})[step] };
      // 内定チェック→ステータスを自動更新
      const newStatus = newCL['内定'] ? '内定' : s.status === '内定' ? '最終面接' : s.status;
      return { ...s, checklist: newCL, status: newStatus };
    });
    await saveSchedules(updated);
    // checkModalItemも更新
    const refreshed = updated.find(s => s.id === item.id) ?? null;
    setCheckModalItem(refreshed);
  };

  // カスタム項目をトグル
  const toggleCustomCheck = async (item: Schedule, id: string) => {
    const updated = schedules.map(s => {
      if (s.id !== item.id) return s;
      const newCL = (s.customChecklist ?? []).map(c => c.id === id ? { ...c, checked: !c.checked } : c);
      return { ...s, customChecklist: newCL };
    });
    await saveSchedules(updated);
    setCheckModalItem(updated.find(s => s.id === item.id) ?? null);
  };

  // カスタム項目を追加
  const addCustomCheck = async (item: Schedule) => {
    if (!newCheckLabel.trim()) return;
    const newItem = { id: Date.now().toString(), label: newCheckLabel.trim(), checked: false };
    const updated = schedules.map(s => {
      if (s.id !== item.id) return s;
      return { ...s, customChecklist: [...(s.customChecklist ?? []), newItem] };
    });
    await saveSchedules(updated);
    setCheckModalItem(updated.find(s => s.id === item.id) ?? null);
    setNewCheckLabel('');
  };

  // カスタム項目を削除
  const deleteCustomCheck = async (item: Schedule, id: string) => {
    const updated = schedules.map(s => {
      if (s.id !== item.id) return s;
      return { ...s, customChecklist: (s.customChecklist ?? []).filter(c => c.id !== id) };
    });
    await saveSchedules(updated);
    setCheckModalItem(updated.find(s => s.id === item.id) ?? null);
  };

  // ─── ジャンル管理 ──────────────────────────────
  const openAddGenre = () => { setEditGenre(null); setGenreName(''); setGenreColor('#4A90D9'); setGenreModalVisible(true); };
  const openEditGenre = (g: Genre) => { setEditGenre(g); setGenreName(g.name); setGenreColor(g.color); setGenreModalVisible(true); };
  const saveGenre = async () => {
    if (!genreName.trim()) return;
    let updated: Genre[];
    if (editGenre) {
      updated = genres.map(g => g.id === editGenre.id ? { ...g, name: genreName.trim(), color: genreColor } : g);
    } else {
      updated = [...genres, { id: Date.now().toString(), name: genreName.trim(), color: genreColor }];
    }
    await saveGenres(updated);
    setGenreModalVisible(false);
  };
  const deleteGenre = (id: string) => {
    Alert.alert('削除', 'このジャンルを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          await saveGenres(genres.filter(g => g.id !== id));
          setGenreModalVisible(false);
        }
      }
    ]);
  };

  // ─── ヘルパー ─────────────────────────────────
  const rankColor = (r: string) => ({ S: '#e74c3c', A: '#e67e22', B: '#2980b9', C: '#7f8c8d' }[r] ?? '#999');
  const genreOf = (id: string) => genres.find(g => g.id === id);
  const timeStr = (h: string, m: string) => h && m ? `${h}:${m}` : h ? `${h}:00` : '';
  const today = new Date().toISOString().split('T')[0];

  // ─── UI ───────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>

        {/* ヘッダー */}
        <View style={styles.topNav}>
          <View style={styles.headerStats}>
            <View style={styles.statChip}>
              <Text style={styles.statNum}>{activeCount}</Text>
              <Text style={styles.statLabel}>持ち駒</Text>
            </View>
            <Text style={styles.headerTitle}>就活管理</Text>
            <View style={[styles.statChip, { backgroundColor: '#fff3cd' }]}>
              <Text style={[styles.statNum, { color: '#856404' }]}>{internalCount}</Text>
              <Text style={[styles.statLabel, { color: '#856404' }]}>内定 🌸</Text>
            </View>
          </View>
        </View>

        {/* ── カレンダータブ ── */}
        {activeTab === 'calendar' && (
          <View style={{ flex: 1 }}>
            <Calendar
              markingType="multi-dot"
              onDayPress={(day: any) => { setSelectedDate(day.dateString); setCalDaySelected(true); }}
              markedDates={markedDates}
              theme={{
                todayTextColor: ACCENT, arrowColor: TDU_BLUE,
                selectedDayBackgroundColor: TDU_BLUE,
                calendarBackground: '#f8faff',
                textSectionTitleColor: TDU_BLUE,
                dayTextColor: '#222', monthTextColor: TDU_BLUE,
                textMonthFontWeight: 'bold', textDayFontSize: 13,
              }}
              dayComponent={({ date, state }: any) => {
                const ds = date.dateString;
                const items = dateCompanyMap[ds] || [];
                const isSel = ds === selectedDate;
                const isToday = ds === today;
                return (
                  <TouchableOpacity onPress={() => { setSelectedDate(ds); setCalDaySelected(true); }}
                    style={{ alignItems: 'center', width: 46, minHeight: 54 }}>
                    <View style={[
                      { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
                      isSel && { backgroundColor: TDU_BLUE },
                      isToday && !isSel && { borderWidth: 1.5, borderColor: ACCENT },
                    ]}>
                      <Text style={[
                        { fontSize: 12 },
                        state === 'disabled' && { color: '#ccc' },
                        isSel ? { color: '#fff', fontWeight: 'bold' }
                          : isToday ? { color: ACCENT, fontWeight: 'bold' }
                            : { color: '#333' },
                      ]}>{date.day}</Text>
                    </View>
                    {items.slice(0, 2).map((item: Schedule, i: number) => {
                      const gc = genreOf(item.genreId)?.color ?? TDU_BLUE;
                      return (
                        <View key={i} style={[styles.calLabel, { backgroundColor: gc + '33', borderLeftColor: gc }]}>
                          <Text style={[styles.calLabelText, { color: gc }]} numberOfLines={1}>{item.company}</Text>
                        </View>
                      );
                    })}
                    {items.length > 2 && <Text style={styles.calMore}>+{items.length - 2}</Text>}
                  </TouchableOpacity>
                );
              }}
            />
            <View style={styles.todoArea}>
              {!calDaySelected ? (
                <>
                  <Text style={styles.subTitle}>📌 直近の予定</Text>
                  {upcomingSchedules.length === 0
                    ? <Text style={styles.emptyText}>直近の予定はありません</Text>
                    : upcomingSchedules.map(item => (
                      <TouchableOpacity key={item.id} style={styles.upcomingCard} onPress={() => openDetail(item)}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemTitle}>{item.company}</Text>
                          <Text style={styles.itemStatus}>
                            {item.date.replace(/-/g, '/')} {timeStr(item.hour, item.minute) ? timeStr(item.hour, item.minute) + '〜 · ' : ''}{item.status}
                          </Text>
                        </View>
                        <View style={[styles.rankBadge, { backgroundColor: rankColor(item.rank) }]}>
                          <Text style={styles.rankText}>{item.rank}</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  }
                </>
              ) : (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.subTitle}>{selectedDate.replace(/-/g, '/')} の予定</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <TouchableOpacity onPress={() => setCalDaySelected(false)}>
                        <Text style={{ color: '#999', fontSize: 11 }}>直近に戻る</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.addButton} onPress={openAdd}>
                        <Text style={styles.addButtonText}>+ 追加</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {filteredByDate.length === 0
                      ? <Text style={styles.emptyText}>この日の予定はありません</Text>
                      : filteredByDate.map(item => {
                        const gc = genreOf(item.genreId)?.color ?? TDU_BLUE;
                        return (
                          <TouchableOpacity key={item.id}
                            style={[styles.itemCard, { borderLeftColor: gc, borderLeftWidth: 3 }]}
                            onPress={() => openDetail(item)}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.itemTitle}>{item.company}</Text>
                              <Text style={styles.itemStatus}>{timeStr(item.hour, item.minute) ? timeStr(item.hour, item.minute) + '〜 · ' : ''}{item.status}</Text>
                            </View>
                            <View style={[styles.rankBadge, { backgroundColor: rankColor(item.rank) }]}>
                              <Text style={styles.rankText}>{item.rank}</Text>
                            </View>
                            <Text style={styles.itemArrow}>〉</Text>
                          </TouchableOpacity>
                        );
                      })
                    }
                  </ScrollView>
                </>
              )}
            </View>
          </View>
        )}

        {/* ── 持ち駒タブ ── */}
        {activeTab === 'list' && (
          <View style={{ flex: 1 }}>
            {/* 検索バー */}
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="企業名で検索..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
              />
            </View>

            {/* ── 検索バー＋絞り込みボタン行 ── */}
            <View style={styles.listToolbar}>
              <TouchableOpacity
                style={[styles.filterBtn, (filterGenreId !== 'all' || filterStatus !== 'all') && styles.filterBtnActive]}
                onPress={() => setFilterPanelVisible(v => !v)}>
                <Text style={[styles.filterBtnText, (filterGenreId !== 'all' || filterStatus !== 'all') && { color: '#fff' }]}>
                  絞り込み {(filterGenreId !== 'all' || filterStatus !== 'all') ? '●' : ''}
                </Text>
              </TouchableOpacity>

              {/* 並替＋昇降順 */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginLeft: 8 }}>
                <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                  {SORT_OPTIONS.map(opt => (
                    <TouchableOpacity key={opt}
                      style={[styles.miniChip, sortType === opt && styles.miniChipActive]}
                      onPress={async () => { setSortType(opt as SortType); await AsyncStorage.setItem('@sort_type', opt); }}>
                      <Text style={[styles.miniChipText, sortType === opt && { color: '#fff' }]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TouchableOpacity style={styles.ascBtn} onPress={() => setSortAsc(v => !v)}>
                <Text style={styles.ascBtnText}>{sortAsc ? '↑' : '↓'}</Text>
              </TouchableOpacity>
            </View>

            {/* ── 絞り込みパネル（折りたたみ） ── */}
            {filterPanelVisible && (
              <View style={styles.filterPanel}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.filterPanelTitle}>絞り込み</Text>
                  <TouchableOpacity onPress={() => { setFilterGenreId('all'); setFilterStatus('all'); }}>
                    <Text style={{ fontSize: 11, color: '#e74c3c' }}>リセット</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.filterGroupLabel}>業種</Text>
                <View style={styles.filterChipWrap}>
                  <TouchableOpacity style={[styles.miniChip, filterGenreId === 'all' && styles.miniChipActive]} onPress={() => setFilterGenreId('all')}>
                    <Text style={[styles.miniChipText, filterGenreId === 'all' && { color: '#fff' }]}>全て</Text>
                  </TouchableOpacity>
                  {genres.map(g => (
                    <TouchableOpacity key={g.id}
                      style={[styles.miniChip, { borderColor: g.color }, filterGenreId === g.id && { backgroundColor: g.color }]}
                      onPress={() => setFilterGenreId(filterGenreId === g.id ? 'all' : g.id)}>
                      <Text style={[styles.miniChipText, { color: filterGenreId === g.id ? '#fff' : g.color }]}>{g.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.filterGroupLabel, { marginTop: 10 }]}>状況</Text>
                <View style={styles.filterChipWrap}>
                  <TouchableOpacity style={[styles.miniChip, filterStatus === 'all' && styles.miniChipActive]} onPress={() => setFilterStatus('all')}>
                    <Text style={[styles.miniChipText, filterStatus === 'all' && { color: '#fff' }]}>全て</Text>
                  </TouchableOpacity>
                  {STATUS_SORT_ORDER.map(st => (
                    <TouchableOpacity key={st}
                      style={[styles.miniChip, filterStatus === st && styles.miniChipActive]}
                      onPress={() => setFilterStatus(filterStatus === st ? 'all' : st)}>
                      <Text style={[styles.miniChipText, filterStatus === st && { color: '#fff' }]}>{st}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <Text style={{ paddingHorizontal: 16, fontSize: 11, color: '#999', marginBottom: 4 }}>{filteredSorted.length}件</Text>

            <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
              {filteredSorted.length === 0
                ? <Text style={styles.emptyText}>該当する企業がありません</Text>
                : filteredSorted.map(item => {
                  const gc = genreOf(item.genreId)?.color ?? TDU_BLUE;
                  const isInternal = item.status === '内定';
                  const isInactive = ['内定辞退', '不合格'].includes(item.status);
                  return (
                    <TouchableOpacity key={item.id}
                      style={[styles.listCard,
                      { backgroundColor: statusCardColor(item.status), borderColor: statusCardBorder(item.status) },
                      isInactive && { opacity: 0.6 }
                      ]}
                      onPress={() => openDetail(item)}>
                      {/* ジャンル色帯 */}
                      <View style={[styles.genreBand, { backgroundColor: gc }]} />
                      <View style={{ flex: 1, paddingLeft: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[styles.rankBadge, { backgroundColor: rankColor(item.rank) }]}>
                            <Text style={styles.rankText}>{item.rank}</Text>
                          </View>
                          <Text style={[styles.itemTitle, isInactive && { color: '#999' }]}>
                            {item.company}{isInternal ? ' 🌸' : ''}
                          </Text>
                        </View>
                        <Text style={styles.dateText}>{item.date.replace(/-/g, '/')}{timeStr(item.hour, item.minute) ? ' ' + timeStr(item.hour, item.minute) + '〜' : ''}</Text>
                        {item.url ? <Text style={styles.notePreview} numberOfLines={1}>🔗 {item.url}</Text> : null}
                        {item.note ? <Text style={styles.notePreview} numberOfLines={1}>📝 {item.note}</Text> : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <View style={[styles.statusBadge,
                        isInternal && { backgroundColor: '#e74c3c' },
                        isInactive && { backgroundColor: '#aaa' }]}>
                          <Text style={styles.statusBadgeText}>{item.status}</Text>
                        </View>
                        {/* チェックリストボタン */}
                        <TouchableOpacity style={styles.checkBtn}
                          onPress={() => setCheckModalItem(item)}>
                          <Text style={styles.checkBtnText}>✓ 進捗</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })
              }
              <View style={{ height: 80 }} />
            </ScrollView>

            <TouchableOpacity style={styles.fab} onPress={openAdd}>
              <Text style={styles.fabText}>＋</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 設定タブ ── */}
        {activeTab === 'settings' && (
          <ScrollView style={{ flex: 1, padding: 20 }}>
            {/* ジャンル管理 */}
            <Text style={styles.settingSection}>ジャンル管理</Text>
            {genres.map(g => (
              <TouchableOpacity key={g.id} style={styles.genreRow} onPress={() => openEditGenre(g)}>
                <View style={[styles.genreColorDot, { backgroundColor: g.color }]} />
                <Text style={styles.settingLabel}>{g.name}</Text>
                <Text style={{ color: '#ccc' }}>›</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.outlineButton} onPress={openAddGenre}>
              <Text style={styles.outlineButtonText}>+ ジャンルを追加</Text>
            </TouchableOpacity>

            {/* 通知設定 */}
            <Text style={[styles.settingSection, { marginTop: 28 }]}>通知設定</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>リマインダー通知</Text>
              <Switch value={notifyEnabled}
                onValueChange={async v => { setNotifyEnabled(v); await AsyncStorage.setItem('@notify_enabled', JSON.stringify(v)); }}
                trackColor={{ true: TDU_BLUE }} />
            </View>
            {notifyEnabled && (
              <View style={[styles.settingRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
                <Text style={styles.settingLabel}>通知タイミング</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['0', '1', '2', '3'].map(d => (
                    <TouchableOpacity key={d}
                      style={[styles.sortChip, notifyDays === d && styles.sortChipActive]}
                      onPress={async () => { setNotifyDays(d); await AsyncStorage.setItem('@notify_days', d); }}>
                      <Text style={[styles.sortChipText, notifyDays === d && { color: '#fff' }]}>{d}日前</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* データ管理 */}
            <Text style={[styles.settingSection, { marginTop: 28 }]}>データ管理</Text>
            <TouchableOpacity style={styles.dangerButton} onPress={() => {
              Alert.alert('全データ削除', '全ての企業データを削除しますか？', [
                { text: 'キャンセル', style: 'cancel' },
                { text: '削除', style: 'destructive', onPress: async () => { await saveSchedules([]); } }
              ]);
            }}>
              <Text style={styles.dangerButtonText}>全データを削除する</Text>
            </TouchableOpacity>

            <View style={styles.aboutBox}>
              <Text style={styles.aboutText}>就活管理リマインダー v3.0</Text>
            </View>
          </ScrollView>
        )}

        {/* タブバー */}
        <View style={styles.tabBar}>
          {(['calendar', 'list', 'settings'] as TabType[]).map((tab, i) => {
            const icons = ['📅', '📋', '⚙️'];
            const labels = ['カレンダー', '持ち駒', '設定'];
            return (
              <TouchableOpacity key={tab} style={styles.tabButton} onPress={() => setActiveTab(tab)}>
                <Text style={[styles.tabIcon, activeTab === tab && styles.tabIconActive]}>{icons[i]}</Text>
                <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>{labels[i]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── 企業登録/編集モーダル ── */}
        <Modal visible={isModalVisible || isDetailVisible} animationType="slide" transparent onRequestClose={closeModal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={closeModal} activeOpacity={1} />
            <View style={styles.modalContent}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{isDetailVisible ? '詳細・編集' : '新規企業登録'}</Text>
                  {isDetailVisible && (
                    <TouchableOpacity onPress={() => deleteSchedule(selectedItem!.id)}>
                      <Text style={styles.deleteText}>削除</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.label}>企業名 *</Text>
                <TextInput style={styles.input} placeholder="例：株式会社〇〇" value={companyName} onChangeText={setCompanyName} returnKeyType="done" />

                <Text style={styles.label}>ジャンル</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {genres.map(g => (
                      <TouchableOpacity key={g.id}
                        style={[styles.genreChip, { borderColor: g.color }, selGenreId === g.id && { backgroundColor: g.color }]}
                        onPress={() => setSelGenreId(g.id)}>
                        <Text style={[styles.genreChipText, { color: selGenreId === g.id ? '#fff' : g.color }]}>{g.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <Text style={styles.label}>志望度</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {RANK_OPTIONS.map(r => (
                    <TouchableOpacity key={r}
                      style={[styles.rankOption, { backgroundColor: rank === r ? rankColor(r) : '#f0f2f5' }]}
                      onPress={() => setRank(r)}>
                      <Text style={{ color: rank === r ? '#fff' : '#666', fontWeight: 'bold', fontSize: 14 }}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>選考ステータス</Text>
                <View style={styles.statusContainer}>
                  {STATUS_OPTIONS.map(opt => (
                    <TouchableOpacity key={opt}
                      style={[styles.statusOption, selStatus === opt && styles.statusSelected]}
                      onPress={() => setSelStatus(opt)}>
                      <Text style={[styles.statusOptionText, selStatus === opt && { color: '#fff' }]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 日付・時間 */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.label}>日付</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={selDate} onChangeText={setSelDate} keyboardType="numbers-and-punctuation" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>時間</Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {/* 時プルダウン */}
                      <TouchableOpacity style={[styles.input, { flex: 1, justifyContent: 'center' }]} onPress={() => setHourPickerVisible(true)}>
                        <Text style={{ fontSize: 15, color: selHour ? '#333' : '#aaa' }}>{selHour || '時'}</Text>
                      </TouchableOpacity>
                      <Text style={{ alignSelf: 'center', color: '#333' }}>:</Text>
                      {/* 分プルダウン */}
                      <TouchableOpacity style={[styles.input, { flex: 1, justifyContent: 'center' }]} onPress={() => setMinutePickerVisible(true)}>
                        <Text style={{ fontSize: 15, color: selMinute ? '#333' : '#aaa' }}>{selMinute || '分'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <Text style={styles.label}>URL</Text>
                <TextInput style={styles.input} placeholder="https://..." value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />

                <Text style={styles.label}>パスワード</Text>
                <TextInput style={styles.input} placeholder="パスワード" value={password} onChangeText={setPassword} autoCapitalize="none" />

                <Text style={styles.label}>メモ</Text>
                <TextInput style={[styles.input, styles.textArea]} multiline placeholder="面接内容・対策など..." value={note} onChangeText={setNote} />

                <View style={styles.modalButtons}>
                  <TouchableOpacity onPress={closeModal}><Text style={styles.cancelText}>戻る</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.saveButton, !companyName.trim() && styles.saveButtonDisabled]} onPress={handleSave}>
                    <Text style={styles.saveButtonText}>保存</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── 時プルダウン ── */}
        <Modal visible={hourPickerVisible} transparent animationType="fade" onRequestClose={() => setHourPickerVisible(false)}>
          <View style={styles.pickerOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setHourPickerVisible(false)} />
            <View style={styles.pickerBox} onStartShouldSetResponder={() => true}>
              <Text style={styles.pickerTitle}>時を選択</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {HOURS.map(h => (
                  <TouchableOpacity key={h} style={[styles.pickerItem, selHour === h && styles.pickerItemActive]}
                    onPress={() => { setSelHour(h); setHourPickerVisible(false); }}>
                    <Text style={[styles.pickerItemText, selHour === h && { color: '#fff' }]}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>

        {/* ── 分プルダウン ── */}
        <Modal visible={minutePickerVisible} transparent animationType="fade" onRequestClose={() => setMinutePickerVisible(false)}>
          <View style={styles.pickerOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setMinutePickerVisible(false)} />
            <View style={styles.pickerBox} onStartShouldSetResponder={() => true}>
              <Text style={styles.pickerTitle}>分を選択</Text>
              <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 10 }}>
                {MINUTES.map(m => (
                  <TouchableOpacity key={m} style={[styles.pickerItem, selMinute === m && styles.pickerItemActive]}
                    onPress={() => { setSelMinute(m); setMinutePickerVisible(false); }}>
                    <Text style={[styles.pickerItemText, selMinute === m && { color: '#fff' }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>

        {/* ── チェックリストモーダル ── */}
        <Modal visible={!!checkModalItem} transparent animationType="slide" onRequestClose={() => { setCheckModalItem(null); setNewCheckLabel(''); }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.pickerOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => { setCheckModalItem(null); setNewCheckLabel(''); }} />
            <View style={[styles.modalContent, { maxHeight: '85%' }]} onStartShouldSetResponder={() => true}>
              <Text style={styles.modalTitle}>{checkModalItem?.company}</Text>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* 固定ステップ */}
                <Text style={[styles.label, { marginTop: 8 }]}>選考ステップ</Text>
                {CHECKLIST_STEPS.map(step => {
                  const checked = (checkModalItem?.checklist ?? {})[step] ?? false;
                  const isInternal = step === '内定';
                  return (
                    <TouchableOpacity key={step}
                      style={[styles.checkRow, checked && isInternal && { backgroundColor: '#fff0f0', borderRadius: 8 }]}
                      onPress={() => checkModalItem && toggleCheck(checkModalItem, step)}>
                      <View style={[styles.checkbox, checked && { backgroundColor: isInternal ? '#e74c3c' : TDU_BLUE, borderColor: isInternal ? '#e74c3c' : TDU_BLUE }]}>
                        {checked && <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
                      </View>
                      <Text style={[styles.checkLabel, checked && { color: isInternal ? '#e74c3c' : TDU_BLUE, fontWeight: 'bold' }]}>
                        {step}{isInternal && checked ? ' 🌸' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* 区切り */}
                <View style={{ borderTopWidth: 1, borderColor: '#f0f0f0', marginTop: 16, marginBottom: 4 }} />
                <Text style={styles.label}>カスタム項目</Text>

                {/* カスタム項目一覧 */}
                {(checkModalItem?.customChecklist ?? []).length === 0 && (
                  <Text style={{ fontSize: 12, color: '#bbb', marginBottom: 8, paddingLeft: 8 }}>追加した項目がここに表示されます</Text>
                )}
                {(checkModalItem?.customChecklist ?? []).map(c => (
                  <View key={c.id} style={styles.checkRow}>
                    <TouchableOpacity
                      style={[styles.checkbox, c.checked && { backgroundColor: '#27AE60', borderColor: '#27AE60' }]}
                      onPress={() => checkModalItem && toggleCustomCheck(checkModalItem, c.id)}>
                      {c.checked && <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
                    </TouchableOpacity>
                    <Text style={[styles.checkLabel, { flex: 1 }, c.checked && { color: '#27AE60', fontWeight: 'bold' }]}>{c.label}</Text>
                    {/* 削除ボタン */}
                    <TouchableOpacity onPress={() => checkModalItem && deleteCustomCheck(checkModalItem, c.id)}
                      style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: '#ccc', fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {/* カスタム項目追加入力 */}
                <View style={styles.customAddRow}>
                  <TextInput
                    style={styles.customAddInput}
                    placeholder="項目を入力（例: 適性検査）"
                    value={newCheckLabel}
                    onChangeText={setNewCheckLabel}
                    returnKeyType="done"
                    onSubmitEditing={() => checkModalItem && addCustomCheck(checkModalItem)}
                  />
                  <TouchableOpacity
                    style={[styles.customAddBtn, !newCheckLabel.trim() && { backgroundColor: '#ccc' }]}
                    onPress={() => checkModalItem && addCustomCheck(checkModalItem)}
                    disabled={!newCheckLabel.trim()}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>追加</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={[styles.saveButton, { marginTop: 20, alignSelf: 'center', paddingHorizontal: 40 }]}
                  onPress={() => { setCheckModalItem(null); setNewCheckLabel(''); }}>
                  <Text style={styles.saveButtonText}>閉じる</Text>
                </TouchableOpacity>
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── ジャンル追加/編集モーダル ── */}
        <Modal visible={genreModalVisible} transparent animationType="slide" onRequestClose={() => setGenreModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setGenreModalVisible(false)} activeOpacity={1} />
            <View style={[styles.modalContent, { maxHeight: '70%' }]}>
              <Text style={styles.modalTitle}>{editGenre ? 'ジャンルを編集' : 'ジャンルを追加'}</Text>
              <Text style={styles.label}>ジャンル名</Text>
              <TextInput style={styles.input} placeholder="例: IT・通信" value={genreName} onChangeText={setGenreName} />
              <Text style={styles.label}>カラー</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                {COLOR_PALETTE.map(c => (
                  <TouchableOpacity key={c}
                    style={[styles.colorDot, { backgroundColor: c }, genreColor === c && styles.colorDotActive]}
                    onPress={() => setGenreColor(c)} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <View style={[styles.genreColorDot, { backgroundColor: genreColor, width: 28, height: 28 }]} />
                <Text style={{ color: '#333' }}>選択中: {genreColor}</Text>
              </View>
              <View style={styles.modalButtons}>
                {editGenre && (
                  <TouchableOpacity onPress={() => deleteGenre(editGenre.id)}>
                    <Text style={styles.deleteText}>削除</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => setGenreModalVisible(false)}>
                  <Text style={styles.cancelText}>戻る</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveButton, !genreName.trim() && styles.saveButtonDisabled]} onPress={saveGenre}>
                  <Text style={styles.saveButtonText}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1 },
  topNav: { paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  headerStats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: TDU_BLUE },
  statChip: { backgroundColor: '#e8f0fe', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: 'bold', color: TDU_BLUE },
  statLabel: { fontSize: 9, color: TDU_BLUE },

  // カレンダー企業ラベル
  calLabel: { borderLeftWidth: 2, borderRadius: 3, paddingHorizontal: 2, marginTop: 1, width: 44 },
  calLabelText: { fontSize: 7, fontWeight: 'bold' },
  calMore: { fontSize: 7, color: '#999', marginTop: 1 },

  // 検索バー
  searchBar: { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  searchIcon: { fontSize: 14, marginRight: 6 },
  searchInput: { flex: 1, fontSize: 14, color: '#333' },

  // ジャンルフィルタ
  genreFilter: { paddingLeft: 12, marginBottom: 8 },
  genreChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#ddd', marginRight: 6 },
  genreChipActive: { backgroundColor: TDU_BLUE, borderColor: TDU_BLUE },
  genreChipText: { fontSize: 11, color: '#666' },

  // ジャンル色帯
  genreBand: { width: 4, borderRadius: 4, alignSelf: 'stretch' },

  // 持ち駒カード
  upcomingCard: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f0f4ff', borderRadius: 10, marginBottom: 8 },
  todoArea: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  subTitle: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  addButton: { backgroundColor: TDU_BLUE, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  addButtonText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  itemCard: { paddingVertical: 13, paddingHorizontal: 6, borderBottomWidth: 1, borderColor: '#f0f0f0', flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { fontSize: 15, fontWeight: 'bold', color: '#222' },
  itemStatus: { fontSize: 11, color: '#888', marginTop: 3 },
  itemArrow: { color: '#ccc', fontSize: 16 },
  emptyText: { textAlign: 'center', color: '#bbb', marginTop: 24, fontSize: 13 },
  listCard: { padding: 14, borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, elevation: 1, overflow: 'hidden' },
  dateText: { fontSize: 11, color: '#999', marginTop: 4 },
  notePreview: { fontSize: 10, color: '#aaa', marginTop: 2 },
  statusBadge: { backgroundColor: TDU_BLUE, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  rankBadge: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  checkBtn: { backgroundColor: '#f0f4ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  checkBtnText: { fontSize: 10, color: TDU_BLUE, fontWeight: 'bold' },

  // ソート
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f2f5' },
  sortChipActive: { backgroundColor: TDU_BLUE },
  sortChipText: { fontSize: 12, color: '#666' },

  // FAB
  fab: { position: 'absolute', bottom: 16, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: TDU_BLUE, alignItems: 'center', justifyContent: 'center', elevation: 5 },
  fabText: { color: '#fff', fontSize: 26, lineHeight: 30 },

  // 設定
  settingSection: { fontSize: 12, fontWeight: 'bold', color: '#888', marginBottom: 12, letterSpacing: 1 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  settingLabel: { fontSize: 14, color: '#333', flex: 1 },
  genreRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  genreColorDot: { width: 16, height: 16, borderRadius: 8, marginRight: 12 },
  outlineButton: { borderWidth: 1, borderColor: TDU_BLUE, padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  outlineButtonText: { color: TDU_BLUE, fontWeight: 'bold' },
  dangerButton: { borderWidth: 1, borderColor: '#e74c3c', padding: 14, borderRadius: 10, alignItems: 'center' },
  dangerButtonText: { color: '#e74c3c', fontWeight: 'bold' },
  aboutBox: { backgroundColor: '#f8f9fa', padding: 16, borderRadius: 10, marginTop: 20 },
  aboutText: { fontSize: 13, color: '#666', lineHeight: 20 },

  // タブバー
  tabBar: { flexDirection: 'row', height: 70, borderTopWidth: 1, borderColor: '#f0f0f0', backgroundColor: '#fff', paddingBottom: 10 },
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabIcon: { fontSize: 20, opacity: 0.3 },
  tabIconActive: { opacity: 1 },
  tabLabel: { fontSize: 9, color: '#ccc', marginTop: 3 },
  tabLabelActive: { color: TDU_BLUE, fontWeight: 'bold' },

  // モーダル共通
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  deleteText: { color: '#e74c3c', fontSize: 13 },
  label: { fontSize: 11, color: '#888', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#f8f9fa', padding: 13, borderRadius: 10, fontSize: 15, marginBottom: 2 },
  textArea: { height: 90, textAlignVertical: 'top' },
  statusContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  statusOption: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, backgroundColor: '#f0f2f5' },
  statusSelected: { backgroundColor: TDU_BLUE },
  statusOptionText: { fontSize: 11, color: '#666' },
  rankOption: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
  cancelText: { color: '#999', fontSize: 15 },
  saveButton: { backgroundColor: TDU_BLUE, paddingVertical: 13, paddingHorizontal: 44, borderRadius: 14 },
  saveButtonDisabled: { backgroundColor: '#aaa' },
  saveButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  // 時間ピッカー
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  pickerBox: { backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '85%' },
  pickerTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12, textAlign: 'center' },
  pickerItem: { width: 44, height: 44, margin: 4, borderRadius: 10, backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center' },
  pickerItemActive: { backgroundColor: TDU_BLUE },
  pickerItemText: { fontSize: 14, color: '#333' },

  // リストツールバー
  listToolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  filterBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: TDU_BLUE, backgroundColor: '#fff' },
  filterBtnActive: { backgroundColor: TDU_BLUE },
  filterBtnText: { fontSize: 11, color: TDU_BLUE, fontWeight: 'bold' },
  filterPanel: { marginHorizontal: 12, marginBottom: 6, padding: 12, backgroundColor: '#f8faff', borderRadius: 12, borderWidth: 1, borderColor: '#dde8ff' },
  filterPanelTitle: { fontSize: 13, fontWeight: 'bold', color: TDU_BLUE },
  filterGroupLabel: { fontSize: 11, color: '#888', fontWeight: 'bold', marginBottom: 6 },
  filterChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  // フィルタ・並替エリア（後方互換）
  filterSection: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 4 },
  filterLabel: { fontSize: 10, color: '#999', width: 26, marginRight: 4, fontWeight: 'bold' },
  miniChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#f8f8f8' },
  miniChipActive: { backgroundColor: TDU_BLUE, borderColor: TDU_BLUE },
  miniChipText: { fontSize: 10, color: '#666' },
  ascBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: '#e8f0fe', borderWidth: 1, borderColor: TDU_BLUE },
  ascBtnText: { fontSize: 10, color: TDU_BLUE, fontWeight: 'bold' },

  // チェックリスト
  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f5f5f5', paddingHorizontal: 8 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  checkLabel: { fontSize: 15, color: '#333' },
  customAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 4 },
  customAddInput: { flex: 1, backgroundColor: '#f8f9fa', padding: 11, borderRadius: 10, fontSize: 14 },
  customAddBtn: { backgroundColor: TDU_BLUE, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10 },

  // カラーパレット
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotActive: { borderWidth: 3, borderColor: '#333' },
});
