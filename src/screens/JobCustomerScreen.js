/**
 * Customer page — name from the job. Phone/email are not piped from Sales yet.
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useQuery } from '@powersync/react';
import { C, F, S } from '../lib/tokens';
import JobSubHeader from '../components/JobSubHeader';
import LinenBackground from '../components/LinenBackground';

export default function JobCustomerScreen({ route, navigation }) {
  const { jobId } = route.params;
  const { data: rows } = useQuery(
    `SELECT customer_name, customer_type FROM call_log WHERE id = ?`,
    [jobId]
  );
  const job = rows?.[0] || {};
  const name = (job.customer_name || '').trim();

  return (
    <View style={styles.screen}>
      <JobSubHeader navigation={navigation} title="CUSTOMER" />
      <LinenBackground>
        <ScrollView
          style={{ flex: 1, backgroundColor: 'transparent' }}
          contentContainerStyle={styles.content}
        >
          <View style={styles.card}>
            <Text style={styles.kicker}>CUSTOMER</Text>
            <Text style={styles.name}>{name || 'No customer name on this job'}</Text>
            {job.customer_type ? (
              <Text style={styles.meta}>{String(job.customer_type).toUpperCase()}</Text>
            ) : null}
          </View>

          <Text style={styles.section}>CONTACT</Text>
          <View style={styles.card}>
            <Text style={styles.empty}>
              Phone and email are not on this job yet. They live on the customer
              record in Sales Command and have not been piped to Field.
            </Text>
          </View>
        </ScrollView>
      </LinenBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.linen },
  content: { padding: S.md, paddingBottom: S.xxl },
  card: {
    backgroundColor: C.linenCard, borderRadius: 10, padding: S.md,
    borderWidth: 1, borderColor: C.borderStrong, marginBottom: S.md,
  },
  kicker: { fontFamily: F.display, fontSize: 12, color: C.textMuted, letterSpacing: 2, marginBottom: 4 },
  name: { fontFamily: F.display, fontSize: 24, color: C.textHead, letterSpacing: 0.5, textTransform: 'uppercase' },
  meta: { fontFamily: F.displayMed, fontSize: 13, color: C.textMuted, letterSpacing: 1, marginTop: 6 },
  section: { fontFamily: F.display, fontSize: 13, color: C.textMuted, letterSpacing: 2, marginBottom: S.sm },
  empty: { fontFamily: F.body, fontSize: 14, color: C.textBody, lineHeight: 21 },
});
