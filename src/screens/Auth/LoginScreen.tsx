import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useAuth } from "../../hooks/useAuth";

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
      if (modoRegistro) {
        await registrar(email, password, nombre);
      } else {
        await iniciarSesion(email, password);
      }
    } catch {
      // el mensaje ya queda en `error`
    } finally {
      setCargando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.title}>Finanzas Familiares</Text>
      <Text style={styles.subtitle}>{modoRegistro ? "Crea tu cuenta" : "Inicia sesión"}</Text>

      {modoRegistro && (
        <TextInput style={styles.input} placeholder="Tu nombre" placeholderTextColor="#9AA" value={nombre} onChangeText={setNombre} />
      )}
      <TextInput
        style={styles.input}
        placeholder="Correo electrónico"
        placeholderTextColor="#9AA"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput style={styles.input} placeholder="Contraseña" placeholderTextColor="#9AA" value={password} onChangeText={setPassword} secureTextEntry />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.button} onPress={manejarEnvio} disabled={cargando}>
        {cargando ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{modoRegistro ? "Registrarme" : "Entrar"}</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setModoRegistro(!modoRegistro)}>
        <Text style={styles.switchText}>{modoRegistro ? "¿Ya tienes cuenta? Inicia sesión" : "¿No tienes cuenta? Regístrate"}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", backgroundColor: "#1F6F5C", padding: 24 },
  title: { fontSize: 28, fontWeight: "bold", color: "#fff", marginBottom: 4, textAlign: "center" },
  subtitle: { fontSize: 15, color: "#EAF3F1", textAlign: "center", marginBottom: 24 },
  input: { backgroundColor: "#fff", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, fontSize: 15 },
  button: { backgroundColor: "#144B3F", borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  switchText: { color: "#EAF3F1", textAlign: "center", marginTop: 16, fontSize: 13 },
  error: { color: "#FFD1D1", textAlign: "center", marginBottom: 8, fontSize: 13 },
});
