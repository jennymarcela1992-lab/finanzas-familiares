import { Appearance, Platform } from "react-native";

export type PreferenciaTema = "auto" | "claro" | "oscuro";

const CLAVE_TEMA = "tema_preferido";

/** Lee la preferencia guardada (solo web; en el celular se sigue el modo del sistema). */
export function leerPreferenciaTema(): PreferenciaTema {
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      const v = localStorage.getItem(CLAVE_TEMA);
      if (v === "claro" || v === "oscuro" || v === "auto") return v;
    }
  } catch {}
  return "auto";
}

/** Guarda la preferencia y recarga la página para aplicar los colores (solo web). */
export function guardarPreferenciaTema(pref: PreferenciaTema) {
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.setItem(CLAVE_TEMA, pref);
      if (typeof window !== "undefined") window.location.reload();
    }
  } catch {}
}

function sistemaEsOscuro(): boolean {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return Appearance.getColorScheme() === "dark";
  } catch {
    return false;
  }
}

export const preferenciaTema = leerPreferenciaTema();
export const esOscuro = preferenciaTema === "oscuro" || (preferenciaTema === "auto" && sistemaEsOscuro());

const claro = {
  primary: "#0A2E5C",
  primaryDark: "#061D3D",
  primaryLight: "#E3EAF3",
  accent: "#FF8C2E",
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
  // Fondos suaves para avisos y etiquetas
  successBg: "#E3F3EC",
  warningBg: "#FCEFD9",
  dangerBg: "#FBE3E2",
  infoBg: "#E3EAF3",
  mutedBg: "#F1F3F2",
  // Fondo de encabezados y tarjetas destacadas (texto blanco encima)
  hero: "#0A2E5C",
};

const oscuro: typeof claro = {
  primary: "#3B7DD8",
  primaryDark: "#0A1626",
  primaryLight: "#1D2C44",
  accent: "#FF9A45",
  background: "#0D1520",
  surface: "#16202E",
  border: "#26344A",
  textPrimary: "#E8EEF6",
  textSecondary: "#A6B3C4",
  textMuted: "#74839A",
  success: "#34C38F",
  warning: "#F0A04B",
  danger: "#F07470",
  white: "#FFFFFF",
  successBg: "#16352B",
  warningBg: "#3A2C16",
  dangerBg: "#3D1F20",
  infoBg: "#1D2C44",
  mutedBg: "#1C2838",
  hero: "#12294A",
};

export const colors = esOscuro ? oscuro : claro;

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
  shadowColor: "#061D3D",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 10,
  elevation: 2,
};
