import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../hooks/useAuth";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, radius, typography } from "../../theme/theme";

export default function LoginScreen() {
  const { iniciarSesion, registrar, error } = useAuth();
  const [modoRegistro, setModoRegistro] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);

  async function manejarEnvio() {
    setCargando(true);
    try {
      if (modoRegistro) await registrar(email, password, nombre);
      else await iniciarSesion(email, password);
    } catch {
      // el mensaje ya queda en `error`
    } finally {
      setCargando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
        <View style={styles.logoCircle}>
          <Ionicons name="home" size={30} color={colors.white} />
        </View>
        <Text style={styles.title}>Finanzas Familiares</Text>
        <Text style={styles.subtitle}>{modoRegistro ? "Crea tu cuenta para empezar" : "Bienvenido de nuevo"}</Text>

        <View style={styles.card}>
          {modoRegistro && (
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Tu nombre" placeholderTextColor={colors.textMuted} value={nombre} onChangeText={setNombre} />
            </View>
          )}
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Correo electrónico"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <PrimaryButton title={modoRegistro ? "Registrarme" : "Entrar"} onPress={manejarEnvio} loading={cargando} style={{ marginTop: spacing.sm }} />
        </View>

        <TouchableOpacity onPress={() => setModoRegistro(!modoRegistro)} style={{ marginTop: spacing.xl }}>
          <Text style={styles.switchText}>
            {modoRegistro ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
            <Text style={styles.switchTextBold}>{modoRegistro ? "Inicia sesión" : "Regístrate"}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary, paddingHorizontal: spacing.xl },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: { ...typography.h1, color: colors.white, textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.75)", textAlign: "center", marginBottom: spacing.xxl },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: colors.textPrimary },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md },
  errorText: { color: colors.danger, fontSize: 12, flex: 1 },
  switchText: { color: "rgba(255,255,255,0.85)", textAlign: "center", fontSize: 13 },
  switchTextBold: { color: colors.white, fontWeight: "700" },
});
