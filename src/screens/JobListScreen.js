/**
 * Job List Screen — Native Only
 * Shows mobilized jobs assigned to the current crew member.
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
import { tod } from '../lib/utils';
import { LIVE_JOB_FILTER, jobNumber, tripLine, tripsByCallLog } from '../lib/trips';
import LinenBackground from '../components/LinenBackground';

export default function JobListScreen({ navigation, user }) {
  const status = useStatus();
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

  const today = tod();
  const tripsByJob = useMemo(
    () => tripsByCallLog(mobRows, wtcTripRows),
    [mobRows, wtcTripRows]
  );

  return (
    <LinenBackground>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backBtn}>{'< HOME'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>FIELD COMMAND</Text>
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
      ) : !jobs || jobs.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No mobilized jobs</Text>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const num = jobNumber(item);
            const trip = tripLine(tripsByJob.get(String(item.id)), today);
            return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() =>
                navigation.navigate('JobDetail', {
                  jobId: item.id,
                  jobName: item.job_name,
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
