/**
 * Job List — this week's jobs, plus undated live jobs so crew can punch
 * in when the office has not put the job on Home yet.
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useQuery, useStatus } from '@powersync/react';
import { C, F, S } from '../lib/tokens';
import { tod, addDaysYmd } from '../lib/utils';
import {
  LIVE_JOB_FILTER, jobNumber, tripLine, tripsByCallLog,
  collectSowDates, isListedThisWeek,
} from '../lib/trips';
import LinenBackground from '../components/LinenBackground';

function weekMonSun() {
  const today = tod();
  const [y, m, d] = today.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const monday = addDaysYmd(today, offset);
  return { monday, sunday: addDaysYmd(monday, 6) };
}

export default function JobListScreen({ navigation, route, user }) {
  const pickClock = route?.params?.pickFor === 'TimeClock';
  const status = useStatus();
  const { monday, sunday } = weekMonSun();
  const { data: jobs, isLoading } = useQuery(
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
    `SELECT j.call_log_id AS call_log_id, jwt.field_sow
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

  const today = tod();
  const tripsByJob = useMemo(
    () => tripsByCallLog(mobRows, wtcTripRows),
    [mobRows, wtcTripRows]
  );
  const sowDatesByJob = useMemo(
    () => collectSowDates(wtcTripRows),
    [wtcTripRows]
  );
  const listedJobs = useMemo(() => {
    const liveByCl = new Map();
    for (const row of (liveJobRows || [])) {
      const id = String(row.call_log_id);
      if (!liveByCl.has(id)) liveByCl.set(id, []);
      liveByCl.get(id).push(row);
    }
    return (jobs || []).filter((job) => {
      const id = String(job.id);
      const trips = tripsByJob.get(id);
      const sowDates = sowDatesByJob.get(id);
      const lives = liveByCl.get(id) || [];
      if (lives.length === 0) {
        return isListedThisWeek({ trips, sowDates }, monday, sunday);
      }
      return lives.some((row) => isListedThisWeek({
        trips,
        sowDates,
        scheduledStart: row.scheduled_start || row.start_date,
        scheduledEnd: row.scheduled_end || row.end_date,
      }, monday, sunday));
    });
  }, [jobs, liveJobRows, tripsByJob, sowDatesByJob, monday, sunday]);

  return (
    <LinenBackground>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backBtn}>{'< HOME'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{pickClock ? 'PICK A JOB' : 'FIELD COMMAND'}</Text>
        <View style={styles.syncRow}>
          <View
            style={[
              styles.syncDot,
              { backgroundColor: status.connected ? C.teal : C.amber },
            ]}
          />
          <Text style={styles.syncText}>
            {status.connected ? 'Synced' : 'Offline'}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading jobs...</Text>
        </View>
      ) : listedJobs.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No jobs this week</Text>
        </View>
      ) : (
        <FlatList
          data={listedJobs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={pickClock ? (
            <Text style={styles.pickHint}>Choose the job you want to punch into.</Text>
          ) : null}
          renderItem={({ item }) => {
            const num = jobNumber(item);
            const trip = tripLine(tripsByJob.get(String(item.id)), today, monday, sunday);
            return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() =>
                pickClock
                  ? navigation.navigate('JobDetail', {
                      jobId: item.id,
                      jobName: item.job_name,
                      tab: 'TimeClock',
                    })
                  : navigation.navigate('JobMenu', {
                      jobId: item.id,
                      jobName: item.job_name,
                      from: 'list',
                    })
              }
            >
              <View style={styles.cardTop}>
                {num ? <Text style={styles.jobNumber}>{num}</Text> : <View />}
                {item.prevailing_wage === 1 && (
                  <View style={styles.pwBadge}>
                    <Text style={styles.pwText}>PW</Text>
                  </View>
                )}
              </View>
              <Text style={styles.jobName} numberOfLines={2}>
                {item.job_name || 'Untitled Job'}
              </Text>
              {trip ? <Text style={styles.tripName} numberOfLines={1}>{trip}</Text> : null}
            </TouchableOpacity>
            );
          }}
        />
      )}
    </LinenBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.linen },
  header: {
    backgroundColor: C.dark,
    paddingTop: 12,
    paddingBottom: 14,
    paddingHorizontal: S.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: { fontFamily: F.displayMed, fontSize: 14, color: C.teal, letterSpacing: 1 },
  headerTitle: { fontFamily: F.display, fontSize: 22, color: C.teal, letterSpacing: 2, flex: 1, textAlign: 'center' },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  syncText: { fontFamily: F.bodyMed, fontSize: 12, color: C.white },
  list: { padding: S.md },
  pickHint: {
    fontFamily: F.bodyMed, fontSize: 14, color: C.textBody,
    marginBottom: S.md, textAlign: 'center',
  },
  card: {
    backgroundColor: C.linenCard, borderRadius: 10, padding: S.md,
    borderWidth: 1, borderColor: C.borderStrong, marginBottom: S.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  jobNumber: { fontFamily: F.display, fontSize: 28, color: C.textHead, letterSpacing: 1, flex: 1 },
  jobName: { fontFamily: F.display, fontSize: 15, color: C.textBody, textTransform: 'uppercase', letterSpacing: 0.5 },
  tripName: { fontFamily: F.displayMed, fontSize: 13, color: C.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
  pwBadge: { backgroundColor: C.pw, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  pwText: { fontFamily: F.display, fontSize: 11, color: C.white, letterSpacing: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontFamily: F.body, fontSize: 16, color: C.textMuted },
  emptyText: { fontFamily: F.bodyMed, fontSize: 16, color: C.textFaint },
});
