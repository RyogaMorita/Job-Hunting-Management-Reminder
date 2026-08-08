import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReAnimated, {
  useSharedValue, useAnimatedStyle, useAnimatedProps, withSpring, withTiming, withSequence, withRepeat,
  FadeInDown, FadeOutLeft, LinearTransition,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import Svg, { Path } from 'react-native-svg';
import { Pressable } from 'react-native';
import { useColorScheme } from 'react-native';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_700Bold } from '@expo-google-fonts/inter';
import { NotoSansJP_400Regular, NotoSansJP_700Bold } from '@expo-google-fonts/noto-sans-jp';

import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  SafeAreaView, Modal, TextInput, Alert, KeyboardAvoidingView,
  Platform, Switch, Animated, PanResponder, Linking, Clipboard, Image, Dimensions,
  NativeModules, AppState,
  StyleProp, ViewStyle, TextStyle, ImageSourcePropType,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar } from 'react-native-calendars';
import type { DateData, CalendarProps } from 'react-native-calendars';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SharedGroupPreferences from 'react-native-shared-group-preferences';
import * as Notifications from 'expo-notifications';
import * as StoreReview from 'expo-store-review';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider, SafeAreaView as SafeAreaViewContext } from 'react-native-safe-area-context';
import {
  BannerAd, BannerAdSize, TestIds,
  AppOpenAd, AdEventType,
  RewardedAd, RewardedAdEventType,
} from 'react-native-google-mobile-ads';
import { LISTED_COMPANIES, CompanyEntry } from './companies_v2';
// 日付・ステータス遷移のロジックは lib/ に切り出してテストしている（__tests__/schedule.test.ts）
import {
  addDaysYmd, collectTodos, formatYmd, parseYmd, coversDate, dateRangeStr, expandDateRange,
  findConflicts, nextStatus, PREP_TEMPLATES,
} from './lib/schedule';
import type { TodoItem, VenueType } from './lib/schedule';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false,
    shouldShowBanner: true, shouldShowList: true,
  }),
});

// ─── 定数 ─────────────────────────────────────────────────────────
// ─── 広告ID ──────────────────────────────────────────────────────
const AD_UNIT_ID = __DEV__ ? TestIds.BANNER : 'ca-app-pub-7090599455468315/1730004001';
const APP_OPEN_ID = __DEV__ ? TestIds.APP_OPEN : 'ca-app-pub-7090599455468315/3637103731';
const REWARDED_ID = __DEV__ ? TestIds.REWARDED : 'ca-app-pub-7090599455468315/8667464364';
const REVIEW_KEY = '@review_requested';
const REVIEW_3COMPANIES_KEY = '@review_3companies';

// ─── 就活Tips（リワード解放コンテンツ）────────────────────────────
const SHUKATSU_TIPS = [
  { title: 'ESを通過するコツ', content: '企業の求める人物像をJD（職務記述書）から読み取り、具体的なエピソードと結びつけて書く。数字を使って成果を示すと説得力が増す。' },
  { title: '面接でよく聞かれる質問TOP5', content: '①自己紹介 ②志望動機 ③学生時代に力を入れたこと ④強みと弱み ⑤5年後のビジョン。この5つを完璧に準備しておけば80%は対応できる。' },
  { title: '逆質問で差をつける方法', content: '「入社後に活躍している方の共通点は何ですか？」「チームの雰囲気を教えてください」など、企業研究を踏まえた質問が好印象。「特にありません」はNG。' },
  { title: 'OB・OG訪問を最大活用する方法', content: 'OB訪問では「実際に入社して良かった点・悪かった点」を聞く。ネガティブな情報ほど本音に近い。志望度が高い企業ほど複数人に会うべき。' },
  { title: 'GD（グループディスカッション）必勝法', content: '役割（司会・タイムキーパー・書記）にこだわらず、議論を前進させることを意識する。他の人の意見を引き出す「○○さんはどう思いますか？」が高評価につながる。' },
  { title: 'インターンで内定を取る方法', content: '発言量より発言の質を重視。「なぜ？」を3回繰り返して深掘りした意見を述べる。積極的に社員に話しかけて顔を覚えてもらうことが重要。' },
  { title: '内定交渉・承諾期限の延ばし方', content: '「第一志望の企業の選考結果を待っています」と正直に伝えるのが基本。ただし期限延長は1回まで。無断で過ぎるのは絶対NG。' },
];

const STORAGE_KEY = '@schedules_v11';
// ウィジェットとの共有領域（Swift側 AppGroupHelper と一致させること）
const APP_GROUP = 'group.com.moritaryoga.shukatsukanri';
const WIDGET_SCHEDULES_KEY = 'widget_schedules_v1';
const WIDGET_PENDING_KEY = 'widget_pending_actions_v1';
const WIDGET_WEEK_START_KEY = 'widget_week_start_v1';
const GENRES_KEY = '@genres_v11';
const STATUS_COLORS_KEY = '@status_colors_v2';
const STATUS_OPTIONS_KEY = '@status_options_v1';
const TDU_BLUE = '#003366';
const ACCENT = '#1a6bcc';

const INTERN_STATUSES = ['インターンES締切', 'インターン面接', 'インターン確定'];
// 本選考の段階とは別に数える単発イベント
const EVENT_STATUSES = ['説明会', 'ワークショップ', 'GD'];
const SEPARATE_STATUSES = [...EVENT_STATUSES, ...INTERN_STATUSES]; // 本選考と別トラック
const DEFAULT_STATUS_OPTIONS = [
  '検討中', '説明会', 'ワークショップ', 'ES締切', 'ES提出済', 'Webテスト', 'GD',
  '1次面接', '2次面接', '最終面接', '内定', '内定承諾',
  'インターンES締切', 'インターン面接', 'インターン確定',
  '内定辞退', '不合格', '完了',
];
const STATUS_OPTIONS = DEFAULT_STATUS_OPTIONS; // 後方互換用
const STATUS_PRIORITY: Record<string, number> = {
  '内定承諾': 9, '内定': 8, '最終面接': 7, '2次面接': 6, '1次面接': 5, 'GD': 4,
  'Webテスト': 3.5, 'ES提出済': 3, 'ES締切': 2, 'ワークショップ': 1.5, '説明会': 1, '検討中': 0,
  'インターン確定': 0.3, 'インターン面接': 0.2, 'インターンES締切': 0.1,
  '内定辞退': -1, '不合格': -2, '完了': -3,
};
const STATUS_SORT_ORDER = [
  '内定承諾', '内定', '最終面接', '2次面接', '1次面接', 'GD', 'Webテスト', 'ES提出済', 'ES締切',
  'ワークショップ', '説明会', '検討中',
  'インターン確定', 'インターン面接', 'インターンES締切', '内定辞退', '不合格', '完了',
];
// 持ち駒トラックグループ（同名企業でも別トラックは別行表示）
const trackGroup = (status: string): string => {
  if (EVENT_STATUSES.includes(status)) return 'イベント';
  if (INTERN_STATUSES.includes(status)) return 'インターン';
  return '本選考';
};
// ステータスに対応するチェックリスト自動チェック
const STATUS_TO_CHECKS: Record<string, string[]> = {
  '説明会': [],
  'ワークショップ': [],
  'ES締切': [],
  'ES提出済': ['ES提出'],
  'Webテスト': ['ES提出', 'Webテスト受検'],
  'GD': ['ES提出'],
  '1次面接': ['ES提出', '1次面接'],
  '2次面接': ['ES提出', '1次面接', '2次面接'],
  '最終面接': ['ES提出', '1次面接', '2次面接', '最終面接'],
  '内定': ['ES提出', '1次面接', '2次面接', '最終面接', '内定'],
  '内定承諾': ['ES提出', '1次面接', '2次面接', '最終面接', '内定'],
  '内定辞退': ['ES提出', '1次面接', '2次面接', '最終面接', '内定'],
  '不合格': [],
  '検討中': [],
};
const CHECKLIST_STEPS = ['ES提出', 'Webテスト受検', '1次面接', '2次面接', '最終面接', '内定'];

// Webテストの種別。SPIは受検場所ごとに予約手続きが違うため分けている。
// テストセンターの結果は他社にも使い回せる。
const WEB_TEST_TYPES = ['SPI（テストセンター）', 'SPI（自宅Web）', '玉手箱', 'TG-WEB', 'GAB / CAB', 'その他'];
// ─── アイコン画像 ────────────────────────────────────────────
const ICONS = {
  bell:         require('./assets/bell.png'),
  upload:       require('./assets/upload.png'),
  memo:         require('./assets/memo.png'),
  calendar:     require('./assets/calendar.png'),
  company:      require('./assets/company.png'),
  settings:     require('./assets/settings.png'),
  trash:        require('./assets/trash.png'),
  externalLink: require('./assets/external_link.png'),
  checklist:    require('./assets/checklist.png'),
  search:       require('./assets/search.png'),
  reload:       require('./assets/reload.png'),
};

const RANK_OPTIONS = ['S', 'A', 'B', 'C'];
const SORT_OPTIONS = ['登録順', '直近順', '五十音', '志望度', 'ステータス', 'ジャンル', '手動'];
const MANUAL_ORDER_KEY = '@manual_order_v1';
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];
const INACTIVE = ['内定辞退', '不合格', '完了'];

const statusCardColor = (s: string) =>
  s === '内定' ? '#fff0f0' : INACTIVE.includes(s) ? '#f0f0f0' : '#ffffff';
const statusCardBorder = (s: string) =>
  s === '内定' ? '#f5a0a0' : INACTIVE.includes(s) ? '#cccccc' : '#eeeeee';

// ─── 型定義 ───────────────────────────────────────────────────────
interface Genre { id: string; name: string; color: string; }

interface NotifySetting { daysBeforeList: string[]; hourStr: string; minuteStr: string; }
interface Schedule {
  id: string; company: string; date: string; hour: string; minute: string;
  endDate?: string;
  status: string; note: string; url: string; userId: string; password: string;
  rank: string; genreId: string; calendarColor?: string;
  checklist: Record<string, boolean>;
  customChecklist: { id: string; label: string; checked: boolean; due?: string }[];
  // 会場（一次はWeb・最終は対面のように段階で変わる）
  venueType?: VenueType;
  meetingUrl?: string;   // オンラインの接続URL
  venue?: string;        // 対面の会場・最寄駅
  // Webテスト（ES締切とは別軸の期限）
  webTestType?: string;
  webTestDeadline?: string;
  webTestBookedAt?: string;  // 予約日時（会場受検の場合）
  webTestVenue?: string;
  // 辞退の連絡を済ませたか
  declineContacted?: boolean;
  notifyEnabled?: boolean;
  notifySettings?: NotifySetting;
  statusHistory?: { status: string; changedAt: string }[];
  offerDeadline?: string;
  internshipStart?: string;
  internshipEnd?: string;
  memoResearch?: string;
  memoPR?: string;
  memoQuestions?: string;
}

type TabType = 'calendar' | 'list' | 'settings';
type SortType = '登録順' | '直近順' | '五十音' | '志望度' | 'ステータス' | 'ジャンル' | '手動';

// ─── デフォルトジャンル ───────────────────────────────────────────
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

// ステータスカラー（独立管理）
type StatusColors = Record<string, string>;
const DEFAULT_STATUS_COLORS: StatusColors = {
  '検討中': '#95A5A6',
  '説明会': '#00BCD4',
  'ワークショップ': '#26A69A',
  'ES締切': '#27AE60',
  'ES提出済': '#2980B9',
  'Webテスト': '#5C6BC0',
  'GD': '#FF9800',
  '1次面接': '#8E44AD',
  '2次面接': '#E67E22',
  '最終面接': '#E74C3C',
  '内定': '#E91E8C',
  '内定承諾': '#C2185B',
  'インターンES締切': '#F59E0B',
  'インターン面接': '#EF6C00',
  'インターン確定': '#EC407A',
  '内定辞退': '#7F8C8D',
  '不合格': '#BDC3C7',
  '完了': '#95A5A6',
};

const COLOR_PALETTE = [
  '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C',
  '#3498DB', '#4A90D9', '#9B59B6', '#8E44AD', '#2C3E50',
  '#27AE60', '#16A085', '#2980B9', '#7F8C8D', '#BDC3C7',
];

// ─── スワイプ削除コンポーネント ────────────────────────────────────
function SwipeableRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const THRESHOLD = -80;

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_, g) => {
      if (g.dx < 0) translateX.setValue(Math.max(g.dx, THRESHOLD * 1.5));
    },
    onPanResponderRelease: (_, g) => {
      if (g.dx < THRESHOLD) {
        Animated.spring(translateX, { toValue: THRESHOLD, useNativeDriver: true }).start();
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  })).current;

  const reset = () => Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();

  return (
    <View style={{ overflow: 'hidden', marginBottom: 10 }}>
      {/* 削除背景 */}
      <View style={styles.swipeDeleteBg}>
        <TouchableOpacity onPress={() => { reset(); onDelete(); }} style={styles.swipeDeleteBtn}>
          <Image source={ICONS.trash} style={{ width: 18, height: 18, tintColor: '#fff' }} />
          <Text style={styles.swipeDeleteText}>削除</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

// ─── 週表示カレンダー行 ──────────────────────────────────────────────
function WeekCalendarRow({ selectedDate, today, weekStart, C, isDark, dateCompanyMap, statusColorOf, onDayPress, onDayDoubleTap }: {
  selectedDate: string; today: string; weekStart: number; C: typeof LIGHT; isDark: boolean;
  dateCompanyMap: Record<string, Schedule[]>; statusColorOf: (s: string) => string;
  onDayPress: (ds: string) => void; onDayDoubleTap: (ds: string) => void;
}) {
  const weekDates = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    const diff = (d.getDay() - weekStart + 7) % 7;
    const start = new Date(d); start.setDate(d.getDate() - diff);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start); day.setDate(start.getDate() + i);
      return day.toISOString().slice(0, 10);
    });
  }, [selectedDate, weekStart]);
  const lastTapRef = useRef<{ ds: string; time: number }>({ ds: '', time: 0 });
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 2, height: 52 }}>
      {weekDates.map(ds => {
        const items = dateCompanyMap[ds] || [];
        const isSel = ds === selectedDate;
        const isToday = ds === today;
        const dow = new Date(ds + 'T12:00:00').getDay();
        const day = parseInt(ds.slice(-2));
        return (
          <TouchableOpacity
            key={ds}
            onPress={() => {
              const now = Date.now();
              const last = lastTapRef.current;
              if (last.ds === ds && now - last.time < 400) {
                onDayDoubleTap(ds); lastTapRef.current = { ds: '', time: 0 };
              } else {
                onDayPress(ds); lastTapRef.current = { ds, time: now };
              }
            }}
            style={{ alignItems: 'center', width: 46, minHeight: 44, position: 'relative' }}>
            <View style={[
              { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
              isSel && { backgroundColor: TDU_BLUE },
              isToday && !isSel && { borderWidth: 1.5, borderColor: ACCENT },
            ]}>
              <Text style={[{ fontSize: 12 }, (() => {
                if (isSel) return { color: '#fff', fontWeight: 'bold' as const };
                if (isToday) return { color: ACCENT, fontWeight: 'bold' as const };
                if (dow === 0) return { color: '#e74c3c' };
                if (dow === 6) return { color: '#4A90D9' };
                return { color: C.calText };
              })()]}>{day}</Text>
            </View>
            {items.slice(0, 2).map((item: Schedule, i: number) => {
              const sc = item.calendarColor ?? statusColorOf(item.status);
              return (
                <View key={i} style={[styles.calLabel, { backgroundColor: sc + '33', borderLeftColor: sc }]}>
                  <Text style={[styles.calLabelText, { color: sc }]} numberOfLines={1}>{item.company}</Text>
                </View>
              );
            })}
            {items.length > 2 && <Text style={styles.calMore}>+{items.length - 2}</Text>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── SVGチェックマーク（strokeDashoffset 描画アニメーション）──────────
const AnimatedSvgPath = ReAnimated.createAnimatedComponent(Path);
const TICK_LENGTH = 20;
function AnimatedCheckmark({ checked, color }: { checked: boolean; color: string }) {
  const progress = useSharedValue(checked ? 1 : 0);
  const bgScale = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(checked ? 1 : 0, { duration: 320 });
    bgScale.value = withSpring(checked ? 1 : 0, { damping: 14, stiffness: 200 });
  }, [checked]);
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: TICK_LENGTH * (1 - progress.value) }));
  const bgStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bgScale.value }],
    backgroundColor: color,
  }));
  return (
    <View style={[styles.checkbox, { borderColor: checked ? color : '#ccc', overflow: 'hidden' }]}>
      <ReAnimated.View style={[StyleSheet.absoluteFill, { borderRadius: 4 }, bgStyle]} />
      <Svg width={18} height={18} viewBox="0 0 18 18">
        <AnimatedSvgPath
          d="M3.5 9.5l3.5 3.5 7.5-7.5"
          stroke="white"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={TICK_LENGTH}
          animatedProps={checkProps}
        />
      </Svg>
    </View>
  );
}

/// やること1件の期限表示。期限切れ・当日・翌日は言葉にする。
const todoDueLabel = (t: TodoItem): string => {
  if (t.daysLeft === undefined) return '';
  if (t.daysLeft < 0) return `${-t.daysLeft}日超過`;
  if (t.daysLeft === 0) return '今日';
  if (t.daysLeft === 1) return '明日';
  return `あと${t.daysLeft}日`;
};

const TODO_KIND_LABEL: Record<TodoItem['kind'], string> = {
  es: 'ES', webtest: 'Webテスト', offer: '内定', decline: '辞退連絡', custom: 'メモ',
};

// ─── 日付・時刻ピッカー（iOS標準のホイール） ─────────────────────────
// 自作のScrollViewピッカーは操作感がiOS標準と違うため、
// @react-native-community/datetimepicker の spinner に統一している。

