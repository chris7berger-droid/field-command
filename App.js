/**
 * Field Command — App Shell (Native Only)
 *
 * Auth flow: Login → Welcome → JobList → JobDetail
 * PowerSync for offline-first data, Supabase for auth.
 */
import '@azure/core-asynciterator-polyfill';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
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

import { C } from './src/lib/tokens';
import { supabase } from './src/lib/supabase';
import { getPowerSync, connectPowerSync } from './src/lib/powersync';
import PunchStatusBar from './src/components/PunchStatusBar';
import LoginScreen from './src/screens/LoginScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import JobListScreen from './src/screens/JobListScreen';
import JobDetailScreen from './src/screens/JobDetailScreen';

const Stack = createNativeStackNavigator();
const db = getPowerSync();

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
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

  // ── Check existing session on mount ───────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) {
        setSession(s);
        loadUser(s.user.email);
      }
      setCheckingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) loadUser(s.user.email);
      else setUser(null);
    });

    return () => subscription?.unsubscribe();
  }, []);

  // ── Load user profile ─────────────────────────────────
  const loadUser = useCallback(async (email) => {
    // Try team_members first (Command Suite shared table)
    const { data: tm } = await supabase
      .from('team_members')
      .select('id, name, email, role')
      .eq('email', email)
      .single();

    if (tm) {
      setUser(tm);
      return;
    }

    // Try crew table (Schedule Command)
    const { data: crew } = await supabase
      .from('crew')
      .select('name, phone')
      .eq('email', email)
      .single();

    if (crew) {
      const parts = crew.name.split(', ');
      const displayName = parts.length === 2 ? `${parts[1]} ${parts[0]}` : crew.name;
      setUser({ name: displayName, email, role: 'crew' });
      return;
    }

    // Fallback
    const fallbackName = email.split('@')[0].replace(/[._]/g, ' ');
    setUser({ name: fallbackName, email, role: 'crew' });
  }, []);

  // ── Handle login ──────────────────────────────────────
  const handleLogin = useCallback((newSession) => {
    setSession(newSession);
    if (newSession?.user?.email) {
      loadUser(newSession.user.email);
    }
    connectPowerSync().catch(console.error);
  }, [loadUser]);

  // ── Loading ───────────────────────────────────────────
  if (!fontsLoaded || !dbReady || checkingAuth) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={C.teal} />
        <Text style={styles.loadingText}>Loading Field Command...</Text>
      </View>
    );
  }

  // ── Not logged in ─────────────────────────────────────
  if (!session || !user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // ── Main app ──────────────────────────────────────────
  return (
    <PowerSyncContext.Provider value={db}>
      <View style={styles.appWrap}>
        <View style={styles.safeTop} />
        <PunchStatusBar />
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: C.linen },
              animation: 'slide_from_right',
            }}
            initialRouteName="Welcome"
          >
            <Stack.Screen
              name="Welcome"
              component={WelcomeScreen}
              initialParams={{ userName: user.name, jobCount: 0 }}
            />
            <Stack.Screen name="JobList">
              {(props) => <JobListScreen {...props} user={user} />}
            </Stack.Screen>
            <Stack.Screen name="JobDetail">
              {(props) => <JobDetailScreen {...props} user={user} />}
            </Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </PowerSyncContext.Provider>
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
});
