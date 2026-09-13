import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius } from "../theme/theme";

export default function ScreenHeader({
  title,
  subtitle,
  actionLabel,
  actionIcon = "add",
  onAction,
  actionActive,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  onAction?: () => void;
  actionActive?: boolean;
}) {
  return (
    <View style={styles.container}>
      <View>
        <Text style={typography.h1}>{title}</Text>
        {subtitle ? <Text style={[typography.body, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {onAction && (
        <TouchableOpacity style={[styles.button, actionActive && styles.buttonActive]} onPress={onAction} activeOpacity={0.85}>
          <Ionicons name={actionActive ? "close" : actionIcon} size={16} color={colors.white} />
          {actionLabel && <Text style={styles.buttonText}>{actionActive ? "Cerrar" : actionLabel}</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    gap: 6,
  },
  buttonActive: { backgroundColor: colors.textMuted },
  buttonText: { color: colors.white, fontWeight: "700", fontSize: 12 },
});
