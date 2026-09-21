/**
 * Field Command — App Shell (Native Only)
 *
 * Auth flow: Login → Home → JobMenu → Time Clock / SOW / Reports / Customer / Job Site
 * PowerSync for offline-first data, Supabase for auth.
 */
import '@azure/core-asynciterator-polyfill';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Platform,
  AppState,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PowerSyncContext } from '@powersync/react';
import { useFonts } from 'expo-font';
import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
} from '@expo-google-fonts/barlow';
import {
  BarlowCondensed_500Medium,
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from '@expo-google-fonts/barlow-condensed';

import { C, F, S } from './src/lib/tokens';
import { supabase } from './src/lib/supabase';
import { getPowerSync, connectPowerSync } from './src/lib/powersync';
import {
  nextEnsureAction,
  afterConnectAttempt,
} from './src/lib/powerSyncLifecycle';
import { evaluateFieldActivation } from './src/lib/activation';
import PunchStatusBar from './src/components/PunchStatusBar';
import RefreshControl from './src/components/RefreshControl';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import JobListScreen from './src/screens/JobListScreen';
import JobSearchScreen from './src/screens/JobSearchScreen';
import JobMenuScreen from './src/screens/JobMenuScreen';
import JobDetailScreen from './src/screens/JobDetailScreen';
import JobCustomerScreen from './src/screens/JobCustomerScreen';
import JobSiteScreen from './src/screens/JobSiteScreen';

const Stack = createNativeStackNavigator();
const db = getPowerSync();

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [fontsLoaded] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
    BarlowCondensed_500Medium,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });

  // ── PowerSync init ────────────────────────────────────
  useEffect(() => {
    db.init().then(() => setDbReady(true));
  }, []);

  // ── Keep PowerSync connected while authenticated ──
  // First connect on login / cold start (same as before). If the stream later
  // dies to connected:false && connecting:false, restore it here — App.js owns
  // that lifecycle. Skip while the SDK is already connecting/retrying.
  // Local SQLite stays readable either way.
  // Gate on a boolean so TOKEN_REFRESHED (new session object) does not remount
  // this owner and call connect() on a live stream.
  const canConnect = Boolean(dbReady && session && user);
  useEffect(() => {
    if (!canConnect) return undefined;

    let cancelled = false;
    let inFlight = false;
    let cooldownUntil = 0;
    let wakeup = null;

    const clearWakeup = () => {
      if (!wakeup) return;
      clearTimeout(wakeup);
      wakeup = null;
    };

    const scheduleWakeup = (delayMs) => {
      if (cancelled || wakeup || delayMs == null) return;
      wakeup = setTimeout(() => {
        wakeup = null;
        ensure();
      }, delayMs);
    };

    const ensure = () => {
      if (cancelled) return;
      const status = db.currentStatus;
      const action = nextEnsureAction(status, {
        inFlight,
        cooldownUntil,
        now: Date.now(),
      });
      if (action.type === 'wakeup') {
        scheduleWakeup(action.delayMs);
        return;
      }
      if (action.type !== 'connect') {
        if (status?.connected || status?.connecting) {
          clearWakeup();
          cooldownUntil = 0;
        }
        return;
      }
      clearWakeup();
      inFlight = true;
      connectPowerSync()
        .catch(console.error)
        .finally(() => {
          inFlight = false;
          if (cancelled) return;
          const after = afterConnectAttempt(db.currentStatus, { now: Date.now() });
          cooldownUntil = after.cooldownUntil;
          scheduleWakeup(after.wakeupDelayMs);
        });
    };

    ensure();
    const unsub = db.registerListener({
      statusChanged: () => ensure(),
    });
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') ensure();
    });

    return () => {
      cancelled = true;
      if (wakeup) clearTimeout(wakeup);
      unsub?.();
      appSub?.remove();
    };
  }, [canConnect]);

  // ── Check existing session on mount ───────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (s) {
        setSession(s);
        await loadUser(s.user);
      }
      setCheckingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        setCheckingAuth(true);
        loadUser(s.user).finally(() => setCheckingAuth(false));
      } else {
        setUser(null);
        setAccessBlocked(false);
        setCheckingAuth(false);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  // ── Load user profile ─────────────────────────────────
  const loadUser = useCallback(async (sessionUser) => {
    const authId = sessionUser?.id || null;
    const email = sessionUser?.email?.trim().toLowerCase() || null;
    let teamMember = null;

    if (authId) {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, name, email, role, active, apps')
        .eq('auth_id', authId)
        .maybeSingle();
      if (error) console.warn('team_members auth_id lookup failed:', error.message);
      teamMember = data || null;
    }

    if (!teamMember && email) {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, name, email, role, active, apps')
        .ilike('email', email)
        .maybeSingle();
      if (error) console.warn('team_members email lookup failed:', error.message);
      teamMember = data || null;
    }

    const activation = evaluateFieldActivation(teamMember);
    if (!activation.allowed) {
      setUser(null);
      setAccessBlocked(true);
      return;
    }

    setAccessBlocked(false);
    setUser({
      id: activation.id,
      name: teamMember.name || 'Crew Member',
      email: teamMember.email || email || '',
      role: teamMember.role || 'crew',
    });
  }, []);

  // ── Handle login ──────────────────────────────────────
  const handleLogin = useCallback((newSession) => {
    setSession(newSession);
    setCheckingAuth(true);
    if (newSession?.user) {
      loadUser(newSession.user).finally(() => setCheckingAuth(false));
    } else {
      setCheckingAuth(false);
    }
    // PowerSync connect is handled by the dbReady+session effect above,
    // so both fresh login and restored sessions take the same path.
  }, [loadUser]);

  const handleBlockedSignOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // ── Loading ───────────────────────────────────────────
  if (!fontsLoaded || !dbReady || checkingAuth) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={C.teal} />
        <Text style={styles.loadingText}>
          {session ? 'Checking Field Command access...' : 'Loading Field Command...'}
        </Text>
      </View>
    );
  }

  // ── Not logged in ─────────────────────────────────────
  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (accessBlocked) {
    return <BlockedAccessState onSignOut={handleBlockedSignOut} />;
  }

  if (!user) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={C.teal} />
        <Text style={styles.loadingText}>Checking Field Command access...</Text>
      </View>
    );
  }

  // ── Main app ──────────────────────────────────────────
  return (
    <PowerSyncContext.Provider value={db}>
      <View style={styles.appWrap}>
        <View style={styles.safeTop} />
        <View style={styles.refreshChrome}>
          <RefreshControl active={canConnect} />
        </View>
        <PunchStatusBar />
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: C.linen },
              animation: 'slide_from_right',
            }}
            initialRouteName="Home"
          >
            <Stack.Screen name="Home">
              {(props) => <HomeScreen {...props} user={user} />}
            </Stack.Screen>
            <Stack.Screen name="JobList">
              {(props) => <JobListScreen {...props} user={user} />}
            </Stack.Screen>
            <Stack.Screen name="JobSearch">
              {(props) => <JobSearchScreen {...props} user={user} />}
            </Stack.Screen>
            <Stack.Screen name="JobMenu">
              {(props) => <JobMenuScreen {...props} user={user} />}
            </Stack.Screen>
            <Stack.Screen name="JobDetail">
              {(props) => <JobDetailScreen {...props} user={user} />}
            </Stack.Screen>
            <Stack.Screen name="JobCustomer" component={JobCustomerScreen} />
            <Stack.Screen name="JobSite" component={JobSiteScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </PowerSyncContext.Provider>
  );
}

