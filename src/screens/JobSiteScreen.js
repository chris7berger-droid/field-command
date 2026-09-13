/**
 * Job Site page — address from the job. Access/lock codes and Maps
 * navigation are not piped yet.
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useQuery } from '@powersync/react';
import { C, F, S } from '../lib/tokens';
import JobSubHeader from '../components/JobSubHeader';
import LinenBackground from '../components/LinenBackground';

function formatAddress(job) {
  const line1 = (job.jobsite_address || '').trim();
  const cityLine = [job.jobsite_city, job.jobsite_state, job.jobsite_zip]
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(', ');
  if (!line1 && !cityLine) return null;
  return { line1, cityLine };
}

export default function JobSiteScreen({ route, navigation }) {
  const { jobId } = route.params;
  const { data: rows } = useQuery(
    `SELECT jobsite_address, jobsite_city, jobsite_state, jobsite_zip
       FROM call_log WHERE id = ?`,
    [jobId]
  );
  const addr = formatAddress(rows?.[0] || {});

  return (
    <View style={styles.screen}>
      <JobSubHeader navigation={navigation} title="JOB SITE" />
      <LinenBackground>
        <ScrollView
          style={{ flex: 1, backgroundColor: 'transparent' }}
          contentContainerStyle={styles.content}
        >
          <Text style={styles.section}>ADDRESS</Text>
          <View style={styles.card}>
            {addr ? (
              <>
                {addr.line1 ? <Text style={styles.addr}>{addr.line1}</Text> : null}
                {addr.cityLine ? <Text style={styles.addr}>{addr.cityLine}</Text> : null}
              </>
            ) : (
              <Text style={styles.empty}>No jobsite address on this job.</Text>
            )}
          </View>

          <Text style={styles.section}>ACCESS</Text>
          <View style={styles.card}>
            <Text style={styles.empty}>
              Lock codes, gate codes, and site access notes are not on this job
              yet. They have not been piped from Sales Command.
            </Text>
          </View>

          <Text style={styles.section}>NAVIGATION</Text>
          <View style={styles.card}>
            <Text style={styles.empty}>
              Get directions is not in Field or Schedule yet. That is a later
              item for both apps.
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
  section: { fontFamily: F.display, fontSize: 13, color: C.textMuted, letterSpacing: 2, marginBottom: S.sm },
  card: {
    backgroundColor: C.linenCard, borderRadius: 10, padding: S.md,
    borderWidth: 1, borderColor: C.borderStrong, marginBottom: S.lg,
  },
  addr: { fontFamily: F.bodyMed, fontSize: 16, color: C.textHead, lineHeight: 24 },
  empty: { fontFamily: F.body, fontSize: 14, color: C.textBody, lineHeight: 21 },
});
