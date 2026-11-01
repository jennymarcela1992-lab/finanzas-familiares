import React from "react";
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";
import { colors, radius, spacing } from "../theme/theme";

interface Props {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "outline";
  style?: ViewStyle;
}

export default function PrimaryButton({ title, onPress, loading, disabled, variant = "primary", style }: Props) {
  const variantStyle =
    variant === "primary" ? styles.primary : variant === "secondary" ? styles.secondary : styles.outline;
  const textStyle = variant === "outline" ? styles.textOutline : styles.text;

  return (
    <TouchableOpacity
      style={[styles.base, variantStyle, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? <ActivityIndicator color={variant === "outline" ? colors.primary : colors.white} /> : <Text style={textStyle}>{title}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.accent },
  outline: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.primary },
  disabled: { opacity: 0.5 },
  text: { color: colors.white, fontWeight: "700", fontSize: 15 },
  textOutline: { color: colors.primary, fontWeight: "700", fontSize: 15 },
});