function WheelDateField({
  label, value, onChange, C, placeholder = '未設定', minimumDate, clearable = true,
}: {
  label?: string; value: string; onChange: (ymd: string) => void; C: typeof LIGHT;
  placeholder?: string; minimumDate?: Date; clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = value ? parseYmd(value) : new Date();

  return (
    <View style={{ marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        {label ? <Text style={{ fontSize: 12, color: C.text3, width: 52 }}>{label}</Text> : null}
        <RippleButton
          style={[styles.input, { flex: 1, backgroundColor: C.inputBg, justifyContent: 'center' }]}
          onPress={() => setOpen(v => !v)}>
          <Text style={{ fontSize: 15, color: value ? C.text : '#aaa' }}>
            {value ? value.replace(/-/g, '/') : placeholder}
          </Text>
        </RippleButton>
        {clearable && value ? (
          <TouchableOpacity onPress={() => { onChange(''); setOpen(false); }}
            style={{ paddingHorizontal: 8, paddingVertical: 10 }}>
            <Text style={{ color: '#aaa', fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {open && (
        <ReAnimated.View
          entering={FadeInDown.duration(180)}
          style={{ backgroundColor: C.bg2, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginTop: 4 }}>
          <DateTimePicker
            value={current}
            mode="date"
            display="spinner"
            locale="ja-JP"
            minimumDate={minimumDate}
            themeVariant={C === DARK ? 'dark' : 'light'}
            onChange={(_e, d) => { if (d) onChange(formatYmd(d)); }}
            style={{ height: 180 }}
          />
          <RippleButton
            style={{ margin: 8, backgroundColor: TDU_BLUE, borderRadius: 8, padding: 10, alignItems: 'center' }}
            onPress={() => { if (!value) onChange(formatYmd(current)); setOpen(false); }}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>完了</Text>
          </RippleButton>
        </ReAnimated.View>
      )}
    </View>
  );
}

function WheelTimeField({
  label, hour, minute, onChange, C,
}: {
  label?: string; hour: string; minute: string;
  onChange: (h: string, m: string) => void; C: typeof LIGHT;
}) {
  const [open, setOpen] = useState(false);
  const current = new Date();
  current.setHours(Number(hour || 9), Number(minute || 0), 0, 0);
  const shown = hour ? `${hour}:${minute || '00'}` : '';

  return (
    <View style={{ marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        {label ? <Text style={{ fontSize: 12, color: C.text3, width: 52 }}>{label}</Text> : null}
        <RippleButton
          style={[styles.input, { flex: 1, backgroundColor: C.inputBg, justifyContent: 'center' }]}
          onPress={() => setOpen(v => !v)}>
          <Text style={{ fontSize: 15, color: shown ? C.text : '#aaa' }}>{shown || '時刻を設定'}</Text>
        </RippleButton>
        {shown ? (
          <TouchableOpacity onPress={() => { onChange('', ''); setOpen(false); }}
            style={{ paddingHorizontal: 8, paddingVertical: 10 }}>
            <Text style={{ color: '#aaa', fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {open && (
        <ReAnimated.View
          entering={FadeInDown.duration(180)}
          style={{ backgroundColor: C.bg2, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginTop: 4 }}>
          <DateTimePicker
            value={current}
            mode="time"
            display="spinner"
            locale="ja-JP"
            minuteInterval={5}
            themeVariant={C === DARK ? 'dark' : 'light'}
            onChange={(_e, d) => {
              if (!d) return;
              onChange(String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0'));
            }}
            style={{ height: 180 }}
          />
          <RippleButton
            style={{ margin: 8, backgroundColor: TDU_BLUE, borderRadius: 8, padding: 10, alignItems: 'center' }}
            onPress={() => {
              if (!hour) onChange(String(current.getHours()).padStart(2, '0'), String(current.getMinutes()).padStart(2, '0'));
              setOpen(false);
            }}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>完了</Text>
          </RippleButton>
        </ReAnimated.View>
      )}
    </View>
  );
}

// ─── 期限切れバッジ（控えめな脈動） ─────────────────────────────────
// 動かすのは scale だけ。1.0 ⇄ 1.06 を往復させる。

function PulseView({ active, children }: { active: boolean; children: React.ReactNode }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (active) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 620 }),
          withTiming(1, { duration: 620 }),
        ),
        -1,
        false,
      );
    } else {
      scale.value = withTiming(1, { duration: 200 });
    }
  }, [active]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <ReAnimated.View style={style}>{children}</ReAnimated.View>;
}

// ─── タブバーのボタン ───────────────────────────────────────────────
// 選択中のアイコンだけ少し持ち上げて拡大する。
// transform と opacity のみを動かすのでレイアウト再計算は起きない。

function TabBarButton({ icon, label, isActive, activeColor, inactiveColor, onPress }: {
  icon: ImageSourcePropType; label: string; isActive: boolean;
  activeColor: string; inactiveColor: string; onPress: () => void;
}) {
  const scale = useSharedValue(isActive ? 1 : 0.92);
  const lift = useSharedValue(isActive ? -2 : 0);

  useEffect(() => {
    scale.value = withSpring(isActive ? 1.12 : 0.92, { damping: 15, stiffness: 150 });
    lift.value = withSpring(isActive ? -2 : 0, { damping: 15, stiffness: 150 });
  }, [isActive]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }, { scale: scale.value }] as const,
  }));

  return (
    <TouchableOpacity style={styles.tabButton} onPress={onPress} activeOpacity={0.7}>
      <ReAnimated.View style={iconStyle}>
        <Image
          source={icon}
          style={[styles.tabImg, { tintColor: isActive ? activeColor : inactiveColor, opacity: isActive ? 1 : 0.7 }]}
          resizeMode="contain" />
      </ReAnimated.View>
      <Text style={[styles.tabLabel, { color: isActive ? activeColor : inactiveColor, fontWeight: isActive ? 'bold' : 'normal' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── リップルボタン（ぽちゃんアニメーション） ──────────────────────────
function RippleButton({ style, onPress, children, activeOpacity = 0.8 }: {
  style?: StyleProp<ViewStyle>; onPress?: () => void; children: React.ReactNode; activeOpacity?: number;
}) {
  const rippleScale = useSharedValue(0);
  const rippleOpacity = useSharedValue(0);
  const rippleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rippleScale.value }],
    opacity: rippleOpacity.value,
  }));
  const handlePress = () => {
    rippleScale.value = 0;
    rippleOpacity.value = 0.35;
    rippleScale.value = withTiming(3, { duration: 380 });
    rippleOpacity.value = withTiming(0, { duration: 380 });
    onPress?.();
  };
  return (
    <TouchableOpacity style={[style, { overflow: 'hidden' }]} onPress={handlePress} activeOpacity={activeOpacity}>
      <ReAnimated.View style={[
        StyleSheet.absoluteFill,
        { borderRadius: 100, backgroundColor: '#fff' },
        rippleStyle,
      ]} />
      {children}
    </TouchableOpacity>
  );
}

// ─── 検索ハイライトテキスト ──────────────────────────────────────────
function HighlightText({ text, query, style }: { text: string; query: string; style?: StyleProp<TextStyle> }) {
  if (!query.trim()) return <Text style={style} numberOfLines={1}>{text}</Text>;
  const q = query.trim().toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return <Text style={style} numberOfLines={1}>{text}</Text>;
  return (
    <Text style={style} numberOfLines={1}>
      {text.slice(0, idx)}
      <Text style={{ color: ACCENT, fontWeight: 'bold' }}>{text.slice(idx, idx + q.length)}</Text>
      {text.slice(idx + q.length)}
    </Text>
  );
}

// ─── アニメーションカード（プレス時スケール）────────────────────────
function AnimatedCard({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress: () => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.97, { damping: 15, stiffness: 300 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 300 }); }}
      onPress={onPress}>
      <ReAnimated.View style={[style, animStyle]}>
        {children}
      </ReAnimated.View>
    </Pressable>
  );
}

// ─── ミニステッパー（カード内用・Reanimated v3）────────────────────
function MiniStepper({ status, statusColors, isDark, animTrigger }: {
  status: string; statusColors: Record<string, string>; isDark: boolean; animTrigger?: number;
}) {
  const currentStage = STATUS_TO_STAGE[status] ?? -1;
  const dotScale = useSharedValue(1);
  const barProgress = useSharedValue(1);
  const prevTrigger = useRef(0);

  const animDotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
  }));
  const animBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - barProgress.value) * -300 }],
  }));

  useEffect(() => {
    if (!animTrigger || animTrigger === prevTrigger.current) return;
    prevTrigger.current = animTrigger;
    dotScale.value = 0;
    barProgress.value = 0;
    dotScale.value = withSequence(
      withTiming(1.5, { duration: 100 }),
      withSpring(1, { damping: 20, stiffness: 400 })
    );
    barProgress.value = withTiming(1, { duration: 220 });
  }, [animTrigger]);

  if (currentStage < 0) return null;
  const inactiveColor = isDark ? '#444' : '#e0e0e0';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, height: 8 }}>
      {STEPPER_STAGES.map((stage, i) => {
        const done = i < currentStage;
        const active = i === currentStage;
        const color = (done || active) ? (statusColors[STEPPER_STAGES[i]] ?? '#95A5A6') : inactiveColor;
        const isNewDot = active;
        const isNewBar = i === currentStage - 1;
        return (
          <React.Fragment key={stage}>
            {isNewDot ? (
              <ReAnimated.View style={[{
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: color, borderWidth: 1.5, borderColor: color,
              }, animDotStyle]} />
            ) : (
              <View style={{
                width: done || active ? 8 : 6, height: done || active ? 8 : 6, borderRadius: 4,
                backgroundColor: done || active ? color : 'transparent',
                borderWidth: 1.5, borderColor: color,
              }} />
            )}
            {i < 5 && (
              isNewBar ? (
                <View style={{ flex: 1, height: 2, backgroundColor: inactiveColor, overflow: 'hidden' }}>
                  <ReAnimated.View style={[{
                    position: 'absolute', left: 0, top: 0, bottom: 0, right: 0,
                    backgroundColor: statusColors[status] ?? '#95A5A6',
                  }, animBarStyle]} />
                </View>
              ) : (
                <View style={{ flex: 1, height: 2, backgroundColor: done ? (statusColors[status] ?? '#95A5A6') : inactiveColor }} />
              )
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── ステータスステッパー ──────────────────────────────────────────

const STEPPER_STAGES = ['検討中', 'ES締切', '1次面接', '2次面接', '最終面接', '内定'];
// ステッパーは6段のままにして、Webテストは書類フェーズに含める。
// ステータス名自体はバッジで出るので情報は失われない。
const STATUS_TO_STAGE: Record<string, number> = {
  '検討中': 0, '説明会': 0, 'ワークショップ': 0, 'GD': 0,
  'ES締切': 1, 'ES提出済': 1, 'Webテスト': 1,
  '1次面接': 2,
  '2次面接': 3,
  '最終面接': 4,
  '内定': 5, '内定承諾': 5,
};

function StatusStepper({ status, statusColors, isDark }: { status: string; statusColors: Record<string, string>; isDark: boolean }) {
  const currentStage = STATUS_TO_STAGE[status] ?? 0;
  const dotScales = useRef(STEPPER_STAGES.map(() => new Animated.Value(0))).current;
  const barAnims = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0))).current;
  const labelOpacities = useRef(STEPPER_STAGES.map(() => new Animated.Value(0))).current;
  const labelTranslates = useRef(STEPPER_STAGES.map(() => new Animated.Value(8))).current;

  useEffect(() => {
    dotScales.forEach(d => d.setValue(0));
    barAnims.forEach(b => b.setValue(0));
    labelOpacities.forEach(l => l.setValue(0));
    labelTranslates.forEach(l => l.setValue(8));

    const seq: Animated.CompositeAnimation[] = [];
    for (let i = 0; i <= Math.min(currentStage, STEPPER_STAGES.length - 1); i++) {
      const isActive = i === currentStage;
      seq.push(Animated.parallel([
        isActive
          ? Animated.sequence([
              Animated.timing(dotScales[i], { toValue: 1.4, duration: 120, useNativeDriver: true }),
              Animated.spring(dotScales[i], { toValue: 1, tension: 400, friction: 10, useNativeDriver: true }),
            ])
          : Animated.spring(dotScales[i], { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
        Animated.timing(labelOpacities[i], { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(labelTranslates[i], { toValue: 0, duration: 200, useNativeDriver: true }),
      ]));
      if (i < currentStage && i < 5) {
        seq.push(Animated.timing(barAnims[i], { toValue: 1, duration: 320, useNativeDriver: true }));
      }
    }
    Animated.sequence(seq).start();
  }, [status]);

  const stageColor = (i: number) => statusColors[STEPPER_STAGES[i]] ?? '#95A5A6';
  const inactiveColor = isDark ? '#444' : '#ddd';

  return (
    <View style={{ marginTop: 4, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {STEPPER_STAGES.map((stage, i) => {
          const done = i < currentStage;
          const active = i === currentStage;
          const color = done || active ? stageColor(i) : inactiveColor;
          return (
            <React.Fragment key={stage}>
              <View style={{ alignItems: 'center' }}>
                <Animated.View style={{
                  width: 11, height: 11, borderRadius: 6,
                  backgroundColor: done || active ? color : 'transparent',
                  borderWidth: 1.5, borderColor: color,
                  transform: [{ scale: dotScales[i] }],
                }} />
                <Animated.Text style={{
                  fontSize: 8, marginTop: 4, width: 36, textAlign: 'center',
                  color: done || active ? color : inactiveColor,
                  opacity: labelOpacities[i],
                  transform: [{ translateY: labelTranslates[i] }],
                }}>
                  {stage}
                </Animated.Text>
              </View>
              {i < 5 && (
                <View style={{ flex: 1, height: 2, backgroundColor: inactiveColor, marginBottom: 18, overflow: 'hidden' }}>
                  <Animated.View style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, right: 0,
                    backgroundColor: stageColor(i),
                    transform: [{ translateX: barAnims[i].interpolate({ inputRange: [0, 1], outputRange: [-300, 0] }) }],
                  }} />
                </View>
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

// ─── チュートリアルモーダル ──────────────────────────────────────

function PhoneMockup({ children, isDark }: { children: React.ReactNode; isDark: boolean }) {
  return (
    <View style={{
      width: 190, height: 300, borderRadius: 26,
      borderWidth: 2, borderColor: isDark ? '#444' : '#ccc',
      backgroundColor: isDark ? '#1c1c1e' : '#f0f0f5',
      overflow: 'hidden', alignItems: 'center',
    }}>
      <View style={{ width: 56, height: 5, backgroundColor: isDark ? '#444' : '#ccc', borderRadius: 3, marginTop: 10, marginBottom: 8 }} />
      <View style={{ flex: 1, width: '100%', paddingHorizontal: 10, position: 'relative' }}>
        {children}
      </View>
    </View>
  );
}

function TutorialIllust1({ isDark }: { isDark: boolean }) {
  const rowBg = isDark ? '#2c2c2e' : '#fff';
  const colors = ['#27AE60', '#8E44AD', '#E74C3C'];
  const inactive = isDark ? '#3a3a3c' : '#e8e8e8';
  return (
    <PhoneMockup isDark={isDark}>
      <View style={{ gap: 6, marginBottom: 8 }}>
        {colors.map((c, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: rowBg, borderRadius: 8, height: 36, paddingHorizontal: 8, gap: 8 }}>
            <View style={{ width: 3, height: 20, backgroundColor: c, borderRadius: 2 }} />
            <View style={{ flex: 1, height: 6, backgroundColor: inactive, borderRadius: 3 }} />
            <View style={{ width: 28, height: 14, backgroundColor: c + '44', borderRadius: 4 }} />
          </View>
        ))}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: isDark ? '#333' : '#e0e0e0', paddingTop: 6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
          {[...Array(21)].map((_, i) => (
            <View key={i} style={{ width: 23, height: 23, borderRadius: 12, backgroundColor: i === 8 ? TDU_BLUE : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 9, color: i === 8 ? '#fff' : (isDark ? '#888' : '#666') }}>{i + 1}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 9, color: isDark ? '#888' : '#999', marginTop: 4, textAlign: 'center' }}>日付をダブルタップで素早く登録</Text>
      </View>
      <View style={{ position: 'absolute', bottom: 10, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: TDU_BLUE, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', lineHeight: 24 }}>+</Text>
      </View>
    </PhoneMockup>
  );
}

function TutorialIllust2({ isDark }: { isDark: boolean }) {
  const rowBg = isDark ? '#2c2c2e' : '#fff';
  const rows: [string, string, string | null][] = [
    ['#27AE60', 'A社', 'ES提出済 →'],
    ['#8E44AD', 'B社', null],
    ['#E74C3C', 'C社', null],
  ];
  return (
    <PhoneMockup isDark={isDark}>
      <View style={{ gap: 8, marginTop: 8 }}>
        {rows.map(([c, co, btn], i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: rowBg, borderRadius: 10, padding: 10, gap: 8 }}>
            <View style={{ width: 3, height: 28, backgroundColor: c, borderRadius: 2 }} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ height: 8, backgroundColor: isDark ? '#3a3a3c' : '#e0e0e0', borderRadius: 4, width: '65%' }} />
              <View style={{ height: 5, backgroundColor: isDark ? '#333' : '#ececec', borderRadius: 3, width: '45%' }} />
            </View>
            {btn && (
              <View style={{ borderWidth: 1.5, borderColor: c, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 }}>
                <Text style={{ fontSize: 9, color: c, fontWeight: 'bold' }}>{btn}</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    </PhoneMockup>
  );
}

function TutorialIllust3({ isDark }: { isDark: boolean }) {
  const rowBg = isDark ? '#2c2c2e' : '#fff';
  const stageColors = ['#95A5A6', '#27AE60', '#8E44AD', '#E67E22', '#E74C3C', '#E91E8C'];
  const inactive = isDark ? '#444' : '#e0e0e0';
  const stages = [2, 4, 1];
  return (
    <PhoneMockup isDark={isDark}>
      <View style={{ gap: 8, marginTop: 8 }}>
        {stages.map((stage, ri) => (
          <View key={ri} style={{ backgroundColor: rowBg, borderRadius: 10, padding: 10, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 3, height: 18, backgroundColor: stageColors[stage], borderRadius: 2 }} />
              <View style={{ height: 7, backgroundColor: isDark ? '#3a3a3c' : '#e0e0e0', borderRadius: 4, flex: 1 }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 }}>
              {stageColors.map((c, i) => (
                <React.Fragment key={i}>
                  <View style={{
                    width: i === stage ? 7 : 5, height: i === stage ? 7 : 5, borderRadius: 4,
                    backgroundColor: i <= stage ? c : 'transparent',
                    borderWidth: 1, borderColor: i <= stage ? c : inactive,
                  }} />
                  {i < 5 && <View style={{ flex: 1, height: 1.5, backgroundColor: i < stage ? c : inactive }} />}
                </React.Fragment>
              ))}
            </View>
          </View>
        ))}
      </View>
    </PhoneMockup>
  );
}

function TutorialIllust4({ isDark }: { isDark: boolean }) {
  const rowBg = isDark ? '#2c2c2e' : '#fff';
  const items: [string, string, string][] = [
    ['#E91E8C', '内定', 'A社'],
    ['#8E44AD', '1次面接', 'B社'],
    ['#27AE60', 'ES締切', 'C社'],
    ['#2980B9', 'ES提出済', 'D社'],
  ];
  return (
    <PhoneMockup isDark={isDark}>
      <View style={{ flexDirection: 'row', marginBottom: 8, borderBottomWidth: 1, borderBottomColor: isDark ? '#333' : '#e0e0e0' }}>
        {['📅', '📋', '🎯', '⚙️'].map((icon, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 5, borderBottomWidth: i === 2 ? 2 : 0, borderBottomColor: TDU_BLUE, marginBottom: -1 }}>
            <Text style={{ fontSize: 13 }}>{icon}</Text>
          </View>
        ))}
      </View>
      <View style={{ gap: 5 }}>
        {items.map(([c, st, co], i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: rowBg, borderRadius: 8, height: 32, paddingHorizontal: 8, gap: 6 }}>
            <View style={{ width: 3, height: 18, backgroundColor: c, borderRadius: 2 }} />
            <View style={{ backgroundColor: c + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
              <Text style={{ fontSize: 8, color: c, fontWeight: 'bold' }}>{st}</Text>
            </View>
            <Text style={{ fontSize: 10, color: isDark ? '#ccc' : '#333', fontWeight: '600' }}>{co}</Text>
          </View>
        ))}
      </View>
    </PhoneMockup>
  );
}

const TUTORIAL_SLIDES = [
  { title: '企業を登録する', desc: '右下の「＋」ボタン、またはカレンダーの\n日付をダブルタップして登録できます' },
  { title: 'ステータスを進める', desc: 'カードの「→」ボタンをタップすると\n次の選考ステップへ進みます' },
  { title: '選考の進捗を確認', desc: 'カード下部のドットで\n現在のフェーズが一目でわかります' },
  { title: '持ち駒を確認する', desc: '持ち駒タブで選考中の企業を\nまとめて確認・管理できます' },
];

function TutorialModal({ visible, onClose, isDark, C }: {
  visible: boolean; onClose: () => void; isDark: boolean; C: typeof LIGHT;
}) {
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const { width } = Dimensions.get('window');
  const PAGES = TUTORIAL_SLIDES.length;

  const goToNext = () => {
    const next = page + 1;
    if (next < PAGES) {
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setPage(next);
    }
  };

  const illusts = [
    <TutorialIllust1 isDark={isDark} />,
    <TutorialIllust2 isDark={isDark} />,
    <TutorialIllust3 isDark={isDark} />,
    <TutorialIllust4 isDark={isDark} />,
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{ backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '92%' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
            <View style={{ width: 64 }} />
            <Text style={{ fontSize: 17, fontWeight: '600', color: C.text }}>基本の使い方</Text>
            <TouchableOpacity
              onPress={onClose}
              style={{ backgroundColor: isDark ? '#2c2c2e' : '#e5e5ea', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: C.text }}>閉じる</Text>
            </TouchableOpacity>
          </View>
          {/* Slides */}
          <ScrollView
            ref={scrollRef}
            horizontal pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            style={{ flex: 1 }}>
            {TUTORIAL_SLIDES.map((s, i) => (
              <View key={i} style={{ width, alignItems: 'center', paddingHorizontal: 28, paddingTop: 8 }}>
                <Text style={{ fontSize: 22, fontWeight: 'bold', color: C.text, textAlign: 'center', marginBottom: 10 }}>{s.title}</Text>
                <Text style={{ fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>{s.desc}</Text>
                {illusts[i]}
              </View>
            ))}
          </ScrollView>
          {/* Dots + start button */}
          <View style={{ alignItems: 'center', paddingVertical: 20, gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {TUTORIAL_SLIDES.map((_, i) => (
                <View key={i} style={{
                  width: i === page ? 20 : 6, height: 6, borderRadius: 3,
                  backgroundColor: i === page ? TDU_BLUE : (isDark ? '#555' : '#c8c8c8'),
                }} />
              ))}
            </View>
            {page === PAGES - 1 && (
              <TouchableOpacity
                style={{ backgroundColor: TDU_BLUE, borderRadius: 14, paddingHorizontal: 48, paddingVertical: 14 }}
                onPress={onClose}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>はじめる</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {/* Right arrow */}
        {page < PAGES - 1 && (
          <TouchableOpacity
            onPress={goToNext}
            style={{ position: 'absolute', right: 0, top: '50%', marginTop: -20, backgroundColor: isDark ? '#3a3a3c' : '#d8d8d8', borderTopLeftRadius: 12, borderBottomLeftRadius: 12, paddingLeft: 10, paddingRight: 6, paddingVertical: 14 }}>
            <Text style={{ fontSize: 20, color: C.text }}>‹</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

// ─── メインコンポーネント ─────────────────────────────────────────

// Dark mode colors
const LIGHT = {
  bg: '#ffffff', bg2: '#f8f9fa', bg3: '#f0f4ff', card: '#ffffff',
  border: '#eeeeee', border2: '#f0f0f0',
  text: '#222222', text2: '#666666', text3: '#999999',
  calBg: '#ffffff', calText: '#222222',
  tabBar: '#ffffff', inputBg: '#f8f9fa', searchBg: '#f5f5f5',
  filterBg: '#f8faff', statChip: '#e8f0fe', headerBorder: '#f0f0f0',
};
// セマンティックカラー。
// StyleSheet.create は静的で C（ダーク/ライト）を参照できないため、
// ここにライトの既定値を置き、ダーク時は各所で C.xxx をインラインで重ねる。
const DANGER = '#e74c3c';        // 削除・警告
const NEUTRAL_GRAY = '#95A5A6';  // ステータス未設定時のフォールバック
const SUCCESS = '#27AE60';       // 完了・チェック済み
const CHIP_BG = '#f0f2f5';       // チップ/ピッカーの背景
const ACCENT_BORDER = '#dde8ff'; // ACCENT の淡い枠線
const SURFACE_MUTED = '#f8f8f8'; // 沈めた面

const DARK = {
  bg: '#0d1117', bg2: '#161b22', bg3: '#1c2333', card: '#161b22',
  border: '#30363d', border2: '#21262d',
  text: '#e6edf3', text2: '#8b949e', text3: '#6e7681',
  calBg: '#0d1117', calText: '#e6edf3',
  tabBar: '#161b22', inputBg: '#21262d', searchBg: '#21262d',
  filterBg: '#1c2333', statChip: '#1c2333', headerBorder: '#30363d',
};

// カレンダーヘッダー
function CalendarHeader({ isDark, C, currentDate, weekStart, onOpenDatePicker, calendarMode, onToggleMode }: {
  isDark: boolean; C: typeof LIGHT; currentDate: Date; weekStart: number; onOpenDatePicker: () => void;
  calendarMode: 'week' | 'month'; onToggleMode: () => void;
}) {
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, backgroundColor: C.bg, flexDirection: 'row', alignItems: 'center' }}>
      <TouchableOpacity onPress={onOpenDatePicker} activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        <Text style={{ fontSize: 28, fontWeight: '600', color: C.text, letterSpacing: -0.5 }}>
          {String(month).padStart(2, '0')}
        </Text>
        <Text style={{ fontSize: 18, color: C.text3, fontWeight: '300' }}>/</Text>
        <Text style={{ fontSize: 15, color: C.text3, fontWeight: '400', letterSpacing: 1 }}>{year}</Text>
        <Text style={{ fontSize: 15, color: C.text2, fontWeight: '300' }}>{monthNames[currentDate.getMonth()]}</Text>
        <Text style={{ fontSize: 10, color: C.text3, marginLeft: 2 }}>▾</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onToggleMode}
        style={{ backgroundColor: isDark ? '#1e3a5f' : '#e8f0fe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
        <Text style={{ fontSize: 12, fontWeight: 'bold', color: ACCENT }}>
          {calendarMode === 'month' ? '週' : '月'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// 曜日ヘッダー（Calendarの上に表示）
function WeekdayHeader({ C, weekStart }: { C: typeof LIGHT; weekStart: number }) {
  const days0 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const days1 = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const weekDays = weekStart === 1 ? days1 : days0;
  const isSat = (i: number) => weekStart === 0 ? i === 6 : i === 5;
  const isSun = (i: number) => weekStart === 0 ? i === 0 : i === 6;
  return (
    <View style={{
      flexDirection: 'row', justifyContent: 'space-around',
      paddingHorizontal: 2, paddingVertical: 6,
      borderBottomWidth: 0.5, borderBottomColor: C.border,
      backgroundColor: C.bg
    }}>
      {weekDays.map((d, i) => (
        <Text key={i} style={{
          fontSize: 13,
          fontWeight: '500',
          color: isSun(i) ? '#e74c3c' : isSat(i) ? '#4A90D9' : C.text2,
          width: 40,
          textAlign: 'center',
        }}>{d}</Text>
      ))}
    </View>
  );
}

/** カタカナ → ひらがな変換 */
function kataToHira(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0x60)
  );
}

/** 入力文字列を検索用に正規化（ひらがな・小文字） */
function normalizeQuery(str: string): string {
  return kataToHira(str).toLowerCase();
}

export default function App() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const C = isDark ? DARK : LIGHT;
  const ACCENT = isDark ? '#6ea8fe' : TDU_BLUE;
  const [currentCalDate, setCurrentCalDate] = useState(new Date());
  const [calendarMode, setCalendarMode] = useState<'week' | 'month'>('month');
  const [manualOrder, setManualOrder] = useState<string[]>([]);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_700Bold,
    NotoSansJP_400Regular,
    NotoSansJP_700Bold,
  });

  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  // ─── 広告 state ──────────────────────────────────────────────
  const [rewardedTip, setRewardedTip] = useState<{ title: string; content: string } | null>(null);
  const [offerModalVisible, setOfferModalVisible] = useState(false);
  const [firstLaunchModal, setFirstLaunchModal] = useState(false);
  const [adFree, setAdFree] = useState(false);
  const [actionCount, setActionCount] = useState(0);
  const [bannerKey, setBannerKey] = useState(0);
  const [pendingInternalCompany, setPendingInternalCompany] = useState<string>(''); // 内定企業名
  const appOpenRef = useRef<AppOpenAd | null>(null);
  const rewardedRef = useRef<RewardedAd | null>(null);
  const [genres, setGenres] = useState<Genre[]>(DEFAULT_GENRES);
  const [statusColors, setStatusColors] = useState<StatusColors>(DEFAULT_STATUS_COLORS);
  const [statusOptions, setStatusOptions] = useState<string[]>([...DEFAULT_STATUS_OPTIONS]);

  // 企業ごとの通知設定（編集モーダル内）
  const [itemNotifyEnabled, setItemNotifyEnabled] = useState(true);
  const [notifyDaysList, setNotifyDaysList] = useState<string[]>(['1']);
  const [notifyHour, setNotifyHour] = useState('09');
  const [notifyMinute, setNotifyMinute] = useState('00');

  // ダブルタップ検知
  const lastTapRef = useRef<{ ds: string; time: number }>({ ds: '', time: 0 });
  // ステータス追加モーダル
  const [addStatusModal, setAddStatusModal] = useState(false);
  const [newStatusName, setNewStatusName] = useState('');

  // カレンダー
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [calDaySelected, setCalDaySelected] = useState(false);

  // 持ち駒フィルタ
  const [searchQuery, setSearchQuery] = useState('');
  const [sortType, setSortType] = useState<SortType>('登録順');
  const [filterGenreIds, setFilterGenreIds] = useState<string[]>([]);   // 複数選択
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);   // 複数選択
  const [sortAsc, setSortAsc] = useState(true);
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);

  const modalScrollRef = useRef<ScrollView>(null);
  const scrollToMemo = () => setTimeout(() => modalScrollRef.current?.scrollToEnd({ animated: true }), 300);

  // ─── アニメーション値 ────────────────────────────────────────
  const fabScale = useSharedValue(1);
  const fabScaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: fabScale.value }] }));
  const calHeight = useSharedValue(0); // 初期値は useEffect で設定

  const calHeightStyle = useAnimatedStyle(() => ({ height: calHeight.value }));

  const modalTranslateY = useRef(new Animated.Value(600)).current;
  const modalScrollY = useRef(0);
  const modalPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => g.dy > 3 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) modalTranslateY.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80 || g.vy > 0.5) {
        Animated.timing(modalTranslateY, { toValue: 800, duration: 200, useNativeDriver: true }).start(() => {
          modalTranslateY.setValue(0);
          closeModal();
        });
      } else {
        modalTranslateY.setValue(0);
      }
    },
  })).current;

  // 登録/編集モーダル
  const [isModalVisible, setModalVisible] = useState(false);
  const [isDetailVisible, setDetailVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Schedule | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [suggestions, setSuggestions] = useState<CompanyEntry[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selStatus, setSelStatus] = useState('検討中');
  const [selDate, setSelDate] = useState(new Date().toISOString().split('T')[0]);
  const [selEndDate, setSelEndDate] = useState('');
  const [selHour, setSelHour] = useState('');
  const [selMinute, setSelMinute] = useState('');
  const [note, setNote] = useState('');
  const [url, setUrl] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [rank, setRank] = useState('B');
  const [selGenreId, setSelGenreId] = useState('other');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  // ピッカー

  // 新機能用 state
  const [offerDeadline, setOfferDeadline] = useState('');
  const [memoResearch, setMemoResearch] = useState('');
  const [memoPR, setMemoPR] = useState('');
  const [memoQuestions, setMemoQuestions] = useState('');
  const [activeMemoTab, setActiveMemoTab] = useState(0); // 0=研究, 1=PR, 2=質問
  const [internshipStart, setInternshipStart] = useState('');
  const [internshipEnd, setInternshipEnd] = useState('');
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [showAllStatuses, setShowAllStatuses] = useState(false);

  // 会場（オンライン / 対面）
  const [selVenueType, setSelVenueType] = useState<VenueType | undefined>(undefined);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [venue, setVenue] = useState('');
  // Webテスト
  const [webTestType, setWebTestType] = useState('');
  const [webTestDeadline, setWebTestDeadline] = useState('');
  const [webTestBookedAt, setWebTestBookedAt] = useState('');
  const [webTestVenue, setWebTestVenue] = useState('');
  // やること一覧
  const [todoModalVisible, setTodoModalVisible] = useState(false);
  const [openHelpItem, setOpenHelpItem] = useState<number | null>(null);
  const [advanceAnimMap, setAdvanceAnimMap] = useState<Record<string, number>>({});

  // チェックリストモーダル
  const [checkModalItem, setCheckModalItem] = useState<Schedule | null>(null);
  const [newCheckLabel, setNewCheckLabel] = useState('');

  // ジャンル管理モーダル
  const [genreModalVisible, setGenreModalVisible] = useState(false);
  const [editGenre, setEditGenre] = useState<Genre | null>(null);
  const [genreName, setGenreName] = useState('');
  const [genreColor, setGenreColor] = useState('#4A90D9');

  // 通知設定
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [notifyDays, setNotifyDays] = useState('1');
  const [weekStart, setWeekStart] = useState(0); // 0=日, 1=月
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const calScrollRef = useRef<ScrollView>(null);
  const [screenWidth, setScreenWidth] = useState(0);
  const isSwipingCal = useRef(false);
  const [datePickerYear, setDatePickerYear] = useState(new Date().getFullYear());
  const [datePickerMonth, setDatePickerMonth] = useState(new Date().getMonth()); // 0-indexed

  // 企業登録用ホイールピッカー

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (selDate && selEndDate && selEndDate < selDate) {
      setSelEndDate(selDate);
    }
  }, [selDate, selEndDate]);

  // AppStateリスナーは一度しか張らないので、最新の色をrefで参照する
  const statusColorsRef = useRef(statusColors);
  useEffect(() => { statusColorsRef.current = statusColors; }, [statusColors]);

  // ウィジェットの→ボタンで進めたステータスを取り込む。
  // ウィジェットはApp Group側のキューに積むだけで、AsyncStorageの正本は
  // アプリ側で更新する（二重管理による取りこぼしを防ぐため）。
  // 待ち行列を読んで空にし、id → 新ステータス の対応を返す。
  const drainWidgetPendingActions = async (): Promise<Record<string, string> | null> => {
    if (Platform.OS !== 'ios') return null;
    try {
      const raw = await SharedGroupPreferences.getItem(WIDGET_PENDING_KEY, APP_GROUP);
      if (!raw) return null;
      const actions = JSON.parse(raw) as { id: string; status: string }[];
      if (!Array.isArray(actions) || actions.length === 0) return null;
      await SharedGroupPreferences.setItem(WIDGET_PENDING_KEY, '[]', APP_GROUP);
      const map: Record<string, string> = {};
      actions.forEach(a => { if (a?.id && a?.status) map[a.id] = a.status; });
      return Object.keys(map).length ? map : null;
    } catch {
      return null;
    }
  };

  // 待ち行列のステータスを反映する。変化が無ければ null。
  const mergePendingStatuses = (
    list: Schedule[], map: Record<string, string>, colors: StatusColors
  ): Schedule[] | null => {
    let changed = false;
    const updated = list.map(s => {
      const ns = map[s.id];
      if (!ns || ns === s.status) return s;
      changed = true;
      const autoChecks = STATUS_TO_CHECKS[ns] ?? [];
      const cl: Record<string, boolean> = { ...(s.checklist ?? {}) };
      CHECKLIST_STEPS.forEach(step => { if (autoChecks.includes(step)) cl[step] = true; });
      return { ...s, status: ns, checklist: cl, calendarColor: colors[ns] ?? '#95A5A6' };
    });
    return changed ? updated : null;
  };

  // フォアグラウンド復帰時にウィジェットの操作を取り込んでから再同期。
  // 初回は loadAll 側で取り込むため、ここではリスナーだけ張る
  // （マウント直後に走らせると loadAll の読み込みと競合する）。
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active') return;
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        const list = JSON.parse(stored) as Schedule[];
        const pending = await drainWidgetPendingActions();
        const merged = pending ? mergePendingStatuses(list, pending, statusColorsRef.current) : null;
        if (merged) await saveSchedules(merged);
        else await syncWidgetData(list);
      } catch {}
    });
    return () => sub.remove();
  }, []);

  // ウィジェットの日付タップ（shukatsukanri://date/YYYY-MM-DD）でその日を開く
  useEffect(() => {
    const openFromUrl = (url: string | null) => {
      if (!url) return;
      const m = url.match(/date\/(\d{4}-\d{2}-\d{2})/);
      if (!m) return;
      setSelectedDate(m[1]);
      setCalDaySelected(true);
      setActiveTab('calendar');
    };
    Linking.getInitialURL().then(openFromUrl).catch(() => {});
    const sub = Linking.addEventListener('url', e => openFromUrl(e.url));
    return () => sub.remove();
  }, []);

  // ─── 広告初期化 ──────────────────────────────────────────────
  useEffect(() => {
    const appOpen = AppOpenAd.createForAdRequest(APP_OPEN_ID, { requestNonPersonalizedAdsOnly: true });
    appOpenRef.current = appOpen;
    appOpen.load();
    const rewarded = RewardedAd.createForAdRequest(REWARDED_ID, { requestNonPersonalizedAdsOnly: true });
    rewardedRef.current = rewarded;
    rewarded.load();
  }, []);

  const showAppOpenAd = () => {
    if (adFree) return;
    const appOpen = AppOpenAd.createForAdRequest(APP_OPEN_ID, { requestNonPersonalizedAdsOnly: true });
    appOpen.addAdEventListener(AdEventType.LOADED, () => { appOpen.show(); });
    appOpen.load();
  };

  // 4回起動ごとに1回App Open広告表示
  const countAction = async () => {
    if (adFree) return;
    const launchStr = await AsyncStorage.getItem('@launch_count');
    const launches = launchStr ? parseInt(launchStr) : 0;
    if (launches < 4) return;
    const triggered = await AsyncStorage.getItem('@interstitial_triggered');
    if (triggered === 'true') return;
    await AsyncStorage.setItem('@interstitial_triggered', 'true');
    await AsyncStorage.setItem('@launch_count', '1');
    showAppOpenAd();
  };

  // リワード広告を表示してTipsを解放
  const showRewardedAd = () => {
    if (!rewardedRef.current?.loaded) {
      Alert.alert('広告の準備中', 'しばらくしてからもう一度お試しください。');
      return;
    }
    const tip = SHUKATSU_TIPS[Math.floor(Math.random() * SHUKATSU_TIPS.length)];
    rewardedRef.current.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      setRewardedTip(tip);
      setTimeout(() => rewardedRef.current?.load(), 1000);
    });
    rewardedRef.current.show();
  };

  const loadAll = async () => {
    try {
      // statusColorsを先に読み込んでsyncWidgetDataに渡せるようにする
      const sc = await AsyncStorage.getItem(STATUS_COLORS_KEY);
      const loadedColors: StatusColors = sc
        ? { ...DEFAULT_STATUS_COLORS, ...JSON.parse(sc) }
        : { ...DEFAULT_STATUS_COLORS };
      if (sc) setStatusColors(loadedColors);

      const s = await AsyncStorage.getItem(STORAGE_KEY);
      if (s) {
        let parsed: Schedule[] = JSON.parse(s);
        // ウィジェットの→ボタンで進めたぶんを先に取り込む
        const pending = await drainWidgetPendingActions();
        const afterPending = pending ? mergePendingStatuses(parsed, pending, loadedColors) : null;
        if (afterPending) parsed = afterPending;
        // 説明会・GDで日付が昨日以前のものを自動完了
        const today = new Date().toISOString().split('T')[0];
        const autoCompleted = parsed.map(item =>
          (['説明会', 'GD'].includes(item.status) && item.date && item.date < today)
            ? { ...item, status: '完了', calendarColor: loadedColors['完了'] ?? '#95A5A6' }
            : item
        );
        // calendarColorを現在のステータス色に合わせてマイグレーション（古いデータ対応）
        const migrated = autoCompleted.map(item => ({
          ...item,
          calendarColor: loadedColors[item.status] ?? item.calendarColor ?? '#95A5A6',
        }));
        const hasChanged = !!afterPending
          || migrated.some((item, i) => item.status !== parsed[i].status || item.calendarColor !== parsed[i].calendarColor);
        if (hasChanged) {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          await syncWidgetData(migrated, loadedColors);
        }
        setSchedules(migrated);
        if (!hasChanged) await syncWidgetData(migrated, loadedColors);
      }
      const g = await AsyncStorage.getItem(GENRES_KEY);
      if (g) setGenres(JSON.parse(g));
      const sort = await AsyncStorage.getItem('@sort_type');
      if (sort) setSortType(sort as SortType);
      const ne = await AsyncStorage.getItem('@notify_enabled');
      if (ne !== null) setNotifyEnabled(JSON.parse(ne));
      const nd = await AsyncStorage.getItem('@notify_days');
      if (nd) setNotifyDays(nd);
      const ws = await AsyncStorage.getItem('@week_start');
      if (ws !== null) setWeekStart(JSON.parse(ws));
      await syncWidgetWeekStart(ws !== null ? JSON.parse(ws) : 0);
      const so = await AsyncStorage.getItem(STATUS_OPTIONS_KEY);
      if (so) { setStatusOptions(JSON.parse(so)); }

      // 起動回数カウント
      const launchCount = await AsyncStorage.getItem('@launch_count');
      const count = launchCount ? parseInt(launchCount) + 1 : 1;
      await AsyncStorage.setItem('@launch_count', String(count));

      // 初回起動モーダル
      if (count === 1) {
        setTimeout(() => setFirstLaunchModal(true), 1000);
      }

      // 広告削除状態を読み込み
      const af = await AsyncStorage.getItem('@ad_free');
      if (af === 'true') setAdFree(true);

      // 手動並び順を読み込み
      const mo = await AsyncStorage.getItem(MANUAL_ORDER_KEY);
      if (mo) setManualOrder(JSON.parse(mo));

      // 起動時に表示済みフラグをリセット（新しい起動サイクル開始）
      await AsyncStorage.setItem('@interstitial_triggered', 'false');

    } catch (e) { Alert.alert('エラー', '読み込み失敗'); }
  };

  // 週の開始曜日をウィジェットへ共有する（カレンダーの列並びを合わせるため）
  const syncWidgetWeekStart = async (ws: number) => {
    if (Platform.OS !== 'ios') return;
    try {
      await SharedGroupPreferences.setItem(WIDGET_WEEK_START_KEY, String(ws), APP_GROUP);
      NativeModules.WidgetKitModule?.reloadAllTimelines();
    } catch {}
  };

  const syncWidgetData = async (data: Schedule[], overrideColors?: StatusColors) => {
    if (Platform.OS !== 'ios') return;
    try {
      const colors = overrideColors ?? statusColors;
      const widgetData = data.map(s => ({
        id: s.id,
        company: s.company,
        date: s.date,
        endDate: s.endDate ?? null,
        hour: s.hour,
        minute: s.minute,
        status: s.status,
        calendarColor: s.calendarColor ?? colors[s.status] ?? null,
        // ウィジェットの→ボタンの遷移先をアプリ側と揃えるために渡す
        hasWebTest: !!(s.webTestType || s.webTestDeadline),
      }));
      await SharedGroupPreferences.setItem(
        WIDGET_SCHEDULES_KEY,
        JSON.stringify(widgetData),
        APP_GROUP
      );
      // ウィジェットのタイムラインを即時リロード
      NativeModules.WidgetKitModule?.reloadAllTimelines();
    } catch {
      // ウィジェットの同期失敗は本体の動作に影響しないため握りつぶす
    }
  };

  const saveSchedules = async (data: Schedule[]) => {
    setSchedules(data);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    await syncWidgetData(data);
  };
  const saveGenres = async (data: Genre[]) => {
    setGenres(data);
    await AsyncStorage.setItem(GENRES_KEY, JSON.stringify(data));
  };
  const saveStatusColors = async (data: StatusColors) => {
    setStatusColors(data);
    await AsyncStorage.setItem(STATUS_COLORS_KEY, JSON.stringify(data));
  };
  const saveStatusOptions = async (data: string[]) => {
    setStatusOptions(data);
    await AsyncStorage.setItem(STATUS_OPTIONS_KEY, JSON.stringify(data));
  };

  // ─── 統計 ──────────────────────────────────────────────────────
  const EXCLUDE_FROM_COUNT = ['内定', '内定辞退', '不合格', '完了', '説明会', 'GD', ...INTERN_STATUSES];
  const activeCount = useMemo(() => schedules.filter(s => !EXCLUDE_FROM_COUNT.includes(s.status)).length, [schedules]);
  const internalCount = useMemo(() => schedules.filter(s => s.status === '内定').length, [schedules]);
  const passRate = useMemo(() => {
    const offer = schedules.filter(s => s.status === '内定' || s.status === '内定辞退').length;
    const reject = schedules.filter(s => s.status === '不合格').length;
    if (offer + reject === 0) return null;
    return Math.round(offer / (offer + reject) * 100);
  }, [schedules]);

  const upcomingSchedules = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return schedules.filter(s => s.date && s.date >= today && !INACTIVE.includes(s.status))
      .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10);
  }, [schedules]);

  // ─── カレンダーマーキング ──────────────────────────────────────
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    schedules.forEach(s => {
      if (!s.date) return;
      const col = s.calendarColor ?? statusColors[s.status] ?? TDU_BLUE;
      expandDateRange(s).forEach(cur => {
        if (!marks[cur]) marks[cur] = { dots: [] };
        if (!marks[cur].dots) marks[cur].dots = [];
        marks[cur].dots.push({ color: col });
      });
    });
    marks[selectedDate] = { ...(marks[selectedDate] || {}), selected: true, selectedColor: TDU_BLUE };
    return marks;
  }, [schedules, selectedDate, statusColors]);

  // インターン期間マップ（日付→スパン情報）
  const internshipPeriodsMap = useMemo(() => {
    const map: Record<string, { company: string; color: string; isStart: boolean; isEnd: boolean }[]> = {};
    schedules.forEach(s => {
      if (!s.internshipStart || !s.internshipEnd) return;
      const color = s.calendarColor ?? statusColors[s.status] ?? '#EC407A';
      // 以前は new Date().toISOString() で日を進めていたが、
      // ローカル時刻とUTCが混ざるうえ上限も無かったため expandDateRange に統一
      expandDateRange({ date: s.internshipStart, endDate: s.internshipEnd }).forEach(cur => {
        if (!map[cur]) map[cur] = [];
        map[cur].push({ company: s.company, color, isStart: cur === s.internshipStart, isEnd: cur === s.internshipEnd });
      });
    });
    return map;
  }, [schedules, statusColors]);

  const dateCompanyMap = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    schedules.forEach(s => {
      if (!s.date) return;
      expandDateRange(s).forEach(cur => {
        if (!map[cur]) map[cur] = [];
        map[cur].push(s);
      });
    });
    Object.keys(map).forEach(d => {
      map[d].sort((a, b) => (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0));
    });
    return map;
  }, [schedules]);

  // ─── フィルタ・ソート ──────────────────────────────────────────
  // 持ち駒: 説明会/GD/インターンは本選考と別トラックで同時表示
  const deduplicatedSchedules = useMemo(() => {
    const map = new Map<string, Schedule>();
    schedules.forEach(s => {
      const key = `${s.company.trim()}__${trackGroup(s.status)}`;
      const cur = map.get(key);
      if (!cur || (STATUS_PRIORITY[s.status] ?? 0) > (STATUS_PRIORITY[cur.status] ?? 0)) {
        map.set(key, s);
      }
    });
    return Array.from(map.values());
  }, [schedules]);

  const filteredSorted = useMemo(() => {
    let list = [...deduplicatedSchedules];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(s => s.company.toLowerCase().includes(q));
    }
    if (filterGenreIds.length > 0) list = list.filter(s => filterGenreIds.includes(s.genreId));
    if (filterStatuses.length > 0) list = list.filter(s => filterStatuses.includes(s.status));

    const ro: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 };
    switch (sortType) {
      case '直近順': {
        const today = new Date().toISOString().slice(0, 10);
        list.sort((a, b) => {
          const aTerminal = INACTIVE.includes(a.status);
          const bTerminal = INACTIVE.includes(b.status);
          if (aTerminal !== bTerminal) return aTerminal ? 1 : -1;
          if (aTerminal && bTerminal) return 0;
          if (!a.date && !b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return -1;
          const aPast = a.date < today;
          const bPast = b.date < today;
          if (aPast !== bPast) return aPast ? 1 : -1;
          const cmp = a.date.localeCompare(b.date);
          return sortAsc ? cmp : -cmp;
        });
        break;
      }
      case '五十音': list.sort((a, b) => a.company.localeCompare(b.company, 'ja')); break;
      case '志望度': list.sort((a, b) => (ro[a.rank] ?? 3) - (ro[b.rank] ?? 3)); break;
      case 'ステータス':
        list.sort((a, b) => {
          const sd = STATUS_SORT_ORDER.indexOf(a.status) - STATUS_SORT_ORDER.indexOf(b.status);
          if (sd !== 0) return sd;
          return (ro[a.rank] ?? 3) - (ro[b.rank] ?? 3);
        }); break;
      case 'ジャンル': list.sort((a, b) => a.genreId.localeCompare(b.genreId)); break;
      case '手動': {
        if (manualOrder.length > 0) {
          const orderMap = new Map(manualOrder.map((id, i) => [id, i]));
          list.sort((a, b) => (orderMap.get(a.id) ?? 9999) - (orderMap.get(b.id) ?? 9999));
        }
        break;
      }
    }
    if (!sortAsc && sortType !== '直近順' && sortType !== '手動') list.reverse();
    return list;
  }, [deduplicatedSchedules, searchQuery, filterGenreIds, filterStatuses, sortType, sortAsc, manualOrder]); // ② 正しい依存配列

  const filteredByDate = useMemo(
    () => schedules.filter(s => coversDate(s, selectedDate)),
    [schedules, selectedDate]
  );

  // 同日に物理的に両立しない予定がないか。対面が絡む場合は移動時間ぶん広く見る。
  const conflictIds = useMemo(
    () => findConflicts(
      schedules
        .filter(s => s.date && s.hour && !['不合格', '完了', '内定辞退'].includes(s.status))
        .map(s => ({ id: s.id, company: s.company, date: s.date, hour: s.hour, minute: s.minute, venueType: s.venueType }))
    ),
    [schedules]
  );

  // 全企業横断の「やること」。締切が近い順。
  const todos = useMemo(
    () => collectTodos(schedules, formatYmd(new Date())),
    [schedules]
  );
  const overdueTodoCount = todos.filter(t => t.daysLeft !== undefined && t.daysLeft < 0).length;
  // 辞退を決めたのに連絡できていない企業（調査では内々定保有者の57.4%が該当）
  const declinePendingCount = todos.filter(t => t.kind === 'decline').length;

  // カレンダーの行数を計算（現在月のみ）
  const maxCalRows = useMemo(() => {
    const firstDay = new Date(currentCalDate.getFullYear(), currentCalDate.getMonth(), 1).getDay();
    const adjusted = (firstDay - weekStart + 7) % 7;
    const daysInMonth = new Date(currentCalDate.getFullYear(), currentCalDate.getMonth() + 1, 0).getDate();
    return Math.ceil((adjusted + daysInMonth) / 7);
  }, [currentCalDate, weekStart]);

  // カレンダー高さアニメーション（週↔月切り替え・月変更）
  // maxCalRows / filteredSorted より後に置くこと。
  // 依存配列はレンダリング時に評価されるため、宣言より前だと初回に undefined が入る。
  useEffect(() => {
    const WEEK_H = 52;
    const MONTH_H = maxCalRows * 52;
    calHeight.value = withSpring(calendarMode === 'week' ? WEEK_H : MONTH_H, { damping: 15, stiffness: 150 });
  }, [calendarMode, maxCalRows]);

  // リストフェードイン（フィルター/ソート変更時）
  const listFadeAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    listFadeAnim.setValue(0);
    Animated.timing(listFadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [filteredSorted]);

  // ─── 保存ロジック ──────────────────────────────────────────────
  const handleSave = async () => {
    if (companyName.trim() === '') return;
    const name = companyName.trim();

    if (!selectedItem) {
      // 新規登録: 同名+同ステータスのエントリだけ自動削除（置換）
      // 同名+異ステータスはカレンダーに残す
      const sameStatusIds = schedules
        .filter(s => s.company.trim() === name && s.status === selStatus)
        .map(s => s.id);
      doSave(sameStatusIds);
    } else {
      // 編集: 通常の上書き保存
      doSave([]);
    }
  };

  const doSave = async (deleteIds: string[]) => {
    // selectedItem はモーダルを開いた時点のコピーなので、
    // 保存時に触らない項目は保存先の最新値から拾う
    const storedItem = selectedItem ? schedules.find(s => s.id === selectedItem.id) : undefined;
    const autoChecks = STATUS_TO_CHECKS[selStatus] ?? [];
    const initCL: Record<string, boolean> = {};
    CHECKLIST_STEPS.forEach(step => { initCL[step] = autoChecks.includes(step); });
    // 既存のチェックと合成（既にチェック済みのものは保持）
    // ただしステータスが下がった場合は、新ステータスより上のステージのチェックをリセット
    const existingCL = selectedItem?.checklist ?? {};
    const newStage = STATUS_TO_STAGE[selStatus] ?? 0;
    const oldStage = STATUS_TO_STAGE[selectedItem?.status ?? selStatus] ?? 0;
    const statusLowered = selectedItem && newStage < oldStage;
    CHECKLIST_STEPS.forEach((step, i) => {
      if (statusLowered && i >= newStage) {
        initCL[step] = autoChecks.includes(step); // 上位ステージはリセット
      } else {
        initCL[step] = initCL[step] || (existingCL[step] ?? false);
      }
    });

    // ⑬ ステータス変更履歴を更新
    const prevHistory = selectedItem?.statusHistory ?? [];
    const statusChanged = selectedItem ? selectedItem.status !== selStatus : true;
    const newHistory = statusChanged
      ? [...prevHistory, { status: selStatus, changedAt: new Date().toISOString() }]
      : prevHistory;

    const newSchedule: Schedule = {
      id: selectedItem ? selectedItem.id : Date.now().toString(),
      company: companyName.trim(), date: selDate,
      endDate: selEndDate && selDate && selEndDate >= selDate ? selEndDate : undefined,
      hour: selHour, minute: selMinute,
      status: selStatus, note: note.trim(),
      url: url.trim(), userId: userId.trim(), password: password.trim(),
      rank, genreId: selGenreId,
      checklist: initCL,
      // モーダルを開いた時点のスナップショットではなく現在値を使う。
      // チェックリストや辞退連絡はモーダル外からも更新されるため。
      customChecklist: storedItem?.customChecklist ?? selectedItem?.customChecklist ?? [],
      notifyEnabled: itemNotifyEnabled,
      notifySettings: { daysBeforeList: notifyDaysList, hourStr: notifyHour, minuteStr: notifyMinute },
      statusHistory: newHistory,
      offerDeadline: offerDeadline || undefined,
      internshipStart: internshipStart || undefined,
      internshipEnd: internshipEnd || undefined,
      memoResearch: memoResearch || undefined,
      memoPR: memoPR || undefined,
      memoQuestions: memoQuestions || undefined,
      venueType: selVenueType,
      meetingUrl: selVenueType === 'online' ? (meetingUrl.trim() || undefined) : undefined,
      venue: selVenueType === 'onsite' ? (venue.trim() || undefined) : undefined,
      webTestType: webTestType || undefined,
      webTestDeadline: webTestDeadline || undefined,
      webTestBookedAt: webTestBookedAt || undefined,
      webTestVenue: webTestVenue.trim() || undefined,
      declineContacted: storedItem?.declineContacted ?? selectedItem?.declineContacted,
      calendarColor: selectedItem
        ? (statusColors[selStatus] ?? selectedItem.calendarColor ?? '#95A5A6') // 編集時: 新ステータス色で更新
        : (statusColors[selStatus] ?? '#95A5A6'), // 新規: 登録時のステータス色で固定
    };
    const base = deleteIds.length > 0 ? schedules.filter(s => !deleteIds.includes(s.id)) : schedules;
    const updated = selectedItem ? base.map(s => s.id === selectedItem.id ? newSchedule : s) : [...base, newSchedule];
    await saveSchedules(updated);
    await scheduleNotification(newSchedule);

    // 企業登録3社目でレビュー依頼
    if (!selectedItem) {
      const uniqueCompanies = new Set(updated.map(s => s.company.trim())).size;
      if (uniqueCompanies >= 3) {
        const done = await AsyncStorage.getItem(REVIEW_3COMPANIES_KEY);
        if (!done && await StoreReview.hasAction()) {
          await StoreReview.requestReview();
          await AsyncStorage.setItem(REVIEW_3COMPANIES_KEY, 'true');
        }
      }
    }

    closeModal();
  };

  const closeModal = () => {
    setModalVisible(false); setDetailVisible(false); setSelectedItem(null);
    setCompanyName(''); setNote(''); setSelStatus('検討中');
    setSelDate(new Date().toISOString().split('T')[0]); setSelEndDate('');
    setSelHour(''); setSelMinute(''); setUrl(''); setUserId(''); setPassword('');
    setRank('B'); setSelGenreId('other'); setChecklist({});
    setSelVenueType(undefined); setMeetingUrl(''); setVenue('');
    setWebTestType(''); setWebTestDeadline(''); setWebTestBookedAt(''); setWebTestVenue('');
    setItemNotifyEnabled(true); setNotifyDaysList(['1']); setNotifyHour('09'); setNotifyMinute('00');
    setOfferDeadline(''); setMemoResearch(''); setMemoPR(''); setMemoQuestions(''); setActiveMemoTab(0);
    setInternshipStart(''); setInternshipEnd('');
  };

  const openAdd = (dateStr?: string) => {
    const ds = (typeof dateStr === 'string' && dateStr) ? dateStr : selectedDate;
    setSelDate(ds);
    setSelEndDate('');
    setItemNotifyEnabled(true);
    setNotifyDaysList(['1']); setNotifyHour('09'); setNotifyMinute('00');
    setModalVisible(true);
  };

  // 企業名入力時に同名企業のデータを自動継承（新規登録時のみ）
  const handleCompanyNameChange = (text: string) => {
    setCompanyName(text);
    const q = text.trim();
    if (q.length >= 1) {
      const normalizedQ = normalizeQuery(q);
      const match = (c: CompanyEntry) => {
        if (c.n.includes(q)) return true;
        const reading = c.r ?? normalizeQuery(c.n);
        return reading.includes(normalizedQ);
      };
      const startsWith = LISTED_COMPANIES.filter(c => {
        const reading = c.r ?? normalizeQuery(c.n);
        return c.n.startsWith(q) || reading.startsWith(normalizedQ);
      });
      const partial = LISTED_COMPANIES.filter(c => !startsWith.includes(c) && match(c));
      const filtered = [...startsWith, ...partial].slice(0, 8);
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
    if (selectedItem) return; // 編集モードは継承しない
    const match = schedules.find(s => s.company.trim() === text.trim() && text.trim() !== '');
    if (!match) return;
    setRank(match.rank ?? 'B');
    setSelGenreId(match.genreId ?? 'other');
    setUrl(match.url ?? '');
    setUserId(match.userId ?? '');
    setPassword(match.password ?? '');
    setNote(match.note ?? '');
    setMemoResearch(match.memoResearch ?? '');
    setMemoPR(match.memoPR ?? '');
    setMemoQuestions(match.memoQuestions ?? '');
  };

  const openDetail = (item: Schedule) => {
    setSelectedItem(item); setCompanyName(item.company);
    setNote(item.note ?? ''); setSelStatus(item.status); setSelDate(item.date);
    setSelEndDate(item.endDate ?? '');
    const _d = item.date ? new Date(item.date) : new Date();
    setSelHour(item.hour ?? ''); setSelMinute(item.minute ?? '');
    setUrl(item.url ?? ''); setUserId(item.userId ?? ''); setPassword(item.password ?? '');
    setRank(item.rank ?? 'B'); setSelGenreId(item.genreId ?? 'other');
    setChecklist(item.checklist ?? {});
    setItemNotifyEnabled(item.notifyEnabled !== false);
    setNotifyDaysList(item.notifySettings?.daysBeforeList ?? ['1']);
    setNotifyHour(item.notifySettings?.hourStr ?? '09');
    setNotifyMinute(item.notifySettings?.minuteStr ?? '00');
    setOfferDeadline(item.offerDeadline ?? '');
    setInternshipStart(item.internshipStart ?? '');
    setInternshipEnd(item.internshipEnd ?? '');
    setMemoResearch(item.memoResearch ?? '');
    setMemoPR(item.memoPR ?? '');
    setMemoQuestions(item.memoQuestions ?? '');
    setActiveMemoTab(0);
    setSelVenueType(item.venueType);
    setMeetingUrl(item.meetingUrl ?? '');
    setVenue(item.venue ?? '');
    setWebTestType(item.webTestType ?? '');
    setWebTestDeadline(item.webTestDeadline ?? '');
    setWebTestBookedAt(item.webTestBookedAt ?? '');
    setWebTestVenue(item.webTestVenue ?? '');
    setDetailVisible(true);
  };

  const deleteSchedule = (id: string) => {
    Alert.alert('削除', 'このデータを削除しますか？', [
      { text: '戻る', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          const target = schedules.find(s => s.id === id);
          await cancelNotification(id, target);
          await saveSchedules(schedules.filter(s => s.id !== id));
          closeModal();
        }
      },
    ]);
  };

  // ─── 通知 ─────────────────────────────────────────────────────
  const scheduleNotification = async (item: Schedule) => {
    if (!item.date) return;
    // 企業個別設定 or グローバル設定
    const enabled = item.notifyEnabled !== false && notifyEnabled;
    if (!enabled) { await cancelNotification(item.id, item); return; }
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      // 既存通知を全キャンセル
      const days = item.notifySettings?.daysBeforeList ?? [notifyDays];
      const nHour = parseInt(item.notifySettings?.hourStr ?? '09');
      const nMin = parseInt(item.notifySettings?.minuteStr ?? '00');
      const [y, m, d] = item.date.split('-').map(Number);
      for (const day of days) {
        const notifId = `notif_${item.id}_${day}`;
        await Notifications.cancelScheduledNotificationAsync(notifId).catch(() => { });
        const notifyDate = new Date(y, m - 1, d - parseInt(day), nHour, nMin, 0);
        if (notifyDate <= new Date()) continue;
        await Notifications.scheduleNotificationAsync({
          identifier: notifId,
          content: {
            title: `${item.company}`,
            body: `${item.status}の予定が${day === '0' ? '今日' : day + '日後'}です（${item.date}${item.hour ? ' ' + item.hour + ':' + item.minute : ''}）`
              + (item.venueType === 'onsite' ? `\n対面${item.venue ? '：' + item.venue : ''}` : item.venueType === 'online' ? '\nオンライン' : ''),
            sound: true,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: notifyDate },
        });
      }
    } catch {
      // 通知のスケジュール失敗は致命的ではないので握りつぶす
    }
  };

  const cancelNotification = async (id: string, item?: Schedule) => {
    // ④ 設定済みの日数 + 全候補日数を網羅してキャンセル
    const customDays = item?.notifySettings?.daysBeforeList ?? [];
    const allDays = [...new Set([...customDays, '0', '1', '2', '3', '5', '7', '10', '14'])];
    for (const d of allDays) {
      await Notifications.cancelScheduledNotificationAsync(`notif_${id}_${d}`).catch(() => { });
    }
    await Notifications.cancelScheduledNotificationAsync(`notif_${id}`).catch(() => { });
  };

  // ─── チェックリスト ────────────────────────────────────────────
  const toggleCheck = async (item: Schedule, step: string) => {
    const updated = schedules.map(s => {
      if (s.id !== item.id) return s;
      const newCL = { ...(s.checklist ?? {}), [step]: !(s.checklist ?? {})[step] };
      const newStatus = newCL['内定'] ? '内定' : s.status === '内定' ? '最終面接' : s.status;
      // 内定チェック時にオファーモーダルを表示
      if (newCL['内定'] && newStatus === '内定') {
        setTimeout(async () => {
          setPendingInternalCompany(s.company);
          setOfferModalVisible(true);
          // 内定時一回限定レビュー促進
          const reviewDone = await AsyncStorage.getItem(REVIEW_KEY);
          if (!reviewDone && await StoreReview.hasAction()) {
            await StoreReview.requestReview();
            await AsyncStorage.setItem(REVIEW_KEY, 'true');
          }
        }, 500);
      }
      return { ...s, checklist: newCL, status: newStatus };
    });
    await saveSchedules(updated);
    setCheckModalItem(updated.find(s => s.id === item.id) ?? null);
  };

  const toggleCustomCheck = async (item: Schedule, id: string) => {
    const updated = schedules.map(s => {
      if (s.id !== item.id) return s;
      const newCL = (s.customChecklist ?? []).map(c => c.id === id ? { ...c, checked: !c.checked } : c);
      return { ...s, customChecklist: newCL };
    });
    await saveSchedules(updated);
    setCheckModalItem(updated.find(s => s.id === item.id) ?? null);
  };

  const addCustomCheck = async (item: Schedule, label?: string, due?: string) => {
    const text = (label ?? newCheckLabel).trim();
    if (!text) return;
    // 同じ内容を二重に足さない（テンプレートの連打対策）
    if ((item.customChecklist ?? []).some(c => c.label === text && !c.checked)) return;
    const newC = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, label: text, checked: false, due };
    const updated = schedules.map(s => s.id !== item.id ? s : { ...s, customChecklist: [...(s.customChecklist ?? []), newC] });
    await saveSchedules(updated);
    setCheckModalItem(updated.find(s => s.id === item.id) ?? null);
    if (!label) setNewCheckLabel('');
  };

  /// チェック項目の期限を設定する
  const setCustomCheckDue = async (item: Schedule, id: string, due: string) => {
    const updated = schedules.map(s => s.id !== item.id ? s : {
      ...s,
      customChecklist: (s.customChecklist ?? []).map(c => c.id === id ? { ...c, due: due || undefined } : c),
    });
    await saveSchedules(updated);
    setCheckModalItem(updated.find(s => s.id === item.id) ?? null);
  };

  /// 辞退の連絡を済ませたことを記録する
  const markDeclineContacted = async (item: Schedule) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const updated = schedules.map(s => s.id !== item.id ? s : { ...s, declineContacted: true });
    await saveSchedules(updated);
  };

  const deleteCustomCheck = async (item: Schedule, id: string) => {
    const updated = schedules.map(s => s.id !== item.id ? s : { ...s, customChecklist: (s.customChecklist ?? []).filter(c => c.id !== id) });
    await saveSchedules(updated);
    setCheckModalItem(updated.find(s => s.id === item.id) ?? null);
  };

  // 次のステータスを返す（最終は変更なし）
  const completeStatus = async (item: Schedule) => {
    const updated = schedules.map(s => s.id !== item.id ? s : {
      ...s, status: '完了',
      calendarColor: statusColors['完了'] ?? '#95A5A6',
    });
    await saveSchedules(updated);
  };

  const advanceStatus = async (item: Schedule) => {
    const ns = nextStatus(item.status, !!(item.webTestType || item.webTestDeadline));
    if (!ns) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const autoChecks = STATUS_TO_CHECKS[ns] ?? [];
    const initCL: Record<string, boolean> = { ...(item.checklist ?? {}) };
    CHECKLIST_STEPS.forEach(step => { if (autoChecks.includes(step)) initCL[step] = true; });
    const updated = schedules.map(s => s.id !== item.id ? s : {
      ...s, status: ns, checklist: initCL,
      calendarColor: statusColors[ns] ?? '#95A5A6',
    });
    await saveSchedules(updated);
    setAdvanceAnimMap(prev => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }));
  };

  // ─── ジャンル管理 ─────────────────────────────────────────────
  const openAddGenre = () => { setEditGenre(null); setGenreName(''); setGenreColor('#4A90D9'); setGenreModalVisible(true); };
  const openEditGenre = (g: Genre) => { setEditGenre(g); setGenreName(g.name); setGenreColor(g.color); setGenreModalVisible(true); };
  const saveGenre = async () => {
    if (!genreName.trim()) return;
    // ステータス色編集の場合
    if (editGenre && statusOptions.includes(editGenre.id) && DEFAULT_STATUS_OPTIONS.includes(editGenre.id)) {
      await saveStatusColors({ ...statusColors, [editGenre.id]: genreColor });
      setGenreModalVisible(false);
      return;
    }
    const updated = editGenre
      ? genres.map(g => g.id === editGenre.id ? { ...g, name: genreName.trim(), color: genreColor } : g)
      : [...genres, { id: Date.now().toString(), name: genreName.trim(), color: genreColor }];
    await saveGenres(updated);
    setGenreModalVisible(false);
  };
  const deleteGenre = (id: string) => {
    Alert.alert('削除', 'このジャンルを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: async () => { await saveGenres(genres.filter(g => g.id !== id)); setGenreModalVisible(false); } },
    ]);
  };

  // ─── フィルタ複数選択 ──────────────────────────────────────────
  const toggleFilterGenre = (id: string) =>
    setFilterGenreIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleFilterStatus = (st: string) =>
    setFilterStatuses(prev => prev.includes(st) ? prev.filter(x => x !== st) : [...prev, st]);
  const isFilterActive = filterGenreIds.length > 0 || filterStatuses.length > 0;

  // ─── ヘルパー ──────────────────────────────────────────────────
  const rankColor = (r: string) => ({ S: '#e74c3c', A: '#e67e22', B: '#2980b9', C: '#7f8c8d' }[r] ?? '#999');
  // ⑪ カウントダウン計算
  const daysUntil = (dateStr: string): number | null => {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  };
  const countdownLabel = (dateStr: string): string | null => {
    const d = daysUntil(dateStr);
    if (d === null) return null;
    if (d < 0) return null;
    if (d === 0) return '今日';
    if (d <= 7) return `あと${d}日`;
    return null;
  };
  const genreOf = (id: string) => genres.find(g => g.id === id);
  const statusColorOf = (status: string) => statusColors[status] ?? '#95A5A6';
  const timeStr = (h: string, m: string) => h && m ? `${h}:${m}` : h ? `${h}:00` : '';
  const today = new Date().toISOString().split('T')[0];

  // ─── UI ────────────────────────────────────────────────────────
  if (!fontsLoaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView style={[styles.safeArea, { backgroundColor: C.bg }]}>
      <StatusBar style="dark" />
      <View style={[styles.container, { backgroundColor: C.bg }]}>

        {/* ヘッダー */}
        <View style={[styles.topNav, { borderBottomColor: C.border }]}>
          {/* 1行目：持駒・タイトル・内定 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6 }}>
            <View style={[styles.statChip, { backgroundColor: C.statChip }]}>
              <Text style={[styles.statNum, { color: isDark ? '#6ea8fe' : TDU_BLUE }]}>{activeCount}</Text>
              <Text style={[styles.statLabel, { color: isDark ? '#6ea8fe' : TDU_BLUE }]}>持駒</Text>
            </View>
            <Text style={[styles.headerTitle, { flex: 1, textAlign: 'center', color: ACCENT }]}>就活管理リマインダー</Text>
            <View style={[styles.statChip, { backgroundColor: isDark ? '#2d2007' : '#fff3cd' }]}>
              <Text style={[styles.statNum, { color: '#856404' }]}>{internalCount}</Text>
              <Text style={[styles.statLabel, { color: '#856404' }]}>内定</Text>
            </View>
          </View>

          {/* やること：締切が企業カードに散らばるので、横断で1本にまとめて出す */}
          {todos.length > 0 && (
            <ReAnimated.View entering={FadeInDown.duration(260)} style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
              <RippleButton
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: overdueTodoCount > 0 ? (isDark ? '#3a1414' : '#fdecea') : C.bg3,
                  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: overdueTodoCount > 0 ? DANGER : 'transparent',
                }}
                onPress={() => setTodoModalVisible(true)}>
                <PulseView active={overdueTodoCount > 0}>
                  <Image source={ICONS.checklist} style={{ width: 15, height: 15, tintColor: overdueTodoCount > 0 ? DANGER : ACCENT }} resizeMode="contain" />
                </PulseView>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: overdueTodoCount > 0 ? DANGER : C.text, flex: 1 }} numberOfLines={1}>
                  やること {todos.length}件
                  {overdueTodoCount > 0 ? `（期限切れ ${overdueTodoCount}）` : ''}
                  {declinePendingCount > 0 ? `・辞退連絡 ${declinePendingCount}` : ''}
                </Text>
                <Text style={{ fontSize: 11, color: C.text3 }}>{todos[0].company} {todoDueLabel(todos[0])}</Text>
              </RippleButton>
            </ReAnimated.View>
          )}

          {/* 2行目：広告（課金済みなら非表示→カレンダーが自動で上に移動） */}
          {!adFree && (
            <View style={{ width: '100%', height: 60, alignItems: 'center', justifyContent: 'center' }}>
              <BannerAd
                key={bannerKey}
                unitId={AD_UNIT_ID}
                size={BannerAdSize.ADAPTIVE_BANNER}
                requestOptions={{ requestNonPersonalizedAdsOnly: true }}
              />
            </View>
          )}
        </View>

        {/* ── カレンダータブ ── */}
        {activeTab === 'calendar' && (
          <View style={{ flex: 1, backgroundColor: C.bg, position: 'relative' }}
            onLayout={(e) => setScreenWidth(e.nativeEvent.layout.width)}>
            <CalendarHeader isDark={isDark} C={C} currentDate={currentCalDate} weekStart={weekStart} onOpenDatePicker={() => setDatePickerVisible(true)} calendarMode={calendarMode} onToggleMode={() => setCalendarMode(m => m === 'month' ? 'week' : 'month')} />
            <WeekdayHeader C={C} weekStart={weekStart} />
            {screenWidth > 0 && (
              <ReAnimated.View style={[calHeightStyle, { overflow: 'hidden' }]}>
              {calendarMode === 'week'
                ? (
                  <WeekCalendarRow
                    selectedDate={selectedDate} today={today} weekStart={weekStart}
                    C={C} isDark={isDark} dateCompanyMap={dateCompanyMap} statusColorOf={statusColorOf}
                    onDayPress={(ds) => { setSelectedDate(ds); setCalDaySelected(true); }}
                    onDayDoubleTap={(ds) => { setSelectedDate(ds); setCalDaySelected(true); openAdd(ds); }}
                  />
                ) : (
              <ScrollView
                ref={calScrollRef}
                horizontal pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onMomentumScrollEnd={(e) => {
                  if (isSwipingCal.current) return;
                  const page = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                  if (page === 0) {
                    // 前月
                    isSwipingCal.current = true;
                    setCurrentCalDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
                    setTimeout(() => {
                      calScrollRef.current?.scrollTo({ x: screenWidth, animated: false });
                      isSwipingCal.current = false;
                    }, 50);
                  } else if (page === 2) {
                    // 次月
                    isSwipingCal.current = true;
                    setCurrentCalDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
                    setTimeout(() => {
                      calScrollRef.current?.scrollTo({ x: screenWidth, animated: false });
                      isSwipingCal.current = false;
                    }, 50);
                  }
                }}
                contentOffset={{ x: screenWidth, y: 0 }}
                style={{ flexGrow: 0, height: maxCalRows * 52 }}
              >

                {[-1, 0, 1].map(offset => {
                  const d = new Date(currentCalDate.getFullYear(), currentCalDate.getMonth() + offset, 1);
                  const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
                  return (
                    <View key={monthStr} style={{ width: screenWidth }}>
                      <Calendar
                        key={`cal-${isDark}-${monthStr}`}
                        current={monthStr}
                        markingType="multi-dot"
                        onDayPress={(day: { dateString?: string }) => { if (day?.dateString) { setSelectedDate(day.dateString); setCalDaySelected(true); } }}
                        firstDay={weekStart}
                        markedDates={markedDates}
                        hideArrows={true}
                        theme={{
                          todayTextColor: ACCENT,
                          selectedDayBackgroundColor: TDU_BLUE,
                          calendarBackground: C.calBg,
                          textSectionTitleColor: 'transparent',
                          dayTextColor: C.calText,
                          monthTextColor: 'transparent',
                          textMonthFontSize: 0.1,
                          textDayFontSize: 14,
                          textDayFontWeight: '300',
                          textDayHeaderFontSize: 0.1,
                          weekVerticalMargin: 2,
                          // @ts-ignore
                          'stylesheet.calendar.header': {
                            header: { height: 0, overflow: 'hidden', margin: 0, padding: 0 },
                            week: { height: 0, overflow: 'hidden', margin: 0, padding: 0 },
                            dayHeader: { height: 0, overflow: 'hidden', margin: 0, padding: 0 },
                            monthText: { height: 0, margin: 0, padding: 0 },
                          },
                        } as CalendarProps['theme']}
                        dayComponent={({ date, state }: { date?: DateData; state?: string }) => {
                          const ds = date?.dateString ?? '';
                          const items = dateCompanyMap[ds] || [];
                          const isSel = ds === selectedDate, isToday = ds === today;
                          const internBars = internshipPeriodsMap[ds] || [];
                          const dow = new Date(ds + 'T12:00:00').getDay(); // 0=Sun, 6=Sat
                          const isWeekRowStart = weekStart === 1 ? dow === 1 : dow === 0;
                          const isWeekRowEnd = weekStart === 1 ? dow === 0 : dow === 6;
                          return (
                            <TouchableOpacity
                              onPress={() => {
                                const now = Date.now();
                                const last = lastTapRef.current;
                                if (last.ds === ds && now - last.time < 400) {
                                  // ダブルタップ: 予定追加
                                  setSelectedDate(ds); setCalDaySelected(true);
                                  openAdd(ds);
                                  lastTapRef.current = { ds: '', time: 0 };
                                } else {
                                  setSelectedDate(ds); setCalDaySelected(true);
                                  lastTapRef.current = { ds, time: now };
                                }
                              }}
                              style={{ alignItems: 'center', width: '100%', minHeight: 44, position: 'relative' }}>
                              <View style={[
                                { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
                                isSel && { backgroundColor: TDU_BLUE },
                                isToday && !isSel && { borderWidth: 1.5, borderColor: ACCENT },
                              ]}>
                                <Text style={[{ fontSize: 12 },
                                (() => {
                                  if (isSel) return { color: '#fff', fontWeight: 'bold' };
                                  if (isToday) return { color: ACCENT, fontWeight: 'bold' };
                                  if (state === 'disabled') return { color: isDark ? '#3a3a3a' : '#d0d0d0' };
                                  const dow = new Date(ds).getDay();
                                  if (dow === 0) return { color: '#e74c3c' };
                                  if (dow === 6) return { color: '#4A90D9' };
                                  return { color: C.calText };
                                })(),
                                ]}>{date?.day ?? ""}</Text>
                              </View>
                              {/* インターン期間スパンバー */}
                              {internBars.slice(0, 1).map((bar, bi) => {
                                const capL = bar.isStart || isWeekRowStart;
                                const capR = bar.isEnd || isWeekRowEnd;
                                return (
                                  <View key={bi} style={{
                                    position: 'absolute', top: 28, height: 5,
                                    left: capL ? 23 : 0,
                                    right: capR ? 23 : 0,
                                    backgroundColor: bar.color + 'CC',
                                    borderTopLeftRadius: capL ? 3 : 0,
                                    borderBottomLeftRadius: capL ? 3 : 0,
                                    borderTopRightRadius: capR ? 3 : 0,
                                    borderBottomRightRadius: capR ? 3 : 0,
                                  }} />
                                );
                              })}
                              {items.slice(0, 2).map((item: Schedule, i: number) => {
                                const sc = item.calendarColor ?? statusColorOf(item.status);
                                const isSpan = !!(item.endDate && item.endDate > item.date);
                                const isStart = isSpan && ds === item.date;
                                const isEnd = isSpan && ds === item.endDate;
                                const capL = !isSpan || isStart || isWeekRowStart;
                                const capR = !isSpan || isEnd || isWeekRowEnd;
                                const label = isStart || !isSpan ? item.company : '';
                                return isSpan ? (
                                  <View key={i} style={{
                                    height: 12, marginTop: 2, alignSelf: 'stretch',
                                    marginHorizontal: capL && capR ? 0 : capL ? -2 : capR ? -2 : -2,
                                    backgroundColor: sc + '55',
                                    borderLeftWidth: capL ? 2 : 0,
                                    borderLeftColor: sc,
                                    borderTopLeftRadius: capL ? 3 : 0,
                                    borderBottomLeftRadius: capL ? 3 : 0,
                                    borderTopRightRadius: capR ? 3 : 0,
                                    borderBottomRightRadius: capR ? 3 : 0,
                                  }}>
                                    {label ? <Text style={[styles.calLabelText, { color: sc }]} numberOfLines={1}>{label}</Text> : null}
                                  </View>
                                ) : (
                                  <View key={i} style={[styles.calLabel, { backgroundColor: sc + '33', borderLeftColor: sc }]}>
                                    <Text style={[styles.calLabelText, { color: sc }]} numberOfLines={1}>{item.company}</Text>
                                  </View>
                                );
                              })}
                              {items.length > 2 && <Text style={styles.calMore}>+{items.length - 2}</Text>}
                            </TouchableOpacity>
                          );
                        }}
                      />
                    </View>
                  );
                })}
              </ScrollView>
                )}
              </ReAnimated.View>
            )}
            <View style={[styles.todoArea, { backgroundColor: C.bg }]}>
              {!calDaySelected ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 }}>
                    <Image source={require('./assets/icon_pin.png')} style={{ width: 20, height: 20 }} resizeMode="contain" />
                    <Text style={[styles.subTitle, { marginBottom: 0, color: C.text }]}>直近の予定</Text>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                    {upcomingSchedules.length === 0
                      ? <Text style={[styles.emptyText, { color: C.text3 }]}>直近の予定はありません</Text>
                      : upcomingSchedules.map(item => (
                        <TouchableOpacity key={item.id} style={[styles.upcomingCard, { backgroundColor: C.bg3 }]} onPress={() => openDetail(item)}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.itemTitle, { color: C.text }]}>{item.company}</Text>
                            <Text style={[styles.itemStatus, { color: C.text2 }]}>{item.date.replace(/-/g, '/')} {timeStr(item.hour, item.minute) ? timeStr(item.hour, item.minute) + '〜 · ' : ''}{item.status}</Text>
                          </View>
                          <View style={[styles.rankBadge, { backgroundColor: rankColor(item.rank) }]}>
                            <Text style={styles.rankText}>{item.rank}</Text>
                          </View>
                        </TouchableOpacity>
                      ))
                    }
                    <View style={{ height: 80 }} />
                  </ScrollView>
                </>
              ) : (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.subTitle, { color: C.text }]}>{selectedDate.replace(/-/g, '/')} の予定</Text>
                    <TouchableOpacity onPress={() => setCalDaySelected(false)}>
                      <Text style={{ color: '#999', fontSize: 11 }}>直近に戻る</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                    {filteredByDate.length === 0
                      ? <Text style={[styles.emptyText, { color: C.text3 }]}>この日の予定はありません</Text>
                      : filteredByDate.map(item => {
                        const sc = item.calendarColor ?? statusColorOf(item.status);
                        return (
                          <TouchableOpacity key={item.id}
                            style={[styles.itemCard, { borderLeftColor: sc, borderLeftWidth: 3, borderColor: C.border2, backgroundColor: C.bg }]}
                            onPress={() => openDetail(item)}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.itemTitle, { color: C.text }]}>{item.company}</Text>
                              <Text style={[styles.itemStatus, { color: C.text2 }]}>{timeStr(item.hour, item.minute) ? timeStr(item.hour, item.minute) + '〜 · ' : ''}{item.status}</Text>
                            </View>
                            <View style={[styles.rankBadge, { backgroundColor: rankColor(item.rank) }]}>
                              <Text style={styles.rankText}>{item.rank}</Text>
                            </View>
                            <Text style={styles.itemArrow}>〉</Text>
                          </TouchableOpacity>
                        );
                      })
                    }
                    <View style={{ height: 80 }} />
                  </ScrollView>
                </>
              )}
            </View>
            {/* カレンダータブのFAB */}
            <Pressable
              style={styles.fab}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openAdd(); countAction(); }}
              onPressIn={() => { fabScale.value = withSpring(0.85, { damping: 15, stiffness: 300 }); }}
              onPressOut={() => { fabScale.value = withSpring(1, { damping: 15, stiffness: 300 }); }}>
              <ReAnimated.Text style={[styles.fabText, fabScaleStyle]}>＋</ReAnimated.Text>
            </Pressable>
          </View>
        )}

        {activeTab === 'list' && (
          <View style={{ flex: 1 }}>
            {/* 検索バー */}
            <View style={[styles.searchBar, { backgroundColor: C.searchBg }]}>
              <Image source={ICONS.search} style={{ width: 14, height: 14, tintColor: C.text3, marginRight: 6 }} />
              <TextInput style={[styles.searchInput, { color: C.text }]} placeholder="企業名で検索..."
                value={searchQuery} onChangeText={setSearchQuery} clearButtonMode="while-editing" />
            </View>

            {/* ツールバー */}
            <View style={styles.listToolbar}>
              <TouchableOpacity
                style={[styles.filterBtn, isFilterActive && styles.filterBtnActive]}
                onPress={() => setFilterPanelVisible(v => !v)}>
                <Text style={[styles.filterBtnText, isFilterActive && { color: '#fff' }]}>
                  絞り込み{isFilterActive ? ` (${filterGenreIds.length + filterStatuses.length})` : ''}
                </Text>
              </TouchableOpacity>
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

            {/* 絞り込みパネル */}
            {filterPanelVisible && (
              <View style={styles.filterPanel}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={[styles.filterPanelTitle, { color: TDU_BLUE }]}>絞り込み（複数選択可）</Text>
                  <TouchableOpacity onPress={() => { setFilterGenreIds([]); setFilterStatuses([]); }}>
                    <Text style={{ fontSize: 11, color: '#e74c3c' }}>リセット</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.filterGroupLabel, { color: C.text2 }]}>業種</Text>
                <View style={styles.filterChipWrap}>
                  {genres.map(g => (
                    <TouchableOpacity key={g.id}
                      style={[styles.miniChip, { borderColor: g.color }, filterGenreIds.includes(g.id) && { backgroundColor: g.color }]}
                      onPress={() => toggleFilterGenre(g.id)}>
                      <Text style={[styles.miniChipText, { color: filterGenreIds.includes(g.id) ? '#fff' : g.color }]}>{g.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.filterGroupLabel, { marginTop: 10, color: C.text2 }]}>状況</Text>
                <View style={styles.filterChipWrap}>
                  {statusOptions.map(st => (
                    <TouchableOpacity key={st}
                      style={[styles.miniChip, filterStatuses.includes(st) && styles.miniChipActive]}
                      onPress={() => toggleFilterStatus(st)}>
                      <Text style={[styles.miniChipText, filterStatuses.includes(st) && { color: '#fff' }]}>{st}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <Text style={{ paddingHorizontal: 16, fontSize: 11, color: '#999', marginBottom: 4 }}>{filteredSorted.length}社</Text>

            {sortType === '手動' ? (
              <DraggableFlatList
                data={filteredSorted}
                keyExtractor={item => item.id}
                onDragEnd={({ data }) => {
                  const newIds = data.map(item => item.id);
                  setManualOrder(newIds);
                  AsyncStorage.setItem(MANUAL_ORDER_KEY, JSON.stringify(newIds)).catch(() => {});
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80 }}
                ListEmptyComponent={
                  <ReAnimated.View entering={FadeInDown.duration(400).springify()} style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
                    <Text style={{ fontSize: 44 }}>📭</Text>
                    <Text style={[styles.emptyText, { color: C.text3 }]}>企業を追加してみましょう</Text>
                  </ReAnimated.View>
                }
                renderItem={({ item, drag, isActive }: RenderItemParams<Schedule>) => {
                  const sc = statusColorOf(item.status);
                  const isInternal = item.status === '内定';
                  const isInactive = INACTIVE.includes(item.status);
                  const ns = nextStatus(item.status, !!(item.webTestType || item.webTestDeadline));
                  const cdLabel = countdownLabel(item.date);
                  return (
                    <ScaleDecorator activeScale={1.02}>
                      <SwipeableRow onDelete={() => deleteSchedule(item.id)}>
                        <AnimatedCard
                          style={[styles.listCard, {
                            backgroundColor: isDark ? (isInactive ? '#2a2a2a' : isInternal ? '#2d0a0a' : C.card) : statusCardColor(item.status),
                            borderColor: isActive ? ACCENT : (isDark ? C.border : statusCardBorder(item.status)),
                          }]}
                          onPress={() => openDetail(item)}>
                          <View style={[styles.genreBand, { backgroundColor: sc }]} />
                          <View style={{ flex: 1, paddingLeft: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={[styles.rankBadge, { backgroundColor: rankColor(item.rank) }]}>
                                <Text style={styles.rankText}>{item.rank}</Text>
                              </View>
                              <HighlightText text={item.company + (isInternal ? ' 🌸' : '')} query={searchQuery} style={[styles.itemTitle, { color: isInactive ? '#888' : C.text, flex: 1 }]} />
                              {conflictIds.has(item.id) && <View style={{ backgroundColor: DANGER, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>日程重複</Text>
                              </View>}
                              {cdLabel && <View style={{ backgroundColor: cdLabel === '今日' ? DANGER : '#f39c12', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{cdLabel}</Text>
                              </View>}
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={styles.dateText}>{item.date ? dateRangeStr(item) + (timeStr(item.hour, item.minute) ? ' ' + timeStr(item.hour, item.minute) + '〜' : '') : '日付未定'}</Text>
                            </View>
                            {item.note ? <Text style={styles.notePreview} numberOfLines={1}>📝 {item.note}</Text> : null}
                            {!isInactive && <MiniStepper status={item.status} statusColors={statusColors} isDark={isDark} animTrigger={advanceAnimMap[item.id] ?? 0} />}
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 6 }}>
                            <TouchableOpacity onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); drag(); }} delayLongPress={200} style={{ padding: 4 }}>
                              <Text style={{ color: isDark ? '#555' : '#bbb', fontSize: 16 }}>⋮⋮</Text>
                            </TouchableOpacity>
                            <View style={[styles.statusBadge, { backgroundColor: sc }, isInactive && { backgroundColor: '#aaa' }]}>
                              <Text style={styles.statusBadgeText}>{item.status}</Text>
                            </View>
                          </View>
                        </AnimatedCard>
                      </SwipeableRow>
                    </ScaleDecorator>
                  );
                }}
              />
            ) : (
            <Animated.ScrollView style={{ flex: 1, paddingHorizontal: 16, opacity: listFadeAnim }}>
              {filteredSorted.length === 0
                ? (
                  <ReAnimated.View entering={FadeInDown.duration(400).springify()} style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
                    <Text style={{ fontSize: 44 }}>📭</Text>
                    <Text style={[styles.emptyText, { color: C.text3 }]}>
                      {isFilterActive || searchQuery.trim() ? '該当する企業がありません' : '企業を追加してみましょう'}
                    </Text>
                    {(isFilterActive || searchQuery.trim()) && (
                      <Text style={{ fontSize: 12, color: C.text3 }}>検索条件を変えてみてください</Text>
                    )}
                  </ReAnimated.View>
                )
                : filteredSorted.map((item, index) => {
                  const sc = statusColorOf(item.status);
                  const isInternal = item.status === '内定';
                  const isInactive = INACTIVE.includes(item.status);
                  const ns = nextStatus(item.status, !!(item.webTestType || item.webTestDeadline));
                  const cdLabel = countdownLabel(item.date);
                  return (
                    <ReAnimated.View
                      key={item.id}
                      entering={FadeInDown.delay(Math.min(index * 80, 480)).springify()}
                      exiting={FadeOutLeft.duration(200)}
                      layout={LinearTransition.springify()}>
                    <SwipeableRow onDelete={() => deleteSchedule(item.id)}>
                      <AnimatedCard
                        style={[styles.listCard, {
                          backgroundColor: isDark ? (isInactive ? '#2a2a2a' : isInternal ? '#2d0a0a' : C.card) : statusCardColor(item.status),
                          borderColor: isDark ? C.border : statusCardBorder(item.status)
                        }]}
                        onPress={() => openDetail(item)}>
                        <View style={[styles.genreBand, { backgroundColor: sc }]} />
                        <View style={{ flex: 1, paddingLeft: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={[styles.rankBadge, { backgroundColor: rankColor(item.rank) }]}>
                              <Text style={styles.rankText}>{item.rank}</Text>
                            </View>
                            <HighlightText
                              text={item.company + (isInternal ? ' 🌸' : '')}
                              query={searchQuery}
                              style={[styles.itemTitle, { color: isInactive ? '#888' : C.text, flex: 1 }]}
                            />
                            {conflictIds.has(item.id) && <View style={{ backgroundColor: DANGER, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>日程重複</Text>
                              </View>}
                              {cdLabel && <View style={{ backgroundColor: cdLabel === '今日' ? DANGER : '#f39c12', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{cdLabel}</Text>
                            </View>}
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={styles.dateText}>{item.date ? dateRangeStr(item) + (timeStr(item.hour, item.minute) ? ' ' + timeStr(item.hour, item.minute) + '〜' : '') : '日付未定'}</Text>
                            {item.userId ? (
                              <TouchableOpacity onPress={() => { Clipboard.setString(item.userId); Alert.alert('コピー', 'IDをコピーしました'); }}
                                style={{ backgroundColor: '#e8f0fe', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 10, color: ACCENT, fontWeight: 'bold' }}>IDコピー</Text>
                              </TouchableOpacity>
                            ) : null}
                            {item.password ? (
                              <TouchableOpacity onPress={() => { Clipboard.setString(item.password); Alert.alert('コピー', 'PWをコピーしました'); }}
                                style={{ backgroundColor: '#fde8f0', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 10, color: '#c0392b', fontWeight: 'bold' }}>PWコピー</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                          {item.url ? (
                            <TouchableOpacity
                              style={styles.urlChip}
                              onPress={() => Linking.openURL(item.url.startsWith('http') ? item.url : 'https://' + item.url)}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Image source={ICONS.externalLink} style={{ width: 11, height: 11, tintColor: ACCENT }} />
                                <Text style={styles.urlChipText}>開く</Text>
                              </View>
                            </TouchableOpacity>
                          ) : null}
                          {item.note ? <Text style={styles.notePreview} numberOfLines={1}>📝 {item.note}</Text> : null}
                          {!isInactive && <MiniStepper status={item.status} statusColors={statusColors} isDark={isDark} animTrigger={advanceAnimMap[item.id] ?? 0} />}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <View style={[styles.statusBadge, { backgroundColor: sc },
                          isInactive && { backgroundColor: '#aaa' }]}>
                            <Text style={styles.statusBadgeText}>{item.status}</Text>
                          </View>
                          {ns && !isInactive ? (
                            <RippleButton
                              style={[styles.nextStatusBtn, { borderColor: sc }]}
                              onPress={() => advanceStatus(item)}>
                              <Text style={[styles.nextStatusBtnText, { color: sc }]} numberOfLines={1}>{
                                ns === 'インターン面接' ? '面接→' :
                                ns === 'インターン確定' ? '参加確定→' :
                                ns + ' →'
                              }</Text>
                            </RippleButton>
                          ) : null}
                          {EVENT_STATUSES.includes(item.status) && !isInactive ? (
                            <RippleButton
                              style={[styles.nextStatusBtn, { borderColor: NEUTRAL_GRAY }]}
                              onPress={() => completeStatus(item)}>
                              <Text style={[styles.nextStatusBtnText, { color: NEUTRAL_GRAY }]}>完了 →</Text>
                            </RippleButton>
                          ) : null}
                          {/* 辞退を決めたのに連絡できていない企業を目立たせる */}
                          {item.status === '内定辞退' && !item.declineContacted ? (
                            <RippleButton
                              style={[styles.nextStatusBtn, { borderColor: DANGER, backgroundColor: DANGER + '14' }]}
                              onPress={() => markDeclineContacted(item)}>
                              <Text style={[styles.nextStatusBtnText, { color: DANGER }]} numberOfLines={1}>連絡済にする</Text>
                            </RippleButton>
                          ) : null}
                        </View>
                      </AnimatedCard>
                    </SwipeableRow>
                    </ReAnimated.View>
                  );
                })
              }
              <View style={{ height: 80 }} />
            </Animated.ScrollView>
            )}
            <Pressable
              style={styles.fab}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openAdd(); countAction(); }}
              onPressIn={() => { fabScale.value = withSpring(0.85, { damping: 15, stiffness: 300 }); }}
              onPressOut={() => { fabScale.value = withSpring(1, { damping: 15, stiffness: 300 }); }}>
              <ReAnimated.Text style={[styles.fabText, fabScaleStyle]}>＋</ReAnimated.Text>
            </Pressable>
          </View>
        )}

        {/* ── 設定タブ ── */}
        {activeTab === 'settings' && (
          <ScrollView style={{ flex: 1, padding: 20, backgroundColor: C.bg }}>
            {/* 統計ダッシュボード */}
            <View style={{ backgroundColor: isDark ? '#1a2a3a' : '#eaf2ff', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: isDark ? '#2a3a4a' : '#c8ddf7' }}>
              <Text style={{ fontSize: 12, color: ACCENT, fontWeight: 'bold', marginBottom: 12 }}>就活ダッシュボード</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 28, fontWeight: 'bold', color: C.text }}>{activeCount}</Text>
                  <Text style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>応募中</Text>
                </View>
                <View style={{ width: 1, backgroundColor: isDark ? '#2a3a4a' : '#c8ddf7' }} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#E91E8C' }}>{internalCount}</Text>
                  <Text style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>内定</Text>
                </View>
                <View style={{ width: 1, backgroundColor: isDark ? '#2a3a4a' : '#c8ddf7' }} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 28, fontWeight: 'bold', color: passRate !== null ? (passRate >= 50 ? '#27AE60' : '#E67E22') : C.text3 }}>
                    {passRate !== null ? `${passRate}%` : '-'}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>通過率</Text>
                </View>
              </View>
            </View>

            <Text style={styles.settingSection}>ジャンル管理</Text>
            {(showAllGenres ? genres : genres.slice(0, 5)).map(g => (
              <TouchableOpacity key={g.id} style={[styles.genreRow, { borderColor: C.border2 }]} onPress={() => openEditGenre(g)}>
                <View style={[styles.genreColorDot, { backgroundColor: g.color }]} />
                <Text style={[styles.settingLabel, { color: C.text }]}>{g.name}</Text>
                <Text style={{ color: '#ccc' }}>›</Text>
              </TouchableOpacity>
            ))}
            {genres.length > 5 && (
              <TouchableOpacity onPress={() => setShowAllGenres(v => !v)} style={{ paddingVertical: 8, alignItems: 'center' }}>
                <Text style={{ color: ACCENT, fontSize: 13 }}>
                  {showAllGenres ? '▲ 閉じる' : `▼ もっと見る（残り${genres.length - 5}件）`}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.outlineButton, { borderColor: ACCENT }]} onPress={() => openAddGenre()}>
              <Text style={[styles.outlineButtonText, { color: ACCENT }]}>+ ジャンルを追加</Text>
            </TouchableOpacity>

            <Text style={[styles.settingSection, { marginTop: 28 }]}>ステータス管理</Text>
            {(showAllStatuses ? statusOptions : statusOptions.slice(0, 5)).map((st, idx) => {
              const sc = statusColors[st] ?? '#95A5A6';
              const isFixed = DEFAULT_STATUS_OPTIONS.includes(st);
              return (
                <TouchableOpacity key={st} style={[styles.genreRow, { borderColor: C.border2 }]} onPress={() => {
                  setEditGenre({ id: st, name: st, color: sc });
                  setGenreName(st); setGenreColor(sc); setGenreModalVisible(true);
                }}>
                  <View style={[styles.genreColorDot, { backgroundColor: sc }]} />
                  <Text style={[styles.settingLabel, { color: C.text }]}>{st}</Text>
                  <Text style={{ color: '#ccc' }}>›</Text>
                  {!isFixed && (
                    <TouchableOpacity style={{ paddingHorizontal: 8, paddingVertical: 4 }} onPress={(e) => {
                      e.stopPropagation();
                      Alert.alert('削除', `「${st}」を削除しますか？`, [
                        { text: 'キャンセル', style: 'cancel' },
                        { text: '削除', style: 'destructive', onPress: () => saveStatusOptions(statusOptions.filter(s => s !== st)) },
                      ]);
                    }}>
                      <Text style={{ color: '#e74c3c', fontSize: 12 }}>削除</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
            {statusOptions.length > 5 && (
              <TouchableOpacity onPress={() => setShowAllStatuses(v => !v)} style={{ paddingVertical: 8, alignItems: 'center' }}>
                <Text style={{ color: ACCENT, fontSize: 13 }}>
                  {showAllStatuses ? '▲ 閉じる' : `▼ もっと見る（残り${statusOptions.length - 5}件）`}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.outlineButton, { marginTop: 8, borderColor: ACCENT }]}
              onPress={() => { setNewStatusName(''); setAddStatusModal(true); }}>
              <Text style={[styles.outlineButtonText, { color: ACCENT }]}>+ ステータスを追加</Text>
            </TouchableOpacity>


            <Text style={[styles.settingSection, { marginTop: 28 }]}>カレンダー設定</Text>
            <View style={[styles.settingRow, { borderColor: C.border2 }]}>
              <Text style={[styles.settingLabel, { color: C.text }]}>週の始まり</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[{ label: '日曜', v: 0 }, { label: '月曜', v: 1 }].map(opt => (
                  <TouchableOpacity key={opt.v}
                    style={[styles.sortChip, { backgroundColor: C.bg2 }, weekStart === opt.v && { backgroundColor: ACCENT }]}
                    onPress={async () => {
                      setWeekStart(opt.v);
                      await AsyncStorage.setItem('@week_start', JSON.stringify(opt.v));
                      await syncWidgetWeekStart(opt.v);
                    }}>
                    <Text style={[styles.sortChipText, weekStart === opt.v && { color: '#fff' }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={[styles.settingSection, { marginTop: 28 }]}>通知テスト</Text>
            <View style={[styles.settingRow, { borderColor: C.border2, flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
              <Text style={{ color: C.text2, fontSize: 13 }}>5秒後にテスト通知を送信します</Text>
              <TouchableOpacity
                style={[styles.outlineButton, { marginTop: 0, alignSelf: 'flex-start', paddingHorizontal: 20, borderColor: ACCENT }]}
                onPress={async () => {
                  try {
                    const { status } = await Notifications.requestPermissionsAsync();
                    if (status !== 'granted') { Alert.alert('通知権限が必要です', '設定アプリで通知を許可してください'); return; }
                    await Notifications.scheduleNotificationAsync({
                      identifier: 'test_notif_' + Date.now(),
                      content: {
                        title: 'テスト通知',
                        body: '就活管理アプリからのリマインド通知が正常に届いています',
                        sound: true,
                      },
                      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, repeats: false },
                    });
                    Alert.alert('送信完了', '5秒後に通知が届きます。アプリをバックグラウンドにしてお待ちください。');
                  } catch (e) { Alert.alert('エラー', '通知の送信に失敗しました: ' + String(e)); }
                }}>
                <Text style={[styles.outlineButtonText, { color: ACCENT }]}>テスト通知を送る</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.settingSection, { marginTop: 28 }]}>データ管理</Text>
            {/* ⑭ CSV エクスポート */}
            <TouchableOpacity style={[styles.outlineButton, { marginBottom: 12, borderColor: ACCENT }]} onPress={() => {
              const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
              const header = '企業名,ステータス,日付,時間,志望度,ジャンル,メモ\n';
              const rows = schedules.map(s => {
                const genreName = genres.find(g => g.id === s.genreId)?.name ?? '';
                return [
                  escape(s.company),
                  escape(s.status),
                  escape(s.date),
                  escape(s.hour && s.minute ? `${s.hour}:${s.minute}` : ''),
                  escape(s.rank),
                  escape(genreName),
                  escape(s.note),
                ].join(',');
              }).join('\n');
              Clipboard.setString(header + rows);
              Alert.alert('コピー完了', `${schedules.length}社のデータをクリップボードにコピーしました。\nスプレッドシートに貼り付けてください。`);
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Image source={ICONS.checklist} style={{ width: 14, height: 14, tintColor: ACCENT }} resizeMode="contain" />
                <Text style={[styles.outlineButtonText, { color: ACCENT }]}>CSVをクリップボードにコピー</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dangerButton} onPress={() => {
              Alert.alert('全データ削除', '全ての企業データを削除しますか？', [
                { text: 'キャンセル', style: 'cancel' },
                { text: '削除', style: 'destructive', onPress: async () => { await saveSchedules([]); } },
              ]);
            }}>
              <Text style={styles.dangerButtonText}>全データを削除する</Text>
            </TouchableOpacity>
            {/* ヘルプ */}
            <Text style={[styles.settingSection, { marginTop: 28 }]}>ヘルプ・使い方</Text>
            {([
              {
                icon: ICONS.calendar,
                title: 'カレンダーの使い方',
                body: [
                  '• 日付をタップ → その日の予定を表示',
                  '• 日付をダブルタップ → その日付で新規登録',
                  '• 左右スワイプ → 月を移動',
                  '• 左上の年月をタップ → 年月ピッカーを開く',
                  '• 「直近に戻る」で直近10件の予定を表示',
                ],
              },
              {
                icon: ICONS.company,
                title: '企業の登録・編集',
                body: [
                  '• 画面右下の「＋」ボタンで新規登録',
                  '• 企業名・ステータス・日程・志望度などを入力',
                  '• 登録後はカード長押しで削除、左スワイプでも削除可',
                  '• 詳細画面から内容を編集できます',
                  '• 日付なしでも登録できます（日付未定として管理）',
                ],
              },
              {
                icon: ICONS.checklist,
                title: '持ち駒欄の使い方',
                body: [
                  '• 同名企業は最高ステータスの1件だけ表示されます',
                  '• 「→」ボタンでステータスを次のステップに進められます',
                  '• 左スワイプで削除ボタンが出ます',
                  '• 上部のバーで検索・絞り込み・並び替えができます',
                  '• ▼ フィルターアイコンで業種・ステータスの絞り込み',
                ],
              },
              {
                icon: ICONS.bell,
                title: '通知設定',
                body: [
                  '• 設定タブ → 通知設定でリマインダーのON/OFFを切り替え',
                  '• 企業の詳細編集 → 通知設定で個別に何日前に通知するか指定できます',
                  '• 「テスト通知を送る」で動作確認ができます',
                  '• 通知が届かない場合はスマホの通知許可を確認してください',
                ],
              },
              {
                icon: ICONS.reload,
                title: '企業の重複と同名登録',
                body: [
                  '• 同じ企業名・同じステータスで新規登録 → 古いエントリが自動削除（置換）',
                  '• 同じ企業名・異なるステータスで新規登録 → カレンダーに両方表示',
                  '• 持ち駒欄では常に最高ステータスの1件のみ表示',
                  '• 例：1次面接（3/1）と2次面接（3/15）は両方カレンダーに残ります',
                ],
              },
              {
                icon: ICONS.memo,
                title: 'メモ機能',
                body: [
                  '• 企業詳細のメモタブに4種類のメモを記録できます',
                  '　全般：面接内容・感想など',
                  '　企業研究：事業内容・強み・競合など',
                  '　自己PR：ガクチカ・志望動機・強み弱みなど',
                  '　質問リスト：逆質問・聞くことのメモ',
                  '• 内定承諾期限はステータスが「内定」の時に設定できます',
                ],
              },
              {
                icon: ICONS.upload,
                title: 'データ管理',
                body: [
                  '• 設定 → データ管理 →「CSVをクリップボードにコピー」でデータをエクスポート',
                  '• CSVはスプレッドシート（Excel / Google スプレッドシート）に貼り付けられます',
                  '• 含まれる項目：企業名・ステータス・日付・時間・志望度・ジャンル・メモ',
                  '• 「全データを削除する」は元に戻せないので注意してください',
                ],
              },
            ] as { icon: ImageSourcePropType; title: string; body: string[] }[]).map((item, i) => (
              <View key={i} style={{ borderBottomWidth: 0.5, borderBottomColor: C.border2 }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 }}
                  onPress={() => setOpenHelpItem(openHelpItem === i ? null : i)}
                  activeOpacity={0.7}>
                  <Image source={item.icon} style={{ width: 16, height: 16, tintColor: C.text3, marginRight: 8 }} resizeMode="contain" />
                  <Text style={{ fontSize: 13, fontWeight: '500', color: C.text, flex: 1 }}>{item.title}</Text>
                  <Text style={{ fontSize: 12, color: C.text3, marginLeft: 8 }}>{openHelpItem === i ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {openHelpItem === i && (
                  <View style={{ paddingBottom: 14, paddingHorizontal: 4, gap: 5 }}>
                    {item.body.map((line, j) => (
                      <Text key={j} style={{ fontSize: 12, color: C.text2, lineHeight: 19 }}>{line}</Text>
                    ))}
                  </View>
                )}
              </View>
            ))}

            {/* 設定タブバナー広告 */}
            {!adFree && (
              <View style={{ alignItems: 'center', marginTop: 20 }}>
                <BannerAd
                  unitId={AD_UNIT_ID}
                  size={BannerAdSize.BANNER}
                  requestOptions={{ requestNonPersonalizedAdsOnly: true }}
                />
              </View>
            )}

            {/* 開発者を支援 */}
            <Text style={[styles.settingSection, { marginTop: 24 }]}>開発者を支援する</Text>
            <TouchableOpacity
              style={[styles.supportBtn, { backgroundColor: isDark ? '#1c2333' : '#e8f0fe', borderColor: isDark ? '#6ea8fe' : TDU_BLUE }]}
              onPress={showRewardedAd}
            >
              <Text style={{ fontSize: 20 }}>🎬</Text>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.supportBtnTitle, { color: isDark ? '#6ea8fe' : TDU_BLUE }]}>30秒広告を見て応援する</Text>
                <Text style={[styles.supportBtnSub, { color: C.text2 }]}>就活Tipsをランダムで1つプレゼント🎁</Text>
              </View>
              <Text style={{ fontSize: 18 }}>▶</Text>
            </TouchableOpacity>
            {/* 広告削除購入 近日公開 */}
            <View style={[styles.supportBtn, { backgroundColor: isDark ? '#1c2333' : '#f5f5f5', borderColor: isDark ? '#444' : '#ccc', marginTop: 10, opacity: 0.6 }]}>
              <Text style={{ fontSize: 20 }}>✨</Text>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.supportBtnTitle, { color: C.text2 }]}>広告を削除する</Text>
                <Text style={[styles.supportBtnSub, { color: C.text2 }]}>近日公開</Text>
              </View>
            </View>

            <View style={[styles.aboutBox, { backgroundColor: C.bg2, marginTop: 24 }]}>
              <Text style={[styles.aboutText, { color: C.text2 }]}>就活管理リマインダー v1.2.0</Text>
            </View>
          </ScrollView>
        )}


        {/* チュートリアルモーダル */}
        <TutorialModal visible={firstLaunchModal} onClose={() => setFirstLaunchModal(false)} isDark={isDark} C={C} />

        {/* 内定おめでとう！広告オファーモーダル */}
        <Modal visible={offerModalVisible} transparent animationType="fade" onRequestClose={() => setOfferModalVisible(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: C.bg, borderRadius: 20, padding: 24, width: '90%', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 36 }}>🎉</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: isDark ? '#6ea8fe' : TDU_BLUE }}>内定おめでとうございます！</Text>
              <Text style={{ fontSize: 14, color: C.text2, textAlign: 'center' }}>{pendingInternalCompany}の内定、本当におめでとうございます！</Text>
              <Text style={{ fontSize: 13, color: C.text2, textAlign: 'center', marginTop: 4 }}>広告を見て開発者を応援しますか？{'\n'}就活Tipsを1つプレゼントします🎁</Text>
              <TouchableOpacity
                style={{ backgroundColor: isDark ? '#1c2333' : TDU_BLUE, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, width: '100%', alignItems: 'center', marginTop: 8 }}
                onPress={() => { setOfferModalVisible(false); setTimeout(showRewardedAd, 300); }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>▶ 広告を見てTipsをもらう</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setOfferModalVisible(false)}>
                <Text style={{ color: C.text2, fontSize: 13, marginTop: 4 }}>スキップ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* リワード Tips表示モーダル */}
        <Modal visible={!!rewardedTip} transparent animationType="slide" onRequestClose={() => setRewardedTip(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', padding: 0 }}>
            <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, gap: 12 }}>
              <Text style={{ fontSize: 13, color: isDark ? '#6ea8fe' : ACCENT, fontWeight: 'bold' }}>🎁 就活Tips</Text>
              <Text style={{ fontSize: 17, fontWeight: 'bold', color: C.text }}>{rewardedTip?.title}</Text>
              <Text style={{ fontSize: 14, color: C.text2, lineHeight: 22 }}>{rewardedTip?.content}</Text>
              <TouchableOpacity
                style={{ backgroundColor: isDark ? '#1c2333' : TDU_BLUE, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 }}
                onPress={() => setRewardedTip(null)}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>閉じる</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ステータス追加モーダル */}
        <Modal visible={addStatusModal} transparent animationType="fade" onRequestClose={() => setAddStatusModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setAddStatusModal(false)} />
            <View style={{ backgroundColor: C.bg, borderRadius: 16, padding: 24, width: '80%', gap: 12 }} onStartShouldSetResponder={() => true}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.text }}>ステータスを追加</Text>
              <TextInput
                style={[styles.input, { backgroundColor: C.inputBg, color: C.text }]}
                placeholder="例: 最終選考"
                value={newStatusName}
                onChangeText={setNewStatusName}
                autoFocus
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                <TouchableOpacity onPress={() => setAddStatusModal(false)}>
                  <Text style={{ color: C.text2, fontSize: 15 }}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ backgroundColor: TDU_BLUE, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 }}
                  onPress={() => {
                    const name = newStatusName.trim();
                    if (name && !statusOptions.includes(name)) saveStatusOptions([...statusOptions, name]);
                    setAddStatusModal(false);
                  }}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>追加</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* 年月ピッカーModal */}
        <Modal visible={datePickerVisible} transparent animationType="fade" onRequestClose={() => setDatePickerVisible(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setDatePickerVisible(false)} />
            <View style={{ backgroundColor: C.bg, borderRadius: 20, padding: 24, width: '80%' }} onStartShouldSetResponder={() => true}>
              <Text style={{ fontSize: 15, fontWeight: 'bold', color: C.text, marginBottom: 16, textAlign: 'center' }}>年・月を選択</Text>
              {/* 年選択 */}
              <Text style={{ fontSize: 11, color: C.text3, marginBottom: 8, letterSpacing: 1 }}>YEAR</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map(dpYr => (
                    <TouchableOpacity key={dpYr}
                      style={{
                        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
                        backgroundColor: datePickerYear === dpYr ? TDU_BLUE : C.bg2,
                        borderWidth: 1, borderColor: datePickerYear === dpYr ? TDU_BLUE : C.border
                      }}
                      onPress={() => setDatePickerYear(dpYr)}>
                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: datePickerYear === dpYr ? '#fff' : C.text }}>{dpYr}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              {/* 月選択 */}
              <Text style={{ fontSize: 11, color: C.text3, marginBottom: 8, letterSpacing: 1 }}>MONTH</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {Array.from({ length: 12 }, (_, i) => i).map(dpMon => (
                  <TouchableOpacity key={dpMon}
                    style={{
                      width: 58, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                      backgroundColor: datePickerMonth === dpMon ? TDU_BLUE : C.bg2,
                      borderWidth: 1, borderColor: datePickerMonth === dpMon ? TDU_BLUE : C.border
                    }}
                    onPress={() => setDatePickerMonth(dpMon)}>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: datePickerMonth === dpMon ? '#fff' : C.text }}>{dpMon + 1}月</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={{ marginTop: 20, backgroundColor: TDU_BLUE, padding: 14, borderRadius: 12, alignItems: 'center' }}
                onPress={() => {
                  const d = new Date(datePickerYear, datePickerMonth, 1);
                  setCurrentCalDate(d);
                  setDatePickerVisible(false);
                }}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>この月に移動</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* タブバー */}
        <View style={[styles.tabBar, { backgroundColor: C.tabBar, borderTopColor: C.border }]}
          onLayout={(e) => { setScreenWidth(e.nativeEvent.layout.width); }}>
          {(['calendar', 'list', 'settings'] as TabType[]).map((tab, i) => {
            const imgSrcs = [
              require('./assets/tab_calendar.png'),
              require('./assets/tab_list.png'),
              require('./assets/tab_settings.png'),
            ];
            const labels = ['カレンダー', '持ち駒', '設定'];
            const isActive = activeTab === tab;
            const activeColor = isDark ? '#6ea8fe' : TDU_BLUE;
            return (
              <TabBarButton
                key={tab}
                icon={imgSrcs[i]}
                label={labels[i]}
                isActive={isActive}
                activeColor={activeColor}
                inactiveColor={isDark ? '#6e7681' : '#aaa'}
                onPress={() => {
                  if (!isActive) Haptics.selectionAsync();
                  setActiveTab(tab); setBannerKey(k => k + 1); countAction();
                }}
              />
            );
          })}
        </View>

        {/* ── 企業登録/編集モーダル ── */}
        <Modal visible={isModalVisible || isDetailVisible} animationType="none" transparent onRequestClose={closeModal} onShow={() => {
          modalScrollY.current = 0;
          modalTranslateY.setValue(600);
          Animated.spring(modalTranslateY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
        }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => closeModal()} activeOpacity={1} />
            <Animated.View style={[styles.modalContent, { backgroundColor: C.bg, transform: [{ translateY: modalTranslateY }] }]}>
              <View style={styles.dragHandleContainer} {...modalPanResponder.panHandlers}>
                <View style={styles.dragHandleBar} />
              </View>
              <ScrollView ref={modalScrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" onScroll={(e) => { modalScrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: C.text }]}>{isDetailVisible ? '詳細・編集' : '新規企業登録'}</Text>
                  {isDetailVisible && (
                    <TouchableOpacity onPress={() => deleteSchedule(selectedItem!.id)}>
                      <Text style={styles.deleteText}>削除</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {isDetailVisible && (
                  <StatusStepper status={selStatus} statusColors={statusColors} isDark={isDark} />
                )}

                <Text style={[styles.label, { color: C.text3 }]}>企業名 *</Text>
                <View style={{ position: 'relative', zIndex: 10 }}>
                  <TextInput
                    style={[styles.input, { backgroundColor: C.inputBg, color: C.text }]}
                    placeholder="例：株式会社〇〇"
                    value={companyName}
                    onChangeText={handleCompanyNameChange}
                    returnKeyType="done"
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  />
                  {showSuggestions && (
                    <View style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.text3, borderRadius: 6, zIndex: 20, maxHeight: 200, overflow: 'hidden' }}>
                      <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled>
                        {suggestions.map((item, idx) => (
                          <TouchableOpacity
                            key={idx}
                            style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: idx < suggestions.length - 1 ? 1 : 0, borderBottomColor: C.text3 + '40' }}
                            onPress={() => {
                              setCompanyName(item.n);
                              setSuggestions([]);
                              setShowSuggestions(false);
                            }}
                          >
                            <Text style={{ color: C.text }}>{item.n}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                <Text style={[styles.label, { color: C.text3 }]}>ジャンル</Text>
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

                <Text style={[styles.label, { color: C.text3 }]}>志望度</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {RANK_OPTIONS.map(r => (
                    <TouchableOpacity key={r}
                      style={[styles.rankOption, { backgroundColor: rank === r ? rankColor(r) : '#f0f2f5' }]}
                      onPress={() => setRank(r)}>
                      <Text style={{ color: rank === r ? '#fff' : '#666', fontWeight: 'bold', fontSize: 14 }}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.label, { color: C.text3 }]}>選考ステータス</Text>
                <View style={styles.statusContainer}>
                  {statusOptions.map(opt => {
                    const sc = statusColors[opt] ?? '#95A5A6';
                    const isSel = selStatus === opt;
                    return (
                      <RippleButton key={opt}
                        style={[styles.statusOption,
                        {
                          borderWidth: 1.5, borderColor: isSel ? sc : 'transparent',
                          backgroundColor: isSel ? sc + '22' : CHIP_BG
                        }]}
                        onPress={() => { Haptics.selectionAsync(); setSelStatus(opt); }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: sc }} />
                          <Text style={[styles.statusOptionText, { color: isSel ? sc : C.text2 }]}>{opt}</Text>
                        </View>
                      </RippleButton>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 2 }}>
                    <Text style={[styles.label, { color: C.text3 }]}>日付</Text>
                    <WheelDateField value={selDate} onChange={setSelDate} C={C} placeholder="日付なし" />
                    <WheelDateField
                      label="終了日" value={selEndDate} onChange={setSelEndDate} C={C}
                      placeholder="終了日なし"
                      minimumDate={selDate ? parseYmd(selDate) : undefined}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: C.text3 }]}>時間</Text>
                    <WheelTimeField
                      hour={selHour} minute={selMinute}
                      onChange={(h, m) => { setSelHour(h); setSelMinute(m); }}
                      C={C}
                    />
                  </View>
                </View>

                {/* 会場（一次はWeb・最終は対面のように段階で変わる） */}
                <Text style={[styles.label, { color: C.text3 }]}>実施形式</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                  {([
                    { v: undefined, label: '未設定' },
                    { v: 'online' as const, label: 'オンライン' },
                    { v: 'onsite' as const, label: '対面' },
                  ]).map(opt => {
                    const active = selVenueType === opt.v;
                    return (
                      <RippleButton key={opt.label}
                        style={[styles.statusOption, { backgroundColor: active ? TDU_BLUE : C.bg3 }]}
                        onPress={() => setSelVenueType(opt.v)}>
                        <Text style={{ fontSize: 12, fontWeight: active ? 'bold' : 'normal', color: active ? '#fff' : C.text2 }}>
                          {opt.label}
                        </Text>
                      </RippleButton>
                    );
                  })}
                </View>
                {selVenueType === 'online' && (
                  <View style={styles.copyRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: C.inputBg, color: C.text }]}
                      placeholder="接続URL（Zoom / Teams 等）" placeholderTextColor="#aaa"
                      value={meetingUrl} onChangeText={setMeetingUrl} autoCapitalize="none" keyboardType="url" />
                    {meetingUrl ? (
                      <TouchableOpacity style={styles.copyBtn}
                        onPress={() => { Clipboard.setString(meetingUrl); Alert.alert('コピーしました', '接続URLをコピーしました'); }}>
                        <Image source={ICONS.checklist} style={{ width: 16, height: 16, tintColor: TDU_BLUE }} resizeMode="contain" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
                {selVenueType === 'onsite' && (
                  <TextInput
                    style={[styles.input, { backgroundColor: C.inputBg, color: C.text }]}
                    placeholder="会場・最寄駅（例: 本社ビル / 東京駅）" placeholderTextColor="#aaa"
                    value={venue} onChangeText={setVenue} />
                )}

                {/* Webテスト（ES締切とは別軸の期限） */}
                <Text style={[styles.label, { color: C.text3 }]}>Webテスト</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  {WEB_TEST_TYPES.map(t => {
                    const active = webTestType === t;
                    return (
                      <RippleButton key={t}
                        style={[styles.statusOption, { backgroundColor: active ? TDU_BLUE : C.bg3 }]}
                        onPress={() => setWebTestType(active ? '' : t)}>
                        <Text style={{ fontSize: 11, fontWeight: active ? 'bold' : 'normal', color: active ? '#fff' : C.text2 }}>{t}</Text>
                      </RippleButton>
                    );
                  })}
                </View>
                {(webTestType || webTestDeadline) && (
                  <>
                    <WheelDateField label="受検期限" value={webTestDeadline} onChange={setWebTestDeadline} C={C} placeholder="期限を設定" />
                    <WheelDateField label="予約日" value={webTestBookedAt} onChange={setWebTestBookedAt} C={C} placeholder="予約日を設定" />
                    <TextInput
                      style={[styles.input, { backgroundColor: C.inputBg, color: C.text }]}
                      placeholder="受検会場（テストセンターの場合）" placeholderTextColor="#aaa"
                      value={webTestVenue} onChangeText={setWebTestVenue} />
                  </>
                )}

                <Text style={[styles.label, { color: C.text3 }]}>URL（マイページ等）</Text>
                <View style={styles.copyRow}>
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: C.inputBg, color: C.text }]} placeholder="https://..." value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
                  {url ? <TouchableOpacity style={styles.copyBtn} onPress={() => { Clipboard.setString(url); Alert.alert('コピーしました', 'URLをコピーしました'); }}>
                    <Image source={ICONS.checklist} style={{ width: 16, height: 16, tintColor: TDU_BLUE }} resizeMode="contain" /></TouchableOpacity> : null}
                </View>

                <Text style={[styles.label, { color: C.text3 }]}>ユーザーID</Text>
                <View style={styles.copyRow}>
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: C.inputBg, color: C.text }]} placeholder="ログインID・メールアドレス等" value={userId} onChangeText={setUserId} autoCapitalize="none" />
                  {userId ? <TouchableOpacity style={styles.copyBtn} onPress={() => { Clipboard.setString(userId); Alert.alert('コピーしました', 'ユーザーIDをコピーしました'); }}>
                    <Image source={ICONS.checklist} style={{ width: 16, height: 16, tintColor: TDU_BLUE }} resizeMode="contain" /></TouchableOpacity> : null}
                </View>

                <Text style={[styles.label, { color: C.text3 }]}>パスワード</Text>
                <View style={styles.copyRow}>
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: C.inputBg, color: C.text }]} placeholder="パスワード" value={password} onChangeText={setPassword} autoCapitalize="none" secureTextEntry />
                  {password ? <TouchableOpacity style={styles.copyBtn} onPress={() => { Clipboard.setString(password); Alert.alert('コピーしました', 'パスワードをコピーしました'); }}>
                    <Image source={ICONS.checklist} style={{ width: 16, height: 16, tintColor: TDU_BLUE }} resizeMode="contain" /></TouchableOpacity> : null}
                </View>

                {/* ── 通知設定 ── */}
                <Text style={[styles.label, { color: C.text3, marginTop: 4 }]}>リマインド通知</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ color: C.text, fontSize: 14 }}>この企業の通知</Text>
                  <Switch value={itemNotifyEnabled} onValueChange={setItemNotifyEnabled} trackColor={{ true: TDU_BLUE }} />
                </View>
                {itemNotifyEnabled && (
                  <View style={{ backgroundColor: C.bg2, borderRadius: 10, padding: 10, marginBottom: 8, gap: 8 }}>
                    <Text style={{ fontSize: 12, color: C.text3 }}>何日前に通知（複数選択可）</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {['0', '1', '2', '3', '5', '7'].map(nDay => {
                        const sel = notifyDaysList.includes(nDay);
                        return (
                          <TouchableOpacity key={nDay}
                            style={{
                              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
                              backgroundColor: sel ? TDU_BLUE : C.bg3, borderWidth: 1, borderColor: sel ? TDU_BLUE : C.border
                            }}
                            onPress={() => {
                              const nd2 = nDay;
                              setNotifyDaysList(prev =>
                                prev.includes(nd2) ? prev.filter(x => x !== nd2) : [...prev, nd2].sort((a, b) => Number(a) - Number(b))
                              );
                            }}>
                            <Text style={{ fontSize: 11, color: sel ? '#fff' : C.text2 }}>{nDay === '0' ? '当日' : nDay + '日前'}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={{ fontSize: 12, color: C.text3 }}>通知時刻</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {HOURS.map(nH => (
                          <TouchableOpacity key={nH}
                            style={{
                              paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8,
                              backgroundColor: notifyHour === nH ? TDU_BLUE : C.bg3
                            }}
                            onPress={() => setNotifyHour(nH)}>
                            <Text style={{ fontSize: 11, color: notifyHour === nH ? '#fff' : C.text }}>{nH}時</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {['00', '15', '30', '45'].map(nM => (
                        <TouchableOpacity key={nM}
                          style={{
                            flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center',
                            backgroundColor: notifyMinute === nM ? TDU_BLUE : C.bg3
                          }}
                          onPress={() => setNotifyMinute(nM)}>
                          <Text style={{ fontSize: 11, color: notifyMinute === nM ? '#fff' : C.text }}>{nM}分</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* ⑯ 内定承諾期限 */}
                {(selStatus === '内定' || offerDeadline) && (
                  <>
                    <Text style={[styles.label, { color: C.text3 }]}>内定承諾期限</Text>
                    <WheelDateField value={offerDeadline} onChange={setOfferDeadline} C={C} placeholder="期限日を設定" />
                  </>
                )}

                {/* インターン期間設定 */}
                {(selStatus === 'インターン確定' || internshipStart || internshipEnd) && (
                  <>
                    <Text style={[styles.label, { color: C.text3 }]}>インターン期間</Text>
                    <WheelDateField label="開始日" value={internshipStart} onChange={setInternshipStart} C={C} placeholder="日付を設定" />
                    <WheelDateField
                      label="終了日" value={internshipEnd} onChange={setInternshipEnd} C={C} placeholder="日付を設定"
                      minimumDate={internshipStart ? parseYmd(internshipStart) : undefined}
                    />
                  </>
                )}

                {/* ⑫ メモタブ */}
                <Text style={[styles.label, { color: C.text3 }]}>メモ・対策</Text>
                <View style={{ flexDirection: 'row', gap: 4, marginBottom: 6 }}>
                  {['全般', '企業研究', '自己PR', '質問リスト'].map((tab, i) => (
                    <TouchableOpacity key={tab} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
                      backgroundColor: activeMemoTab === i ? TDU_BLUE : C.bg2, borderWidth: 1, borderColor: activeMemoTab === i ? TDU_BLUE : C.border }}
                      onPress={() => setActiveMemoTab(i)}>
                      <Text style={{ fontSize: 11, color: activeMemoTab === i ? '#fff' : C.text2 }}>{tab}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {activeMemoTab === 0 && <TextInput style={[styles.input, styles.textArea, { backgroundColor: C.inputBg, color: C.text }]} multiline placeholder="面接内容・感想など..." value={note} onChangeText={setNote} onFocus={scrollToMemo} />}
                {activeMemoTab === 1 && <TextInput style={[styles.input, styles.textArea, { backgroundColor: C.inputBg, color: C.text }]} multiline placeholder="事業内容・強み・競合など..." value={memoResearch} onChangeText={setMemoResearch} onFocus={scrollToMemo} />}
                {activeMemoTab === 2 && <TextInput style={[styles.input, styles.textArea, { backgroundColor: C.inputBg, color: C.text }]} multiline placeholder="ガクチカ・志望動機・強み弱みなど..." value={memoPR} onChangeText={setMemoPR} onFocus={scrollToMemo} />}
                {activeMemoTab === 3 && <TextInput style={[styles.input, styles.textArea, { backgroundColor: C.inputBg, color: C.text }]} multiline placeholder="面接で聞くこと・逆質問リストなど..." value={memoQuestions} onChangeText={setMemoQuestions} onFocus={scrollToMemo} />}

                {/* ⑬ ステータス変更履歴 */}
                {selectedItem?.statusHistory && selectedItem.statusHistory.length > 0 && (
                  <>
                    <Text style={[styles.label, { color: C.text3, marginTop: 8 }]}>ステータス履歴</Text>
                    <View style={{ backgroundColor: C.bg2, borderRadius: 10, padding: 10, gap: 4 }}>
                      {[...selectedItem.statusHistory].reverse().slice(0, 5).map((h, i) => {
                        const sc2 = statusColors[h.status] ?? '#95A5A6';
                        const d = new Date(h.changedAt);
                        const dateLabel = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
                        return (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sc2 }} />
                            <Text style={{ flex: 1, fontSize: 12, color: C.text2 }}>{h.status}</Text>
                            <Text style={{ fontSize: 11, color: C.text3 }}>{dateLabel}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}

                <View style={styles.modalButtons}>
                  <TouchableOpacity onPress={() => closeModal()}><Text style={styles.cancelText}>戻る</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.saveButton, !companyName.trim() && styles.saveButtonDisabled]} onPress={() => handleSave()}>
                    <Text style={styles.saveButtonText}>保存</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </Modal>

        {/* チェックリストモーダル */}
        <Modal visible={!!checkModalItem} transparent animationType="slide"
          onRequestClose={() => { setCheckModalItem(null); setNewCheckLabel(''); }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.pickerOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1}
              onPress={() => { setCheckModalItem(null); setNewCheckLabel(''); }} />
            <View style={[styles.modalContent, { maxHeight: '85%', backgroundColor: C.bg }]} onStartShouldSetResponder={() => true}>
              <Text style={[styles.modalTitle, { color: C.text }]}>{checkModalItem?.company}</Text>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={[styles.label, { marginTop: 8, color: C.text3 }]}>選考ステップ</Text>
                {CHECKLIST_STEPS.map(step => {
                  const checked = (checkModalItem?.checklist ?? {})[step] ?? false;
                  const isInter = step === '内定';
                  return (
                    <TouchableOpacity key={step}
                      style={[styles.checkRow, { borderColor: C.border2 }, checked && isInter && { backgroundColor: isDark ? '#2d0a0a' : '#fff0f0', borderRadius: 8 }]}
                      onPress={() => checkModalItem && toggleCheck(checkModalItem, step)}>
                      <AnimatedCheckmark checked={checked} color={isInter ? '#e74c3c' : TDU_BLUE} />
                      <Text style={[styles.checkLabel, checked && { color: isInter ? '#e74c3c' : TDU_BLUE, fontWeight: 'bold' }]}>
                        {step}{isInter && checked ? ' 🌸' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                <View style={{ borderTopWidth: 1, borderColor: LIGHT.border2, marginTop: 16, marginBottom: 4 }} />

                {/* 現在のステータスに応じた準備テンプレート */}
                {checkModalItem && (PREP_TEMPLATES[checkModalItem.status]?.length ?? 0) > 0 && (
                  <>
                    <Text style={[styles.label, { color: C.text3 }]}>
                      {checkModalItem.status}の準備（タップで追加）
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {PREP_TEMPLATES[checkModalItem.status].map(tpl => {
                        const already = (checkModalItem.customChecklist ?? []).some(c => c.label === tpl);
                        return (
                          <RippleButton key={tpl}
                            style={[styles.miniChip, already && { opacity: 0.35 }]}
                            onPress={() => { if (!already) { Haptics.selectionAsync(); addCustomCheck(checkModalItem, tpl); } }}>
                            <Text style={styles.miniChipText}>{already ? '✓ ' : '＋ '}{tpl}</Text>
                          </RippleButton>
                        );
                      })}
                    </View>
                  </>
                )}

                <Text style={[styles.label, { color: C.text3 }]}>カスタム項目</Text>
                {(checkModalItem?.customChecklist ?? []).length === 0 && (
                  <Text style={{ fontSize: 12, color: '#bbb', marginBottom: 8, paddingLeft: 8 }}>追加した項目がここに表示されます</Text>
                )}
                {(checkModalItem?.customChecklist ?? []).map(c => (
                  <View key={c.id} style={{ borderBottomWidth: 1, borderColor: C.border2, paddingVertical: 4 }}>
                    <View style={[styles.checkRow, { borderColor: 'transparent', borderBottomWidth: 0 }]}>
                      <TouchableOpacity onPress={() => checkModalItem && toggleCustomCheck(checkModalItem, c.id)}>
                        <AnimatedCheckmark checked={c.checked} color={SUCCESS} />
                      </TouchableOpacity>
                      <Text style={[styles.checkLabel, { flex: 1 }, c.checked && { color: SUCCESS, fontWeight: 'bold' }]}>{c.label}</Text>
                      <TouchableOpacity onPress={() => checkModalItem && deleteCustomCheck(checkModalItem, c.id)}
                        style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ color: '#ccc', fontSize: 16 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    {!c.checked && (
                      <View style={{ paddingLeft: 34, paddingRight: 8, paddingBottom: 4 }}>
                        <WheelDateField
                          label="期限" value={c.due ?? ''} C={C} placeholder="なし"
                          onChange={ymd => checkModalItem && setCustomCheckDue(checkModalItem, c.id, ymd)}
                        />
                      </View>
                    )}
                  </View>
                ))}
                <View style={styles.customAddRow}>
                  <TextInput style={styles.customAddInput} placeholder="項目を入力（例: 適性検査）"
                    value={newCheckLabel} onChangeText={setNewCheckLabel}
                    returnKeyType="done"
                    onSubmitEditing={() => checkModalItem && addCustomCheck(checkModalItem)} />
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

        {/* ジャンル編集モーダル */}
        <Modal visible={genreModalVisible} transparent animationType="slide" onRequestClose={() => setGenreModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setGenreModalVisible(false)} activeOpacity={1} />
            <View style={[styles.modalContent, { maxHeight: '70%', backgroundColor: C.bg }]}>
              <Text style={[styles.modalTitle, { color: C.text }]}>{editGenre ? (STATUS_OPTIONS.includes(editGenre.id) ? 'ステータス色を編集' : 'ジャンルを編集') : 'ジャンルを追加'}</Text>
              <Text style={[styles.label, { color: C.text3 }]}>{editGenre && STATUS_OPTIONS.includes(editGenre.id) ? 'ステータス' : 'ジャンル名'}</Text>
              {editGenre && STATUS_OPTIONS.includes(editGenre.id)
                ? <View style={[styles.input, { backgroundColor: C.inputBg, justifyContent: 'center' }]}>
                  <Text style={{ color: C.text, fontSize: 15 }}>{genreName}</Text>
                </View>
                : <TextInput style={[styles.input, { backgroundColor: C.inputBg, color: C.text }]} placeholder="例: IT・通信" value={genreName} onChangeText={setGenreName} />
              }
              <Text style={[styles.label, { color: C.text3 }]}>カラー</Text>
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
                {editGenre && !DEFAULT_STATUS_OPTIONS.includes(editGenre.id) && (
                  <TouchableOpacity onPress={() => deleteGenre(editGenre.id)}>
                    <Text style={styles.deleteText}>削除</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => setGenreModalVisible(false)}>
                  <Text style={styles.cancelText}>戻る</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveButton, !genreName.trim() && styles.saveButtonDisabled]} onPress={() => saveGenre()}>
                  <Text style={styles.saveButtonText}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── やること一覧（全企業横断） ───────────────────────────── */}
        <Modal visible={todoModalVisible} animationType="slide" transparent onRequestClose={() => setTodoModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: C.card, maxHeight: '85%' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={[styles.modalTitle, { color: C.text, flex: 1 }]}>やること</Text>
                <TouchableOpacity onPress={() => setTodoModalVisible(false)} style={{ padding: 6 }}>
                  <Text style={{ fontSize: 18, color: C.text3 }}>✕</Text>
                </TouchableOpacity>
              </View>

              {todos.length === 0 ? (
                <Text style={{ fontSize: 13, color: C.text3, textAlign: 'center', paddingVertical: 24 }}>
                  期限のあるやることはありません
                </Text>
              ) : (
                <ScrollView>
                  {todos.map((t, i) => {
                    const overdue = t.daysLeft !== undefined && t.daysLeft < 0;
                    const soon = t.daysLeft !== undefined && t.daysLeft >= 0 && t.daysLeft <= 2;
                    const item = schedules.find(s => s.id === t.scheduleId);
                    return (
                      <ReAnimated.View key={t.key} entering={FadeInDown.delay(Math.min(i, 6) * 80).duration(240)}>
                        <RippleButton
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 8,
                            paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: C.border2,
                          }}
                          onPress={() => { setTodoModalVisible(false); if (item) openDetail(item); }}>
                          <View style={{
                            paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5,
                            backgroundColor: (statusColors[item?.status ?? ''] ?? NEUTRAL_GRAY) + '22',
                          }}>
                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: statusColors[item?.status ?? ''] ?? NEUTRAL_GRAY }}>
                              {TODO_KIND_LABEL[t.kind]}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }} numberOfLines={1}>{t.company}</Text>
                            <Text style={{ fontSize: 11, color: C.text2, marginTop: 1 }} numberOfLines={1}>{t.label}</Text>
                          </View>
                          {t.daysLeft !== undefined && (
                            <View style={{
                              paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
                              backgroundColor: overdue ? DANGER : soon ? '#f39c12' : C.bg3,
                            }}>
                              <Text style={{
                                fontSize: 10, fontWeight: 'bold',
                                color: overdue || soon ? '#fff' : C.text2,
                              }}>{todoDueLabel(t)}</Text>
                            </View>
                          )}
                        </RippleButton>
                      </ReAnimated.View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

      </View>
    </SafeAreaView>
    </GestureHandlerRootView>
  );
}

// ─── スタイル ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },

  topNav: { paddingVertical: 10, borderBottomWidth: 1 },
  headerStats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: TDU_BLUE },
  statChip: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: 'bold', color: TDU_BLUE },
  statLabel: { fontSize: 9, color: TDU_BLUE },

  calLabel: { borderLeftWidth: 2, borderRadius: 3, paddingHorizontal: 2, marginTop: 1, width: '100%' },
  calLabelText: { fontSize: 7, fontWeight: 'bold' },
  calMore: { fontSize: 7, color: '#999', marginTop: 1 },

  upcomingCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 8 },
  todoArea: { flex: 1, paddingHorizontal: 16, paddingTop: 14, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  subTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 10 },
  addButton: { backgroundColor: TDU_BLUE, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  addButtonText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  itemCard: { paddingVertical: 13, paddingHorizontal: 6, borderBottomWidth: 1, borderColor: LIGHT.border2, flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { fontSize: 15, fontWeight: 'bold', fontFamily: 'NotoSansJP_700Bold' },
  itemStatus: { fontSize: 11, marginTop: 3 },
  itemArrow: { color: '#ccc', fontSize: 16 },
  emptyText: { textAlign: 'center', marginTop: 24, fontSize: 13 },

  searchBar: { flexDirection: 'row', alignItems: 'center', margin: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  searchIcon: { fontSize: 14, marginRight: 6 },
  searchInput: { flex: 1, fontSize: 14 },

  listToolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  filterBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: TDU_BLUE, backgroundColor: '#fff' },
  filterBtnActive: { backgroundColor: TDU_BLUE },
  filterBtnText: { fontSize: 11, color: TDU_BLUE, fontWeight: 'bold' },
  filterPanel: { marginHorizontal: 12, marginBottom: 6, padding: 12, borderRadius: 12, borderWidth: 1 },
  filterPanelTitle: { fontSize: 13, fontWeight: 'bold', color: TDU_BLUE },
  filterGroupLabel: { fontSize: 11, color: '#888', fontWeight: 'bold', marginBottom: 6 },
  filterChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  miniChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', backgroundColor: SURFACE_MUTED },
  miniChipActive: { backgroundColor: TDU_BLUE, borderColor: TDU_BLUE },
  miniChipText: { fontSize: 10, color: '#666' },
  ascBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: LIGHT.statChip, borderWidth: 1, borderColor: TDU_BLUE },
  ascBtnText: { fontSize: 10, color: TDU_BLUE, fontWeight: 'bold' },

  // スワイプ削除
  swipeDeleteBg: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 80, backgroundColor: DANGER, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  swipeDeleteBtn: { flex: 1, justifyContent: 'center', alignItems: 'center', width: 80 },
  swipeDeleteText: { color: '#fff', fontSize: 11, fontWeight: 'bold', textAlign: 'center' },

  listCard: { padding: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, elevation: 3, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
  genreBand: { width: 4, borderRadius: 4, alignSelf: 'stretch' },
  dateText: { fontSize: 11, color: '#999', marginTop: 4, fontFamily: 'Inter_400Regular' },
  notePreview: { fontSize: 10, color: '#aaa', marginTop: 2 },
  statusBadge: { backgroundColor: TDU_BLUE, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold', fontFamily: 'NotoSansJP_700Bold' },
  rankBadge: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#fff', fontSize: 10, fontWeight: 'bold', fontFamily: 'Inter_700Bold' },
  checkBtn: { backgroundColor: LIGHT.bg3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  checkBtnText: { fontSize: 10, color: TDU_BLUE, fontWeight: 'bold' },

  fab: { position: 'absolute', bottom: 16, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: TDU_BLUE, alignItems: 'center', justifyContent: 'center', elevation: 5 },
  fabText: { color: '#fff', fontSize: 26, lineHeight: 30 },

  settingSection: { fontSize: 12, fontWeight: 'bold', color: '#888', marginBottom: 12, letterSpacing: 1, fontFamily: 'NotoSansJP_700Bold' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  settingLabel: { fontSize: 14, flex: 1, fontFamily: 'NotoSansJP_400Regular' },
  genreRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: LIGHT.border2 },
  genreColorDot: { width: 16, height: 16, borderRadius: 8, marginRight: 12 },
  outlineButton: { borderWidth: 1, borderColor: TDU_BLUE, padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  outlineButtonText: { color: TDU_BLUE, fontWeight: 'bold' },
  dangerButton: { borderWidth: 1, borderColor: DANGER, padding: 14, borderRadius: 10, alignItems: 'center' },
  dangerButtonText: { color: DANGER, fontWeight: 'bold' },
  aboutBox: { padding: 16, borderRadius: 10, marginTop: 20 },
  aboutText: { fontSize: 13, color: '#666', lineHeight: 20 },
  supportBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, padding: 16, marginTop: 8 },
  supportBtnTitle: { fontSize: 15, fontWeight: 'bold' },
  supportBtnSub: { fontSize: 12, marginTop: 2 },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: CHIP_BG },
  sortChipActive: { backgroundColor: TDU_BLUE },
  sortChipText: { fontSize: 12, color: '#666' },

  tabBar: { flexDirection: 'row', height: 70, borderTopWidth: 1, paddingBottom: 10 },
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabImg: { width: 26, height: 26, opacity: 0.3, tintColor: '#aaa' },
  tabImgActive: { opacity: 1, tintColor: TDU_BLUE },
  tabLabel: { fontSize: 9, color: '#ccc', marginTop: 3, fontFamily: 'NotoSansJP_400Regular' },
  tabLabelActive: { fontWeight: 'bold', color: TDU_BLUE, fontFamily: 'NotoSansJP_700Bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  dragHandleContainer: { alignItems: 'center', paddingVertical: 8, marginTop: -8, marginHorizontal: -24 },
  dragHandleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc' },
  modalTitle: { fontSize: 17, fontWeight: 'bold', marginBottom: 4, fontFamily: 'NotoSansJP_700Bold' },
  deleteText: { color: DANGER, fontSize: 13 },
  label: { fontSize: 11, color: '#888', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: LIGHT.bg2, padding: 13, borderRadius: 10, fontSize: 15, marginBottom: 2 },
  textArea: { height: 90, textAlignVertical: 'top' },
  statusContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  statusOption: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, backgroundColor: CHIP_BG },
  statusSelected: { backgroundColor: TDU_BLUE },
  statusOptionText: { fontSize: 11, color: '#666' },
  rankOption: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  genreChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#ddd', marginRight: 6 },
  genreChipText: { fontSize: 11, color: '#666' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
  cancelText: { color: '#999', fontSize: 15 },
  saveButton: { backgroundColor: TDU_BLUE, paddingVertical: 13, paddingHorizontal: 44, borderRadius: 14 },
  saveButtonDisabled: { backgroundColor: '#aaa' },
  saveButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  pickerBox: { backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '85%' },
  pickerTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 4, textAlign: 'center' },
  pickerItem: { width: 44, height: 44, borderRadius: 10, backgroundColor: CHIP_BG, alignItems: 'center', justifyContent: 'center' },
  pickerItemActive: { backgroundColor: TDU_BLUE },
  pickerItemText: { fontSize: 14, color: '#333' },

  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: LIGHT.searchBg, paddingHorizontal: 8 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  checkLabel: { fontSize: 15, color: '#333' },
  customAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 4 },
  customAddInput: { flex: 1, backgroundColor: LIGHT.bg2, padding: 11, borderRadius: 10, fontSize: 14 },
  customAddBtn: { backgroundColor: TDU_BLUE, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10 },

  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotActive: { borderWidth: 3, borderColor: '#333' },

  // インラインピッカー
  inlinePicker: { backgroundColor: LIGHT.bg3, borderRadius: 10, borderWidth: 1, borderColor: ACCENT_BORDER, padding: 6, marginTop: 4, maxHeight: 200 },
  inlinePickerItem: { width: 38, height: 38, borderRadius: 8, backgroundColor: CHIP_BG, alignItems: 'center', justifyContent: 'center' },
  inlinePickerItemActive: { backgroundColor: TDU_BLUE },
  inlinePickerClear: { width: '100%', alignItems: 'flex-end', paddingRight: 4, paddingBottom: 2 },

  // URLチップ・進捗ボタン
  urlChip: { marginTop: 4, backgroundColor: LIGHT.statChip, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start' },
  urlChipText: { fontSize: 11, color: ACCENT, fontWeight: 'bold' },
  progressBtn: { backgroundColor: TDU_BLUE, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  progressBtnText: { fontSize: 11, color: '#fff', fontWeight: 'bold' },
  nextStatusBtn: { borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, maxWidth: 100 },
  nextStatusBtnText: { fontSize: 11, fontWeight: 'bold' },

  // コピーボタン
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  copyBtn: { backgroundColor: LIGHT.bg3, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: ACCENT_BORDER },
  copyBtnText: { fontSize: 16 },
});
