import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, radius } from "../theme/theme";

export default function BarChart({ data, colorBarra = colors.primary }: { data: { etiqueta: string; valor: number }[]; colorBarra?: string }) {
  if (data.length === 0) {
    return <Text style={styles.vacio}>Sin datos este mes.</Text>;
  }
  const max = Math.max(...data.map((d) => d.valor), 1);

  return (
    <View>
      {data.map((d) => (
        <View key={d.etiqueta} style={styles.fila}>
          <View style={styles.encabezadoFila}>
            <Text style={styles.etiqueta} numberOfLines={1}>
              {d.etiqueta}
            </Text>
            <Text style={styles.valor}>${d.valor.toLocaleString("es-CO")}</Text>
          </View>
          <View style={styles.fondoBarra}>
            <View style={[styles.barra, { width: `${Math.max((d.valor / max) * 100, 4)}%`, backgroundColor: colorBarra }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { marginBottom: spacing.sm },
  encabezadoFila: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  etiqueta: { fontSize: 12, color: colors.textSecondary, flex: 1, marginRight: 8 },
  valor: { fontSize: 12, color: colors.textPrimary, fontWeight: "700" },
  fondoBarra: { height: 8, backgroundColor: colors.border, borderRadius: radius.pill, overflow: "hidden" },
  barra: { height: 8, borderRadius: radius.pill },
  vacio: { fontSize: 12, color: colors.textMuted, fontStyle: "italic" },
});
