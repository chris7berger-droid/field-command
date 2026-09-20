/**
 * Job Detail — one destination from the job menu (Time Clock, SOW, or Reports).
 * No tab bar. Back returns to the job menu.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { C } from '../lib/tokens';
import JobSubHeader from '../components/JobSubHeader';
import TimeClockTab from './tabs/TimeClockTab';
import TasksTab from './tabs/TasksTab';
import ReportTab from './tabs/ReportTab';

const TITLES = {
  TimeClock: 'TIME CLOCK',
  Tasks: 'SOW',
  Report: 'REPORTS',
};

export default function JobDetailScreen({ route, navigation, user }) {
  const { jobId, jobName, tab = 'TimeClock', reportSection, logType } = route.params;
  const employeeId = user?.id || null;

  let body = null;
  if (tab === 'Tasks') {
    body = <TasksTab jobId={jobId} employeeId={employeeId} employeeName={user?.name || ''} />;
  } else if (tab === 'Report') {
    body = (
      <ReportTab
        key={`${reportSection || 'prt'}-${logType || ''}`}
        jobId={jobId}
        employeeId={employeeId}
        employeeName={user?.name || ''}
        jobName={jobName}
        navigation={navigation}
        initialSection={reportSection}
        initialLogType={logType}
      />
    );
  } else {
    body = <TimeClockTab jobId={jobId} jobName={jobName} employeeId={employeeId} navigation={navigation} />;
  }

  return (
    <View style={styles.screen}>
      <JobSubHeader navigation={navigation} title={TITLES[tab] || 'JOB'} />
      <View style={styles.body}>{body}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.linen },
  body: { flex: 1 },
});
