import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  SafeAreaView, Modal, TextInput, Alert, KeyboardAvoidingView,
  Platform, Switch
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@schedules_data_v7';
const TDU_BLUE = '#003366';
const ACCENT = '#1a6bcc';

const STATUS_OPTIONS = ['検討中', 'ES作成', 'ES提出済', '1次面接', '2次面接', '最終面接', '内定', '終了'];
const RANK_OPTIONS = ['S', 'A', 'B', 'C'];
const SORT_OPTIONS = ['登録順', '五十音', '志望度', 'ステータス'];
const INACTIVE_STATUSES = ['終了'];

interface Schedule {
  id: string;
  company: string;
  date: string;
  time: string;
  status: string;
  note: string;
  url: string;
  password: string;
  rank: string;
}

type TabType = 'calendar' | 'list' | 'settings';
type SortType = '登録順' | '五十音' | '志望度' | 'ステータス';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [isModalVisible, setModalVisible] = useState(false);
  const [isDetailVisible, setDetailVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Schedule | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('検討中');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState('');
  const [note, setNote] = useState('');
  const [url, setUrl] = useState('');
  const [password, setPassword] = useState('');
  const [rank, setRank] = useState('B');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [sortType, setSortType] = useState<SortType>('登録順');
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [notifyDaysBefore, setNotifyDaysBefore] = useState('1');
  const [calendarDaySelected, setCalendarDaySelected] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const s = await AsyncStorage.getItem(STORAGE_KEY);
      if (s) setSchedules(JSON.parse(s));
      const sort = await AsyncStorage.getItem('@sort_type');
      if (sort) setSortType(sort as SortType);
      const notify = await AsyncStorage.getItem('@notify_enabled');
      if (notify !== null) setNotifyEnabled(JSON.parse(notify));
      const days = await AsyncStorage.getItem('@notify_days');
      if (days) setNotifyDaysBefore(days);
    } catch (e) { Alert.alert('エラー', '読み込み失敗'); }
  };

  const saveSchedules = async (data: Schedule[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  const activeSchedules = useMemo(() => schedules.filter(s => !INACTIVE_STATUSES.includes(s.status)), [schedules]);
  const internalCount = useMemo(() => schedules.filter(s => s.status === '内定').length, [schedules]);

  const upcomingSchedules = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return schedules
      .filter(s => s.date >= today && !INACTIVE_STATUSES.includes(s.status))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3);
  }, [schedules]);

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    schedules.forEach(s => {
      marks[s.date] = { ...(marks[s.date] || {}), marked: true, dotColor: TDU_BLUE };
    });
    marks[selectedDate] = { ...(marks[selectedDate] || {}), selected: true, selectedColor: TDU_BLUE };
    return marks;
  }, [schedules, selectedDate]);

  const dateCompanyMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    schedules.forEach(s => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s.company);
    });
    return map;
  }, [schedules]);

  const sortedSchedules = useMemo(() => {
    const list = [...schedules];
    switch (sortType) {
      case '五十音': return list.sort((a, b) => a.company.localeCompare(b.company, 'ja'));
      case '志望度': {
        const order = { S: 0, A: 1, B: 2, C: 3 };
        return list.sort((a, b) => (order[a.rank as keyof typeof order] ?? 3) - (order[b.rank as keyof typeof order] ?? 3));
      }
      case 'ステータス': return list.sort((a, b) => STATUS_OPTIONS.indexOf(a.status) - STATUS_OPTIONS.indexOf(b.status));
      default: return list;
    }
  }, [schedules, sortType]);

  const filteredByDate = useMemo(() => schedules.filter(s => s.date === selectedDate), [schedules, selectedDate]);

  const handleSave = async () => {
    if (companyName.trim() === '') return;
    const duplicate = schedules.find(s => s.company.trim() === companyName.trim() && s.id !== (selectedItem?.id ?? ''));
    if (duplicate) {
      Alert.alert('重複確認', `「${companyName.trim()}」はすでに登録されています。\n別エントリーとして追加しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        { text: '追加する', onPress: () => doSave() },
      ]);
      return;
    }
    doSave();
  };

  const doSave = async () => {
    const newSchedule: Schedule = {
      id: selectedItem ? selectedItem.id : Date.now().toString(),
      company: companyName.trim(), date: selectedDate, time: selectedTime,
      status: selectedStatus, note: note.trim(), url: url.trim(),
      password: password.trim(), rank,
    };
    const updated = selectedItem
      ? schedules.map(s => s.id === selectedItem.id ? newSchedule : s)
      : [...schedules, newSchedule];
    setSchedules(updated);
    await saveSchedules(updated);
    closeModal();
  };

  const closeModal = () => {
    setModalVisible(false); setDetailVisible(false); setSelectedItem(null);
    setCompanyName(''); setNote(''); setSelectedStatus('検討中');
    setSelectedTime(''); setUrl(''); setPassword(''); setRank('B');
  };

  const openDetail = (item: Schedule) => {
    setSelectedItem(item); setCompanyName(item.company);
    setNote(item.note ?? ''); setSelectedStatus(item.status);
    setSelectedDate(item.date); setSelectedTime(item.time ?? '');
    setUrl(item.url ?? ''); setPassword(item.password ?? '');
    setRank(item.rank ?? 'B'); setDetailVisible(true);
  };

  const deleteSchedule = (id: string) => {
    Alert.alert('削除', 'このデータを削除しますか？', [
      { text: '戻る', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          const filtered = schedules.filter(s => s.id !== id);
          setSchedules(filtered); await saveSchedules(filtered); closeModal();
        }
      }
    ]);
  };

  const rankColor = (r: string) => ({ S: '#e74c3c', A: '#e67e22', B: '#2980b9', C: '#7f8c8d' }[r] ?? '#999');
  const today = new Date().toISOString().split('T')[0];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>

        <View style={styles.topNav}>
          <View style={styles.headerStats}>
            <View style={styles.statChip}>
              <Text style={styles.statNum}>{activeSchedules.length}</Text>
              <Text style={styles.statLabel}>持ち駒</Text>
            </View>
            <Text style={styles.headerTitle}>就活管理</Text>
            <View style={[styles.statChip, { backgroundColor: '#fff3cd' }]}>
              <Text style={[styles.statNum, { color: '#856404' }]}>{internalCount}</Text>
              <Text style={[styles.statLabel, { color: '#856404' }]}>内定</Text>
            </View>
          </View>
        </View>

        {activeTab === 'calendar' && (
          <View style={{ flex: 1 }}>
            <Calendar
              onDayPress={(day: any) => { setSelectedDate(day.dateString); setCalendarDaySelected(true); }}
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
                const dateStr = date.dateString;
                const companies = dateCompanyMap[dateStr] || [];
                const isSelected = dateStr === selectedDate;
                const isToday = dateStr === today;
                return (
                  <TouchableOpacity
                    onPress={() => { setSelectedDate(dateStr); setCalendarDaySelected(true); }}
                    style={{ alignItems: 'center', width: 46, minHeight: 52 }}
                  >
                    <View style={[
                      { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
                      isSelected && { backgroundColor: TDU_BLUE },
                      isToday && !isSelected && { borderWidth: 1.5, borderColor: ACCENT },
                    ]}>
                      <Text style={[
                        { fontSize: 12 },
                        state === 'disabled' && { color: '#ccc' },
                        isSelected ? { color: '#fff', fontWeight: 'bold' }
                          : isToday ? { color: ACCENT, fontWeight: 'bold' }
                            : { color: '#333' },
                      ]}>{date.day}</Text>
                    </View>
                    {companies.slice(0, 2).map((c: string, i: number) => (
                      <Text key={i} style={styles.calDayCompany} numberOfLines={1}>{c}</Text>
                    ))}
                    {companies.length > 2 && (
                      <Text style={[styles.calDayCompany, { color: '#999' }]}>+{companies.length - 2}</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
            <View style={styles.todoArea}>
              {!calendarDaySelected ? (
                <>
                  <Text style={styles.subTitle}>📌 直近の予定</Text>
                  {upcomingSchedules.length === 0
                    ? <Text style={styles.emptyText}>直近の予定はありません</Text>
                    : upcomingSchedules.map(item => (
                      <TouchableOpacity key={item.id} style={styles.upcomingCard} onPress={() => openDetail(item)}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemTitle}>{item.company}</Text>
                          <Text style={styles.itemStatus}>
                            {item.date.replace(/-/g, '/')} {item.time ? `${item.time}〜 · ` : ''}{item.status}
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
                      <TouchableOpacity onPress={() => setCalendarDaySelected(false)}>
                        <Text style={{ color: '#999', fontSize: 11 }}>直近に戻る</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
                        <Text style={styles.addButtonText}>+ 追加</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {filteredByDate.length === 0
                      ? <Text style={styles.emptyText}>この日の予定はありません</Text>
                      : filteredByDate.map(item => (
                        <TouchableOpacity key={item.id} style={styles.itemCard} onPress={() => openDetail(item)}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>{item.company}</Text>
                            <Text style={styles.itemStatus}>{item.time ? `${item.time}〜 · ` : ''}{item.status}</Text>
                          </View>
                          <View style={[styles.rankBadge, { backgroundColor: rankColor(item.rank) }]}>
                            <Text style={styles.rankText}>{item.rank}</Text>
                          </View>
                          <Text style={styles.itemArrow}>〉</Text>
                        </TouchableOpacity>
                      ))
                    }
                  </ScrollView>
                </>
              )}
            </View>
          </View>
        )}

        {activeTab === 'list' && (
          <View style={{ flex: 1 }}>
            <View style={styles.listHeader}>
              <Text style={[styles.subTitle, { marginBottom: 8 }]}>持ち駒一覧 ({schedules.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {SORT_OPTIONS.map(opt => (
                    <TouchableOpacity key={opt}
                      style={[styles.sortChip, sortType === opt && styles.sortChipActive]}
                      onPress={async () => { setSortType(opt as SortType); await AsyncStorage.setItem('@sort_type', opt); }}>
                      <Text style={[styles.sortChipText, sortType === opt && { color: '#fff' }]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
            <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
              {sortedSchedules.length === 0
                ? <Text style={styles.emptyText}>登録されている企業はありません</Text>
                : sortedSchedules.map(item => (
                  <TouchableOpacity key={item.id} style={styles.listCard} onPress={() => openDetail(item)}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.rankBadge, { backgroundColor: rankColor(item.rank) }]}>
                          <Text style={styles.rankText}>{item.rank}</Text>
                        </View>
                        <Text style={styles.itemTitle}>{item.company}</Text>
                      </View>
                      <Text style={styles.dateText}>{item.date.replace(/-/g, '/')}{item.time ? ` ${item.time}〜` : ''}</Text>
                      {item.url ? <Text style={styles.notePreview} numberOfLines={1}>🔗 {item.url}</Text> : null}
                      {item.note ? <Text style={styles.notePreview} numberOfLines={1}>📝 {item.note}</Text> : null}
                    </View>
                    <View style={[styles.statusBadge, INACTIVE_STATUSES.includes(item.status) && { backgroundColor: '#ccc' }]}>
                      <Text style={styles.statusBadgeText}>{item.status}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              }
              <View style={{ height: 80 }} />
            </ScrollView>
            <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
              <Text style={styles.fabText}>＋</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'settings' && (
          <ScrollView style={{ flex: 1, padding: 20 }}>
            <Text style={styles.settingSection}>通知設定</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>リマインダー通知</Text>
              <Switch
                value={notifyEnabled}
                onValueChange={async v => { setNotifyEnabled(v); await AsyncStorage.setItem('@notify_enabled', JSON.stringify(v)); }}
                trackColor={{ true: TDU_BLUE }}
              />
            </View>
            {notifyEnabled && (
              <View style={[styles.settingRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
                <Text style={styles.settingLabel}>通知タイミング（何日前）</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['0', '1', '2', '3'].map(d => (
                    <TouchableOpacity key={d}
                      style={[styles.sortChip, notifyDaysBefore === d && styles.sortChipActive]}
                      onPress={async () => { setNotifyDaysBefore(d); await AsyncStorage.setItem('@notify_days', d); }}>
                      <Text style={[styles.sortChipText, notifyDaysBefore === d && { color: '#fff' }]}>{d}日前</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <Text style={[styles.settingSection, { marginTop: 28 }]}>データ管理</Text>
            <TouchableOpacity style={styles.dangerButton} onPress={() => {
              Alert.alert('全データ削除', '全ての企業データを削除しますか？', [
                { text: 'キャンセル', style: 'cancel' },
                { text: '削除', style: 'destructive', onPress: async () => { setSchedules([]); await AsyncStorage.removeItem(STORAGE_KEY); } }
              ]);
            }}>
              <Text style={styles.dangerButtonText}>全データを削除する</Text>
            </TouchableOpacity>
            <Text style={[styles.settingSection, { marginTop: 28 }]}>このアプリについて</Text>
            <View style={styles.aboutBox}>
              <Text style={styles.aboutText}>就活管理リマインダー v2.0</Text>
              <Text style={styles.aboutText}>企業ごとの選考状況・面接予定・メモ・URL・パスワードを一元管理できます。</Text>
            </View>
          </ScrollView>
        )}

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

                <Text style={styles.label}>志望度</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
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
                      style={[styles.statusOption, selectedStatus === opt && styles.statusSelected]}
                      onPress={() => setSelectedStatus(opt)}>
                      <Text style={[styles.statusOptionText, selectedStatus === opt && { color: '#fff' }]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.label}>日付（締切/面接）</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={selectedDate} onChangeText={setSelectedDate} keyboardType="numbers-and-punctuation" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>時間</Text>
                    <TextInput style={styles.input} placeholder="14:00" value={selectedTime} onChangeText={setSelectedTime} keyboardType="numbers-and-punctuation" />
                  </View>
                </View>

                <Text style={styles.label}>URL（マイページ等）</Text>
                <TextInput style={styles.input} placeholder="https://..." value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />

                <Text style={styles.label}>パスワード</Text>
                <TextInput style={styles.input} placeholder="パスワード" value={password} onChangeText={setPassword} autoCapitalize="none" />

                <Text style={styles.label}>メモ（面接内容・対策など）</Text>
                <TextInput style={[styles.input, styles.textArea]} multiline placeholder="メモを入力..." value={note} onChangeText={setNote} />

                <View style={styles.modalButtons}>
                  <TouchableOpacity onPress={closeModal}><Text style={styles.cancelText}>戻る</Text></TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveButton, !companyName.trim() && styles.saveButtonDisabled]}
                    onPress={handleSave}>
                    <Text style={styles.saveButtonText}>保存</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
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
  calDayCompany: { fontSize: 7, color: TDU_BLUE, fontWeight: 'bold', textAlign: 'center', width: 46 },
  upcomingCard: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f0f4ff', borderRadius: 10, marginBottom: 8 },
  todoArea: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  subTitle: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  addButton: { backgroundColor: TDU_BLUE, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  addButtonText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  itemCard: { paddingVertical: 13, borderBottomWidth: 1, borderColor: '#f0f0f0', flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { fontSize: 15, fontWeight: 'bold', color: '#222' },
  itemStatus: { fontSize: 11, color: '#888', marginTop: 3 },
  itemArrow: { color: '#ccc', fontSize: 16 },
  emptyText: { textAlign: 'center', color: '#bbb', marginTop: 24, fontSize: 13 },
  listHeader: { padding: 16, paddingBottom: 10, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  listCard: { padding: 15, backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#eee', elevation: 1 },
  dateText: { fontSize: 11, color: '#999', marginTop: 4 },
  notePreview: { fontSize: 10, color: '#aaa', marginTop: 2 },
  statusBadge: { backgroundColor: TDU_BLUE, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, marginLeft: 8 },
  statusBadgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  rankBadge: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f2f5' },
  sortChipActive: { backgroundColor: TDU_BLUE },
  sortChipText: { fontSize: 12, color: '#666' },
  fab: { position: 'absolute', bottom: 16, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: TDU_BLUE, alignItems: 'center', justifyContent: 'center', elevation: 5 },
  fabText: { color: '#fff', fontSize: 26, lineHeight: 30 },
  settingSection: { fontSize: 12, fontWeight: 'bold', color: '#888', marginBottom: 12, letterSpacing: 1 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  settingLabel: { fontSize: 14, color: '#333', flex: 1, marginRight: 10 },
  dangerButton: { borderWidth: 1, borderColor: '#e74c3c', padding: 14, borderRadius: 10, alignItems: 'center' },
  dangerButtonText: { color: '#e74c3c', fontWeight: 'bold' },
  aboutBox: { backgroundColor: '#f8f9fa', padding: 16, borderRadius: 10 },
  aboutText: { fontSize: 13, color: '#666', lineHeight: 20 },
  tabBar: { flexDirection: 'row', height: 70, borderTopWidth: 1, borderColor: '#f0f0f0', backgroundColor: '#fff', paddingBottom: 10 },
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabIcon: { fontSize: 20, opacity: 0.3 },
  tabIconActive: { opacity: 1 },
  tabLabel: { fontSize: 9, color: '#ccc', marginTop: 3 },
  tabLabelActive: { color: TDU_BLUE, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#333' },
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
});
