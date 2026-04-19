/**
 * Job Detail Screen — Native Only
 * Tab container: Time Clock | Tasks | Report
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, F, S } from '../lib/tokens';
import TimeClockTab from './tabs/TimeClockTab';
import TasksTab from './tabs/TasksTab';
import ReportTab from './tabs/ReportTab';

const TAB_KEYS = ['TimeClock', 'Tasks', 'Report'];
const TAB_LABELS = ['TIME CLOCK', 'FIELD SOW', 'REPORT'];

export default function JobDetailScreen({ route, navigation, user }) {
  const { jobId, jobName } = route.params;
  const employeeId = user?.id || '';
  const [activeTab, setActiveTab] = useState('TimeClock');

  const renderTab = () => {
    switch (activeTab) {
      case 'TimeClock':
        return <TimeClockTab jobId={jobId} jobName={jobName} employeeId={employeeId} />;
      case 'Tasks':
        return <TasksTab jobId={jobId} />;
      case 'Report':
        return <ReportTab jobId={jobId} employeeId={employeeId} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backBtn}>{'< JOBS'}</Text>
        </TouchableOpacity>
        <Text style={styles.jobName} numberOfLines={1}>
          {jobName || 'Job'}
        </Text>
      </View>

      <View style={styles.tabBar}>
        {TAB_KEYS.map((key, i) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, activeTab === key && styles.tabActive]}
            onPress={() => setActiveTab(key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>
              {TAB_LABELS[i]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.tabContent}>
        {renderTab()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.linen },
  header: {
    backgroundColor: C.dark,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: S.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
  },
  backBtn: { fontFamily: F.displayMed, fontSize: 14, color: C.teal, letterSpacing: 1 },
  jobName: {
    fontFamily: F.display, fontSize: 20, color: C.teal,
    letterSpacing: 1, textTransform: 'uppercase', flex: 1,
  },
  tabBar: {
    backgroundColor: C.dark, flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: C.darkBorder,
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: C.teal },
  tabText: { fontFamily: F.display, fontSize: 13, color: C.textFaint, letterSpacing: 1.5 },
  tabTextActive: { color: C.teal },
  tabContent: { flex: 1 },
});
