import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useReporteJuanes, Soporte, LineaReporte, extensionDe } from "../../hooks/useReporteJuanes";
import { mesHoy, moverMes } from "../../hooks/useDashboard";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";
import { aNumero } from "../../utils/numeros";
import { pesos } from "../../utils/amortizacion";
import { crearXlsx, descargarZip, descargarBytes, Hoja } from "../../utils/xlsx";
import { actualizarLibro, saldoDelLibro } from "../../utils/libroJuanes";
import { descargarPdf, Bloque } from "../../utils/pdf";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const slug = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "gasto";

/** Abre el selector de archivos del navegador (foto, cámara o PDF). */
function elegirArchivo(): Promise<File | null> {
  return new Promise((ok) => {
    if (Platform.OS !== "web" || typeof document === "undefined") return ok(null);
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*,application/pdf";
    inp.onchange = () => ok(inp.files && inp.files[0] ? inp.files[0] : null);
    inp.click();
  });
}
function elegirArchivoExcel(): Promise<File | null> {
  return new Promise((ok) => {
    if (Platform.OS !== "web" || typeof document === "undefined") return ok(null);
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    inp.onchange = () => ok(inp.files && inp.files[0] ? inp.files[0] : null);
    inp.click();
  });
}
const fmt = (n: number) => (n ? Math.round(n).toLocaleString("es-CO") : "");

