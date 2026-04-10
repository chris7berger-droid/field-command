/**
 * Job List Screen — Native Only
 * Shows mobilized jobs assigned to the current crew member.
 */
import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useQuery, useStatus } from '@powersync/react';
import { C, F, S } from '../lib/tokens';
import { fmtD } from '../lib/utils';
import LinenBackground from '../components/LinenBackground';

export default function JobListScreen({ navigation, user }) {
  const status = useStatus();
  const { data: jobs, isLoading } = useQuery(
    `SELECT * FROM call_log WHERE stage = 'mobilized' OR stage = 'in_progress' ORDER BY date ASC`
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
          renderItem={({ item }) => (
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
                <Text style={styles.jobName} numberOfLines={1}>
                  {item.job_name || 'Untitled Job'}
                </Text>
                {item.prevailing_wage === 1 && (
                  <View style={styles.pwBadge}>
                    <Text style={styles.pwText}>PW</Text>
                  </View>
                )}
              </View>
              {item.display_job_number ? (
                <Text style={styles.jobNumber}>#{item.display_job_number}</Text>
              ) : null}
              <Text style={styles.address} numberOfLines={1}>
                {[item.jobsite_address, item.jobsite_city, item.jobsite_state]
                  .filter(Boolean)
                  .join(', ')}
              </Text>
              <Text style={styles.dates}>
                {fmtD(item.date)}
              </Text>
            </TouchableOpacity>
          )}
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
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  jobName: { fontFamily: F.display, fontSize: 18, color: C.textHead, flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 },
  pwBadge: { backgroundColor: C.pw, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  pwText: { fontFamily: F.display, fontSize: 11, color: C.white, letterSpacing: 1 },
  jobNumber: { fontFamily: F.bodyMed, fontSize: 13, color: C.textMuted, marginBottom: 4 },
  address: { fontFamily: F.body, fontSize: 14, color: C.textBody, marginBottom: 4 },
  dates: { fontFamily: F.body, fontSize: 13, color: C.textLight },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontFamily: F.body, fontSize: 16, color: C.textMuted },
  emptyText: { fontFamily: F.bodyMed, fontSize: 16, color: C.textFaint },
});
