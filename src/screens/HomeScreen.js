/**
 * Home Screen — Weekly Dashboard
 * Shows this week's hours, today's status, daily breakdown, active jobs, and recent DPRs.
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@powersync/react';
import { C, F, S } from '../lib/tokens';
import { fmtHrs, fmtTime, tod } from '../lib/utils';
import LinenBackground from '../components/LinenBackground';

// Get Monday of the current week (YYYY-MM-DD)
function getMonday() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  return mon.toISOString().slice(0, 10);
}

// Get Sunday of the current week
function getSunday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() + (day === 0 ? 0 : 7 - day);
  const sun = new Date(d.setDate(diff));
  return sun.toISOString().slice(0, 10);
}

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function getWeekDates() {
  const mon = new Date(getMonday() + 'T00:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export default function HomeScreen({ navigation, userName }) {
  const today = tod();
  const monday = getMonday();
  const sunday = getSunday();
  const weekDates = useMemo(() => getWeekDates(), []);
  const firstName = userName ? userName.split(' ')[0] : 'Crew';

  const todayDate = new Date();
  const dayOfWeek = todayDate.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = todayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // ── This week's punches ──────────────────────────────
  const { data: weekPunches } = useQuery(
    `SELECT * FROM time_punches WHERE punch_date >= ? AND punch_date <= ? ORDER BY punch_date ASC, punch_time ASC`,
    [monday, sunday]
  );

  // ── Active jobs ──────────────────────────────────────
  const { data: jobs } = useQuery(
    `SELECT * FROM call_log WHERE stage IN ('Scheduled', 'In Progress', 'mobilized', 'in_progress') ORDER BY date ASC`
  );

  // ── This week's DPRs ────────────────────────────────
  const { data: weekReports } = useQuery(
    `SELECT * FROM daily_production_reports WHERE report_date >= ? AND report_date <= ? ORDER BY report_date DESC`,
    [monday, sunday]
  );

  // ── Compute weekly hours ─────────────────────────────
  const weeklyStats = useMemo(() => {
    if (!weekPunches || weekPunches.length === 0) {
      return { totalRegular: 0, totalOT: 0, dailyHours: {}, daysWorked: 0 };
    }

    const dailyHours = {};
    const byDate = {};

    // Group punches by date
    for (const p of weekPunches) {
      if (!byDate[p.punch_date]) byDate[p.punch_date] = [];
      byDate[p.punch_date].push(p);
    }

    let totalRegular = 0;
    let totalOT = 0;
    let daysWorked = 0;

    for (const [date, punches] of Object.entries(byDate)) {
      let dayMs = 0;
      let clockIn = null;
      let lunchStart = null;
      let lunchMs = 0;

      for (const p of punches) {
        const t = new Date(p.punch_time).getTime();
        if (p.punch_type === 'clock_in') clockIn = t;
        if (p.punch_type === 'clock_out' && clockIn) { dayMs += t - clockIn; clockIn = null; }
        if (p.punch_type === 'lunch_start') lunchStart = t;
        if (p.punch_type === 'lunch_end' && lunchStart) { lunchMs += t - lunchStart; lunchStart = null; }
      }

      const netMs = Math.max(0, dayMs - lunchMs);
      const hrs = netMs / 3600000;
      const reg = Math.min(hrs, 8);
      const ot = Math.max(0, hrs - 8);

      dailyHours[date] = { regular: Math.round(reg * 10) / 10, ot: Math.round(ot * 10) / 10, total: Math.round(hrs * 10) / 10 };
      totalRegular += reg;
      totalOT += ot;
      if (hrs > 0) daysWorked++;
    }

    return {
      totalRegular: Math.round(totalRegular * 10) / 10,
      totalOT: Math.round(totalOT * 10) / 10,
      dailyHours,
      daysWorked,
    };
  }, [weekPunches]);

  // Max hours in a day this week (for bar chart scaling)
  const maxDayHours = useMemo(() => {
    let max = 8;
    for (const d of Object.values(weeklyStats.dailyHours)) {
      if (d.total > max) max = d.total;
    }
    return max;
  }, [weeklyStats]);

  // Today's punches for status
  const todayPunches = useMemo(() => {
    return (weekPunches || []).filter((p) => p.punch_date === today);
  }, [weekPunches, today]);

  const todayHours = weeklyStats.dailyHours[today] || { regular: 0, ot: 0, total: 0 };
  const lastPunch = todayPunches.length > 0 ? todayPunches[todayPunches.length - 1] : null;

  return (
    <LinenBackground>
      <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={styles.content}>

        {/* Greeting */}
        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greeting}>Hey, {firstName}</Text>
            <Text style={styles.dateText}>{dayOfWeek} · {dateStr}</Text>
          </View>
          <View style={styles.jobCountBadge}>
            <Text style={styles.jobCountNum}>{jobs?.length ?? 0}</Text>
            <Text style={styles.jobCountLabel}>{(jobs?.length ?? 0) === 1 ? 'JOB' : 'JOBS'}</Text>
          </View>
        </View>

        {/* This Week Summary */}
        <View style={styles.weekCard}>
          <Text style={styles.weekCardTitle}>THIS WEEK</Text>
          <View style={styles.weekStatsRow}>
            <View style={styles.weekStat}>
              <Text style={styles.weekStatValue}>{weeklyStats.totalRegular + weeklyStats.totalOT}</Text>
              <Text style={styles.weekStatLabel}>HOURS</Text>
            </View>
            <View style={styles.weekStatDivider} />
            <View style={styles.weekStat}>
              <Text style={styles.weekStatValue}>{weeklyStats.daysWorked}</Text>
              <Text style={styles.weekStatLabel}>DAYS</Text>
            </View>
            <View style={styles.weekStatDivider} />
            <View style={styles.weekStat}>
              <Text style={[styles.weekStatValue, weeklyStats.totalOT > 0 && { color: C.amber }]}>
                {weeklyStats.totalOT}
              </Text>
              <Text style={styles.weekStatLabel}>OT</Text>
            </View>
          </View>

          {/* Daily Bar Chart */}
          <View style={styles.barChart}>
            {weekDates.map((date, i) => {
              const dayData = weeklyStats.dailyHours[date];
              const hrs = dayData?.total || 0;
              const barHeight = maxDayHours > 0 ? (hrs / maxDayHours) * 80 : 0;
              const isToday = date === today;
              const isPast = date < today;

              return (
                <View key={date} style={styles.barCol}>
                  <Text style={styles.barHrs}>{hrs > 0 ? hrs : ''}</Text>
                  <View style={styles.barTrack}>
                    {hrs > 0 && (
                      <View
                        style={[
                          styles.barFill,
                          { height: Math.max(barHeight, 4) },
                          dayData?.ot > 0 && styles.barFillOT,
                          isToday && styles.barFillToday,
                        ]}
                      />
                    )}
                  </View>
                  <Text style={[styles.barLabel, isToday && styles.barLabelToday]}>
                    {DAY_LABELS[i]}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Today's Status */}
        {lastPunch && (
          <View style={styles.todayCard}>
            <View style={styles.todayHeader}>
              <Text style={styles.todayTitle}>TODAY</Text>
              <Text style={styles.todayHours}>{todayHours.total} hrs{todayHours.ot > 0 ? ` (${todayHours.ot} OT)` : ''}</Text>
            </View>
            <View style={styles.todayPunches}>
              {todayPunches.map((p) => (
                <View key={p.id} style={styles.todayPunchRow}>
                  <View style={[styles.todayPunchDot, { backgroundColor: p.gps_override === 1 ? C.amber : C.teal }]} />
                  <Text style={styles.todayPunchType}>{formatPunchLabel(p.punch_type)}</Text>
                  <Text style={styles.todayPunchTime}>{fmtTime(p.punch_time)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Active Jobs */}
        <Text style={styles.sectionTitle}>ACTIVE JOBS</Text>
        {(jobs || []).map((job) => (
          <TouchableOpacity
            key={job.id}
            style={styles.jobCard}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('JobDetail', { jobId: job.id, jobName: job.job_name })}
          >
            <View style={styles.jobCardTop}>
              <Text style={styles.jobCardName} numberOfLines={1}>{job.job_name}</Text>
              {job.prevailing_wage === 1 && (
                <View style={styles.pwBadge}><Text style={styles.pwText}>PW</Text></View>
              )}
            </View>
            <Text style={styles.jobCardAddress} numberOfLines={1}>
              {[job.jobsite_address, job.jobsite_city, job.jobsite_state].filter(Boolean).join(', ')}
            </Text>
          </TouchableOpacity>
        ))}
        {(!jobs || jobs.length === 0) && (
          <Text style={styles.emptyText}>No active jobs this week</Text>
        )}

        {/* Weekly Reports */}
        {weekReports && weekReports.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: S.lg }]}>DAILY REPORTS</Text>
            {weekReports.map((r) => (
              <View key={r.id} style={styles.reportCard}>
                <View style={styles.reportHeader}>
                  <Text style={styles.reportDate}>
                    {new Date(r.report_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                  <View style={[styles.reportStatus, r.status === 'approved' && styles.reportStatusApproved]}>
                    <Text style={[styles.reportStatusText, r.status === 'approved' && styles.reportStatusTextApproved]}>
                      {r.status === 'approved' ? 'APPROVED' : r.status === 'submitted' ? 'PENDING' : 'DRAFT'}
                    </Text>
                  </View>
                </View>
                {r.notes ? <Text style={styles.reportNotes} numberOfLines={2}>{r.notes}</Text> : null}
                <Text style={styles.reportHours}>
                  {r.hours_regular} reg{r.hours_ot > 0 ? ` + ${r.hours_ot} OT` : ''}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* View All Jobs Button */}
        <TouchableOpacity
          style={styles.viewAllBtn}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('JobList')}
        >
          <Text style={styles.viewAllText}>VIEW ALL JOBS</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>FIELD COMMAND</Text>
          <Text style={styles.footerSub}>Command Suite</Text>
        </View>

      </ScrollView>
    </LinenBackground>
  );
}

function formatPunchLabel(type) {
  return {
    clock_in: 'Clock In', clock_out: 'Clock Out',
    lunch_start: 'Lunch', lunch_end: 'Lunch End',
    drive_start: 'Drive Start', drive_end: 'Arrive',
  }[type] || type;
}

const styles = StyleSheet.create({
  content: { padding: S.md, paddingBottom: 60 },

  // Greeting
  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.lg },
  greeting: { fontFamily: F.display, fontSize: 32, color: C.textHead, letterSpacing: 1 },
  dateText: { fontFamily: F.bodyMed, fontSize: 14, color: C.textMuted, marginTop: 2, letterSpacing: 0.5 },
  jobCountBadge: { backgroundColor: C.dark, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
  jobCountNum: { fontFamily: F.display, fontSize: 28, color: C.teal },
  jobCountLabel: { fontFamily: F.display, fontSize: 10, color: C.textFaint, letterSpacing: 2 },

  // Week Card
  weekCard: { backgroundColor: C.dark, borderRadius: 12, padding: S.md, marginBottom: S.lg },
  weekCardTitle: { fontFamily: F.display, fontSize: 12, color: C.textFaint, letterSpacing: 3, marginBottom: S.sm, textAlign: 'center' },
  weekStatsRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', marginBottom: S.md },
  weekStat: { alignItems: 'center' },
  weekStatValue: { fontFamily: F.display, fontSize: 36, color: C.teal },
  weekStatLabel: { fontFamily: F.display, fontSize: 11, color: C.textFaint, letterSpacing: 2, marginTop: 2 },
  weekStatDivider: { width: 1, height: 40, backgroundColor: C.darkBorder },

  // Bar Chart
  barChart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: S.sm },
  barCol: { alignItems: 'center', flex: 1 },
  barHrs: { fontFamily: F.bodyMed, fontSize: 10, color: C.textFaint, marginBottom: 2, height: 14 },
  barTrack: { width: 20, height: 80, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { backgroundColor: C.tealDeep, borderRadius: 4, width: '100%' },
  barFillOT: { backgroundColor: C.amber },
  barFillToday: { backgroundColor: C.teal },
  barLabel: { fontFamily: F.display, fontSize: 10, color: C.textFaint, letterSpacing: 1, marginTop: 4 },
  barLabelToday: { color: C.teal },

  // Today
  todayCard: { backgroundColor: C.linenCard, borderRadius: 10, padding: S.md, borderWidth: 1, borderColor: C.borderStrong, marginBottom: S.lg },
  todayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm },
  todayTitle: { fontFamily: F.display, fontSize: 14, color: C.textMuted, letterSpacing: 2 },
  todayHours: { fontFamily: F.displayMed, fontSize: 14, color: C.tealDark, letterSpacing: 1 },
  todayPunches: { gap: 4 },
  todayPunchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayPunchDot: { width: 6, height: 6, borderRadius: 3 },
  todayPunchType: { fontFamily: F.bodyMed, fontSize: 13, color: C.textBody, flex: 1 },
  todayPunchTime: { fontFamily: F.body, fontSize: 13, color: C.textLight },

  // Section
  sectionTitle: { fontFamily: F.display, fontSize: 13, color: C.textMuted, letterSpacing: 2, marginBottom: S.sm },

  // Job Cards
  jobCard: { backgroundColor: C.linenCard, borderRadius: 10, padding: S.md, borderWidth: 1, borderColor: C.borderStrong, marginBottom: S.sm },
  jobCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  jobCardName: { fontFamily: F.display, fontSize: 16, color: C.textHead, flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 },
  jobCardAddress: { fontFamily: F.body, fontSize: 13, color: C.textLight },
  pwBadge: { backgroundColor: C.pw, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  pwText: { fontFamily: F.display, fontSize: 11, color: C.white, letterSpacing: 1 },

  // Reports
  reportCard: { backgroundColor: C.linenCard, borderRadius: 10, padding: S.md, borderWidth: 1, borderColor: C.borderStrong, marginBottom: S.sm },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  reportDate: { fontFamily: F.displayMed, fontSize: 14, color: C.textHead, letterSpacing: 0.5 },
  reportStatus: { backgroundColor: C.dark, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  reportStatusApproved: { backgroundColor: C.tealDeep },
  reportStatusText: { fontFamily: F.display, fontSize: 10, color: C.amber, letterSpacing: 1 },
  reportStatusTextApproved: { color: C.teal },
  reportNotes: { fontFamily: F.body, fontSize: 13, color: C.textBody, marginBottom: 4, lineHeight: 18 },
  reportHours: { fontFamily: F.bodyMed, fontSize: 12, color: C.textMuted },

  // Empty
  emptyText: { fontFamily: F.body, fontSize: 14, color: C.textFaint, textAlign: 'center', paddingVertical: S.md },

  // View All
  viewAllBtn: { backgroundColor: C.dark, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: S.lg },
  viewAllText: { fontFamily: F.display, fontSize: 16, color: C.teal, letterSpacing: 2 },

  // Footer
  footer: { alignItems: 'center', marginTop: S.xl, paddingBottom: S.md },
  footerText: { fontFamily: F.display, fontSize: 13, color: C.textFaint, letterSpacing: 4 },
  footerSub: { fontFamily: F.body, fontSize: 11, color: C.textFaint, letterSpacing: 2, marginTop: 2, opacity: 0.5 },
});
