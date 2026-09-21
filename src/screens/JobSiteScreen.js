/**
 * Job Site — address from the job, plus Get Directions into Maps.
 * Lock codes / gate access are not on the job yet, so this page does
 * not invent them.
 */
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
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

function mapsDest(job, addr) {
  const lat = Number(job.jobsite_latitude);
  const lng = Number(job.jobsite_longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
    return { kind: 'coords', lat, lng };
  }
  const q = [addr?.line1, addr?.cityLine].filter(Boolean).join(', ');
  return q ? { kind: 'query', q } : null;
}

function destParam(dest) {
  if (dest.kind === 'coords') return `${dest.lat},${dest.lng}`;
  return encodeURIComponent(dest.q);
}

function directionsUrl(dest) {
  const daddr = destParam(dest);
  if (Platform.OS === 'ios') {
    return `http://maps.apple.com/?saddr=Current+Location&daddr=${daddr}&dirflg=d`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${daddr}&travelmode=driving`;
}

async function openDirections(dest) {
  try {
    await Linking.openURL(directionsUrl(dest));
  } catch {
    Alert.alert('Maps', 'Could not open Maps on this phone.');
  }
}

export default function JobSiteScreen({ route, navigation }) {
  const { jobId } = route.params;
  const { data: rows } = useQuery(
    `SELECT jobsite_address, jobsite_city, jobsite_state, jobsite_zip,
            jobsite_latitude, jobsite_longitude
       FROM call_log WHERE id = ?`,
    [jobId]
  );
  const job = rows?.[0] || {};
  const addr = formatAddress(job);
  const dest = mapsDest(job, addr);

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

          {dest ? (
            <TouchableOpacity
              style={styles.btn}
              activeOpacity={0.7}
              onPress={() => {
                openDirections(dest);
              }}
            >
              <Text style={styles.btnText}>GET DIRECTIONS</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </LinenBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.linen },
  content: { padding: S.md, paddingBottom: S.xxl },
  section: {
    fontFamily: F.display, fontSize: 13, color: C.textMuted,
    letterSpacing: 2, marginBottom: S.sm,
  },
  card: {
    backgroundColor: C.linenCard, borderRadius: 10, padding: S.md,
    borderWidth: 1, borderColor: C.borderStrong, marginBottom: S.lg,
  },
  addr: { fontFamily: F.bodyMed, fontSize: 16, color: C.textHead, lineHeight: 24 },
  empty: { fontFamily: F.body, fontSize: 14, color: C.textBody, lineHeight: 21 },
  btn: {
    backgroundColor: C.dark, borderRadius: 10, paddingVertical: 20,
    alignItems: 'center',
  },
  btnText: { fontFamily: F.display, fontSize: 22, color: C.teal, letterSpacing: 2 },
});
