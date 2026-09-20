/**
 * Search Jobs — local PowerSync lookup beyond this week's View All list.
 * Universe: call_log rows with a live jobs parent. Opens the normal Job menu.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useQuery } from '@powersync/react';
import { C, F, S } from '../lib/tokens';
import { LIVE_JOB_FILTER, jobNumber } from '../lib/trips';
import { searchableCallLogJobs, filterSearchableJobs } from '../lib/jobSearch';
import LinenBackground from '../components/LinenBackground';

export default function JobSearchScreen({ navigation }) {
  const [query, setQuery] = useState('');

  const { data: callLogRows } = useQuery(
    `SELECT * FROM call_log`
  );

  const { data: liveJobRows } = useQuery(
    `SELECT j.call_log_id AS call_log_id, j.job_num AS job_num
       FROM jobs j
      WHERE ${LIVE_JOB_FILTER}`
  );

  const universe = useMemo(
    () => searchableCallLogJobs(callLogRows, liveJobRows),
    [callLogRows, liveJobRows]
  );

  const results = useMemo(
    () => filterSearchableJobs(universe, query),
    [universe, query]
  );

  const q = query.trim();

  return (
    <LinenBackground>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backBtn}>{'< JOBS'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SEARCH ALL JOBS</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Job number"
          placeholderTextColor={C.textFaint}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <Text style={styles.hint}>Number first. Name also works.</Text>
      </View>

      {!q ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Enter a job number to find work that is not on this week.</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No matching jobs on this device.</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const num = jobNumber(item);
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate('JobMenu', {
                    jobId: item.id,
                    jobName: item.job_name,
                    from: 'list',
                  })
                }
              >
                {num ? <Text style={styles.jobNumber}>{num}</Text> : <View />}
                <Text style={styles.jobName} numberOfLines={2}>
                  {item.job_name || 'Untitled Job'}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </LinenBackground>
  );
}

const styles = StyleSheet.create({
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
  headerTitle: {
    fontFamily: F.display, fontSize: 22, color: C.teal, letterSpacing: 2,
    flex: 1, textAlign: 'center',
  },
  headerSpacer: { width: 64 },
  searchWrap: { padding: S.md, paddingBottom: S.sm },
  input: {
    backgroundColor: C.linenCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderStrong,
    paddingHorizontal: S.md,
    paddingVertical: 14,
    fontFamily: F.display,
    fontSize: 28,
    color: C.textHead,
    letterSpacing: 1,
  },
  hint: {
    fontFamily: F.body, fontSize: 13, color: C.textMuted,
    marginTop: 8, textAlign: 'center',
  },
  list: { paddingHorizontal: S.md, paddingBottom: S.xxl },
  card: {
    backgroundColor: C.linenCard, borderRadius: 10, padding: S.md,
    borderWidth: 1, borderColor: C.borderStrong, marginBottom: S.sm,
  },
  jobNumber: { fontFamily: F.display, fontSize: 28, color: C.textHead, letterSpacing: 1 },
  jobName: {
    fontFamily: F.display, fontSize: 15, color: C.textBody,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: S.xl },
  emptyText: { fontFamily: F.bodyMed, fontSize: 16, color: C.textFaint, textAlign: 'center' },
});
