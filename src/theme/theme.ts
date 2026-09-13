export const colors = {
  primary: "#146B5C",
  primaryDark: "#0D4A3F",
  primaryLight: "#E3F2EE",
  accent: "#E8A33D",
  background: "#F7F8FA",
  surface: "#FFFFFF",
  border: "#E7EBEA",
  textPrimary: "#1A2B27",
  textSecondary: "#6B7B77",
  textMuted: "#9CA8A5",
  success: "#1F9D6B",
  warning: "#D98324",
  danger: "#D9534F",
  white: "#FFFFFF",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 26, fontWeight: "800" as const, color: colors.textPrimary, letterSpacing: -0.3 },
  h2: { fontSize: 19, fontWeight: "700" as const, color: colors.textPrimary },
  h3: { fontSize: 15, fontWeight: "700" as const, color: colors.textPrimary },
  body: { fontSize: 14, fontWeight: "400" as const, color: colors.textSecondary },
  caption: { fontSize: 12, fontWeight: "500" as const, color: colors.textMuted },
  amount: { fontSize: 22, fontWeight: "800" as const, color: colors.textPrimary, letterSpacing: -0.4 },
};

export const shadow = {
  shadowColor: "#0D4A3F",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 10,
  elevation: 2,
};
