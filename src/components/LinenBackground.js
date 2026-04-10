/**
 * LinenBackground — textured linen background matching the Command Suite web apps.
 * Wraps children in an ImageBackground with the crosshatch tile.
 */
import React from 'react';
import { ImageBackground, StyleSheet } from 'react-native';
import { C } from '../lib/tokens';

const texture = require('../../assets/linen-texture.png');

export default function LinenBackground({ style, children }) {
  return (
    <ImageBackground
      source={texture}
      resizeMode="repeat"
      style={[styles.bg, style]}
      imageStyle={styles.image}
    >
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: C.linen,
  },
  image: {
    opacity: 0.55,
  },
});