function BlockedAccessState({ onSignOut }) {
  return (
    <View style={styles.blockedScreen}>
      <View style={styles.blockedCard}>
        <Text style={styles.blockedTitle}>FIELD COMMAND NOT ACTIVE</Text>
        <Text style={styles.blockedBody}>
          Your account is not currently activated for Field Command.
        </Text>
        <Text style={styles.blockedBody}>Contact the office if you need access.</Text>
        <TouchableOpacity
          style={styles.blockedSignOutBtn}
          onPress={onSignOut}
          activeOpacity={0.7}
        >
          <Text style={styles.blockedSignOutText}>SIGN OUT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appWrap: {
    flex: 1,
    backgroundColor: C.dark,
  },
  safeTop: {
    height: Platform.OS === 'ios' ? 50 : 30,
    backgroundColor: C.dark,
  },
  refreshChrome: {
    backgroundColor: C.dark,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingBottom: 8,
  },
  loading: {
    flex: 1,
    backgroundColor: C.dark,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: C.teal,
    letterSpacing: 1,
  },
  blockedScreen: {
    flex: 1,
    backgroundColor: C.linen,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: S.lg,
  },
  blockedCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: C.linenCard,
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderRadius: 12,
    padding: S.lg,
    gap: S.sm,
  },
  blockedTitle: {
    fontFamily: F.display,
    color: C.textHead,
    fontSize: 28,
    letterSpacing: 1,
    textAlign: 'center',
  },
  blockedBody: {
    fontFamily: F.body,
    color: C.textBody,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  blockedSignOutBtn: {
    marginTop: S.md,
    borderRadius: 10,
    backgroundColor: C.dark,
    paddingVertical: 16,
    alignItems: 'center',
  },
  blockedSignOutText: {
    fontFamily: F.display,
    color: C.teal,
    fontSize: 16,
    letterSpacing: 2,
  },
});
