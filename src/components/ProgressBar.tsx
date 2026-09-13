import React from "react";
import { View, StyleSheet } from "react-native";
import { colors, radius } from "../theme/theme";

export default function ProgressBar({ progreso, color = colors.primary }: { progreso: number; color?: string }) {
  const pct = Math.max(0, Math.min(progreso, 1)) * 100;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, backgroundColor: colors.border, borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: 8, borderRadius: radius.pill },
});
