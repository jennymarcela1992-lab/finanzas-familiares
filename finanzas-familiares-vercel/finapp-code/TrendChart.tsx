import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, spacing, radius } from "../theme/theme";

// Colores de serie validados (azul / naranja): distinguibles también con daltonismo.
export const COLOR_ENTRADAS = "#2a78d6";
export const COLOR_SALIDAS = "#eb6834";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const nombreMesCorto = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1];

export function abreviar(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })}M`;
  if (a >= 1_000) return `$${Math.round(n / 1_000).toLocaleString("es-CO")}k`;
  return `$${Math.round(n)}`;
}

interface Punto {
  mes: string;
  entradas: number;
  salidas: number;
}

const ALTO = 140;

/** Barras agrupadas por mes (entradas vs salidas). Tocar un mes muestra sus valores. */
export default function TrendChart({ datos, mesInicial }: { datos: Punto[]; mesInicial?: string }) {
  const [elegido, setElegido] = useState<string>(mesInicial ?? datos[datos.length - 1]?.mes);
  const max = Math.max(1, ...datos.flatMap((d) => [d.entradas, d.salidas]));
  // líneas guía en 0, 50% y 100% de un tope "redondo"
  const paso = Math.pow(10, Math.floor(Math.log10(max)));
  const tope = Math.ceil(max / paso) * paso;
  const guias = [tope, tope / 2];
  const sel = datos.find((d) => d.mes === elegido);
  const sinDatos = datos.every((d) => d.entradas === 0 && d.salidas === 0);

  return (
    <View>
      <View style={styles.leyenda}>
        <View style={styles.leyendaItem}>
          <View style={[styles.cuadrito, { backgroundColor: COLOR_ENTRADAS }]} />
          <Text style={styles.leyendaTexto}>Entradas</Text>
        </View>
        <View style={styles.leyendaItem}>
          <View style={[styles.cuadrito, { backgroundColor: COLOR_SALIDAS }]} />
          <Text style={styles.leyendaTexto}>Salidas (gastos + cuotas)</Text>
        </View>
      </View>

      {sinDatos ? (
        <Text style={styles.vacio}>Aún no hay movimientos en estos meses.</Text>
      ) : (
        <>
          <View style={{ height: ALTO + 22, marginTop: 14 }}>
            {guias.map((g) => (
              <View key={g} style={[styles.guia, { bottom: 22 + (g / tope) * ALTO }]}>
                <Text style={styles.guiaTexto}>{abreviar(g)}</Text>
              </View>
            ))}
            <View style={[styles.guia, styles.base, { bottom: 22 }]} />
            <View style={styles.columnas}>
              {datos.map((d) => {
                const activo = d.mes === elegido;
                return (
                  <TouchableOpacity
                    key={d.mes}
                    style={[styles.columna, activo && styles.columnaActiva]}
                    onPress={() => setElegido(d.mes)}
                    accessibilityLabel={`${nombreMesCorto(d.mes)}: entradas ${abreviar(d.entradas)}, salidas ${abreviar(d.salidas)}`}
                  >
                    <View style={styles.barras}>
                      <View style={[styles.barra, { height: Math.max(d.entradas > 0 ? 3 : 0, (d.entradas / tope) * ALTO), backgroundColor: COLOR_ENTRADAS }]} />
                      <View style={[styles.barra, { height: Math.max(d.salidas > 0 ? 3 : 0, (d.salidas / tope) * ALTO), backgroundColor: COLOR_SALIDAS }]} />
                    </View>
                    <Text style={[styles.mes, activo && styles.mesActivo]}>{nombreMesCorto(d.mes)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {sel && (
            <View style={styles.detalle}>
              <Text style={styles.detalleTitulo}>{nombreMesCorto(sel.mes)} {sel.mes.slice(0, 4)}</Text>
              <View style={styles.detalleFila}>
                <View style={[styles.cuadrito, { backgroundColor: COLOR_ENTRADAS }]} />
                <Text style={styles.detalleTexto}>Entradas</Text>
                <Text style={styles.detalleValor}>${Math.round(sel.entradas).toLocaleString("es-CO")}</Text>
              </View>
              <View style={styles.detalleFila}>
                <View style={[styles.cuadrito, { backgroundColor: COLOR_SALIDAS }]} />
                <Text style={styles.detalleTexto}>Salidas</Text>
                <Text style={styles.detalleValor}>${Math.round(sel.salidas).toLocaleString("es-CO")}</Text>
              </View>
              <View style={[styles.detalleFila, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4, marginTop: 2 }]}>
                <View style={[styles.cuadrito, { backgroundColor: "transparent" }]} />
                <Text style={styles.detalleTexto}>Quedó</Text>
                <Text style={styles.detalleValor}>
                  {sel.entradas - sel.salidas < 0 ? "−" : ""}${Math.abs(Math.round(sel.entradas - sel.salidas)).toLocaleString("es-CO")}
                </Text>
              </View>
            </View>
          )}
          <Text style={styles.ayuda}>Toca un mes para ver sus valores.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  leyenda: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: spacing.sm },
  leyendaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  cuadrito: { width: 10, height: 10, borderRadius: 3 },
  leyendaTexto: { fontSize: 12, color: colors.textSecondary },
  guia: { position: "absolute", left: 0, right: 0, borderTopWidth: 1, borderTopColor: colors.border },
  base: { borderTopColor: "#C9D1CF" },
  guiaTexto: { position: "absolute", left: 0, top: -14, fontSize: 10, color: colors.textMuted },
  columnas: { position: "absolute", left: 34, right: 0, top: 0, bottom: 0, flexDirection: "row", justifyContent: "space-around" },
  columna: { flex: 1, alignItems: "center", justifyContent: "flex-end", borderRadius: radius.sm, paddingTop: 4 },
  columnaActiva: { backgroundColor: "rgba(42,120,214,0.08)" },
  barras: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: ALTO },
  barra: { width: 12, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  mes: { fontSize: 11, color: colors.textMuted, height: 22, lineHeight: 22 },
  mesActivo: { color: colors.textPrimary, fontWeight: "700" },
  detalle: { marginTop: spacing.sm, backgroundColor: colors.background, borderRadius: radius.sm, padding: spacing.sm },
  detalleTitulo: { fontSize: 12, fontWeight: "700", color: colors.textPrimary, marginBottom: 4 },
  detalleFila: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  detalleTexto: { fontSize: 12, color: colors.textSecondary, flex: 1 },
  detalleValor: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  ayuda: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  vacio: { fontSize: 12, color: colors.textMuted, fontStyle: "italic" },
});
