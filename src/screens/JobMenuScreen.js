/**
 * Job menu — one job, five destinations. Crew picks what they came to do
 * instead of landing on Clock In.
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useQuery } from '@powersync/react';
import { C, F, S } from '../lib/tokens';
import { tod } from '../lib/utils';
import { namesMatch } from '../lib/crew';
import { LIVE_JOB_FILTER, jobNumber, tripLine, tripsByCallLog } from '../lib/trips';
import { assignmentDatesForJob, eligibleWorkDates, punchWorkDatesForJob } from '../lib/dailyLogHistory';
import {
  dailyLogAccessGate, reportClockGate, reportClockCopy, openClockJobId,
  switchJobClockCopy, punchLookbackDate,
} from '../lib/dayDuty';
import LinenBackground from '../components/LinenBackground';

const DESTINATIONS = [
  { key: 'TimeClock', label: 'TIME CLOCK', screen: 'JobDetail', params: { tab: 'TimeClock' } },
  { key: 'Sow', label: 'SOW', screen: 'JobDetail', params: { tab: 'Tasks' } },
  { key: 'Reports', label: 'REPORTS', screen: 'JobDetail', params: { tab: 'Report' } },
  { key: 'Customer', label: 'CUSTOMER', screen: 'JobCustomer' },
  { key: 'JobSite', label: 'JOB SITE', screen: 'JobSite' },
];

export default function JobMenuScreen({ route, navigation, user }) {
  const { jobId, jobName, from } = route.params;
  const today = tod();
  const userId = user?.id || '';
  const userName = user?.name || '';

  const { data: jobRows } = useQuery(
    `SELECT * FROM call_log WHERE id = ?`,
    [jobId]
  );
  const job = jobRows?.[0] || { id: jobId, job_name: jobName };

  const { data: mobRows } = useQuery(
    `SELECT j.call_log_id AS call_log_id, jm.seq, jm.label, jm.start_date, jm.end_date
       FROM job_mobilizations jm
       INNER JOIN jobs j ON j.id = jm.job_id
      WHERE j.call_log_id = ? AND ${LIVE_JOB_FILTER}
      ORDER BY jm.seq`,
    [jobId]
  );

  const { data: wtcTripRows } = useQuery(
    `SELECT j.call_log_id AS call_log_id, jwt.field_sow
       FROM job_wtcs jwt
       INNER JOIN jobs j ON j.id = jwt.job_id
      WHERE j.call_log_id = ? AND ${LIVE_JOB_FILTER}`,
    [jobId]
  );

  const { data: punchRows } = useQuery(
    `SELECT job_id, employee_id, punch_type, punch_time, punch_date FROM time_punches WHERE punch_date >= ? ORDER BY punch_time ASC`,
    [punchLookbackDate(today)]
  );
  const { data: jobPunchRows } = useQuery(
    `SELECT job_id, employee_id, punch_type, punch_time, punch_date FROM time_punches WHERE job_id = ? ORDER BY punch_time ASC`,
    [jobId]
  );
  const { data: assignRows } = useQuery(
    `SELECT j.call_log_id AS call_log_id, a.crew_name AS crew_name, a.date AS date,
            a.team_member_id AS team_member_id
       FROM assignments a
       INNER JOIN jobs j ON j.id = a.job_id
      WHERE j.call_log_id = ? AND ${LIVE_JOB_FILTER}`,
    [jobId]
  );

  const { data: openJobRows } = useQuery(
    `SELECT * FROM call_log WHERE id = ?`,
    [openClockJobId(punchRows) || jobId]
  );

  const trip = useMemo(() => {
    const map = tripsByCallLog(mobRows, wtcTripRows);
    return tripLine(map.get(String(jobId)), today);
  }, [mobRows, wtcTripRows, jobId, today]);

  const num = jobNumber(job);
  const openJob = openJobRows?.[0] || null;
  const openLabel = jobNumber(openJob) || openJob?.job_name || 'that job';

  const goClock = (target) => {
    navigation.navigate('JobDetail', {
      jobId: target.id,
      jobName: target.job_name,
      tab: 'TimeClock',
    });
  };

  const eligibleDates = useMemo(() => {
    const assignmentDates = assignmentDatesForJob(assignRows, {
      jobId, userId, memberName: userName, namesMatch,
    });
    const punchDates = punchWorkDatesForJob(jobPunchRows, { jobId, employeeId: userId });
    return eligibleWorkDates({ assignmentDates, punchDates, today });
  }, [assignRows, jobPunchRows, jobId, userId, userName, today]);

  const open = (dest) => {
    if (dest.key === 'Reports') {
      const prtGate = reportClockGate(jobId, punchRows);
      const logGate = dailyLogAccessGate(jobId, punchRows, { eligible: eligibleDates.length > 0 });
      if (!prtGate.allowed && !logGate.allowed) {
        const copy = reportClockCopy(prtGate.kind === 'other' || logGate.kind === 'other' ? 'other' : prtGate.kind, openLabel);
        const destJob = (prtGate.kind === 'other' || logGate.kind === 'other') && openJob ? openJob : job;
        Alert.alert(copy.title, copy.body || undefined, [
          { text: 'Cancel', style: 'cancel' },
          { text: copy.confirm, onPress: () => goClock(destJob) },
        ]);
        return;
      }
      navigation.navigate(dest.screen, {
        jobId,
        jobName: job.job_name || jobName,
        tab: 'Report',
        reportSection: prtGate.allowed ? 'prt' : 'log',
      });
      return;
    }
    if (dest.key === 'TimeClock') {
      const openId = openClockJobId(punchRows);
      if (openId && openId !== String(jobId) && openJob) {
        const copy = switchJobClockCopy(openLabel);
        Alert.alert(copy.title, copy.body || undefined, [
          { text: 'Cancel', style: 'cancel' },
          { text: copy.confirm, onPress: () => goClock(openJob) },
        ]);
        return;
      }
    }
    navigation.navigate(dest.screen, {
      jobId,
      jobName: job.job_name || jobName,
      ...(dest.params || {}),
    });
  };

  return (
    <LinenBackground>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.back}>{from === 'list' ? '< JOBS' : '< HOME'}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={styles.content}
      >
        <View style={styles.identity}>
          {num ? <Text style={styles.number}>{num}</Text> : null}
          <Text style={styles.name}>{job.job_name || jobName || 'Job'}</Text>
          {trip ? <Text style={styles.trip}>{trip}</Text> : null}
        </View>

        {DESTINATIONS.map((dest) => (
          <TouchableOpacity
            key={dest.key}
            style={styles.btn}
            activeOpacity={0.7}
            onPress={() => open(dest)}
          >
            <Text style={styles.btnText}>{dest.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </LinenBackground>
  );
}

const styles = StyleSheet.create({
  topBar: {
    backgroundColor: C.dark,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: S.md,
  },
  back: { fontFamily: F.displayMed, fontSize: 14, color: C.teal, letterSpacing: 1 },
  content: { padding: S.md, paddingBottom: S.xxl },
  identity: { marginBottom: S.lg },
  number: { fontFamily: F.display, fontSize: 36, color: C.textHead, letterSpacing: 1 },
  name: {
    fontFamily: F.display, fontSize: 18, color: C.textBody,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2,
  },
  trip: {
    fontFamily: F.displayMed, fontSize: 14, color: C.textMuted,
    letterSpacing: 1, textTransform: 'uppercase', marginTop: 4,
  },
  btn: {
    backgroundColor: C.dark, borderRadius: 10, paddingVertical: 20,
    alignItems: 'center', marginBottom: S.sm,
  },
  btnText: { fontFamily: F.display, fontSize: 22, color: C.teal, letterSpacing: 2 },
});
