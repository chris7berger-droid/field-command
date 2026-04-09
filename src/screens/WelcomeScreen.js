/**
 * Welcome Screen
 * Shows user's name, today's date, and a "View My Jobs" button.
 * Acts as the landing screen after login.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useQuery } from '@powersync/react';
import { C, F, S } from '../lib/tokens';
import { fmtD, tod } from '../lib/utils';

export default function WelcomeScreen({ navigation, route }) {
  const { userName } = route.params || {};
  const firstName = userName ? userName.split(' ')[0] : 'Crew';

  const { data: jobCountRows } = useQuery(
    `SELECT COUNT(*) as cnt FROM call_log WHERE stage = 'mobilized' OR stage = 'in_progress'`
  );
  const jobCount = jobCountRows?.[0]?.cnt ?? 0;
  const today = new Date();
  const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        {/* Greeting */}
        <View style={styles.greeting}>
          <Text style={styles.welcome}>Welcome,</Text>
          <Text style={styles.name}>{firstName}</Text>
          <Text style={styles.date}>
            {dayOfWeek} · {fmtD(tod())}
          </Text>
        </View>

        {/* Job Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{jobCount ?? '—'}</Text>
          <Text style={styles.summaryLabel}>
            {jobCount === 1 ? 'JOB TODAY' : 'JOBS TODAY'}
          </Text>
        </View>

        {/* Action */}
        <TouchableOpacity
          style={styles.viewJobsBtn}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('JobList')}
        >
          <Text style={styles.viewJobsText}>VIEW MY JOBS</Text>
        </TouchableOpacity>
      </View>

      {/* Footer branding */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>FIELD COMMAND</Text>
        <Text style={styles.footerSub}>HDSP Command Suite</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.dark,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: S.lg,
  },
  greeting: {
    alignItems: 'center',
    marginBottom: S.xxl,
  },
  welcome: {
    fontFamily: F.displayLight,
    fontSize: 24,
    color: C.textFaint,
    letterSpacing: 2,
  },
  name: {
    fontFamily: F.display,
    fontSize: 52,
    color: C.teal,
    letterSpacing: 3,
    marginTop: -4,
    textTransform: 'uppercase',
  },
  date: {
    fontFamily: F.bodyMed,
    fontSize: 15,
    color: C.textLight,
    letterSpacing: 1,
    marginTop: S.sm,
  },
  summaryCard: {
    backgroundColor: C.darkRaised,
    borderRadius: 12,
    paddingVertical: S.lg,
    paddingHorizontal: S.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.darkBorder,
    marginBottom: S.xl,
  },
  summaryNumber: {
    fontFamily: F.display,
    fontSize: 64,
    color: C.teal,
  },
  summaryLabel: {
    fontFamily: F.display,
    fontSize: 14,
    color: C.textFaint,
    letterSpacing: 3,
    marginTop: 4,
  },
  viewJobsBtn: {
    backgroundColor: C.dark,
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 48,
    borderWidth: 2,
    borderColor: C.teal,
  },
  viewJobsText: {
    fontFamily: F.display,
    fontSize: 20,
    color: C.teal,
    letterSpacing: 3,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: S.xl,
  },
  footerText: {
    fontFamily: F.display,
    fontSize: 14,
    color: C.textFaint,
    letterSpacing: 4,
  },
  footerSub: {
    fontFamily: F.body,
    fontSize: 11,
    color: C.textFaint,
    letterSpacing: 2,
    marginTop: 2,
    opacity: 0.5,
  },
});
