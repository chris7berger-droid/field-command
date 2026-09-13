/**
 * Home — today's expected work, not a timesheet.
 * SOD / MOD / EOD / PRT start dim, light up as the crew knocks them out.
 * The week strip is a record of those days, not hours.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useQuery } from '@powersync/react';
import { C, F, S } from '../lib/tokens';
import { parseJSON, parseJSONArray, tod, addDaysYmd, localYmd } from '../lib/utils';
import {
  LIVE_JOB_FILTER, jobNumber, tripLine, tripsByCallLog,
  collectSowDates, isActiveThisWeek,
} from '../lib/trips';
import {
  DUTY_LOGS, PRT_DUTY, dutyState, pickSowDaysForPrt,
  openClockInPunch, punchDay, punchLookbackDate, reportClockGate, reportClockCopy,
} from '../lib/dayDuty';
import { mergeDaysByDate } from './tabs/TasksTab';
import LinenBackground from '../components/LinenBackground';

function getMonday() {
  const today = tod();
  const [y, m, d] = today.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDaysYmd(today, offset);
}

function getSunday(monday) {
  return addDaysYmd(monday, 6);
}

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function getWeekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(monday, i));
}

function sowLineForJob(wtcRows, trips, today, priorPrtCount) {
  const tagged = [];
  for (const w of (wtcRows || [])) {
    for (const d of parseJSON(w.field_sow, [])) {
      tagged.push({ ...d, work_type_name: w.work_type_name });
    }
  }
  if (tagged.length === 0) return null;
  const { days } = mergeDaysByDate(tagged, trips);
  const prtDays = pickSowDaysForPrt(days, today, priorPrtCount);
  if (prtDays.length === 0) return null;
  const day = prtDays[0];
  const idx = Math.max(1, days.indexOf(day) + 1);
  const tasks = prtDays.flatMap((d) => (d.tasks || []).filter((t) => (t.description || '').trim()));
  const names = [...new Set(tasks.map((t) => t.description.trim()))].join(' · ');
  const target = tasks.length === 1 ? Number(tasks[0].pct_complete) || null : null;
  return {
    label: day.label || day.day_label || `Day ${idx}`,
    idx,
    total: days.length,
    names: names || null,
    target,
  };
}

function prtHit(report) {
  if (!report || (report.status !== 'submitted' && report.status !== 'approved')) return false;
  const tasks = parseJSONArray(report.tasks, []);
  const worked = tasks.filter((t) => Number(t.pct_today) > 0);
  if (worked.length === 0) return false;
  return worked.every((t) => Number(t.pct_today) >= (Number(t.target_pct) || 0));
}

export default function HomeScreen({ navigation, userName }) {
  const today = tod();
  const monday = getMonday();
  const sunday = getSunday(monday);
  const weekDates = useMemo(() => getWeekDates(monday), [monday]);
  const firstName = userName ? userName.split(' ')[0] : 'Crew';
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const todayDate = new Date();
  const dayOfWeek = todayDate.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = todayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const lookback = punchLookbackDate(today);
  const punchFrom = lookback < monday ? lookback : monday;

  const { data: weekPunches } = useQuery(
    `SELECT * FROM time_punches WHERE punch_date >= ? AND punch_date <= ? ORDER BY punch_date ASC, punch_time ASC`,
    [punchFrom, sunday]
  );

  const { data: jobs } = useQuery(
    `SELECT * FROM call_log WHERE stage IN ('Scheduled', 'In Progress', 'Parked', 'mobilized', 'in_progress') ORDER BY date ASC`
  );

  const { data: mobRows } = useQuery(
    `SELECT j.call_log_id AS call_log_id, jm.seq, jm.label, jm.start_date, jm.end_date
       FROM job_mobilizations jm
       INNER JOIN jobs j ON j.id = jm.job_id
      WHERE ${LIVE_JOB_FILTER}
      ORDER BY j.call_log_id, jm.seq`
  );

  const { data: wtcTripRows } = useQuery(
    `SELECT j.call_log_id AS call_log_id, jwt.field_sow, jwt.work_type_name
       FROM job_wtcs jwt
       INNER JOIN jobs j ON j.id = jwt.job_id
      WHERE ${LIVE_JOB_FILTER}`
  );

  const { data: liveJobRows } = useQuery(
    `SELECT j.call_log_id AS call_log_id,
            j.scheduled_start, j.scheduled_end, j.start_date, j.end_date
       FROM jobs j
      WHERE ${LIVE_JOB_FILTER}`
  );

  const tripsByJob = useMemo(
    () => tripsByCallLog(mobRows, wtcTripRows),
    [mobRows, wtcTripRows]
  );

  const sowDatesByJob = useMemo(
    () => collectSowDates(wtcTripRows),
    [wtcTripRows]
  );

  const weekJobs = useMemo(() => {
    const liveByCl = new Map();
    for (const row of (liveJobRows || [])) {
      const id = String(row.call_log_id);
      if (!liveByCl.has(id)) liveByCl.set(id, []);
      liveByCl.get(id).push(row);
    }
    const punched = new Set(
      (weekPunches || []).map((p) => String(p.job_id)).filter((id) => id && id !== 'null')
    );
    return (jobs || []).filter((job) => {
      const id = String(job.id);
      if (punched.has(id)) return true;
      const trips = tripsByJob.get(id);
      const sowDates = sowDatesByJob.get(id);
      const lives = liveByCl.get(id) || [];
      if (lives.length === 0) {
        return isActiveThisWeek({ trips, sowDates }, monday, sunday);
      }
      return lives.some((row) => isActiveThisWeek({
        trips,
        sowDates,
        scheduledStart: row.scheduled_start || row.start_date,
        scheduledEnd: row.scheduled_end || row.end_date,
      }, monday, sunday));
    });
  }, [jobs, liveJobRows, tripsByJob, sowDatesByJob, weekPunches, monday, sunday]);

  const { data: weekReports } = useQuery(
    `SELECT id, job_id, report_date, status, tasks FROM daily_production_reports
      WHERE report_date >= ? AND report_date <= ?`,
    [punchFrom, sunday]
  );

  const { data: priorPrtRows } = useQuery(
    `SELECT job_id, report_date FROM daily_production_reports
      WHERE report_date != ? AND (status = 'submitted' OR status = 'approved')`,
    [today]
  );

  const logFromIso = useMemo(
    () => new Date((lookback < monday ? lookback : monday) + 'T00:00:00').toISOString(),
    [lookback, monday]
  );
  const { data: weekLogs } = useQuery(
    `SELECT job_id, entry_type, created_at FROM daily_log_entries
      WHERE created_at >= ?`,
    [logFromIso]
  );

  const wtcsByJob = useMemo(() => {
    const m = new Map();
    for (const row of (wtcTripRows || [])) {
      const id = String(row.call_log_id);
      if (!m.has(id)) m.set(id, []);
      m.get(id).push(row);
    }
    return m;
  }, [wtcTripRows]);

  const logsByJobDate = useMemo(() => {
    const m = new Map();
    for (const e of (weekLogs || [])) {
      if (!e.created_at) continue;
      const when = new Date(e.created_at);
      if (Number.isNaN(when.getTime())) continue;
      const date = localYmd(when);
      const key = `${String(e.job_id)}|${date}`;
      if (!m.has(key)) m.set(key, new Set());
      m.get(key).add(e.entry_type);
    }
    return m;
  }, [weekLogs]);

  const reportsByJobDate = useMemo(() => {
    const m = new Map();
    for (const r of (weekReports || [])) {
      m.set(`${String(r.job_id)}|${r.report_date}`, r);
    }
    return m;
  }, [weekReports]);

  const priorCountByJob = useMemo(() => {
    const m = new Map();
    for (const r of (priorPrtRows || [])) {
      const id = String(r.job_id);
      if (!m.has(id)) m.set(id, new Set());
      m.get(id).add(r.report_date);
    }
    const counts = new Map();
    for (const [id, dates] of m) counts.set(id, dates.size);
    return counts;
  }, [priorPrtRows]);

  const openPunch = useMemo(() => openClockInPunch(weekPunches), [weekPunches]);
  const onJobId = openPunch ? String(openPunch.job_id) : null;
  const workDate = punchDay(openPunch) || today;

  const todayJobs = useMemo(() => {
    const list = [...weekJobs];
    if (!onJobId) return list;
    list.sort((a, b) => {
      const aOn = String(a.id) === onJobId ? 0 : 1;
      const bOn = String(b.id) === onJobId ? 0 : 1;
      return aOn - bOn;
    });
    return list;
  }, [weekJobs, onJobId]);

  const weekStrip = useMemo(() => weekDates.map((date) => {
    const isFuture = date > today;
    const isToday = date === today;
    const onDay = (e, type) => {
      if (!e.created_at || e.entry_type !== type) return false;
      const when = new Date(e.created_at);
      return !Number.isNaN(when.getTime()) && localYmd(when) === date;
    };
    const sod = (weekLogs || []).some((e) => onDay(e, 'SOD'));
    const mod = (weekLogs || []).some((e) => onDay(e, 'MOD'));
    const eod = (weekLogs || []).some((e) => onDay(e, 'EOD'));
    const report = (weekReports || []).find((r) => r.report_date === date && (r.status === 'submitted' || r.status === 'approved'));
    return {
      date,
      isToday,
      isFuture,
      lights: [
        { key: 'SOD', on: sod },
        { key: 'MOD', on: mod },
        { key: 'EOD', on: eod },
        { key: 'PRT', on: !!report, hit: report ? prtHit(report) : false },
      ],
    };
  }), [weekDates, today, weekLogs, weekReports]);

  const goClock = (job) => {
    navigation.navigate('JobDetail', {
      jobId: job.id,
      jobName: job.job_name,
      tab: 'TimeClock',
    });
  };

  const goReports = (job) => {
    const gate = reportClockGate(job.id, weekPunches == null ? null : weekPunches);
    if (gate.allowed) {
      navigation.navigate('JobDetail', {
        jobId: job.id,
        jobName: job.job_name,
        tab: 'Report',
      });
      return;
    }
    const openJob = (jobs || []).find((j) => String(j.id) === gate.openId);
    const openLabel = jobNumber(openJob) || openJob?.job_name || 'that job';
    const copy = reportClockCopy(gate.kind, openLabel);
    const dest = gate.kind === 'other' && openJob ? openJob : job;
    Alert.alert(copy.title, copy.body || undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: copy.confirm, onPress: () => goClock(dest) },
    ]);
  };

  return (
    <LinenBackground>
      <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={styles.content}>

        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greeting}>Hey, {firstName}</Text>
            <Text style={styles.dateText}>{dayOfWeek} · {dateStr}</Text>
          </View>
          <View style={styles.jobCountBadge}>
            <Text style={styles.jobCountNum}>{weekJobs.length}</Text>
            <Text style={styles.jobCountLabel}>{weekJobs.length === 1 ? 'JOB' : 'JOBS'}</Text>
          </View>
        </View>

        <View style={styles.weekCard}>
          <Text style={styles.weekCardTitle}>THIS WEEK</Text>
          <View style={styles.weekStrip}>
            {weekStrip.map((col, i) => (
              <View key={col.date} style={styles.weekCol}>
                <View style={styles.weekDots}>
                  {col.lights.map((l) => (
                    <View
                      key={l.key}
                      style={[
                        styles.weekDot,
                        l.on && (l.key === 'PRT' && l.hit === false ? styles.weekDotShort : styles.weekDotOn),
                        col.isFuture && styles.weekDotFuture,
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.weekColLabel, col.isToday && styles.weekColLabelToday]}>
                  {DAY_LABELS[i]}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.weekLegend}>SOD · MOD · EOD · PRT</Text>
        </View>

        <Text style={styles.sectionTitle}>TODAY</Text>
        {todayJobs.length === 0 ? (
          <Text style={styles.emptyText}>No jobs on the board this week</Text>
        ) : todayJobs.map((job) => {
          const id = String(job.id);
          const num = jobNumber(job);
          const trip = tripLine(tripsByJob.get(id), today, monday, sunday);
          const priorCount = priorCountByJob.get(id) || 0;
          const dutyDate = String(job.id) === onJobId ? workDate : today;
          let types = logsByJobDate.get(`${id}|${dutyDate}`) || new Set();
          if (String(job.id) === onJobId && openPunch?.punch_time) {
            const start = new Date(openPunch.punch_time).getTime();
            types = new Set();
            for (const e of (weekLogs || [])) {
              if (String(e.job_id) !== id || !e.created_at) continue;
              const when = new Date(e.created_at);
              if (!Number.isNaN(when.getTime()) && when.getTime() >= start) {
                types.add(e.entry_type);
              }
            }
          }
          const report = reportsByJobDate.get(`${id}|${dutyDate}`);
          const prtDone = report && (report.status === 'submitted' || report.status === 'approved');
          const clockIn = String(job.id) === onJobId ? openPunch.punch_time : null;
          const sow = sowLineForJob(wtcsByJob.get(id), tripsByJob.get(id), dutyDate, priorCount);
          const items = [
            ...DUTY_LOGS.map((d) => ({
              ...d,
              done: types.has(d.key),
              state: dutyState({
                done: types.has(d.key),
                clockInTime: clockIn,
                now,
                dueAfterMs: d.dueAfterMs,
                dueHour: d.dueHour,
              }),
            })),
            {
              ...PRT_DUTY,
              done: !!prtDone,
              state: dutyState({
                done: !!prtDone,
                clockInTime: clockIn,
                now,
                dueAfterMs: PRT_DUTY.dueAfterMs,
                dueHour: PRT_DUTY.dueHour,
              }),
              extra: prtDone
                ? (prtHit(report) ? 'HIT TARGET' : 'SUBMITTED')
                : (sow?.target != null ? `TARGET ${sow.target}%` : null),
            },
          ];
          const allDone = items.every((it) => it.done);
          const isThisJob = onJobId && String(job.id) === onJobId;

          return (
            <View key={job.id} style={[styles.todayCard, allDone && styles.todayCardDone, isThisJob && styles.todayCardOn]}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate('JobMenu', { jobId: job.id, jobName: job.job_name })}
              >
                {isThisJob ? (
                  <View style={styles.thisJobPill}>
                    <Text style={styles.thisJobText}>THIS JOB</Text>
                  </View>
                ) : null}
                {num ? <Text style={styles.todayJobNum}>{num}</Text> : null}
                <Text style={styles.todayJobName} numberOfLines={2}>{job.job_name}</Text>
                {trip ? <Text style={styles.todayTrip}>{trip}</Text> : null}
                {sow ? (
                  <Text style={styles.todaySow}>
                    {sow.label.toUpperCase()} OF {sow.total}
                    {sow.names ? `  ·  ${sow.names}` : ''}
                    {sow.target != null ? `  ·  TARGET ${sow.target}%` : ''}
                  </Text>
                ) : null}
              </TouchableOpacity>

              <View style={styles.dutyList}>
                {items.map((it) => (
                  <TouchableOpacity
                    key={it.key}
                    style={[
                      styles.dutyRow,
                      it.state === 'done' && styles.dutyRowDone,
                      it.state === 'due' && styles.dutyRowDue,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => goReports(job)}
                  >
                    <View style={[
                      styles.dutyLamp,
                      it.state === 'done' && styles.dutyLampOn,
                      it.state === 'due' && styles.dutyLampDue,
                    ]} />
                    <Text style={[
                      styles.dutyLabel,
                      it.state === 'done' && styles.dutyLabelOn,
                      it.state === 'due' && styles.dutyLabelDue,
                    ]}>
                      {it.label}
                    </Text>
                    <Text style={[
                      styles.dutyStatus,
                      it.state === 'done' && styles.dutyStatusOn,
                      it.state === 'due' && styles.dutyStatusDue,
                    ]}>
                      {it.state === 'done' ? (it.extra || 'DONE') : it.state === 'due' ? 'DUE' : (it.extra || '')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {allDone && isThisJob ? (
                <Text style={styles.pride}>DAY COMPLETE — THAT’S THE WORK</Text>
              ) : isThisJob ? (
                <Text style={styles.prideHint}>Clock-out waits until these are in.</Text>
              ) : null}
            </View>
          );
        })}

        <TouchableOpacity
          style={styles.viewAllBtn}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('JobList')}
        >
          <Text style={styles.viewAllText}>VIEW ALL JOBS</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>FIELD COMMAND</Text>
          <Text style={styles.footerSub}>Command Suite</Text>
        </View>

      </ScrollView>
    </LinenBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: S.md, paddingBottom: 60 },

  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.lg },
  greeting: { fontFamily: F.display, fontSize: 32, color: C.textHead, letterSpacing: 1 },
  dateText: { fontFamily: F.bodyMed, fontSize: 14, color: C.textMuted, marginTop: 2, letterSpacing: 0.5 },
  jobCountBadge: { backgroundColor: C.dark, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
  jobCountNum: { fontFamily: F.display, fontSize: 28, color: C.teal },
  jobCountLabel: { fontFamily: F.display, fontSize: 10, color: C.textFaint, letterSpacing: 2 },

  weekCard: { backgroundColor: C.dark, borderRadius: 12, padding: S.md, marginBottom: S.lg },
  weekCardTitle: { fontFamily: F.display, fontSize: 12, color: C.textFaint, letterSpacing: 3, marginBottom: S.sm, textAlign: 'center' },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between' },
  weekCol: { flex: 1, alignItems: 'center', gap: 6 },
  weekDots: { gap: 4, alignItems: 'center' },
  weekDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)' },
  weekDotOn: { backgroundColor: C.teal },
  weekDotShort: { backgroundColor: C.amber },
  weekDotFuture: { opacity: 0.35 },
  weekColLabel: { fontFamily: F.display, fontSize: 10, color: C.textFaint, letterSpacing: 1 },
  weekColLabelToday: { color: C.teal },
  weekLegend: { fontFamily: F.display, fontSize: 9, color: C.textFaint, letterSpacing: 1.5, textAlign: 'center', marginTop: S.sm },

  sectionTitle: { fontFamily: F.display, fontSize: 13, color: C.textMuted, letterSpacing: 2, marginBottom: S.sm },

  todayCard: { backgroundColor: C.linenCard, borderRadius: 12, padding: S.md, borderWidth: 1, borderColor: C.borderStrong, marginBottom: S.md },
  todayCardDone: { borderColor: C.tealDark },
  todayCardOn: { borderColor: C.teal, borderWidth: 2 },
  thisJobPill: {
    alignSelf: 'flex-start', backgroundColor: C.dark, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8,
  },
  thisJobText: { fontFamily: F.display, fontSize: 11, color: C.teal, letterSpacing: 1.5 },
  todayJobNum: { fontFamily: F.display, fontSize: 28, color: C.textHead, letterSpacing: 1 },
  todayJobName: { fontFamily: F.display, fontSize: 15, color: C.textBody, textTransform: 'uppercase', letterSpacing: 0.5 },
  todayTrip: { fontFamily: F.displayMed, fontSize: 13, color: C.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
  todaySow: { fontFamily: F.bodyMed, fontSize: 13, color: C.textMuted, marginTop: 6, marginBottom: S.sm },

  dutyList: { gap: 6, marginTop: S.sm },
  dutyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.linenDeep,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
    opacity: 0.55,
  },
  dutyRowDone: { backgroundColor: C.dark, opacity: 1 },
  dutyRowDue: { opacity: 1, borderWidth: 1, borderColor: C.amber },
  dutyLamp: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.textFaint },
  dutyLampOn: { backgroundColor: C.teal },
  dutyLampDue: { backgroundColor: C.amber },
  dutyLabel: { flex: 1, fontFamily: F.display, fontSize: 14, color: C.textMuted, letterSpacing: 1.5 },
  dutyLabelOn: { color: C.teal },
  dutyLabelDue: { color: C.textHead },
  dutyStatus: { fontFamily: F.display, fontSize: 11, color: C.textFaint, letterSpacing: 1 },
  dutyStatusOn: { color: C.teal },
  dutyStatusDue: { color: C.amber },

  pride: { fontFamily: F.display, fontSize: 13, color: C.tealDark, letterSpacing: 1.5, textAlign: 'center', marginTop: S.md },
  prideHint: { fontFamily: F.body, fontSize: 12, color: C.textFaint, textAlign: 'center', marginTop: S.sm },

  emptyText: { fontFamily: F.body, fontSize: 14, color: C.textFaint, textAlign: 'center', paddingVertical: S.md },

  viewAllBtn: { backgroundColor: C.dark, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: S.lg },
  viewAllText: { fontFamily: F.display, fontSize: 16, color: C.teal, letterSpacing: 2 },

  footer: { alignItems: 'center', marginTop: S.xl, paddingBottom: S.md },
  footerText: { fontFamily: F.display, fontSize: 13, color: C.textFaint, letterSpacing: 4 },
  footerSub: { fontFamily: F.body, fontSize: 11, color: C.textFaint, letterSpacing: 2, marginTop: 2, opacity: 0.5 },
});
