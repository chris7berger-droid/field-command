/**
 * Home — this person's assigned work for the week, not every live job.
 * Prefer assignments.team_member_id === user.id; name-match only when that UUID is blank.
 * Admission is Schedule assignment + live jobs row (or this-user open punch).
 * Sales call_log.stage does not veto. View All is the broader escape hatch.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useQuery } from '@powersync/react';
import { C, F, S } from '../lib/tokens';
import { parseJSON, parseJSONArray, tod, addDaysYmd, localYmd } from '../lib/utils';
import {
  LIVE_JOB_FILTER, jobNumber, tripLine, tripsByCallLog,
} from '../lib/trips';
import { crewByCallLog, crewLine, buildHomeWeekJobs } from '../lib/crew';
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
const WEEK_DUTY_KEYS = [...DUTY_LOGS.map((d) => d.short), PRT_DUTY.short];

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
  const tasks = prtDays.flatMap((d) => (d.tasks || []).filter((t) => (t.description || '').trim()));
  const names = [...new Set(tasks.map((t) => t.description.trim()))].join(' · ');
  const target = tasks.length === 1 ? Number(tasks[0].pct_complete) || null : null;
  return {
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

export default function HomeScreen({ navigation, user }) {
  const today = tod();
  const monday = getMonday();
  const sunday = getSunday(monday);
  const weekDates = useMemo(() => getWeekDates(monday), [monday]);
  const userId = user?.id || '';
  const userName = user?.name || '';
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
    `SELECT * FROM time_punches WHERE employee_id = ? AND punch_date >= ? AND punch_date <= ? ORDER BY punch_date ASC, punch_time ASC`,
    [userId, punchFrom, sunday]
  );

  const { data: jobs } = useQuery(
    `SELECT * FROM call_log ORDER BY date ASC`
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
            j.scheduled_start, j.scheduled_end, j.start_date, j.end_date, j.lead
       FROM jobs j
      WHERE ${LIVE_JOB_FILTER}`
  );

  const { data: assignRows } = useQuery(
    `SELECT j.call_log_id AS call_log_id, a.crew_name AS crew_name, a.date AS date,
            a.team_member_id AS team_member_id
       FROM assignments a
       INNER JOIN jobs j ON j.id = a.job_id
      WHERE ${LIVE_JOB_FILTER}`
  );

  const tripsByJob = useMemo(
    () => tripsByCallLog(mobRows, wtcTripRows),
    [mobRows, wtcTripRows]
  );

  const crewAssignByJob = useMemo(
    () => crewByCallLog(assignRows),
    [assignRows]
  );
  const leadByJob = useMemo(() => {
    const m = new Map();
    for (const row of (liveJobRows || [])) {
      const id = String(row.call_log_id);
      const lead = (row.lead || '').trim();
      if (lead && !m.has(id)) m.set(id, lead);
    }
    return m;
  }, [liveJobRows]);

  const openPunch = useMemo(() => openClockInPunch(weekPunches), [weekPunches]);
  const onJobId = openPunch ? String(openPunch.job_id) : null;
  const workDate = punchDay(openPunch) || today;

  const { data: openJobRows } = useQuery(
    `SELECT * FROM call_log WHERE id = ?`,
    [onJobId || '__none__']
  );

  const weekJobs = useMemo(() => buildHomeWeekJobs({
    callLogRows: jobs,
    extraCallLogRows: openJobRows,
    assignRows,
    liveJobRows,
    memberName: userName,
    userId,
    monday,
    sunday,
    openPunch,
  }), [jobs, openJobRows, assignRows, liveJobRows, userName, userId, monday, sunday, openPunch]);

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

  const visibleJobIds = useMemo(
    () => new Set((weekJobs || []).map((j) => String(j.id))),
    [weekJobs]
  );

  const weekStrip = useMemo(() => weekDates.map((date) => {
    const isFuture = date > today;
    const isToday = date === today;
    const onDay = (e, type) => {
      if (!e.created_at || e.entry_type !== type) return false;
      if (!visibleJobIds.has(String(e.job_id))) return false;
      const when = new Date(e.created_at);
      return !Number.isNaN(when.getTime()) && localYmd(when) === date;
    };
    const sod = (weekLogs || []).some((e) => onDay(e, 'SOD'));
    const mod = (weekLogs || []).some((e) => onDay(e, 'MOD'));
    const eod = (weekLogs || []).some((e) => onDay(e, 'EOD'));
    const report = (weekReports || []).find((r) => (
      r.report_date === date
      && visibleJobIds.has(String(r.job_id))
      && (r.status === 'submitted' || r.status === 'approved')
    ));
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
  }), [weekDates, today, weekLogs, weekReports, visibleJobIds]);

  const goMenu = (job) => {
    navigation.navigate('JobMenu', { jobId: job.id, jobName: job.job_name });
  };

  const goClock = (job) => {
    navigation.navigate('JobDetail', {
      jobId: job.id,
      jobName: job.job_name,
      tab: 'TimeClock',
    });
  };

  const goDuty = (job, dutyKey) => {
    const gate = reportClockGate(job.id, weekPunches == null ? null : weekPunches);
    if (gate.allowed) {
      const isLog = dutyKey === 'SOD' || dutyKey === 'MOD' || dutyKey === 'EOD';
      navigation.navigate('JobDetail', {
        jobId: job.id,
        jobName: job.job_name,
        tab: 'Report',
        reportSection: isLog ? 'log' : 'prt',
        logType: isLog ? dutyKey : undefined,
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
          <View style={styles.weekGrid}>
            {WEEK_DUTY_KEYS.map((key, row) => (
              <View key={key} style={[styles.weekRow, styles.weekDutyRow]}>
                <Text style={styles.weekKeyLabel}>{key}</Text>
                <View style={styles.weekRowDots}>
                  {weekStrip.map((col) => {
                    const l = col.lights[row];
                    return (
                      <View key={col.date} style={styles.weekDotCell}>
                        <View
                          style={[
                            styles.weekDot,
                            l.on && (l.key === 'PRT' && l.hit === false ? styles.weekDotShort : styles.weekDotOn),
                            col.isFuture && styles.weekDotFuture,
                          ]}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
            <View style={[styles.weekRow, styles.weekDayRow]}>
              <View style={styles.weekKeySpacer} />
              <View style={styles.weekRowDots}>
                {weekStrip.map((col, i) => (
                  <View key={col.date} style={styles.weekDotCell}>
                    <Text style={[styles.weekColLabel, col.isToday && styles.weekColLabelToday]}>
                      {DAY_LABELS[i]}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>TODAY</Text>
        {todayJobs.length === 0 ? (
          <Text style={styles.emptyText}>No jobs assigned this week</Text>
        ) : todayJobs.map((job) => {
          const id = String(job.id);
          const num = jobNumber(job);
          const trip = tripLine(tripsByJob.get(id), today, monday, sunday);
          const crew = crewLine(crewAssignByJob.get(id), leadByJob.get(id));
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
              {isThisJob ? (
                <View style={styles.thisJobPill}>
                  <Text style={styles.thisJobText}>THIS JOB</Text>
                </View>
              ) : null}
              <View style={styles.todayHeadRow}>
                {num ? <Text style={styles.todayJobNum}>{num}</Text> : <View style={styles.todayJobNumSpacer} />}
                <TouchableOpacity
                  style={styles.openJobBtn}
                  activeOpacity={0.7}
                  onPress={() => goMenu(job)}
                >
                  <Text style={styles.openJobText}>OPEN JOB</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity activeOpacity={0.7} onPress={() => goMenu(job)}>
                <Text style={styles.todayJobName} numberOfLines={2}>{job.job_name}</Text>
                {trip ? <Text style={styles.todayTrip}>{trip}</Text> : null}
                {crew ? <Text style={styles.todayCrew}>{crew}</Text> : null}
                {sow?.names ? (
                  <Text style={styles.todaySow}>
                    {sow.names}
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
                    onPress={() => goDuty(job, it.key)}
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
  weekGrid: { gap: 0 },
  weekRow: { flexDirection: 'row', alignItems: 'center' },
  weekDutyRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  weekDayRow: { paddingTop: 6 },
  weekKeyLabel: {
    width: 34, fontFamily: F.display, fontSize: 10, color: C.textFaint,
    letterSpacing: 1, lineHeight: 12,
  },
  weekKeySpacer: { width: 34 },
  weekRowDots: { flex: 1, flexDirection: 'row' },
  weekDotCell: { flex: 1, alignItems: 'center' },
  weekDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)' },
  weekDotOn: { backgroundColor: C.teal },
  weekDotShort: { backgroundColor: C.amber },
  weekDotFuture: { opacity: 0.35 },
  weekColLabel: { fontFamily: F.display, fontSize: 10, color: C.textFaint, letterSpacing: 1, marginTop: 2, textAlign: 'center' },
  weekColLabelToday: { color: C.teal },

  sectionTitle: { fontFamily: F.display, fontSize: 13, color: C.textMuted, letterSpacing: 2, marginBottom: S.sm },

  todayCard: { backgroundColor: C.linenCard, borderRadius: 12, padding: S.md, borderWidth: 1, borderColor: C.borderStrong, marginBottom: S.md },
  todayCardDone: { borderColor: C.tealDark },
  todayCardOn: { borderColor: C.teal, borderWidth: 2 },
  thisJobPill: {
    alignSelf: 'flex-start', backgroundColor: C.dark, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8,
  },
  thisJobText: { fontFamily: F.display, fontSize: 11, color: C.teal, letterSpacing: 1.5 },
  todayHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  todayJobNum: { flex: 1, fontFamily: F.display, fontSize: 28, color: C.textHead, letterSpacing: 1 },
  todayJobNumSpacer: { flex: 1 },
  todayJobName: { fontFamily: F.display, fontSize: 15, color: C.textBody, textTransform: 'uppercase', letterSpacing: 0.5 },
  todayTrip: { fontFamily: F.displayMed, fontSize: 13, color: C.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
  todayCrew: { fontFamily: F.bodyMed, fontSize: 13, color: C.textBody, marginTop: 4 },
  todaySow: { fontFamily: F.bodyMed, fontSize: 13, color: C.textMuted, marginTop: 6, marginBottom: S.sm },
  openJobBtn: {
    backgroundColor: C.dark, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  openJobText: { fontFamily: F.display, fontSize: 12, color: C.teal, letterSpacing: 1.5 },

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
