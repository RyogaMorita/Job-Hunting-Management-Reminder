import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initConnection, endConnection, requestPurchase, getProducts, finishTransaction, purchaseErrorListener, purchaseUpdatedListener, getAvailablePurchases } from 'expo-iap';
import { useColorScheme } from 'react-native';
import { useFonts, CormorantGaramond_300Light, CormorantGaramond_400Regular, CormorantGaramond_300Light_Italic } from '@expo-google-fonts/cormorant-garamond';

import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  SafeAreaView, Modal, TextInput, Alert, KeyboardAvoidingView,
  Platform, Switch, Animated, PanResponder, Linking, Clipboard, Image, Dimensions,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as StoreReview from 'expo-store-review';
import { SafeAreaProvider, SafeAreaView as SafeAreaViewContext } from 'react-native-safe-area-context';
import {
  BannerAd, BannerAdSize, TestIds,
  AppOpenAd, AdEventType,
  RewardedAd, RewardedAdEventType,
} from 'react-native-google-mobile-ads';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false,
    shouldShowBanner: true, shouldShowList: true,
  }),
});

// ─── 定数 ─────────────────────────────────────────────────────────
// ─── 広告ID ──────────────────────────────────────────────────────
const IAP_PRODUCT_ID = 'com.moritaryoga.shukatsukanri.adfree';
const AD_UNIT_ID = __DEV__ ? TestIds.BANNER : 'ca-app-pub-7090599455468315/1730004001';
const APP_OPEN_ID = __DEV__ ? TestIds.APP_OPEN : 'ca-app-pub-7090599455468315/3637103731';
const REWARDED_ID = __DEV__ ? TestIds.REWARDED : 'ca-app-pub-7090599455468315/8667464364';
const REVIEW_KEY = '@review_requested';

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
const GENRES_KEY = '@genres_v11';
const STATUS_COLORS_KEY = '@status_colors_v2';
const STATUS_OPTIONS_KEY = '@status_options_v1';
const TDU_BLUE = '#003366';
const ACCENT = '#1a6bcc';

const DEFAULT_STATUS_OPTIONS = ['検討中', '説明会', 'ES締切', 'ES提出済', 'GD', '1次面接', '2次面接', '最終面接', '内定', '内定辞退', '不合格'];
const STATUS_OPTIONS = DEFAULT_STATUS_OPTIONS; // 後方互換用
const STATUS_PRIORITY: Record<string, number> = {
  '内定': 8, '最終面接': 7, '2次面接': 6, '1次面接': 5, 'GD': 4, 'ES提出済': 3, 'ES締切': 2, '説明会': 1, '検討中': 0, '内定辞退': -1, '不合格': -2,
};
const STATUS_SORT_ORDER = ['内定', '最終面接', '2次面接', '1次面接', 'GD', 'ES提出済', 'ES締切', '説明会', '検討中', '内定辞退', '不合格'];
// ステータスに対応するチェックリスト自動チェック
const STATUS_TO_CHECKS: Record<string, string[]> = {
  '説明会': [],
  'ES締切': [],
  'ES提出済': ['ES提出'],
  'GD': ['ES提出'],
  '1次面接': ['ES提出', '1次面接'],
  '2次面接': ['ES提出', '1次面接', '2次面接'],
  '最終面接': ['ES提出', '1次面接', '2次面接', '最終面接'],
  '内定': ['ES提出', '1次面接', '2次面接', '最終面接', '内定'],
  '内定辞退': ['ES提出', '1次面接', '2次面接', '最終面接', '内定'],
  '不合格': [],
  '検討中': [],
};
const CHECKLIST_STEPS = ['ES提出', '1次面接', '2次面接', '最終面接', '内定'];
const RANK_OPTIONS = ['S', 'A', 'B', 'C'];
const SORT_OPTIONS = ['登録順', '直近順', '五十音', '志望度', 'ステータス', 'ジャンル'];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];
const INACTIVE = ['内定辞退', '不合格'];

const statusCardColor = (s: string) =>
  s === '内定' ? '#fff0f0' : INACTIVE.includes(s) ? '#f0f0f0' : '#ffffff';
const statusCardBorder = (s: string) =>
  s === '内定' ? '#f5a0a0' : INACTIVE.includes(s) ? '#cccccc' : '#eeeeee';

// ─── 型定義 ───────────────────────────────────────────────────────
interface Genre { id: string; name: string; color: string; }

interface NotifySetting { daysBeforeList: string[]; hourStr: string; minuteStr: string; }
interface Schedule {
  id: string; company: string; date: string; hour: string; minute: string;
  status: string; note: string; url: string; userId: string; password: string;
  rank: string; genreId: string; calendarColor?: string;
  checklist: Record<string, boolean>;
  customChecklist: { id: string; label: string; checked: boolean }[];
  notifyEnabled?: boolean;
  notifySettings?: NotifySetting;
  statusHistory?: { status: string; changedAt: string }[];
  offerDeadline?: string;
  memoResearch?: string;
  memoPR?: string;
  memoQuestions?: string;
}

type TabType = 'calendar' | 'list' | 'settings';
type SortType = '登録順' | '直近順' | '五十音' | '志望度' | 'ステータス' | 'ジャンル';

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
  'ES締切': '#27AE60',
  'ES提出済': '#2980B9',
  'GD': '#FF9800',
  '1次面接': '#8E44AD',
  '2次面接': '#E67E22',
  '最終面接': '#E74C3C',
  '内定': '#E91E8C',
  '内定辞退': '#7F8C8D',
  '不合格': '#BDC3C7',
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
          <Text style={styles.swipeDeleteText}>🗑️{'\n'}削除</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
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
const DARK = {
  bg: '#0d1117', bg2: '#161b22', bg3: '#1c2333', card: '#161b22',
  border: '#30363d', border2: '#21262d',
  text: '#e6edf3', text2: '#8b949e', text3: '#6e7681',
  calBg: '#0d1117', calText: '#e6edf3',
  tabBar: '#161b22', inputBg: '#21262d', searchBg: '#21262d',
  filterBg: '#1c2333', statChip: '#1c2333', headerBorder: '#30363d',
};

