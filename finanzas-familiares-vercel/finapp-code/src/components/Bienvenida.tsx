import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "../theme/theme";

const CLAVE = "bienvenida_vista_v1";

const PASOS: { icono: keyof typeof Ionicons.glyphMap; titulo: string; texto: string }[] = [
  { icono: "people", titulo: "Una sola vista para los dos", texto: "Lo que registre uno aparece al instante en el celular y en el computador del otro." },
  { icono: "cart", titulo: "Gastos e ingresos", texto: "Registra cada movimiento, adjunta la foto del comprobante y consulta el historial con filtros." },
  { icono: "card", titulo: "Deudas, ahorros y propiedades", texto: "Cuotas con alertas de pago, metas de ahorro, arriendos y vehículos en un solo lugar." },
  { icono: "menu", titulo: "El menú lo encuentras en ☰", texto: "Desde ahí cambias de módulo y, en el computador, eliges el modo claro u oscuro." },
];

/** Guía de primera vez. Se muestra una sola vez por dispositivo. */
export default function Bienvenida() {
  const [visible, setVisible] = useState(false);
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    let vivo = true;
    AsyncStorage.getItem(CLAVE)
      .then((v) => vivo && !v && setVisible(true))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  function cerrar() {
    setVisible(false);
    AsyncStorage.setItem(CLAVE, "1").catch(() => {});
  }

  if (!visible) return null;
  const p = PASOS[paso];
  const ultimo = paso === PASOS.length - 1;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={cerrar}>
      <View style={styles.fondo}>
        <View style={styles.tarjeta}>
          <View style={styles.icono}>
            <Ionicons name={p.icono} size={30} color={colors.white} />
          </View>
          <Text style={styles.titulo}>{p.titulo}</Text>
          <Text style={styles.texto}>{p.texto}</Text>

          <View style={styles.puntos}>
            {PASOS.map((_, i) => (
              <View key={i} style={[styles.punto, i === paso && styles.puntoActivo]} />
            ))}
          </View>

          <View style={styles.botones}>
            <TouchableOpacity onPress={cerrar}>
              <Text style={styles.saltar}>Saltar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.siguiente} onPress={() => (ultimo ? cerrar() : setPaso(paso + 1))}>
              <Text style={styles.siguienteTexto}>{ultimo ? "Empezar" : "Siguiente"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(6,29,61,0.6)", justifyContent: "center", alignItems: "center", padding: spacing.xl },
  tarjeta: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  icono: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  titulo: { fontSize: 19, fontWeight: "800", color: colors.textPrimary, textAlign: "center", marginBottom: spacing.sm },
  texto: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
  puntos: { flexDirection: "row", gap: 6, marginVertical: spacing.lg },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  puntoActivo: { backgroundColor: colors.accent, width: 20 },
  botones: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  saltar: { color: colors.textMuted, fontWeight: "600", fontSize: 14, padding: 8 },
  siguiente: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 22 },
  siguienteTexto: { color: colors.white, fontWeight: "700", fontSize: 14 },
});
