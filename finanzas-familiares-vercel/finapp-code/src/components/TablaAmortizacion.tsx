import React, { useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { colors, radius, spacing } from "../theme/theme";
import type { DeudaConCuotas, CuotaRow } from "../hooks/useDeudas";
import { TIPOS_TASA } from "../utils/amortizacion";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const n0 = (v: number) => Math.round(v).toLocaleString("es-CO");
const n2 = (v: number) => v.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Fila =
  | { tipo: "inicio"; saldo: number }
  | { tipo: "evento"; fecha: string; texto: string; valor: number; saldoTras?: number }
  | { tipo: "cuota"; c: CuotaRow; saldoInicial: number; proxima: boolean };

/** Tabla de amortización estilo hoja de cálculo, con desplazamiento horizontal en el celular. */
export default function TablaAmortizacion({ deuda, onTocarCuota }: { deuda: DeudaConCuotas; onTocarCuota?: (c: CuotaRow) => void }) {
  const tieneSeguro = deuda.cuotas.some((c) => Number(c.seguro ?? 0) > 0);

  const filas: Fila[] = useMemo(() => {
    const cuotas = [...deuda.cuotas].sort((a, b) => a.numero_cuota - b.numero_cuota);
    const eventos = [
      ...deuda.desembolsos.map((x) => ({ fecha: x.fecha, texto: `Aumento del préstamo${x.nota ? ` · ${x.nota}` : ""}`, valor: Number(x.valor) })),
      ...deuda.abonos.map((a) => ({ fecha: a.fecha, texto: `Abono a capital (${a.modalidad === "plazo" ? "reduce plazo" : "reduce cuota"})`, valor: -Number(a.valor) })),
    ].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const out: Fila[] = [{ tipo: "inicio", saldo: Number(deuda.valor_inicial) }];
    let e = 0;
    const proximaId = deuda.proximaCuota?.id;
    for (const c of cuotas) {
      while (e < eventos.length && eventos[e].fecha <= c.fecha_vencimiento) out.push({ tipo: "evento", ...eventos[e++] });
      out.push({ tipo: "cuota", c, saldoInicial: Number(c.saldo) + Number(c.capital) + Number(c.abono_extra ?? 0), proxima: c.id === proximaId });
    }
    while (e < eventos.length) out.push({ tipo: "evento", ...eventos[e++] });
    return out;
  }, [deuda]);

  const totales = useMemo(() => {
    const t = { capital: 0, interes: 0, seguro: 0, abonos: 0, cuota: 0 };
    deuda.cuotas.forEach((c) => {
      t.capital += Number(c.capital);
      t.interes += Number(c.interes);
      t.seguro += Number(c.seguro ?? 0);
      t.abonos += Number(c.abono_extra ?? 0);
      t.cuota += Number(c.cuota_total);
    });
    t.abonos += deuda.abonos.reduce((s, a) => s + Number(a.valor), 0);
    return t;
  }, [deuda]);

  const proxima = deuda.proximaCuota ?? deuda.cuotas[0];
  const cuotaBase = proxima ? Number(proxima.capital) + Number(proxima.interes) + Number(proxima.seguro ?? 0) : 0;
  const tipo = TIPOS_TASA.find((t) => t.valor === (deuda.tipo_tasa ?? "MV"))?.etiqueta ?? "";

  async function descargar() {
    const enc = ["Cuota", "Año", "Mes", "Fecha", "Saldo inicial", "Capital", "Interés", ...(tieneSeguro ? ["Seguro"] : []), "Abonos", "Cuota total", "Saldo final", "Estado", "Pagó"];
    const lineas = [enc.join(";")];
    filas.forEach((f) => {
      if (f.tipo === "inicio") lineas.push(["0", "", "", "", "", "", "", ...(tieneSeguro ? [""] : []), "", "", Math.round(f.saldo), "", ""].join(";"));
      else if (f.tipo === "evento") lineas.push(["", f.fecha.slice(0, 4), MESES[Number(f.fecha.slice(5, 7)) - 1], f.fecha, "", "", "", ...(tieneSeguro ? [""] : []), Math.round(f.valor), "", "", f.texto, ""].join(";"));
      else {
        const c = f.c;
        lineas.push(
          [
            c.numero_cuota,
            c.fecha_vencimiento.slice(0, 4),
            MESES[Number(c.fecha_vencimiento.slice(5, 7)) - 1],
            c.fecha_vencimiento,
            Math.round(f.saldoInicial),
            Math.round(Number(c.capital)),
            Math.round(Number(c.interes)),
            ...(tieneSeguro ? [Math.round(Number(c.seguro ?? 0))] : []),
            Math.round(Number(c.abono_extra ?? 0)),
            Math.round(Number(c.cuota_total)),
            Math.round(Number(c.saldo)),
            c.estado === "pagada" ? "Pagada" : Number(c.valor_pagado ?? 0) > 0 ? "Parcial" : "Pendiente",
            c.pagada_por ?? "",
          ].join(";")
        );
      }
    });
    const csv = "﻿" + lineas.join("\n");
    const nombre = `amortizacion_${deuda.nombre.replace(/[^\w]+/g, "_")}.csv`;
    try {
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const ruta = FileSystem.documentDirectory + nombre;
        await FileSystem.writeAsStringAsync(ruta, csv, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(ruta, { mimeType: "text/csv" });
      }
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo descargar la tabla.");
    }
  }

  const cols = [
    { k: "num", t: "Cuota", w: 52 },
    { k: "anio", t: "Año", w: 52 },
    { k: "mes", t: "Mes", w: 92 },
    { k: "si", t: "Saldo inicial", w: 118 },
    { k: "cap", t: "Capital", w: 112 },
    { k: "int", t: "Interés", w: 112 },
    ...(tieneSeguro ? [{ k: "seg", t: "Seguro", w: 90 }] : []),
    { k: "ab", t: "Abonos", w: 104 },
    { k: "ct", t: "Cuota total", w: 112 },
    { k: "sf", t: "Saldo final", w: 118 },
    { k: "est", t: "Estado", w: 120 },
  ];
  const ancho = cols.reduce((s, c) => s + c.w, 0);
  const W = Object.fromEntries(cols.map((c) => [c.k, c.w]));

  return (
    <View>
      <View style={styles.resumen}>
        <Dato t="Cuota" v={`$${n0(cuotaBase)}`} />
        <Dato t={`Tasa ${tipo}`} v={`${Number(deuda.tasa_interes).toLocaleString("es-CO")}%`} />
        <Dato t="Tasa mensual" v={`${(deuda.iMensual * 100).toLocaleString("es-CO", { maximumFractionDigits: 4 })}%`} />
        <Dato t="Tiempo" v={`${deuda.cuotas.length} cuotas`} />
        <Dato t="Prestado" v={`$${n0(deuda.montoTotal)}`} />
        <Dato t="Saldo hoy" v={`$${n0(deuda.saldoActual)}`} />
      </View>

      <View style={styles.barra}>
        <View style={styles.leyenda}>
          <View style={[styles.cuadro, { backgroundColor: COLOR_PAGADA }]} />
          <Text style={styles.leyendaTexto}>Pagada</Text>
          <View style={[styles.cuadro, { backgroundColor: COLOR_PROXIMA }]} />
          <Text style={styles.leyendaTexto}>Próxima</Text>
          <View style={[styles.cuadro, { backgroundColor: COLOR_EVENTO }]} />
          <Text style={styles.leyendaTexto}>Aumento / abono</Text>
        </View>
        <TouchableOpacity onPress={descargar} style={styles.descargar}>
          <Ionicons name="download-outline" size={14} color={colors.primary} />
          <Text style={styles.descargarTexto}>Descargar (Excel)</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ width: ancho }}>
          <View style={[styles.fila, styles.encabezado]}>
            {cols.map((c) => (
              <Text key={c.k} style={[styles.celda, styles.celdaEnc, { width: c.w }, c.k !== "mes" && c.k !== "est" && c.k !== "anio" && styles.der]}>
                {c.t}
              </Text>
            ))}
          </View>
          <ScrollView style={{ maxHeight: 440 }} nestedScrollEnabled>
            {filas.map((f, idx) => {
              if (f.tipo === "inicio") {
                return (
                  <View key="inicio" style={styles.fila}>
                    <Text style={[styles.celda, { width: W.num }, styles.der]}>0</Text>
                    <Text style={[styles.celda, { width: ancho - W.num - W.sf - W.est }]} />
                    <Text style={[styles.celda, styles.der, styles.negrita, { width: W.sf }]}>{n0(f.saldo)}</Text>
                    <Text style={[styles.celda, { width: W.est }]} />
                  </View>
                );
              }
              if (f.tipo === "evento") {
                return (
                  <View key={`ev${idx}`} style={[styles.fila, { backgroundColor: COLOR_EVENTO }]}>
                    <Text style={[styles.celda, { width: W.num }]} />
                    <Text style={[styles.celda, { width: W.anio }]}>{f.fecha.slice(0, 4)}</Text>
                    <Text style={[styles.celda, { width: W.mes }]}>{MESES[Number(f.fecha.slice(5, 7)) - 1]}</Text>
                    <Text style={[styles.celda, styles.negrita, { width: ancho - W.num - W.anio - W.mes - W.est }]} numberOfLines={1}>
                      {f.texto}: {f.valor > 0 ? "+" : "−"}${n0(Math.abs(f.valor))}
                    </Text>
                    <Text style={[styles.celda, { width: W.est }]} />
                  </View>
                );
              }
              const c = f.c;
              const pagada = c.estado === "pagada";
              const parcial = !pagada && Number(c.valor_pagado ?? 0) > 0;
              const abonos = Number(c.abono_extra ?? 0);
              return (
                <TouchableOpacity
                  key={c.id}
                  activeOpacity={0.7}
                  onPress={() => onTocarCuota?.(c)}
                  style={[styles.fila, pagada && { backgroundColor: COLOR_PAGADA }, f.proxima && { backgroundColor: COLOR_PROXIMA }]}
                >
                  <Text style={[styles.celda, styles.der, { width: W.num }]}>{c.numero_cuota}</Text>
                  <Text style={[styles.celda, { width: W.anio }]}>{c.fecha_vencimiento.slice(0, 4)}</Text>
                  <Text style={[styles.celda, { width: W.mes }]}>{MESES[Number(c.fecha_vencimiento.slice(5, 7)) - 1]}</Text>
                  <Text style={[styles.celda, styles.der, { width: W.si }]}>{n0(f.saldoInicial)}</Text>
                  <Text style={[styles.celda, styles.der, { width: W.cap }]}>{n2(Number(c.capital))}</Text>
                  <Text style={[styles.celda, styles.der, { width: W.int }]}>{n2(Number(c.interes))}</Text>
                  {tieneSeguro && <Text style={[styles.celda, styles.der, { width: W.seg }]}>{n0(Number(c.seguro ?? 0))}</Text>}
                  <Text style={[styles.celda, styles.der, { width: W.ab }]}>{abonos ? n2(abonos) : "-"}</Text>
                  <Text style={[styles.celda, styles.der, styles.negrita, { width: W.ct }]}>{n0(Number(c.cuota_total))}</Text>
                  <Text style={[styles.celda, styles.der, { width: W.sf }]}>{n0(Number(c.saldo))}</Text>
                  <Text style={[styles.celda, { width: W.est }, pagada ? styles.txtPagada : parcial ? styles.txtParcial : styles.txtPend]} numberOfLines={1}>
                    {pagada ? `✓ ${c.pagada_por ?? "Pagada"}` : parcial ? `Parcial ${n0(Number(c.valor_pagado))}` : f.proxima ? "Próxima" : "Pendiente"}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View style={[styles.fila, styles.totales]}>
              <Text style={[styles.celda, styles.negrita, { width: W.num + W.anio + W.mes + W.si }]}>Totales</Text>
              <Text style={[styles.celda, styles.der, styles.negrita, { width: W.cap }]}>{n0(totales.capital)}</Text>
              <Text style={[styles.celda, styles.der, styles.negrita, { width: W.int }]}>{n0(totales.interes)}</Text>
              {tieneSeguro && <Text style={[styles.celda, styles.der, styles.negrita, { width: W.seg }]}>{n0(totales.seguro)}</Text>}
              <Text style={[styles.celda, styles.der, styles.negrita, { width: W.ab }]}>{n0(totales.abonos)}</Text>
              <Text style={[styles.celda, styles.der, styles.negrita, { width: W.ct }]}>{n0(totales.cuota)}</Text>
              <Text style={[styles.celda, { width: W.sf + W.est }]} />
            </View>
          </ScrollView>
        </View>
      </ScrollView>
      <Text style={styles.ayuda}>Desliza la tabla hacia los lados para ver todas las columnas. Toca una cuota para ver su detalle.</Text>
    </View>
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.datoT}>{t}</Text>
      <Text style={styles.datoV}>{v}</Text>
    </View>
  );
}

const COLOR_PAGADA = "#E3F3EC";
const COLOR_PROXIMA = "#FCEFD9";
const COLOR_EVENTO = "#E3EAF3";

const styles = StyleSheet.create({
  resumen: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.sm },
  dato: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, minWidth: 96, flexGrow: 1 },
  datoT: { fontSize: 10, color: colors.textMuted },
  datoV: { fontSize: 13, fontWeight: "800", color: colors.textPrimary },
  barra: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  leyenda: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  cuadro: { width: 10, height: 10, borderRadius: 2, borderWidth: 1, borderColor: colors.border, marginLeft: 4 },
  leyendaTexto: { fontSize: 10, color: colors.textSecondary },
  descargar: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary },
  descargarTexto: { fontSize: 11, color: colors.primary, fontWeight: "700" },
  fila: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  encabezado: { backgroundColor: colors.primary },
  celda: { paddingHorizontal: 6, paddingVertical: 6, fontSize: 11, color: colors.textPrimary },
  celdaEnc: { color: colors.white, fontWeight: "700" },
  der: { textAlign: "right" },
  negrita: { fontWeight: "700" },
  totales: { backgroundColor: colors.background },
  txtPagada: { color: colors.success, fontWeight: "700" },
  txtParcial: { color: colors.warning, fontWeight: "700" },
  txtPend: { color: colors.textMuted },
  ayuda: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
});