export default function ReporteJuanes() {
  const [mes, setMes] = useState(mesHoy());
  const esMesActual = mes === mesHoy();
  const r = useReporteJuanes(mes);

  const [cuota, setCuota] = useState("");
  const [pago, setPago] = useState("");
  const [saldoAnt, setSaldoAnt] = useState("");
  const [porc, setPorc] = useState("50");
  const [guardando, setGuardando] = useState(false);

  const [agregando, setAgregando] = useState(false);
  const [nConcepto, setNConcepto] = useState("");
  const [nValor, setNValor] = useState("");
  const [nNota, setNNota] = useState("");
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [armando, setArmando] = useState(false);
  const [subiendoLibro, setSubiendoLibro] = useState(false);
  const [delLibro, setDelLibro] = useState<{ saldo: number; origen: string } | null>(null);

  useEffect(() => {
    setCuota(fmt(r.config.cuota));
    setPago(fmt(r.config.pago));
    setSaldoAnt(r.config.saldoAnterior ? String(r.config.saldoAnterior) : "");
    setPorc(String(r.config.porcentaje));
  }, [r.config]);

  // saldo con el que cierra el mes anterior en TU libro (para no escribirlo a mano)
  useEffect(() => {
    let vivo = true;
    setDelLibro(null);
    if (!r.libroSubido) return;
    r.libroPara(mes)
      .then(async (l) => {
        if (!l || !vivo) return;
        const x = await saldoDelLibro(l.bytes, moverMes(mes, -1));
        if (vivo && x.saldo) setDelLibro({ saldo: x.saldo, origen: l.origen });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, r.libroSubido]);
  useEffect(() => {
    if (delLibro && !r.config.saldoAnterior) setSaldoAnt(String(Math.round(delLibro.saldo * 100) / 100));
  }, [delLibro, r.config]);

  // valores que se ven en pantalla según lo escrito (aunque no se haya guardado todavía)
  const vivo = useMemo(() => {
    const p = aNumero(porc) || 0;
    const c = aNumero(cuota) || 0;
    const pg = aNumero(pago) || 0;
    const sa = Number(saldoAnt.replace(/[^0-9.\-]/g, "")) || 0;
    const parte = (r.totalGastos * p) / 100;
    const total = parte + c;
    return { p, c, pg, sa, parte, total, saldo: sa + total - pg };
  }, [porc, cuota, pago, saldoAnt, r.totalGastos]);

  const grupos = useMemo(() => {
    const m = new Map<string, typeof r.lineas>();
    r.lineas.forEach((l) => m.set(l.concepto, [...(m.get(l.concepto) ?? []), l]));
    return [...m.entries()];
  }, [r.lineas]);

  async function guardar() {
    setGuardando(true);
    try {
      await r.guardarConfig({ cuota: vivo.c, pago: vivo.pg, saldoAnterior: vivo.sa, porcentaje: vivo.p });
      Alert.alert("Guardado", "Los valores de " + nombreMes(mes) + " quedaron guardados.");
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message ?? "Error");
    } finally {
      setGuardando(false);
    }
  }

  async function agregar() {
    const v = aNumero(nValor);
    if (!nConcepto.trim()) return Alert.alert("Falta el concepto", "Ej.: Pensión del colegio, Cita médica, Uniforme.");
    if (!(v > 0)) return Alert.alert("Falta el valor", "Escribe el valor TOTAL del gasto (la app calcula la parte de Juan Carlos).");
    try {
      await r.agregarLinea(nConcepto, v, nNota);
      setNConcepto("");
      setNValor("");
      setNNota("");
      setAgregando(false);
    } catch (e: any) {
      Alert.alert("No se pudo agregar", e.message ?? "Error");
    }
  }

  function confirmarBorrar(id: string, concepto: string) {
    Alert.alert("Quitar", `¿Quitar «${concepto}» del reporte?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: () => r.borrarLinea(id).catch((e) => Alert.alert("Error", e.message)) },
    ]);
  }

  const soportesDe = (clave: string) => r.soportes.filter((x) => x.clave === clave);
  const sinSoporte = r.incluidas.filter((l) => soportesDe(l.clave).length === 0);

  // nombre con el que el soporte queda en la carpeta del ZIP y en la columna «Soporte» del Excel
  const nombreZip = (l: LineaReporte, sp: Soporte, i: number) => `Soportes/${l.fecha}_${slug(l.concepto)}_${i + 1}.${extensionDe(sp.nombre, sp.tipo)}`;

  async function agregarSoporte(l: LineaReporte) {
    const f = await elegirArchivo();
    if (!f) return;
    setSubiendo(l.clave);
    try {
      await r.subirSoporte(l.clave, f);
    } catch (e: any) {
      Alert.alert("No se pudo subir", e.message ?? "Error");
    } finally {
      setSubiendo(null);
    }
  }
  async function verSoporte(sp: Soporte) {
    const url = await r.urlSoporte(sp);
    if (!url) return Alert.alert("No se pudo abrir", "Intenta de nuevo.");
    if (Platform.OS === "web" && typeof window !== "undefined") window.open(url, "_blank");
  }
  function confirmarQuitarSoporte(sp: Soporte) {
    Alert.alert("Quitar soporte", `¿Quitar «${sp.nombre}»?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: () => r.borrarSoporte(sp).catch((e) => Alert.alert("Error", e.message)) },
    ]);
  }

  async function paquete() {
    setArmando(true);
    try {
      const x = await construirExcel();
      const archivos: { nombre: string; datos: Uint8Array }[] = [{ nombre: x.nombre, datos: x.bytes }];
      const faltan: string[] = [];
      for (const l of r.incluidas) {
        const lista = soportesDe(l.clave);
        for (let i = 0; i < lista.length; i++) {
          const datos = await r.bytesSoporte(lista[i]);
          if (datos) archivos.push({ nombre: nombreZip(l, lista[i], i), datos });
          else faltan.push(`${l.detalle} (${lista[i].nombre})`);
        }
      }
      const n = archivos.length - 1;
      if (!descargarZip(`Reporte_Juanes_${mes}.zip`, archivos)) Alert.alert("Solo en el navegador", "La descarga funciona desde la versión web de la app.");
      else if (faltan.length) Alert.alert("Descargado, pero faltan archivos", `No se pudieron leer ${faltan.length} soportes:\n${faltan.join("\n")}`);
      else Alert.alert("Descargado", `Incluye el Excel${x.conLibro ? " actualizado sobre tu libro" : " simple (sin tu historia: sube tu libro)"} y ${n} soportes.${x.mensaje ? "\n\n" + x.mensaje : ""}${sinSoporte.length ? `\n\nOjo: ${sinSoporte.length} gasto(s) no tienen soporte (salen como «SIN SOPORTE» en el Excel).` : ""}`);
    } finally {
      setArmando(false);
    }
  }

  // totales por concepto (solo líneas incluidas)
  function resumenPorConcepto() {
    const m = new Map<string, number>();
    r.incluidas.forEach((l) => m.set(l.concepto, (m.get(l.concepto) ?? 0) + l.valor));
    return [...m.entries()];
  }

  function hojasExcel(): Hoja[] {
    const filasConcepto = resumenPorConcepto().map(([c, v]) => [c, { v, estilo: "dinero" as const }, { v: (v * vivo.p) / 100, estilo: "dinero" as const }]);
    return [
      {
        nombre: "Reporte",
        anchos: [34, 18, 22],
        filas: [
          [{ v: `Gastos de Juanes - ${nombreMes(mes)}`, estilo: "titulo" }],
          [`Parte a cargo de Juan Carlos Bernal: ${vivo.p}% de los gastos`],
          [],
          [{ v: "Concepto", estilo: "encabezado" }, { v: "Valor total", estilo: "encabezado" }, { v: `A cargo de Juan Carlos (${vivo.p}%)`, estilo: "encabezado" }],
          ["Cuota alimentaria", "", { v: vivo.c, estilo: "dinero" }],
          ...filasConcepto,
          [],
          [{ v: "TOTAL DEL MES", estilo: "negrita" }, { v: r.totalGastos, estilo: "dineroNegrita" }, { v: vivo.total, estilo: "dineroNegrita" }],
          [{ v: "Saldo anterior", estilo: "negrita" }, "", { v: vivo.sa, estilo: "dineroNegrita" }],
          [{ v: "PAGO", estilo: "negrita" }, "", { v: vivo.pg, estilo: "dineroNegrita" }],
          [{ v: "SALDO", estilo: "negrita" }, "", { v: vivo.saldo, estilo: "dineroNegrita" }],
        ],
      },
      {
        nombre: "Detalle",
        anchos: [12, 28, 44, 14, 18, 22, 60],
        filas: [
          [{ v: "Fecha", estilo: "encabezado" }, { v: "Concepto", estilo: "encabezado" }, { v: "Detalle", estilo: "encabezado" }, { v: "Origen", estilo: "encabezado" }, { v: "Valor total", estilo: "encabezado" }, { v: "A cargo de Juan Carlos", estilo: "encabezado" }, { v: "Soporte (archivo en la carpeta Soportes del ZIP)", estilo: "encabezado" }],
          ...r.incluidas.map((l) => {
            const lista = soportesDe(l.clave);
            return [l.fecha, l.concepto, l.detalle, l.origen === "manual" ? "Manual" : "Registrado", { v: l.valor, estilo: "dinero" as const }, { v: (l.valor * vivo.p) / 100, estilo: "dinero" as const }, lista.length ? lista.map((sp, i) => nombreZip(l, sp, i).replace("Soportes/", "")).join(" | ") : "SIN SOPORTE"];
          }),
        ],
      },
    ];
  }

  /** Arma el Excel del mes: sobre TU libro (con historia y fórmulas) si ya lo subiste; si no, un libro simple de respaldo. */
  async function construirExcel() {
    const nombre = `Gastos_Juan_Carlos_Bernal_${mes}.xlsx`;
    const base = await r.libroPara(mes);
    if (!base) return { nombre, bytes: crearXlsx(hojasExcel()), conLibro: false, mensaje: "" };
    const gastos = r.incluidas.map((l) => {
      const lista = soportesDe(l.clave);
      return { fecha: l.fecha, concepto: l.concepto, detalle: l.detalle, valor: l.valor, soporte: lista.length ? lista.map((sp, i) => nombreZip(l, sp, i).replace("Soportes/", "")).join(" | ") : "SIN SOPORTE" };
    });
    const res = await actualizarLibro(base.bytes, { mes, porcentaje: vivo.p, cuota: vivo.c, pago: vivo.pg, gastos });
    await r.guardarLibroMes(mes, res.bytes).catch(() => {});
    const dif = Math.abs(res.saldo - vivo.saldo) > 1 ? `\n\nOjo: el saldo en tu Excel es ${pesos(res.saldo)} y en la pantalla ${pesos(vivo.saldo)} (el Excel usa el saldo anterior de tu libro: ${pesos(res.saldoAnterior)}).` : "";
    return { nombre, bytes: res.bytes, conLibro: true, mensaje: `Saldo en tu Excel: ${pesos(res.saldo)}.${res.avisos.length ? "\n\n" + res.avisos.join("\n") : ""}${dif}` };
  }

  async function excel() {
    setArmando(true);
    try {
      const x = await construirExcel();
      if (!descargarBytes(x.nombre, x.bytes)) return Alert.alert("Solo en el navegador", "La descarga funciona desde la versión web de la app.");
      Alert.alert(x.conLibro ? "Excel actualizado" : "Excel simple (sin tu historia)", x.conLibro ? x.mensaje : "Aún no has subido tu libro de Excel; este archivo solo trae el mes. Sube tu libro en la tarjeta «Tu libro de Excel» para que incluya la historia y las fórmulas.");
    } catch (e: any) {
      Alert.alert("No se pudo armar el Excel", e.message ?? "Error");
    } finally {
      setArmando(false);
    }
  }

  async function elegirLibro() {
    const f = await elegirArchivoExcel();
    if (!f) return;
    setSubiendoLibro(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const x = await saldoDelLibro(bytes, `${mes.slice(0, 4)}-01`); // comprueba que se pueda leer y que tenga la hoja del año
      void x;
      await r.subirLibroBase(f);
      Alert.alert("Libro guardado", "Desde ahora cada Excel que descargues parte de este libro, con toda su historia y sus fórmulas.");
    } catch (e: any) {
      Alert.alert("No se pudo usar ese archivo", e.message ?? "Error");
    } finally {
      setSubiendoLibro(false);
    }
  }

  function pdf() {
    const bloques: Bloque[] = [
      { t: "titulo", texto: `Gastos de Juanes - ${nombreMes(mes)}`, sub: `Parte a cargo de Juan Carlos Bernal: ${vivo.p}% de los gastos` },
      { t: "seccion", texto: "Resumen" },
      { t: "fila", a: "Cuota alimentaria", c: pesos(vivo.c) },
      ...resumenPorConcepto().map(([c, v]): Bloque => ({ t: "fila", a: c, b: `total ${pesos(v)}`, c: pesos((v * vivo.p) / 100) })),
      { t: "fila", a: "TOTAL DEL MES", b: `gastos ${pesos(r.totalGastos)}`, c: pesos(vivo.total), fuerte: true },
      { t: "fila", a: "Saldo anterior", c: pesos(vivo.sa) },
      { t: "fila", a: "Pago recibido", c: pesos(vivo.pg) },
      { t: "fila", a: "SALDO", c: pesos(vivo.saldo), fuerte: true },
      { t: "espacio" },
      { t: "seccion", texto: "Detalle de los gastos" },
      ...r.incluidas.map((l): Bloque => ({ t: "fila", a: `${l.fecha} - ${l.detalle}${soportesDe(l.clave).length ? "" : " (sin soporte)"}`, b: `total ${pesos(l.valor)}`, c: pesos((l.valor * vivo.p) / 100) })),
    ];
    const ok = descargarPdf(`Gastos_Juan_Carlos_Bernal_${mes}.pdf`, bloques);
    if (!ok) Alert.alert("Solo en el navegador", "La descarga funciona desde la versión web de la app.");
  }

  if (r.faltaSql) {
    return (
      <Card>
        <Text style={typography.h3}>Falta un paso en Supabase</Text>
        <Text style={typography.body}>Corre el archivo supabase_finanzas_personales.sql en Supabase (SQL Editor) y vuelve a abrir esta pantalla.</Text>
      </Card>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.selector}>
        <TouchableOpacity onPress={() => setMes(moverMes(mes, -1))} style={styles.flecha} accessibilityLabel="Mes anterior">
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[typography.h2, { textTransform: "capitalize" }]}>{nombreMes(mes)}</Text>
        <TouchableOpacity onPress={() => setMes(moverMes(mes, 1))} style={[styles.flecha, esMesActual && { opacity: 0.3 }]} disabled={esMesActual} accessibilityLabel="Mes siguiente">
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {r.cargando ? (
        <ActivityIndicator color={colors.primary} />
      ) : r.error ? (
        <Text style={{ color: colors.danger }}>Error: {r.error}</Text>
      ) : (
        <>
          <Card style={{ backgroundColor: colors.hero }}>
            <Text style={styles.heroEtiqueta}>Saldo de Juan Carlos al cierre de {MESES[Number(mes.slice(5, 7)) - 1]}</Text>
            <Text style={[styles.heroValor, vivo.saldo < 0 && { color: "#FFB4A8" }]}>{pesos(vivo.saldo)}</Text>
            <Text style={styles.heroDetalle}>
              Gastos {pesos(r.totalGastos)} · su parte ({vivo.p}%) {pesos(vivo.parte)} · cuota {pesos(vivo.c)}
            </Text>
            <Text style={styles.heroDetalle}>
              Total del mes {pesos(vivo.total)} · pagó {pesos(vivo.pg)} · saldo anterior {pesos(vivo.sa)}
            </Text>
          </Card>

          <Card>
            <Text style={typography.h3}>Valores del mes</Text>
            <Text style={[typography.caption, { marginBottom: 6 }]}>Escríbelos y toca «Guardar valores». Los gastos se leen solos de lo que registras.</Text>
            <Text style={styles.label}>Cuota alimentaria (déjala en 0 para usar la que ya tiene tu libro)</Text>
            <TextInput style={styles.input} value={cuota} onChangeText={setCuota} keyboardType="numeric" placeholder="Ej. 422874" placeholderTextColor={colors.textMuted} />
            <Text style={styles.label}>Lo que pagó Juan Carlos este mes</Text>
            <TextInput style={styles.input} value={pago} onChangeText={setPago} keyboardType="numeric" placeholder="Ej. 360000" placeholderTextColor={colors.textMuted} />
            <Text style={styles.label}>Saldo que venía del mes anterior</Text>
            <TextInput style={styles.input} value={saldoAnt} onChangeText={setSaldoAnt} keyboardType="numeric" placeholder="Ej. 32256217.71" placeholderTextColor={colors.textMuted} />
            <Text style={styles.label}>% de los gastos que le corresponde</Text>
            <TextInput style={styles.input} value={porc} onChangeText={setPorc} keyboardType="numeric" placeholder="50" placeholderTextColor={colors.textMuted} />
            <PrimaryButton title="Guardar valores" onPress={guardar} loading={guardando} />
          </Card>

          <Card>
            <Text style={typography.h3}>Gastos que entran al reporte</Text>
            <Text style={[typography.caption, { marginBottom: 4 }]}>
              Se toman solos los gastos de la familia y los tuyos que dicen «ruta», «onces» o «Juanes» (o tienen el rubro Juanes). Toca el círculo para quitar o volver a poner uno.
            </Text>
            {r.incluidas.length > 0 && (
              <Text style={[typography.caption, { fontWeight: "700", color: sinSoporte.length ? colors.danger : colors.success }]}>
                {sinSoporte.length ? `${r.incluidas.length - sinSoporte.length} de ${r.incluidas.length} gastos con soporte · faltan ${sinSoporte.length}` : `Los ${r.incluidas.length} gastos tienen soporte`}
              </Text>
            )}
            {grupos.length === 0 && <Text style={[typography.caption, { marginTop: 6 }]}>Este mes todavía no hay gastos que coincidan. Registra los gastos en Gastos (rubro Juanes, o que digan ruta/onces) o agrégalos a mano abajo.</Text>}
            {grupos.map(([concepto, items]) => {
              const sub = items.filter((l) => !r.excluidas.has(l.clave)).reduce((s, l) => s + l.valor, 0);
              return (
                <View key={concepto} style={{ marginTop: spacing.md }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={styles.grupo}>{concepto}</Text>
                    <Text style={styles.grupo}>{pesos(sub)}</Text>
                  </View>
                  {items.map((l) => {
                    const incl = !r.excluidas.has(l.clave);
                    return (
                      <React.Fragment key={l.clave}>
                      <View style={styles.linea}>
                        <TouchableOpacity onPress={() => r.alternar(l.clave)} accessibilityLabel={incl ? "Quitar del reporte" : "Poner en el reporte"} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name={incl ? "checkmark-circle" : "ellipse-outline"} size={24} color={incl ? colors.success : colors.textMuted} />
                        </TouchableOpacity>
                        <View style={{ flex: 1, opacity: incl ? 1 : 0.45 }}>
                          <Text style={styles.lineaTitulo}>{l.detalle}</Text>
                          <Text style={typography.caption}>{l.origen === "manual" ? "Agregado a mano" : l.fecha}</Text>
                        </View>
                        <Text style={[styles.lineaValor, { opacity: incl ? 1 : 0.45 }]}>{pesos(l.valor)}</Text>
                        {l.origen === "manual" && l.idManual && (
                          <TouchableOpacity onPress={() => confirmarBorrar(l.idManual!, l.concepto)} accessibilityLabel="Quitar línea" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="trash-outline" size={18} color={colors.danger} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.soportes}>
                        {soportesDe(l.clave).map((sp) => (
                          <View key={sp.id} style={styles.soporteChip}>
                            <TouchableOpacity onPress={() => verSoporte(sp)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessibilityLabel={`Ver ${sp.nombre}`}>
                              <Ionicons name={sp.tipo === "application/pdf" ? "document-text-outline" : "image-outline"} size={14} color={colors.primary} />
                              <Text style={styles.soporteTexto} numberOfLines={1}>{sp.nombre}</Text>
                            </TouchableOpacity>
                            {sp.propio && (
                              <TouchableOpacity onPress={() => confirmarQuitarSoporte(sp)} accessibilityLabel="Quitar soporte" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                        {soportesDe(l.clave).length === 0 && <Text style={styles.sinSoporte}>Sin soporte</Text>}
                        <TouchableOpacity style={styles.soporteAgregar} onPress={() => agregarSoporte(l)} disabled={subiendo === l.clave} accessibilityLabel="Subir soporte">
                          {subiendo === l.clave ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="attach" size={16} color={colors.primary} />}
                          <Text style={styles.soporteAgregarTexto}>{subiendo === l.clave ? "Subiendo..." : "Subir factura / foto"}</Text>
                        </TouchableOpacity>
                      </View>
                      </React.Fragment>
                    );
                  })}
                </View>
              );
            })}

            {agregando ? (
              <View style={{ marginTop: spacing.md }}>
                <TextInput style={styles.input} placeholder="Concepto (ej. Pensión colegio, Cita médica)" placeholderTextColor={colors.textMuted} value={nConcepto} onChangeText={setNConcepto} />
                <TextInput style={styles.input} placeholder="Valor TOTAL del gasto" placeholderTextColor={colors.textMuted} value={nValor} onChangeText={setNValor} keyboardType="numeric" />
                <TextInput style={styles.input} placeholder="Nota (opcional)" placeholderTextColor={colors.textMuted} value={nNota} onChangeText={setNNota} />
                <PrimaryButton title="Agregar al reporte" onPress={agregar} />
                <TouchableOpacity onPress={() => setAgregando(false)} style={styles.salir}>
                  <Text style={{ textAlign: "center", color: colors.textPrimary, fontWeight: "600" }}>Salir sin guardar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.botonBorde, { marginTop: spacing.md }]} onPress={() => setAgregando(true)}>
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={styles.botonBordeTexto}>Agregar otro gasto a mano</Text>
              </TouchableOpacity>
            )}
          </Card>

          <Card>
            <Text style={typography.h3}>Tu libro de Excel</Text>
            {r.libroSubido ? (
              <>
                <Text style={[typography.caption, { color: colors.success, fontWeight: "700", marginTop: 4 }]}>Libro cargado: el Excel que descargues trae toda tu historia y tus fórmulas.</Text>
                {delLibro && <Text style={[typography.caption, { marginTop: 4 }]}>Saldo con el que cierra el mes anterior en tu libro: {pesos(delLibro.saldo)} (se usa como saldo anterior).</Text>}
                <Text style={[typography.caption, { marginTop: 4 }]}>Al descargar, se actualiza el bloque de {MESES[Number(mes.slice(5, 7)) - 1]} (gastos con fórmula tipo =235000/2, TOTAL, PAGO, SALDO), la hoja RESUMEN 2 y se agrega una hoja «Detalle {mes}» con los soportes. Cada mes parte del mes anterior ya actualizado.</Text>
              </>
            ) : (
              <Text style={[typography.caption, { marginTop: 4 }]}>Sube una sola vez tu Excel de siempre (el de Juan Carlos Bernal con las hojas por año). Así el reporte mantiene la historia y las fórmulas, y solo se actualiza el mes.</Text>
            )}
            <TouchableOpacity style={[styles.botonBorde, { marginTop: spacing.sm }]} onPress={elegirLibro} disabled={subiendoLibro}>
              {subiendoLibro ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />}
              <Text style={styles.botonBordeTexto}>{r.libroSubido ? "Reemplazar mi libro" : "Subir mi libro de Excel"}</Text>
            </TouchableOpacity>
          </Card>

          <PrimaryButton title="Descargar paquete completo (Excel + soportes)" onPress={paquete} loading={armando} />
          <Text style={[typography.caption, { textAlign: "center" }]}>El ZIP trae el Excel actualizado y una carpeta «Soportes» con las fotos y PDF de cada factura.</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TouchableOpacity style={[styles.botonBorde, { flex: 1 }]} onPress={excel}>
              <Ionicons name="download-outline" size={16} color={colors.primary} />
              <Text style={styles.botonBordeTexto}>Solo Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.botonBorde, { flex: 1 }]} onPress={pdf}>
              <Ionicons name="document-text-outline" size={16} color={colors.primary} />
              <Text style={styles.botonBordeTexto}>Solo PDF</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  selector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  flecha: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  heroEtiqueta: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  heroValor: { color: colors.white, fontSize: 30, fontWeight: "800", marginTop: 2 },
  heroDetalle: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 4 },
  label: { fontSize: 12, color: colors.textSecondary, fontWeight: "600", marginTop: 4 },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  grupo: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  linea: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6 },
  lineaTitulo: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  lineaValor: { fontSize: 13, fontWeight: "800", color: colors.textPrimary },
  soportes: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginLeft: 34, marginBottom: 6 },
  soporteChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 220 },
  soporteTexto: { fontSize: 12, color: colors.primary, flexShrink: 1 },
  sinSoporte: { fontSize: 12, color: colors.danger, fontWeight: "700" },
  soporteAgregar: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.primary, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4 },
  soporteAgregarTexto: { fontSize: 12, color: colors.primary, fontWeight: "700" },
  salir: { marginTop: spacing.sm, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 },
  botonBorde: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 12 },
  botonBordeTexto: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
