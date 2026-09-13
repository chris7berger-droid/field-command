import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, F, S } from '../lib/tokens';

export default function JobSubHeader({ navigation, title }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
        <Text style={styles.back}>{'< JOB'}</Text>
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: C.dark,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: S.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
  },
  back: { fontFamily: F.displayMed, fontSize: 14, color: C.teal, letterSpacing: 1 },
  title: {
    fontFamily: F.display, fontSize: 20, color: C.teal,
    letterSpacing: 1, textTransform: 'uppercase', flex: 1,
  },
});
