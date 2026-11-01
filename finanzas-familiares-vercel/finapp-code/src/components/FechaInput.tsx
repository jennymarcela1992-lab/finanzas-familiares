import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, radius, spacing } from "../theme/theme";
import { formatoFecha } from "../utils/amortizacion";

/**
 * Selector de fecha que funciona en el celular (calendario nativo) y en el navegador (calendario del navegador).
 * Trabaja con texto AAAA-MM-DD para evitar que la zona horaria corra el día.
 */
export default function FechaInput({
  value,
  onChange,
  max,
  min,
}: {
  value: string;
  onChange: (fecha: string) => void;
  max?: string;
  min?: string;
}) {
  const [abierto, setAbierto] = useState(false);

  if (Platform.OS === "web") {
    return (
      <View style={styles.caja}>
        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
        {React.createElement("input", {
          type: "date",
          value,
          max,
          min,
          onChange: (e: any) => e.target.value && onChange(e.target.value),
          style: {
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 14,
            fontWeight: 600,
            color: colors.textPrimary,
            fontFamily: "inherit",
            minHeight: 22,
          },
        })}
      </View>
    );
  }

  const [a, m, d] = value.split("-").map(Number);
  const comoFecha = new Date(a, m - 1, d);
  const aTexto = (f: Date) =>
    `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
  const aDate = (s?: string) => (s ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : undefined);

  return (
    <View>
      <TouchableOpacity style={styles.caja} onPress={() => setAbierto(true)}>
        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
        <Text style={styles.texto}>{formatoFecha(value)}</Text>
        <Text style={styles.cambiar}>Cambiar</Text>
      </TouchableOpacity>
      {abierto && (
        <DateTimePicker
          value={comoFecha}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          maximumDate={aDate(max)}
          minimumDate={aDate(min)}
          onChange={(evento, elegida) => {
            setAbierto(Platform.OS === "ios");
            if (evento.type !== "dismissed" && elegida) onChange(aTexto(elegida));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  texto: { flex: 1, fontSize: 14, color: colors.textPrimary, fontWeight: "600" },
  cambiar: { fontSize: 12, color: colors.primary, fontWeight: "600" },
});
