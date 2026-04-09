/**
 * Login Screen
 * Email + password auth via Supabase (shared Command Suite auth).
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { C, F, S } from '../lib/tokens';
import { supabase } from '../lib/supabase';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    setLoading(false);

    if (authErr) {
      setError(authErr.message);
      return;
    }

    if (data?.session) {
      onLogin(data.session);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        {/* Branding */}
        <View style={styles.brand}>
          <Text style={styles.title}>FIELD</Text>
          <Text style={styles.titleAccent}>COMMAND</Text>
          <Text style={styles.subtitle}>HDSP Command Suite</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={C.textFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={C.textFaint}
            secureTextEntry
          />

          {error && (
            <Text style={styles.error}>{error}</Text>
          )}

          <TouchableOpacity
            style={[styles.loginBtn, loading && { opacity: 0.5 }]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator color={C.teal} />
            ) : (
              <Text style={styles.loginBtnText}>SIGN IN</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
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
    paddingHorizontal: S.lg,
  },
  brand: {
    alignItems: 'center',
    marginBottom: S.xxl,
  },
  title: {
    fontFamily: F.display,
    fontSize: 48,
    color: C.white,
    letterSpacing: 6,
  },
  titleAccent: {
    fontFamily: F.display,
    fontSize: 48,
    color: C.teal,
    letterSpacing: 6,
    marginTop: -8,
  },
  subtitle: {
    fontFamily: F.bodyMed,
    fontSize: 13,
    color: C.textFaint,
    letterSpacing: 3,
    marginTop: S.sm,
    textTransform: 'uppercase',
  },
  form: {
    gap: S.sm,
  },
  input: {
    backgroundColor: C.darkRaised,
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: S.md,
    fontFamily: F.body,
    fontSize: 16,
    color: C.white,
    borderWidth: 1,
    borderColor: C.darkBorder,
  },
  error: {
    fontFamily: F.bodyMed,
    fontSize: 13,
    color: C.red,
    textAlign: 'center',
    marginTop: S.xs,
  },
  loginBtn: {
    backgroundColor: C.dark,
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: S.sm,
    borderWidth: 2,
    borderColor: C.teal,
  },
  loginBtnText: {
    fontFamily: F.display,
    fontSize: 18,
    color: C.teal,
    letterSpacing: 2,
  },
});