// カレンダーヘッダー
function CalendarHeader({ isDark, C, currentDate, weekStart, onOpenDatePicker }: {
  isDark: boolean; C: typeof LIGHT; currentDate: Date; weekStart: number; onOpenDatePicker: () => void;
}) {
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return (
    <TouchableOpacity onPress={onOpenDatePicker} activeOpacity={0.8}
      style={{
        paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, backgroundColor: C.bg,
        flexDirection: 'row', alignItems: 'center', gap: 10
      }}>
      <Text style={{ fontSize: 28, fontWeight: '600', color: C.text, letterSpacing: -0.5 }}>
        {String(month).padStart(2, '0')}
      </Text>
      <Text style={{ fontSize: 18, color: C.text3, fontWeight: '300' }}>/</Text>
      <Text style={{ fontSize: 15, color: C.text3, fontWeight: '400', letterSpacing: 1 }}>{year}</Text>
      <Text style={{ fontSize: 15, color: C.text2, fontWeight: '300' }}>{monthNames[currentDate.getMonth()]}</Text>
      <Text style={{ fontSize: 10, color: C.text3, marginLeft: 2 }}>▾</Text>
    </TouchableOpacity>
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

export default function App() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const C = isDark ? DARK : LIGHT;
  const [currentCalDate, setCurrentCalDate] = useState(new Date());

  const [fontsLoaded] = useFonts({
    CormorantGaramond_300Light,
    CormorantGaramond_400Regular,
    CormorantGaramond_300Light_Italic,
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
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [rank, setRank] = useState('B');
  const [selGenreId, setSelGenreId] = useState('other');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  // ピッカー
  const [showHourPicker, setShowHourPicker] = useState(false);
  const [showMinutePicker, setShowMinutePicker] = useState(false);

  // 新機能用 state
  const [offerDeadline, setOfferDeadline] = useState('');
  const [memoResearch, setMemoResearch] = useState('');
  const [memoPR, setMemoPR] = useState('');
  const [memoQuestions, setMemoQuestions] = useState('');
  const [activeMemoTab, setActiveMemoTab] = useState(0); // 0=研究, 1=PR, 2=質問
  const [showOfferDeadlinePicker, setShowOfferDeadlinePicker] = useState(false);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [showAllStatuses, setShowAllStatuses] = useState(false);
  const [openHelpItem, setOpenHelpItem] = useState<number | null>(null);

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
  const calScrollRef = useRef<any>(null);
  const [screenWidth, setScreenWidth] = useState(0);
  const isSwipingCal = useRef(false);
  const [datePickerYear, setDatePickerYear] = useState(new Date().getFullYear());
  const [datePickerMonth, setDatePickerMonth] = useState(new Date().getMonth()); // 0-indexed

  // 企業登録用ホイールピッカー
  const [showDateWheelPicker, setShowDateWheelPicker] = useState(false);
  const [wheelYear, setWheelYear] = useState(new Date().getFullYear());
  const [wheelMonth, setWheelMonth] = useState(new Date().getMonth() + 1); // 1-indexed
  const [wheelDay, setWheelDay] = useState(new Date().getDate());

  useEffect(() => { loadAll(); }, []);

  // ─── IAP初期化（initConnectionが必須） ───────────────────────
  useEffect(() => {
    let purchaseUpdate: any;
    let purchaseError: any;
    initConnection().then(() => {
      purchaseUpdate = purchaseUpdatedListener(async (purchase: any) => {
        if (purchase.productId === IAP_PRODUCT_ID) {
          await finishTransaction({ purchase, isConsumable: false });
          await AsyncStorage.setItem('@ad_free', 'true');
          setAdFree(true);
          Alert.alert('ありがとうございます！', '広告が削除されました🎉');
        }
      });
      purchaseError = purchaseErrorListener((error: any) => {
        if (error?.code !== 'E_USER_CANCELLED') console.log('IAP error:', error);
      });
    }).catch((err: any) => console.log('IAP init error:', err));
    return () => {
      purchaseUpdate?.remove();
      purchaseError?.remove();
      endConnection();
    };
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

  // 広告削除購入（expo-iap本番実装）
  const purchaseAdFree = async () => {
    try {
      const products = await getProducts([IAP_PRODUCT_ID]);
      if (!products || products.length === 0) { Alert.alert('エラー', '商品情報を取得できませんでした。'); return; }
      await requestPurchase({ sku: IAP_PRODUCT_ID });
    } catch (err: any) {
      if (err?.code !== 'E_USER_CANCELLED') Alert.alert('購入エラー', '購入処理に失敗しました。もう一度お試しください。');
    }
  };

  // 購入復元（expo-iap本番実装）
  const restorePurchase = async () => {
    try {
      const purchases = await getAvailablePurchases();
      const found = purchases.some((p: any) => p.productId === IAP_PRODUCT_ID);
      if (found) { await AsyncStorage.setItem('@ad_free', 'true'); setAdFree(true); Alert.alert('復元完了', '広告削除が復元されました🎉'); }
      else Alert.alert('復元できませんでした', '購入履歴が見つかりません。');
    } catch { Alert.alert('エラー', '復元処理に失敗しました。'); }
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
      const ws = await AsyncStorage.getItem('@week_start');
      if (ws !== null) setWeekStart(JSON.parse(ws));
      const sc = await AsyncStorage.getItem(STATUS_COLORS_KEY);
      if (sc) setStatusColors({ ...DEFAULT_STATUS_COLORS, ...JSON.parse(sc) });
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

      // 起動時に表示済みフラグをリセット（新しい起動サイクル開始）
      await AsyncStorage.setItem('@interstitial_triggered', 'false');

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
  const saveStatusColors = async (data: StatusColors) => {
    setStatusColors(data);
    await AsyncStorage.setItem(STATUS_COLORS_KEY, JSON.stringify(data));
  };
  const saveStatusOptions = async (data: string[]) => {
    setStatusOptions(data);
    await AsyncStorage.setItem(STATUS_OPTIONS_KEY, JSON.stringify(data));
  };

  // ─── 統計 ──────────────────────────────────────────────────────
  const activeCount = useMemo(() => schedules.filter(s => !['内定', '内定辞退', '不合格'].includes(s.status)).length, [schedules]);
  const internalCount = useMemo(() => schedules.filter(s => s.status === '内定').length, [schedules]);

  const upcomingSchedules = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return schedules.filter(s => s.date && s.date >= today && !INACTIVE.includes(s.status))
      .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10);
  }, [schedules]);

  // ─── カレンダーマーキング ──────────────────────────────────────
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    schedules.forEach(s => {
      if (!s.date) return; // ① 日付なしエントリを除外
      const col = s.calendarColor ?? statusColors[s.status] ?? TDU_BLUE;
      if (!marks[s.date]) marks[s.date] = { dots: [] };
      if (!marks[s.date].dots) marks[s.date].dots = [];
      marks[s.date].dots.push({ color: col });
    });
    marks[selectedDate] = { ...(marks[selectedDate] || {}), selected: true, selectedColor: TDU_BLUE };
    return marks;
  }, [schedules, selectedDate, statusColors]);

  const dateCompanyMap = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    schedules.forEach(s => { if (!s.date) return; if (!map[s.date]) map[s.date] = []; map[s.date].push(s); });
    Object.keys(map).forEach(d => {
      map[d].sort((a, b) => (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0));
    });
    return map;
  }, [schedules]);

  // ─── フィルタ・ソート ──────────────────────────────────────────
  // 持ち駒: 同名企業は最高ステータスのみ表示
  const deduplicatedSchedules = useMemo(() => {
    const map = new Map<string, Schedule>();
    schedules.forEach(s => {
      const key = s.company.trim();
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
      case '直近順': list.sort((a, b) => a.date.localeCompare(b.date)); break;
      case '五十音': list.sort((a, b) => a.company.localeCompare(b.company, 'ja')); break;
      case '志望度': list.sort((a, b) => (ro[a.rank] ?? 3) - (ro[b.rank] ?? 3)); break;
      case 'ステータス':
        list.sort((a, b) => {
          const sd = STATUS_SORT_ORDER.indexOf(a.status) - STATUS_SORT_ORDER.indexOf(b.status);
          if (sd !== 0) return sd;
          return (ro[a.rank] ?? 3) - (ro[b.rank] ?? 3);
        }); break;
      case 'ジャンル': list.sort((a, b) => a.genreId.localeCompare(b.genreId)); break;
    }
    if (!sortAsc) list.reverse();
    return list;
  }, [deduplicatedSchedules, searchQuery, filterGenreIds, filterStatuses, sortType, sortAsc]); // ② 正しい依存配列

  const filteredByDate = useMemo(() => schedules.filter(s => s.date && s.date === selectedDate), [schedules, selectedDate]);

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
    const autoChecks = STATUS_TO_CHECKS[selStatus] ?? [];
    const initCL: Record<string, boolean> = {};
    CHECKLIST_STEPS.forEach(step => { initCL[step] = autoChecks.includes(step); });
    // 既存のチェックと合成（既にチェック済みのものは保持）
    const existingCL = selectedItem?.checklist ?? {};
    CHECKLIST_STEPS.forEach(step => {
      initCL[step] = initCL[step] || (existingCL[step] ?? false);
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
      hour: selHour, minute: selMinute,
      status: selStatus, note: note.trim(),
      url: url.trim(), userId: userId.trim(), password: password.trim(),
      rank, genreId: selGenreId,
      checklist: initCL,
      customChecklist: selectedItem?.customChecklist ?? [],
      notifyEnabled: itemNotifyEnabled,
      notifySettings: { daysBeforeList: notifyDaysList, hourStr: notifyHour, minuteStr: notifyMinute },
      statusHistory: newHistory,
      offerDeadline: offerDeadline || undefined,
      memoResearch: memoResearch || undefined,
      memoPR: memoPR || undefined,
      memoQuestions: memoQuestions || undefined,
      calendarColor: selectedItem
        ? (statusColors[selStatus] ?? selectedItem.calendarColor ?? '#95A5A6') // 編集時: 新ステータス色で更新
        : (statusColors[selStatus] ?? '#95A5A6'), // 新規: 登録時のステータス色で固定
    };
    const base = deleteIds.length > 0 ? schedules.filter(s => !deleteIds.includes(s.id)) : schedules;
    const updated = selectedItem ? base.map(s => s.id === selectedItem.id ? newSchedule : s) : [...base, newSchedule];
    await saveSchedules(updated);
    await scheduleNotification(newSchedule);
    closeModal();
  };

  const closeModal = () => {
    setModalVisible(false); setDetailVisible(false); setSelectedItem(null);
    setCompanyName(''); setNote(''); setSelStatus('検討中');
    setSelHour(''); setSelMinute(''); setUrl(''); setUserId(''); setPassword('');
    setRank('B'); setSelGenreId('other'); setChecklist({});
    setShowHourPicker(false); setShowMinutePicker(false); setShowDateWheelPicker(false);
    setItemNotifyEnabled(true); setNotifyDaysList(['1']); setNotifyHour('09'); setNotifyMinute('00');
    setOfferDeadline(''); setMemoResearch(''); setMemoPR(''); setMemoQuestions(''); setActiveMemoTab(0); setShowOfferDeadlinePicker(false);
  };

  const openAdd = (dateStr?: string) => {
    const ds = (typeof dateStr === 'string' && dateStr) ? dateStr : selectedDate;
    setSelDate(ds);
    const d = new Date(ds);
    setWheelYear(d.getFullYear()); setWheelMonth(d.getMonth() + 1); setWheelDay(d.getDate());
    setItemNotifyEnabled(true);
    setNotifyDaysList(['1']); setNotifyHour('09'); setNotifyMinute('00');
    setModalVisible(true);
  };

  // 同名企業から情報引き継ぎして新規登録フォームを開く
  const openAddWithInherit = (prev: Schedule) => {
    setSelDate(selectedDate);
    setSelGenreId(prev.genreId ?? 'other');
    setUrl(prev.url ?? '');
    setUserId(prev.userId ?? '');
    setPassword(prev.password ?? '');
    setRank(prev.rank ?? 'B');
    setNote(prev.note ?? '');
    setMemoResearch(prev.memoResearch ?? '');
    setMemoPR(prev.memoPR ?? '');
    setMemoQuestions(prev.memoQuestions ?? '');
    // 引き継がないもの: status・date・通知設定
    setSelStatus('検討中');
    setCompanyName(prev.company);
    setModalVisible(true);
  };

  // 企業名入力時に同名企業のデータを自動継承（新規登録時のみ）
  const handleCompanyNameChange = (text: string) => {
    setCompanyName(text);
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
    const _d = item.date ? new Date(item.date) : new Date();
    setWheelYear(_d.getFullYear()); setWheelMonth(_d.getMonth() + 1); setWheelDay(_d.getDate());
    setSelHour(item.hour ?? ''); setSelMinute(item.minute ?? '');
    setUrl(item.url ?? ''); setUserId(item.userId ?? ''); setPassword(item.password ?? '');
    setRank(item.rank ?? 'B'); setSelGenreId(item.genreId ?? 'other');
    setChecklist(item.checklist ?? {});
    setItemNotifyEnabled(item.notifyEnabled !== false);
    setNotifyDaysList(item.notifySettings?.daysBeforeList ?? ['1']);
    setNotifyHour(item.notifySettings?.hourStr ?? '09');
    setNotifyMinute(item.notifySettings?.minuteStr ?? '00');
    setOfferDeadline(item.offerDeadline ?? '');
    setMemoResearch(item.memoResearch ?? '');
    setMemoPR(item.memoPR ?? '');
    setMemoQuestions(item.memoQuestions ?? '');
    setActiveMemoTab(0);
    setDetailVisible(true);
  };

  const deleteSchedule = (id: string) => {
    Alert.alert('削除', 'このデータを削除しますか？', [
      { text: '戻る', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
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
            title: `📋 ${item.company}`,
            body: `${item.status}の予定が${day === '0' ? '今日' : day + '日後'}です（${item.date}${item.hour ? ' ' + item.hour + ':' + item.minute : ''}）`,
            sound: true,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: notifyDate },
        });
      }
    } catch (e) { console.log('通知エラー:', e); }
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

  const addCustomCheck = async (item: Schedule) => {
    if (!newCheckLabel.trim()) return;
    const newC = { id: Date.now().toString(), label: newCheckLabel.trim(), checked: false };
    const updated = schedules.map(s => s.id !== item.id ? s : { ...s, customChecklist: [...(s.customChecklist ?? []), newC] });
    await saveSchedules(updated);
    setCheckModalItem(updated.find(s => s.id === item.id) ?? null);
    setNewCheckLabel('');
  };

  const deleteCustomCheck = async (item: Schedule, id: string) => {
    const updated = schedules.map(s => s.id !== item.id ? s : { ...s, customChecklist: (s.customChecklist ?? []).filter(c => c.id !== id) });
    await saveSchedules(updated);
    setCheckModalItem(updated.find(s => s.id === item.id) ?? null);
  };

  // 次のステータスを返す（最終は変更なし）
  const PROGRESS_FLOW = ['検討中', 'ES締切', 'ES提出済', '1次面接', '2次面接', '最終面接', '内定'];
  const nextStatus = (current: string): string | null => {
    const idx = PROGRESS_FLOW.indexOf(current);
    if (idx === -1 || idx >= PROGRESS_FLOW.length - 1) return null;
    return PROGRESS_FLOW[idx + 1];
  };
  const advanceStatus = async (item: Schedule) => {
    const ns = nextStatus(item.status);
    if (!ns) return;
    const autoChecks = STATUS_TO_CHECKS[ns] ?? [];
    const initCL: Record<string, boolean> = { ...(item.checklist ?? {}) };
    CHECKLIST_STEPS.forEach(step => { if (autoChecks.includes(step)) initCL[step] = true; });
    // 常に同一エントリのstatusだけ更新（新エントリ作成しない → 古いデータが残らない）
    // calendarColorが未設定の場合は現在のステータス色で固定（以降変わらない）
    const updated = schedules.map(s => s.id !== item.id ? s : {
      ...s, status: ns, checklist: initCL,
      calendarColor: s.calendarColor ?? statusColors[s.status] ?? '#95A5A6',
    });
    await saveSchedules(updated);
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
            <Text style={[styles.headerTitle, { flex: 1, textAlign: 'center' }]}>就活管理リマインダー</Text>
            <View style={[styles.statChip, { backgroundColor: isDark ? '#2d2007' : '#fff3cd' }]}>
              <Text style={[styles.statNum, { color: '#856404' }]}>{internalCount}</Text>
              <Text style={[styles.statLabel, { color: '#856404' }]}>内定</Text>
            </View>
          </View>
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
            <CalendarHeader isDark={isDark} C={C} currentDate={currentCalDate} weekStart={weekStart} onOpenDatePicker={() => setDatePickerVisible(true)} />
            <WeekdayHeader C={C} weekStart={weekStart} />
            {screenWidth > 0 && (
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
                style={{ flexGrow: 0 }}
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
                        onDayPress={(day: any) => { if (day?.dateString) { setSelectedDate(day.dateString); setCalDaySelected(true); } }}
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
                        } as any}
                        dayComponent={({ date, state }: any) => {
                          const ds = date.dateString;
                          const items = dateCompanyMap[ds] || [];
                          const isSel = ds === selectedDate, isToday = ds === today;
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
                              style={{ alignItems: 'center', width: 46, minHeight: 44 }}>
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
                                ]}>{date.day}</Text>
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
                        }}
                      />
                    </View>
                  );
                })}
              </ScrollView>
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
            <TouchableOpacity style={styles.fab} onPress={() => { openAdd(); countAction(); }}>
              <Text style={styles.fabText}>＋</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'list' && (
          <View style={{ flex: 1 }}>
            {/* 検索バー */}
            <View style={[styles.searchBar, { backgroundColor: C.searchBg }]}>
              <Text style={styles.searchIcon}>🔍</Text>
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

            <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
              {filteredSorted.length === 0
                ? <Text style={[styles.emptyText, { color: C.text3 }]}>該当する企業がありません</Text>
                : filteredSorted.map(item => {
                  const sc = statusColorOf(item.status);
                  const isInternal = item.status === '内定';
                  const isInactive = INACTIVE.includes(item.status);
                  const ns = nextStatus(item.status);
                  const cdLabel = countdownLabel(item.date); // ⑪
                  return (
                    <SwipeableRow key={item.id} onDelete={() => deleteSchedule(item.id)}>
                      <TouchableOpacity
                        style={[styles.listCard,
                        {
                          backgroundColor: isDark ? (isInactive ? '#2a2a2a' : isInternal ? '#2d0a0a' : C.card) : statusCardColor(item.status),
                          borderColor: isDark ? C.border : statusCardBorder(item.status)
                        }]}
                        onPress={() => openDetail(item)}
                        activeOpacity={0.9}>
                        <View style={[styles.genreBand, { backgroundColor: sc }]} />
                        <View style={{ flex: 1, paddingLeft: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={[styles.rankBadge, { backgroundColor: rankColor(item.rank) }]}>
                              <Text style={styles.rankText}>{item.rank}</Text>
                            </View>
                            <Text style={[styles.itemTitle, { color: isInactive ? '#888' : C.text }]}>
                              {item.company}{isInternal ? ' 🌸' : ''}
                            </Text>
                            {cdLabel && <View style={{ backgroundColor: cdLabel === '今日' ? '#e74c3c' : '#f39c12', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{cdLabel}</Text>
                            </View>}
                          </View>
                          <Text style={styles.dateText}>{item.date ? item.date.replace(/-/g, '/') + (timeStr(item.hour, item.minute) ? ' ' + timeStr(item.hour, item.minute) + '〜' : '') : '日付未定'}</Text>
                          {item.url ? (
                            <TouchableOpacity
                              style={styles.urlChip}
                              onPress={() => Linking.openURL(item.url.startsWith('http') ? item.url : 'https://' + item.url)}>
                              <Text style={styles.urlChipText} numberOfLines={1}>🔗 開く</Text>
                            </TouchableOpacity>
                          ) : null}
                          {item.note ? <Text style={styles.notePreview} numberOfLines={1}>📝 {item.note}</Text> : null}
                          {/* ⑩ 選考進捗バー */}
                          {!isInactive && (() => {
                            const steps = CHECKLIST_STEPS;
                            const done = steps.filter(s => item.checklist?.[s]).length;
                            return (
                              <View style={{ flexDirection: 'row', gap: 2, marginTop: 4 }}>
                                {steps.map((s, i) => (
                                  <View key={s} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i < done ? sc : isDark ? '#333' : '#e0e0e0' }} />
                                ))}
                              </View>
                            );
                          })()}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <View style={[styles.statusBadge, { backgroundColor: sc },
                          isInactive && { backgroundColor: '#aaa' }]}>
                            <Text style={styles.statusBadgeText}>{item.status}</Text>
                          </View>
                          {ns && !isInactive ? (
                            <TouchableOpacity
                              style={[styles.nextStatusBtn, { borderColor: sc }]}
                              onPress={() => advanceStatus(item)}>
                              <Text style={[styles.nextStatusBtnText, { color: sc }]} numberOfLines={1}>{ns} →</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    </SwipeableRow>
                  );
                })
              }
              <View style={{ height: 80 }} />
            </ScrollView>
            <TouchableOpacity style={styles.fab} onPress={() => { openAdd(); countAction(); }}>
              <Text style={styles.fabText}>＋</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 設定タブ ── */}
        {activeTab === 'settings' && (
          <ScrollView style={{ flex: 1, padding: 20, backgroundColor: C.bg }}>
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
                <Text style={{ color: TDU_BLUE, fontSize: 13 }}>
                  {showAllGenres ? '▲ 閉じる' : `▼ もっと見る（残り${genres.length - 5}件）`}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.outlineButton} onPress={() => openAddGenre()}>
              <Text style={styles.outlineButtonText}>+ ジャンルを追加</Text>
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
                <Text style={{ color: TDU_BLUE, fontSize: 13 }}>
                  {showAllStatuses ? '▲ 閉じる' : `▼ もっと見る（残り${statusOptions.length - 5}件）`}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.outlineButton, { marginTop: 8 }]}
              onPress={() => { setNewStatusName(''); setAddStatusModal(true); }}>
              <Text style={styles.outlineButtonText}>+ ステータスを追加</Text>
            </TouchableOpacity>


            <Text style={[styles.settingSection, { marginTop: 28 }]}>カレンダー設定</Text>
            <View style={[styles.settingRow, { borderColor: C.border2 }]}>
              <Text style={[styles.settingLabel, { color: C.text }]}>週の始まり</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[{ label: '日曜', v: 0 }, { label: '月曜', v: 1 }].map(opt => (
                  <TouchableOpacity key={opt.v}
                    style={[styles.sortChip, { backgroundColor: C.bg2 }, weekStart === opt.v && styles.sortChipActive]}
                    onPress={async () => { setWeekStart(opt.v); await AsyncStorage.setItem('@week_start', JSON.stringify(opt.v)); }}>
                    <Text style={[styles.sortChipText, weekStart === opt.v && { color: '#fff' }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={[styles.settingSection, { marginTop: 28 }]}>通知テスト</Text>
            <View style={[styles.settingRow, { borderColor: C.border2, flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
              <Text style={{ color: C.text2, fontSize: 13 }}>5秒後にテスト通知を送信します</Text>
              <TouchableOpacity
                style={[styles.outlineButton, { marginTop: 0, alignSelf: 'flex-start', paddingHorizontal: 20 }]}
                onPress={async () => {
                  try {
                    const { status } = await Notifications.requestPermissionsAsync();
                    if (status !== 'granted') { Alert.alert('通知権限が必要です', '設定アプリで通知を許可してください'); return; }
                    await Notifications.scheduleNotificationAsync({
                      identifier: 'test_notif_' + Date.now(),
                      content: {
                        title: '📋 テスト通知',
                        body: '就活管理アプリからのリマインド通知が正常に届いています',
                        sound: true,
                      },
                      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, repeats: false },
                    });
                    Alert.alert('送信完了', '5秒後に通知が届きます。アプリをバックグラウンドにしてお待ちください。');
                  } catch (e) { Alert.alert('エラー', '通知の送信に失敗しました: ' + String(e)); }
                }}>
                <Text style={styles.outlineButtonText}>テスト通知を送る</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.settingSection, { marginTop: 28 }]}>データ管理</Text>
            {/* ⑭ CSV エクスポート */}
            <TouchableOpacity style={[styles.outlineButton, { marginBottom: 12 }]} onPress={() => {
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
              <Text style={styles.outlineButtonText}>📋 CSVをクリップボードにコピー</Text>
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
                title: '🗓️ カレンダーの使い方',
                body: [
                  '• 日付をタップ → その日の予定を表示',
                  '• 日付をダブルタップ → その日付で新規登録',
                  '• 左右スワイプ → 月を移動',
                  '• 左上の年月をタップ → 年月ピッカーを開く',
                  '• 「直近に戻る」で直近10件の予定を表示',
                ],
              },
              {
                title: '🏢 企業の登録・編集',
                body: [
                  '• 画面右下の「＋」ボタンで新規登録',
                  '• 企業名・ステータス・日程・志望度などを入力',
                  '• 登録後はカード長押しで削除、左スワイプでも削除可',
                  '• 詳細画面から内容を編集できます',
                  '• 日付なしでも登録できます（日付未定として管理）',
                ],
              },
              {
                title: '📋 持ち駒欄の使い方',
                body: [
                  '• 同名企業は最高ステータスの1件だけ表示されます',
                  '• 「→」ボタンでステータスを次のステップに進められます',
                  '• 左スワイプで削除ボタンが出ます',
                  '• 上部のバーで検索・絞り込み・並び替えができます',
                  '• ▼ フィルターアイコンで業種・ステータスの絞り込み',
                ],
              },
              {
                title: '🔔 通知設定',
                body: [
                  '• 設定タブ → 通知設定でリマインダーのON/OFFを切り替え',
                  '• 企業の詳細編集 → 通知設定で個別に何日前に通知するか指定できます',
                  '• 「テスト通知を送る」で動作確認ができます',
                  '• 通知が届かない場合はスマホの通知許可を確認してください',
                ],
              },
              {
                title: '🔄 企業の重複と同名登録',
                body: [
                  '• 同じ企業名・同じステータスで新規登録 → 古いエントリが自動削除（置換）',
                  '• 同じ企業名・異なるステータスで新規登録 → カレンダーに両方表示',
                  '• 持ち駒欄では常に最高ステータスの1件のみ表示',
                  '• 例：1次面接（3/1）と2次面接（3/15）は両方カレンダーに残ります',
                ],
              },
              {
                title: '📝 メモ機能',
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
                title: '📤 データ管理',
                body: [
                  '• 設定 → データ管理 →「CSVをクリップボードにコピー」でデータをエクスポート',
                  '• CSVはスプレッドシート（Excel / Google スプレッドシート）に貼り付けられます',
                  '• 含まれる項目：企業名・ステータス・日付・時間・志望度・ジャンル・メモ',
                  '• 「全データを削除する」は元に戻せないので注意してください',
                ],
              },
            ] as { title: string; body: string[] }[]).map((item, i) => (
              <View key={i} style={{ borderBottomWidth: 0.5, borderBottomColor: C.border2 }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 }}
                  onPress={() => setOpenHelpItem(openHelpItem === i ? null : i)}
                  activeOpacity={0.7}>
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
            {!adFree ? (
              <>
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
                <TouchableOpacity
                  style={[styles.supportBtn, { backgroundColor: isDark ? '#1c2333' : '#fff8e1', borderColor: '#f59e0b', marginTop: 10 }]}
                  onPress={purchaseAdFree}
                >
                  <Text style={{ fontSize: 20 }}>✨</Text>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.supportBtnTitle, { color: '#b45309' }]}>広告を削除する　¥120</Text>
                    <Text style={[styles.supportBtnSub, { color: C.text2 }]}>すべての広告を完全に非表示にします</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={restorePurchase} style={{ alignItems: 'center', marginTop: 8 }}>
                  <Text style={{ color: C.text2, fontSize: 12 }}>購入を復元する</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={[styles.supportBtn, { backgroundColor: isDark ? '#1c2333' : '#f0fdf4', borderColor: '#22c55e' }]}>
                <Text style={{ fontSize: 20 }}>✅</Text>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.supportBtnTitle, { color: '#16a34a' }]}>広告削除済み</Text>
                  <Text style={[styles.supportBtnSub, { color: C.text2 }]}>ご支援ありがとうございます🙏</Text>
                </View>
              </View>
            )}

            <View style={[styles.aboutBox, { backgroundColor: C.bg2, marginTop: 24 }]}>
              <Text style={[styles.aboutText, { color: C.text2 }]}>就活管理リマインダー v1.1.0</Text>
            </View>
          </ScrollView>
        )}


        {/* 初回起動モーダル */}
        <Modal visible={firstLaunchModal} transparent animationType="fade" onRequestClose={() => setFirstLaunchModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: C.bg, borderRadius: 20, padding: 24, width: '90%', gap: 14 }}>
              <Text style={{ fontSize: 22, fontWeight: 'bold', color: isDark ? '#6ea8fe' : TDU_BLUE, textAlign: 'center' }}>ようこそ！🎉</Text>
              <Text style={{ fontSize: 15, fontWeight: 'bold', color: C.text }}>就活管理リマインダーの使い方</Text>
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, color: C.text2, lineHeight: 20 }}>📅 <Text style={{ fontWeight: 'bold', color: C.text }}>カレンダータブ</Text>{'\n'}日付をタップして企業を登録。ダブルタップで素早く追加できます。</Text>
                <Text style={{ fontSize: 13, color: C.text2, lineHeight: 20 }}>👥 <Text style={{ fontWeight: 'bold', color: C.text }}>持ち駒タブ</Text>{'\n'}登録した企業の選考状況を一覧管理。「→」で次のステップへ進めます。</Text>
                <Text style={{ fontSize: 13, color: C.text2, lineHeight: 20 }}>⚙️ <Text style={{ fontWeight: 'bold', color: C.text }}>設定タブ</Text>{'\n'}詳しい使い方は設定タブ下部の「ヘルプ・使い方」をご覧ください。</Text>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: isDark ? '#1c2333' : TDU_BLUE, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 }}
                onPress={() => setFirstLaunchModal(false)}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>はじめる</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

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
        <View style={[styles.tabBar, { backgroundColor: C.tabBar, borderTopColor: C.border }]}>
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
              <TouchableOpacity key={tab} style={styles.tabButton} onPress={() => { setActiveTab(tab); setBannerKey(k => k + 1); countAction(); }}>
                <Image
                  source={imgSrcs[i]}
                  style={[styles.tabImg,
                    { tintColor: isActive ? activeColor : isDark ? '#6e7681' : '#aaa', opacity: isActive ? 1 : 0.7 }]}
                  resizeMode="contain" />
                <Text style={[styles.tabLabel,
                  { color: isActive ? activeColor : isDark ? '#6e7681' : '#ccc', fontWeight: isActive ? 'bold' : 'normal' }]}>
                  {labels[i]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── 企業登録/編集モーダル ── */}
        <Modal visible={isModalVisible || isDetailVisible} animationType="slide" transparent onRequestClose={closeModal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => closeModal()} activeOpacity={1} />
            <View style={[styles.modalContent, { backgroundColor: C.bg }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: C.text }]}>{isDetailVisible ? '詳細・編集' : '新規企業登録'}</Text>
                  {isDetailVisible && (
                    <TouchableOpacity onPress={() => deleteSchedule(selectedItem!.id)}>
                      <Text style={styles.deleteText}>削除</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={[styles.label, { color: C.text3 }]}>企業名 *</Text>
                <TextInput style={[styles.input, { backgroundColor: C.inputBg, color: C.text }]} placeholder="例：株式会社〇〇" value={companyName} onChangeText={handleCompanyNameChange} returnKeyType="done" />

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
                      <TouchableOpacity key={opt}
                        style={[styles.statusOption,
                        {
                          borderWidth: 1.5, borderColor: isSel ? sc : 'transparent',
                          backgroundColor: isSel ? sc + '22' : '#f0f2f5'
                        }]}
                        onPress={() => setSelStatus(opt)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: sc }} />
                          <Text style={[styles.statusOptionText, { color: isSel ? sc : C.text2 }]}>{opt}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 2 }}>
                    <Text style={[styles.label, { color: C.text3 }]}>日付</Text>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <TouchableOpacity
                        style={[styles.input, { flex: 1, backgroundColor: C.inputBg, justifyContent: 'center' }]}
                        onPress={() => setShowDateWheelPicker(v => !v)}>
                        <Text style={{ fontSize: 15, color: selDate ? C.text : '#aaa' }}>{selDate || '日付なし'}</Text>
                      </TouchableOpacity>
                      {selDate ? <TouchableOpacity onPress={() => { setSelDate(''); setShowDateWheelPicker(false); }}
                        style={{ paddingHorizontal: 8, paddingVertical: 10 }}>
                        <Text style={{ color: '#aaa', fontSize: 16 }}>✕</Text>
                      </TouchableOpacity> : null}
                    </View>
                    {showDateWheelPicker && (
                      <View style={{
                        backgroundColor: C.bg2, borderRadius: 12, borderWidth: 1,
                        borderColor: C.border, marginTop: 4, padding: 8
                      }}>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          {/* 年 */}
                          <ScrollView style={{ flex: 3, height: 140 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i).map(wYr => (
                              <TouchableOpacity key={wYr}
                                style={{
                                  paddingVertical: 9, alignItems: 'center', borderRadius: 8,
                                  backgroundColor: wheelYear === wYr ? TDU_BLUE : 'transparent'
                                }}
                                onPress={() => {
                                  setWheelYear(wYr);
                                  const nd = `${wYr}-${String(wheelMonth).padStart(2, '0')}-${String(wheelDay).padStart(2, '0')}`;
                                  setSelDate(nd);
                                }}>
                                <Text style={{ fontSize: 14, color: wheelYear === wYr ? '#fff' : C.text, fontWeight: wheelYear === wYr ? 'bold' : 'normal' }}>{wYr}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                          {/* 月 */}
                          <ScrollView style={{ flex: 2, height: 140 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(wMon => (
                              <TouchableOpacity key={wMon}
                                style={{
                                  paddingVertical: 9, alignItems: 'center', borderRadius: 8,
                                  backgroundColor: wheelMonth === wMon ? TDU_BLUE : 'transparent'
                                }}
                                onPress={() => {
                                  setWheelMonth(wMon);
                                  const nd = `${wheelYear}-${String(wMon).padStart(2, '0')}-${String(wheelDay).padStart(2, '0')}`;
                                  setSelDate(nd);
                                }}>
                                <Text style={{ fontSize: 14, color: wheelMonth === wMon ? '#fff' : C.text, fontWeight: wheelMonth === wMon ? 'bold' : 'normal' }}>{wMon}月</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                          {/* 日 */}
                          <ScrollView style={{ flex: 2, height: 140 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(wDay => (
                              <TouchableOpacity key={wDay}
                                style={{
                                  paddingVertical: 9, alignItems: 'center', borderRadius: 8,
                                  backgroundColor: wheelDay === wDay ? TDU_BLUE : 'transparent'
                                }}
                                onPress={() => {
                                  setWheelDay(wDay);
                                  const nd = `${wheelYear}-${String(wheelMonth).padStart(2, '0')}-${String(wDay).padStart(2, '0')}`;
                                  setSelDate(nd);
                                }}>
                                <Text style={{ fontSize: 14, color: wheelDay === wDay ? '#fff' : C.text, fontWeight: wheelDay === wDay ? 'bold' : 'normal' }}>{wDay}日</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                        <TouchableOpacity
                          style={{ marginTop: 8, backgroundColor: TDU_BLUE, borderRadius: 8, padding: 10, alignItems: 'center' }}
                          onPress={() => setShowDateWheelPicker(false)}>
                          <Text style={{ color: '#fff', fontWeight: 'bold' }}>決定</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: C.text3 }]}>時間</Text>
                    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-start' }}>
                      {/* 時インラインドロップダウン */}
                      <View style={{ flex: 1 }}>
                        <TouchableOpacity style={[styles.input, { justifyContent: 'center', paddingVertical: 13 }]}
                          onPress={() => { setShowHourPicker(v => !v); setShowMinutePicker(false); }}>
                          <Text style={{ fontSize: 14, color: selHour ? '#333' : '#aaa' }}>{selHour || '時'}</Text>
                        </TouchableOpacity>
                        {showHourPicker && (
                          <ScrollView style={[styles.inlinePicker, { backgroundColor: C.bg2, borderColor: C.border }]} nestedScrollEnabled>
                            <TouchableOpacity style={styles.inlinePickerClear} onPress={() => { setSelHour(''); setShowHourPicker(false); }}>
                              <Text style={{ fontSize: 10, color: '#999' }}>クリア</Text>
                            </TouchableOpacity>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                              {HOURS.map(selHr => (
                                <TouchableOpacity key={selHr} style={[styles.inlinePickerItem, { backgroundColor: C.bg3 }, selHour === selHr && styles.inlinePickerItemActive]}
                                  onPress={() => { setSelHour(selHr); setShowHourPicker(false); }}>
                                  <Text style={[{ fontSize: 13, color: '#333' }, selHour === selHr && { color: '#fff', fontWeight: 'bold' }]}>{selHr}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </ScrollView>
                        )}
                      </View>
                      <Text style={{ alignSelf: 'center', color: '#333', paddingTop: 13 }}>:</Text>
                      {/* 分インラインドロップダウン */}
                      <View style={{ flex: 1 }}>
                        <TouchableOpacity style={[styles.input, { justifyContent: 'center', paddingVertical: 13 }]}
                          onPress={() => { setShowMinutePicker(v => !v); setShowHourPicker(false); }}>
                          <Text style={{ fontSize: 14, color: selMinute ? '#333' : '#aaa' }}>{selMinute || '分'}</Text>
                        </TouchableOpacity>
                        {showMinutePicker && (
                          <View style={[styles.inlinePicker, { flexDirection: 'row', flexWrap: 'wrap', gap: 4, backgroundColor: C.bg2, borderColor: C.border }]}>
                            <TouchableOpacity style={[styles.inlinePickerClear, { width: '100%' }]} onPress={() => { setSelMinute(''); setShowMinutePicker(false); }}>
                              <Text style={{ fontSize: 10, color: '#999' }}>クリア</Text>
                            </TouchableOpacity>
                            {MINUTES.map(selMin => (
                              <TouchableOpacity key={selMin} style={[styles.inlinePickerItem, { flex: 1, minWidth: 50, backgroundColor: C.bg3 }, selMinute === selMin && styles.inlinePickerItemActive]}
                                onPress={() => { setSelMinute(selMin); setShowMinutePicker(false); }}>
                                <Text style={[{ fontSize: 14, color: '#333' }, selMinute === selMin && { color: '#fff', fontWeight: 'bold' }]}>{selMin}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </View>

                <Text style={[styles.label, { color: C.text3 }]}>URL（マイページ等）</Text>
                <View style={styles.copyRow}>
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: C.inputBg, color: C.text }]} placeholder="https://..." value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
                  {url ? <TouchableOpacity style={styles.copyBtn} onPress={() => { Clipboard.setString(url); Alert.alert('コピーしました', 'URLをコピーしました'); }}>
                    <Text style={styles.copyBtnText}>📋</Text></TouchableOpacity> : null}
                </View>

                <Text style={[styles.label, { color: C.text3 }]}>ユーザーID</Text>
                <View style={styles.copyRow}>
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: C.inputBg, color: C.text }]} placeholder="ログインID・メールアドレス等" value={userId} onChangeText={setUserId} autoCapitalize="none" />
                  {userId ? <TouchableOpacity style={styles.copyBtn} onPress={() => { Clipboard.setString(userId); Alert.alert('コピーしました', 'ユーザーIDをコピーしました'); }}>
                    <Text style={styles.copyBtnText}>📋</Text></TouchableOpacity> : null}
                </View>

                <Text style={[styles.label, { color: C.text3 }]}>パスワード</Text>
                <View style={styles.copyRow}>
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: C.inputBg, color: C.text }]} placeholder="パスワード" value={password} onChangeText={setPassword} autoCapitalize="none" secureTextEntry />
                  {password ? <TouchableOpacity style={styles.copyBtn} onPress={() => { Clipboard.setString(password); Alert.alert('コピーしました', 'パスワードをコピーしました'); }}>
                    <Text style={styles.copyBtnText}>📋</Text></TouchableOpacity> : null}
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
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <TouchableOpacity
                        style={[styles.input, { flex: 1, backgroundColor: C.inputBg, justifyContent: 'center' }]}
                        onPress={() => setShowOfferDeadlinePicker(v => !v)}>
                        <Text style={{ fontSize: 15, color: offerDeadline ? C.text : '#aaa' }}>{offerDeadline || '期限日を設定'}</Text>
                      </TouchableOpacity>
                      {offerDeadline && (
                        <TouchableOpacity onPress={() => setOfferDeadline('')} style={{ paddingHorizontal: 8, paddingVertical: 10 }}>
                          <Text style={{ color: '#aaa', fontSize: 16 }}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {offerDeadline && (() => {
                      const d = daysUntil(offerDeadline);
                      if (d === null) return null;
                      const color = d <= 3 ? '#e74c3c' : d <= 7 ? '#f39c12' : '#27ae60';
                      return <Text style={{ color, fontSize: 12, marginBottom: 4 }}>{d === 0 ? '今日が期限！' : d < 0 ? `${Math.abs(d)}日超過` : `あと${d}日`}</Text>;
                    })()}
                    {showOfferDeadlinePicker && (
                      <View style={{ backgroundColor: C.bg2, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginTop: 4, padding: 8 }}>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          <ScrollView style={{ flex: 3, height: 120 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i).map(yr => (
                              <TouchableOpacity key={yr} style={{ paddingVertical: 7, alignItems: 'center', borderRadius: 6, backgroundColor: offerDeadline?.startsWith(String(yr)) ? TDU_BLUE : 'transparent' }}
                                onPress={() => { const [, m, d] = (offerDeadline || `${yr}-01-01`).split('-'); setOfferDeadline(`${yr}-${m || '01'}-${d || '01'}`); }}>
                                <Text style={{ fontSize: 13, color: offerDeadline?.startsWith(String(yr)) ? '#fff' : C.text }}>{yr}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                          <ScrollView style={{ flex: 2, height: 120 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(mn => {
                              const ms = String(mn).padStart(2, '0');
                              const [yr, , d] = (offerDeadline || '').split('-');
                              const active = offerDeadline?.split('-')[1] === ms;
                              return (
                                <TouchableOpacity key={mn} style={{ paddingVertical: 7, alignItems: 'center', borderRadius: 6, backgroundColor: active ? TDU_BLUE : 'transparent' }}
                                  onPress={() => setOfferDeadline(`${yr || new Date().getFullYear()}-${ms}-${d || '01'}`)}>
                                  <Text style={{ fontSize: 13, color: active ? '#fff' : C.text }}>{mn}月</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                          <ScrollView style={{ flex: 2, height: 120 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(dy => {
                              const ds2 = String(dy).padStart(2, '0');
                              const [yr, mn] = (offerDeadline || '').split('-');
                              const active = offerDeadline?.split('-')[2] === ds2;
                              return (
                                <TouchableOpacity key={dy} style={{ paddingVertical: 7, alignItems: 'center', borderRadius: 6, backgroundColor: active ? TDU_BLUE : 'transparent' }}
                                  onPress={() => setOfferDeadline(`${yr || new Date().getFullYear()}-${mn || '01'}-${ds2}`)}>
                                  <Text style={{ fontSize: 13, color: active ? '#fff' : C.text }}>{dy}日</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                        <TouchableOpacity style={{ marginTop: 6, backgroundColor: TDU_BLUE, borderRadius: 8, padding: 8, alignItems: 'center' }}
                          onPress={() => setShowOfferDeadlinePicker(false)}>
                          <Text style={{ color: '#fff', fontWeight: 'bold' }}>決定</Text>
                        </TouchableOpacity>
                      </View>
                    )}
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
                {activeMemoTab === 0 && <TextInput style={[styles.input, styles.textArea, { backgroundColor: C.inputBg, color: C.text }]} multiline placeholder="面接内容・感想など..." value={note} onChangeText={setNote} />}
                {activeMemoTab === 1 && <TextInput style={[styles.input, styles.textArea, { backgroundColor: C.inputBg, color: C.text }]} multiline placeholder="事業内容・強み・競合など..." value={memoResearch} onChangeText={setMemoResearch} />}
                {activeMemoTab === 2 && <TextInput style={[styles.input, styles.textArea, { backgroundColor: C.inputBg, color: C.text }]} multiline placeholder="ガクチカ・志望動機・強み弱みなど..." value={memoPR} onChangeText={setMemoPR} />}
                {activeMemoTab === 3 && <TextInput style={[styles.input, styles.textArea, { backgroundColor: C.inputBg, color: C.text }]} multiline placeholder="面接で聞くこと・逆質問リストなど..." value={memoQuestions} onChangeText={setMemoQuestions} />}

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
            </View>
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
                      <View style={[styles.checkbox, checked && { backgroundColor: isInter ? '#e74c3c' : TDU_BLUE, borderColor: isInter ? '#e74c3c' : TDU_BLUE }]}>
                        {checked && <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
                      </View>
                      <Text style={[styles.checkLabel, checked && { color: isInter ? '#e74c3c' : TDU_BLUE, fontWeight: 'bold' }]}>
                        {step}{isInter && checked ? ' 🌸' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                <View style={{ borderTopWidth: 1, borderColor: '#f0f0f0', marginTop: 16, marginBottom: 4 }} />
                <Text style={[styles.label, { color: C.text3 }]}>カスタム項目</Text>
                {(checkModalItem?.customChecklist ?? []).length === 0 && (
                  <Text style={{ fontSize: 12, color: '#bbb', marginBottom: 8, paddingLeft: 8 }}>追加した項目がここに表示されます</Text>
                )}
                {(checkModalItem?.customChecklist ?? []).map(c => (
                  <View key={c.id} style={[styles.checkRow, { borderColor: C.border2 }]}>
                    <TouchableOpacity
                      style={[styles.checkbox, c.checked && { backgroundColor: '#27AE60', borderColor: '#27AE60' }]}
                      onPress={() => checkModalItem && toggleCustomCheck(checkModalItem, c.id)}>
                      {c.checked && <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
                    </TouchableOpacity>
                    <Text style={[styles.checkLabel, { flex: 1 }, c.checked && { color: '#27AE60', fontWeight: 'bold' }]}>{c.label}</Text>
                    <TouchableOpacity onPress={() => checkModalItem && deleteCustomCheck(checkModalItem, c.id)}
                      style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: '#ccc', fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
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

      </View>
    </SafeAreaView>
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

  calLabel: { borderLeftWidth: 2, borderRadius: 3, paddingHorizontal: 2, marginTop: 1, width: 44 },
  calLabelText: { fontSize: 7, fontWeight: 'bold' },
  calMore: { fontSize: 7, color: '#999', marginTop: 1 },

  upcomingCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 8 },
  todoArea: { flex: 1, paddingHorizontal: 16, paddingTop: 14, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  subTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 10 },
  addButton: { backgroundColor: TDU_BLUE, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  addButtonText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  itemCard: { paddingVertical: 13, paddingHorizontal: 6, borderBottomWidth: 1, borderColor: '#f0f0f0', flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { fontSize: 15, fontWeight: 'bold' },
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
  miniChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#f8f8f8' },
  miniChipActive: { backgroundColor: TDU_BLUE, borderColor: TDU_BLUE },
  miniChipText: { fontSize: 10, color: '#666' },
  ascBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: '#e8f0fe', borderWidth: 1, borderColor: TDU_BLUE },
  ascBtnText: { fontSize: 10, color: TDU_BLUE, fontWeight: 'bold' },

  // スワイプ削除
  swipeDeleteBg: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 80, backgroundColor: '#e74c3c', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  swipeDeleteBtn: { flex: 1, justifyContent: 'center', alignItems: 'center', width: 80 },
  swipeDeleteText: { color: '#fff', fontSize: 11, fontWeight: 'bold', textAlign: 'center' },

  listCard: { padding: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, elevation: 1, overflow: 'hidden' },
  genreBand: { width: 4, borderRadius: 4, alignSelf: 'stretch' },
  dateText: { fontSize: 11, color: '#999', marginTop: 4 },
  notePreview: { fontSize: 10, color: '#aaa', marginTop: 2 },
  statusBadge: { backgroundColor: TDU_BLUE, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  rankBadge: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  checkBtn: { backgroundColor: '#f0f4ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  checkBtnText: { fontSize: 10, color: TDU_BLUE, fontWeight: 'bold' },

  fab: { position: 'absolute', bottom: 16, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: TDU_BLUE, alignItems: 'center', justifyContent: 'center', elevation: 5 },
  fabText: { color: '#fff', fontSize: 26, lineHeight: 30 },

  settingSection: { fontSize: 12, fontWeight: 'bold', color: '#888', marginBottom: 12, letterSpacing: 1 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  settingLabel: { fontSize: 14, flex: 1 },
  genreRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  genreColorDot: { width: 16, height: 16, borderRadius: 8, marginRight: 12 },
  outlineButton: { borderWidth: 1, borderColor: TDU_BLUE, padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  outlineButtonText: { color: TDU_BLUE, fontWeight: 'bold' },
  dangerButton: { borderWidth: 1, borderColor: '#e74c3c', padding: 14, borderRadius: 10, alignItems: 'center' },
  dangerButtonText: { color: '#e74c3c', fontWeight: 'bold' },
  aboutBox: { padding: 16, borderRadius: 10, marginTop: 20 },
  aboutText: { fontSize: 13, color: '#666', lineHeight: 20 },
  supportBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, padding: 16, marginTop: 8 },
  supportBtnTitle: { fontSize: 15, fontWeight: 'bold' },
  supportBtnSub: { fontSize: 12, marginTop: 2 },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f2f5' },
  sortChipActive: { backgroundColor: TDU_BLUE },
  sortChipText: { fontSize: 12, color: '#666' },

  tabBar: { flexDirection: 'row', height: 70, borderTopWidth: 1, paddingBottom: 10 },
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabImg: { width: 26, height: 26, opacity: 0.3, tintColor: '#aaa' },
  tabImgActive: { opacity: 1, tintColor: TDU_BLUE },
  tabLabel: { fontSize: 9, color: '#ccc', marginTop: 3 },
  tabLabelActive: { fontWeight: 'bold', color: TDU_BLUE },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', marginBottom: 4 },
  deleteText: { color: '#e74c3c', fontSize: 13 },
  label: { fontSize: 11, color: '#888', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#f8f9fa', padding: 13, borderRadius: 10, fontSize: 15, marginBottom: 2 },
  textArea: { height: 90, textAlignVertical: 'top' },
  statusContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  statusOption: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, backgroundColor: '#f0f2f5' },
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
  pickerItem: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center' },
  pickerItemActive: { backgroundColor: TDU_BLUE },
  pickerItemText: { fontSize: 14, color: '#333' },

  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f5f5f5', paddingHorizontal: 8 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  checkLabel: { fontSize: 15, color: '#333' },
  customAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 4 },
  customAddInput: { flex: 1, backgroundColor: '#f8f9fa', padding: 11, borderRadius: 10, fontSize: 14 },
  customAddBtn: { backgroundColor: TDU_BLUE, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10 },

  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotActive: { borderWidth: 3, borderColor: '#333' },

  // インラインピッカー
  inlinePicker: { backgroundColor: '#f0f4ff', borderRadius: 10, borderWidth: 1, borderColor: '#dde8ff', padding: 6, marginTop: 4, maxHeight: 200 },
  inlinePickerItem: { width: 38, height: 38, borderRadius: 8, backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center' },
  inlinePickerItemActive: { backgroundColor: TDU_BLUE },
  inlinePickerClear: { width: '100%', alignItems: 'flex-end', paddingRight: 4, paddingBottom: 2 },

  // URLチップ・進捗ボタン
  urlChip: { marginTop: 4, backgroundColor: '#e8f0fe', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start' },
  urlChipText: { fontSize: 11, color: ACCENT, fontWeight: 'bold' },
  progressBtn: { backgroundColor: TDU_BLUE, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  progressBtnText: { fontSize: 11, color: '#fff', fontWeight: 'bold' },
  nextStatusBtn: { borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, maxWidth: 100 },
  nextStatusBtnText: { fontSize: 11, fontWeight: 'bold' },

  // コピーボタン
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  copyBtn: { backgroundColor: '#f0f4ff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#dde8ff' },
  copyBtnText: { fontSize: 16 },
});
