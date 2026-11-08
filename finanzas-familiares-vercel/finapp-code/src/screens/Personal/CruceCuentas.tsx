import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCruceCuentas, Movimiento, SoporteCruce, fraseSaldo, comoSalda } from "../../hooks/useCruceCuentas";
import { extensionDe } from "../../hooks/useReporteJuanes";
import { mesHoy, moverMes } from "../../hooks/useDashboard";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import FechaInput from "../../components/FechaInput";
import { colors, spacing, typography, radius } from "../../theme/theme";
import { aNumero } from "../../utils/numeros";
import { pesos, hoyISO } from "../../utils/amortizacion";
import { crearXlsx, descargarBytes, descargarZip, Hoja } from "../../utils/xlsx";
import { crearPdf, Bloque } from "../../utils/pdf";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const slug = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "gasto";

/** Abre el selector de archivos del navegador (PDF, foto o cámara). */
function elegirArchivo(): Promise<File | null> {
  return new Promise((ok) => {
    if (Platform.OS !== "web" || typeof document === "undefined") return ok(null);
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/pdf,image/*";
    inp.onchange = () => ok(inp.files && inp.files[0] ? inp.files[0] : null);
    inp.click();
  });
}

export default function CruceCuentas() {
  const [mes, setMes] = useState(mesHoy());
  const esMesActual = mes === mesHoy();
  const c = useCruceCuentas(mes);
  const otra = c.cuenta?.nombre ?? "Mi mamá";

  // formulario de movimiento
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [clase, setClase] = useState<"gasto" | "pago">("gasto");
  const [quien, setQuien] = useState<"yo" | "otra">("otra");
  const [concepto, setConcepto] = useState("");
  const [valor, setValor] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [armando, setArmando] = useState(false);

  // ajustes de la cuenta
  const [ajustes, setAjustes] = useState(false);
  const [aNombre, setANombre] = useState("");
  const [aSaldo, setASaldo] = useState("");
  const [aDeudor, setADeudor] = useState<"yo" | "otra">("otra");
  const [aDesde, setADesde] = useState(mesHoy());
  const [aDatosYo, setADatosYo] = useState("");
  const [aDatosOtra, setADatosOtra] = useState("");
  const [nuevaCuenta, setNuevaCuenta] = useState("");

  useEffect(() => {
    if (!c.cuenta) return;
    setANombre(c.cuenta.nombre);
    setASaldo(c.cuenta.saldoInicial ? String(Math.abs(c.cuenta.saldoInicial)) : "");
    setADeudor(c.cuenta.saldoInicial < 0 ? "otra" : "yo");
    setADesde(c.cuenta.desde);
    setADatosYo(c.cuenta.datosYo);
    setADatosOtra(c.cuenta.datosOtra);
  }, [c.cuenta]);

  const saldo = c.filaMes.final;
  const salda = c.cuenta ? comoSalda(saldo, c.miNombre, c.cuenta) : null;
  const soportesDe = (id: string) => c.soportes.filter((s) => s.movimientoId === id);
  const nombreZip = (m: Movimiento, s: SoporteCruce, i: number) => `Soportes/${m.fecha}_${slug(m.concepto)}_${i + 1}.${extensionDe(s.nombre, s.tipo)}`;

  function abrirNuevo(preset?: { clase: "gasto" | "pago"; quien: "yo" | "otra"; valor?: number; concepto?: string }) {
    setEditando(null);
    setClase(preset?.clase ?? "gasto");
    setQuien(preset?.quien ?? "otra");
    setConcepto(preset?.concepto ?? "");
    setValor(preset?.valor ? Math.round(preset.valor).toLocaleString("es-CO") : "");
    setNota("");
    setArchivo(null);
    setFecha(esMesActual ? hoyISO() : `${mes}-01`);
    setAbierto(true);
  }
  function abrirEdicion(m: Movimiento) {
    setEditando(m.id);
    setClase(m.clase);
    setQuien(m.quien);
    setConcepto(m.concepto);
    setValor(Math.round(m.valor).toLocaleString("es-CO"));
    setNota(m.nota);
    setArchivo(null);
    setFecha(m.fecha);
    setAbierto(true);
  }
  function registrarPago() {
    if (!salda) return Alert.alert("Cuentas en cero", "No hay nada que pagar este mes.");
    // si yo debo, el pago lo hago yo; si ella me debe, el pago lo hace ella
    abrirNuevo({ clase: "pago", quien: saldo > 0 ? "yo" : "otra", valor: Math.abs(saldo), concepto: saldo > 0 ? `Pago a ${otra}` : `Pago de ${otra}` });
  }

  async function guardar() {
    const v = aNumero(valor);
    if (!concepto.trim()) return Alert.alert("Falta el concepto", "Escribe de qué fue.");
    if (!(v > 0)) return Alert.alert("Falta el valor", "Escribe un valor mayor que cero (sin signo).");
    setGuardando(true);
    try {
      const id = await c.guardarMov({ id: editando ?? undefined, fecha, concepto, valor: v, clase, quien, nota });
      if (archivo) await c.subirSoporte(id, archivo);
      if (fecha.slice(0, 7) !== mes) setMes(fecha.slice(0, 7));
      setAbierto(false);
      setEditando(null);
      setArchivo(null);
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message ?? "Error");
    } finally {
      setGuardando(false);
    }
  }

  function confirmarBorrar(m: Movimiento) {
    Alert.alert("Borrar", `¿Borrar «${m.concepto}» por ${pesos(m.valor)}? También se borran sus soportes.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: () => c.borrarMov(m.id).catch((e) => Alert.alert("Error", e.message)) },
    ]);
  }

  async function agregarSoporte(m: Movimiento) {
    const f = await elegirArchivo();
    if (!f) return;
    setSubiendo(m.id);
    try {
      await c.subirSoporte(m.id, f);
    } catch (e: any) {
      Alert.alert("No se pudo subir", e.message ?? "Error");
    } finally {
      setSubiendo(null);
    }
  }
  async function verSoporte(s: SoporteCruce) {
    const url = await c.urlSoporte(s);
    if (!url) return Alert.alert("No se pudo abrir", "Intenta de nuevo.");
    if (Platform.OS === "web" && typeof window !== "undefined") window.open(url, "_blank");
  }
  function confirmarQuitarSoporte(s: SoporteCruce) {
    Alert.alert("Quitar soporte", `¿Quitar «${s.nombre}»?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: () => c.borrarSoporte(s).catch((e) => Alert.alert("Error", e.message)) },
    ]);
  }

  async function guardarAjustes() {
    const v = aNumero(aSaldo) || 0;
    try {
      await c.guardarCuenta({ nombre: aNombre, saldoInicial: aDeudor === "yo" ? v : -v, desde: aDesde, datosYo: aDatosYo, datosOtra: aDatosOtra });
      Alert.alert("Guardado", "Los ajustes de la cuenta quedaron guardados.");
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message ?? "Error");
    }
  }
  async function crear() {
    if (!nuevaCuenta.trim()) return;
    try {
      await c.crearCuenta(nuevaCuenta);
      setNuevaCuenta("");
    } catch (e: any) {
      Alert.alert("No se pudo crear", e.message ?? "Error");
    }
  }

  // ---------- descargas ----------
  const frase = fraseSaldo(saldo, c.miNombre, otra);
  const quienPuso = (m: Movimiento) => (m.quien === "yo" ? c.miNombre : otra);

  function hojasExcel(): Hoja[] {
    const mov = c.movsMes;
    const filas: Hoja["filas"] = [
      [{ v: `Cuentas con ${otra} - ${nombreMes(mes)}`, estilo: "titulo" }],
      [`Valor positivo (+): ${c.miNombre === "Yo" ? "yo le debo" : c.miNombre + " le debe"} a ${otra}. Valor negativo (-): ${otra} ${c.miNombre === "Yo" ? "me debe" : "le debe a " + c.miNombre}.`],
      [],
      [{ v: "Fecha", estilo: "encabezado" }, { v: "Concepto", estilo: "encabezado" }, { v: "Qué fue", estilo: "encabezado" }, { v: "Quién puso la plata", estilo: "encabezado" }, { v: "Soporte", estilo: "encabezado" }, { v: "Valor", estilo: "encabezado" }],
      ["", { v: "Saldo anterior", estilo: "negrita" }, "", "", "", { v: c.filaMes.anterior, estilo: "dineroNegrita" }],
      ...mov.map((m) => {
        const lista = soportesDe(m.id);
        return [m.fecha, m.concepto, m.clase === "pago" ? "Pago" : "Gasto", quienPuso(m), lista.length ? lista.map((s, i) => nombreZip(m, s, i).replace("Soportes/", "")).join(" | ") : "", { v: m.monto, estilo: "dinero" as const }];
      }),
    ];
    const ultima = 5 + mov.length; // fila (1-based) del último movimiento
    filas.push([]);
    filas.push(["", { v: `SALDO FINAL DE ${nombreMes(mes).toUpperCase()}`, estilo: "negrita" }, "", "", "", { v: saldo, estilo: "dineroNegrita", f: `SUM(F5:F${ultima})` }]);
    filas.push(["", { v: frase, estilo: "negrita" }, "", "", "", { v: Math.abs(saldo), estilo: "dineroNegrita", f: `ABS(F${ultima + 2})` }]);
    if (salda) filas.push(["", `Para saldar: ${salda.paga} paga a ${salda.recibe}${salda.donde ? " - " + salda.donde : " (sin datos de pago: agrégalos en Ajustes de la cuenta)"}`]);
    else filas.push(["", "Si no se paga, el saldo pasa solo al mes siguiente."]);
    if (salda) filas.push(["", "Si no se paga este mes, el saldo pasa solo al mes siguiente."]);

    const h = c.historial.filter((f) => f.mes <= mes);
    const filasH: Hoja["filas"] = [
      [{ v: `Historial de saldos con ${otra}`, estilo: "titulo" }],
      [],
      [{ v: "Mes", estilo: "encabezado" }, { v: "Saldo anterior", estilo: "encabezado" }, { v: "Movimientos del mes", estilo: "encabezado" }, { v: "Saldo final", estilo: "encabezado" }, { v: "Quién debe", estilo: "encabezado" }],
      ...h.map((f, i) => {
        const r = 4 + i;
        const ant = i === 0 ? { v: f.anterior, estilo: "dinero" as const } : { v: f.anterior, estilo: "dinero" as const, f: `D${r - 1}` };
        return [nombreMes(f.mes), ant, { v: f.movimientos, estilo: "dinero" as const }, { v: f.final, estilo: "dineroNegrita" as const, f: `B${r}+C${r}` }, fraseSaldo(f.final, c.miNombre, otra)];
      }),
    ];
    return [
      { nombre: nombreMes(mes).slice(0, 31), anchos: [12, 40, 12, 24, 44, 18], filas },
      { nombre: "Historial", anchos: [20, 18, 22, 18, 42], filas: filasH },
    ];
  }

  function bloquesPdf(): Bloque[] {
    const b: Bloque[] = [
      { t: "titulo", texto: `Cuentas con ${otra} - ${nombreMes(mes)}`, sub: `Positivo: ${c.miNombre === "Yo" ? "yo le debo" : c.miNombre + " le debe"} a ${otra} · Negativo: ${otra} ${c.miNombre === "Yo" ? "me debe" : "le debe a " + c.miNombre}` },
      { t: "seccion", texto: "Saldo del mes" },
      { t: "fila", a: "Saldo anterior", c: pesos(c.filaMes.anterior) },
      { t: "fila", a: "Movimientos del mes", c: pesos(c.filaMes.movimientos) },
      { t: "fila", a: "SALDO FINAL", c: pesos(saldo), fuerte: true },
      { t: "parrafo", texto: frase, color: [0.04, 0.18, 0.36] },
    ];
    if (salda) {
      b.push({ t: "seccion", texto: "Cómo se salda" });
      b.push({ t: "parrafo", texto: `${salda.paga} paga ${pesos(Math.abs(saldo))} a ${salda.recibe}.` });
      b.push({ t: "parrafo", texto: salda.donde ? `Dónde: ${salda.donde}` : "Sin datos de pago registrados." });
      b.push({ t: "parrafo", texto: "Si no se paga este mes, el saldo pasa solo al mes siguiente." });
    }
    b.push({ t: "espacio" }, { t: "seccion", texto: "Movimientos" });
    c.movsMes.forEach((m) => {
      const n = soportesDe(m.id).length;
      b.push({ t: "fila", a: `${m.fecha} ${m.concepto}${n ? ` [${n} soporte${n > 1 ? "s" : ""}]` : ""}`, b: `${m.clase === "pago" ? "pago" : "gasto"} - puso ${quienPuso(m)}`, c: pesos(m.monto) });
    });
    if (!c.movsMes.length) b.push({ t: "parrafo", texto: "Sin movimientos este mes." });
    return b;
  }

  async function descargar(que: "excel" | "pdf" | "zip") {
    setArmando(true);
    try {
      const base = `Cuentas_${slug(otra)}_${mes}`;
      const excel = crearXlsx(hojasExcel());
      if (que === "excel") {
        if (!descargarBytes(`${base}.xlsx`, excel)) Alert.alert("Solo en el navegador", "La descarga funciona desde la versión web de la app.");
        return;
      }
      const pdf = crearPdf(bloquesPdf(), `Cuentas con ${otra} - ${nombreMes(mes)}`);
      if (que === "pdf") {
        if (!descargarBytes(`${base}.pdf`, pdf, "application/pdf")) Alert.alert("Solo en el navegador", "La descarga funciona desde la versión web de la app.");
        return;
      }
      const archivos: { nombre: string; datos: Uint8Array }[] = [
        { nombre: `${base}.xlsx`, datos: excel },
        { nombre: `${base}.pdf`, datos: pdf },
      ];
      const faltan: string[] = [];
      for (const m of c.movsMes) {
        const lista = soportesDe(m.id);
        for (let i = 0; i < lista.length; i++) {
          const datos = await c.bytesSoporte(lista[i]);
          if (datos) archivos.push({ nombre: nombreZip(m, lista[i], i), datos });
          else faltan.push(`${m.concepto} (${lista[i].nombre})`);
        }
      }
      if (!descargarZip(`${base}.zip`, archivos)) return Alert.alert("Solo en el navegador", "La descarga funciona desde la versión web de la app.");
      const n = archivos.length - 2;
      Alert.alert("Descargado", `Incluye el Excel, el PDF y ${n} soporte${n === 1 ? "" : "s"}.${faltan.length ? `\n\nNo se pudieron leer: ${faltan.join(", ")}` : ""}`);
    } catch (e: any) {
      Alert.alert("No se pudo armar la descarga", e.message ?? "Error");
    } finally {
      setArmando(false);
    }
  }

  if (c.faltaSql) {
    return (
      <Card>
        <Text style={typography.h3}>Falta un paso en Supabase</Text>
        <Text style={typography.body}>Corre el archivo supabase_cruce_cuentas.sql en Supabase (SQL Editor) y vuelve a abrir esta pantalla. Antes debes haber corrido supabase_finanzas_personales.sql.</Text>
      </Card>
    );
  }
  if (c.cargando && !c.cuenta) return <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />;
  if (c.error) return <Text style={{ color: colors.danger }}>Error: {c.error}</Text>;

  const colorSaldo = Math.abs(saldo) < 1 ? colors.white : saldo > 0 ? "#FFD79A" : "#A8F0CF";

  return (
    <View style={{ gap: spacing.md }}>
      {c.cuentas.length > 1 && (
        <View style={styles.chipsRow}>
          {c.cuentas.map((x) => (
            <TouchableOpacity key={x.id} style={[styles.chip, c.cuenta?.id === x.id && styles.chipActivo]} onPress={() => c.seleccionarCuenta(x.id)}>
              <Text style={[styles.chipText, c.cuenta?.id === x.id && styles.chipTextActivo]}>{x.nombre}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.selector}>
        <TouchableOpacity onPress={() => setMes(moverMes(mes, -1))} style={styles.flecha} accessibilityLabel="Mes anterior">
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[typography.h2, { textTransform: "capitalize" }]}>{nombreMes(mes)}</Text>
        <TouchableOpacity onPress={() => setMes(moverMes(mes, 1))} style={[styles.flecha, esMesActual && { opacity: 0.3 }]} disabled={esMesActual} accessibilityLabel="Mes siguiente">
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <Card style={{ backgroundColor: colors.hero }}>
        <Text style={styles.heroEtiqueta}>Saldo con {enMin(otra)} al cierre de {MESES[Number(mes.slice(5, 7)) - 1]}</Text>
        <Text style={[styles.heroValor, { color: colorSaldo }]}>{pesos(Math.abs(saldo))}</Text>
        <Text style={styles.heroFrase}>{frase}</Text>
        <Text style={styles.heroDetalle}>
          Saldo anterior {pesos(c.filaMes.anterior)} · movimientos del mes {pesos(c.filaMes.movimientos)}
        </Text>
        {salda && (
          <View style={styles.salda}>
            <Text style={styles.saldaTitulo}>Para saldar</Text>
            <Text style={styles.saldaTexto}>
              {salda.paga} paga {pesos(Math.abs(saldo))} a {salda.recibe}
            </Text>
            <Text style={styles.saldaTexto}>{salda.donde ? `Dónde: ${salda.donde}` : "Agrega los datos de pago en «Ajustes de la cuenta»"}</Text>
          </View>
        )}
        {!salda && <Text style={styles.heroDetalle}>Si dejan saldo, pasa solo al mes siguiente.</Text>}
      </Card>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <TouchableOpacity style={[styles.botonAccion, { borderColor: colors.primary }]} onPress={() => abrirNuevo()}>
          <Ionicons name="add-circle" size={18} color={colors.primary} />
          <Text style={[styles.botonAccionTexto, { color: colors.textPrimary }]}>Agregar movimiento</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.botonAccion, { borderColor: colors.success }]} onPress={registrarPago}>
          <Ionicons name="swap-horizontal" size={18} color={colors.success} />
          <Text style={[styles.botonAccionTexto, { color: colors.textPrimary }]}>Registrar el pago</Text>
        </TouchableOpacity>
      </View>

      {abierto && (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={typography.h3}>{editando ? "Editar" : "Nuevo"} movimiento</Text>
            <TouchableOpacity onPress={() => setAbierto(false)} accessibilityLabel="Cerrar sin guardar" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={28} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.label}>¿Qué fue?</Text>
          <View style={styles.chipsRow}>
            {(["gasto", "pago"] as const).map((k) => (
              <TouchableOpacity key={k} style={[styles.chip, clase === k && styles.chipActivo]} onPress={() => setClase(k)}>
                <Text style={[styles.chipText, clase === k && styles.chipTextActivo]}>{k === "gasto" ? "Un gasto" : "Un pago entre nosotras"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>{clase === "gasto" ? "¿Quién pagó el gasto?" : "¿Quién hizo el pago?"}</Text>
          <View style={styles.chipsRow}>
            {(["otra", "yo"] as const).map((k) => (
              <TouchableOpacity key={k} style={[styles.chip, quien === k && styles.chipActivo]} onPress={() => setQuien(k)}>
                <Text style={[styles.chipText, quien === k && styles.chipTextActivo]}>{k === "yo" ? (c.miNombre === "Yo" ? "Yo" : c.miNombre) : otra}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
            {quien === "otra"
              ? clase === "gasto"
                ? `${otra} puso la plata: ${c.miNombre === "Yo" ? "yo le debo" : c.miNombre + " le debe"} ese valor.`
                : `${otra} le pagó a ${c.miNombre === "Yo" ? "mí" : c.miNombre}: baja lo que ${otra} debe o sube lo que se le debe a ella.`
              : clase === "gasto"
              ? `${c.miNombre === "Yo" ? "Yo" : c.miNombre} puso la plata: ${otra} le debe ese valor.`
              : `${c.miNombre === "Yo" ? "Yo" : c.miNombre} le pagó a ${otra}: baja lo que se le debe.`}
          </Text>
          <TextInput style={styles.input} placeholder="Concepto (ej. Almuerzos, Cuota crédito, Uber Juanes)" placeholderTextColor={colors.textMuted} value={concepto} onChangeText={setConcepto} />
          <TextInput style={styles.input} placeholder="Valor (sin signo, ej. 150000)" placeholderTextColor={colors.textMuted} value={valor} onChangeText={setValor} keyboardType="numeric" />
          <Text style={styles.label}>Fecha</Text>
          <FechaInput value={fecha} onChange={setFecha} />
          <TextInput style={[styles.input, { marginTop: spacing.sm }]} placeholder="Nota (opcional)" placeholderTextColor={colors.textMuted} value={nota} onChangeText={setNota} />
          <TouchableOpacity style={[styles.botonBorde, { marginBottom: spacing.sm }]} onPress={async () => setArchivo((await elegirArchivo()) ?? archivo)}>
            <Ionicons name="attach" size={18} color={colors.primary} />
            <Text style={styles.botonBordeTexto} numberOfLines={1}>{archivo ? `Soporte: ${archivo.name}` : "Adjuntar PDF o foto como soporte"}</Text>
          </TouchableOpacity>
          <PrimaryButton title={editando ? "Guardar cambios" : "Guardar"} onPress={guardar} loading={guardando} />
          <TouchableOpacity onPress={() => setAbierto(false)} style={styles.salir}>
            <Text style={{ textAlign: "center", color: colors.textPrimary, fontWeight: "600" }}>Salir sin guardar</Text>
          </TouchableOpacity>
        </Card>
      )}

      <Card>
        <Text style={typography.h3}>Movimientos de {MESES[Number(mes.slice(5, 7)) - 1]}</Text>
        {c.movsMes.length === 0 && <Text style={[typography.caption, { marginTop: 6 }]}>Todavía no hay movimientos este mes. Usa «Agregar movimiento» para registrar el primero.</Text>}
        {c.movsMes.map((m) => (
          <View key={m.id} style={styles.mov}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => abrirEdicion(m)} activeOpacity={0.6} accessibilityLabel={`Editar ${m.concepto}`}>
                <Text style={styles.movTitulo}>{m.concepto}</Text>
                <Text style={typography.caption}>
                  {m.fecha} · {m.clase === "pago" ? "Pago" : "Gasto"} · puso {quienPuso(m)}
                  {m.nota ? ` · ${m.nota}` : ""}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.movValor, { color: m.monto > 0 ? colors.textPrimary : colors.success }]}>
                {m.monto > 0 ? "+" : "−"}
                {pesos(m.valor)}
              </Text>
              <TouchableOpacity onPress={() => confirmarBorrar(m)} accessibilityLabel={`Borrar ${m.concepto}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
            <View style={styles.soportes}>
              {soportesDe(m.id).map((s) => (
                <View key={s.id} style={styles.soporteChip}>
                  <TouchableOpacity onPress={() => verSoporte(s)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessibilityLabel={`Ver ${s.nombre}`}>
                    <Ionicons name={s.tipo === "application/pdf" ? "document-text-outline" : "image-outline"} size={14} color={colors.primary} />
                    <Text style={styles.soporteTexto} numberOfLines={1}>{s.nombre}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmarQuitarSoporte(s)} accessibilityLabel="Quitar soporte" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.soporteAgregar} onPress={() => agregarSoporte(m)} disabled={subiendo === m.id} accessibilityLabel="Subir soporte">
                {subiendo === m.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="attach" size={16} color={colors.primary} />}
                <Text style={styles.soporteAgregarTexto}>{subiendo === m.id ? "Subiendo..." : "Subir PDF / foto"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={typography.h3}>Saldo mes a mes</Text>
        <Text style={[typography.caption, { marginBottom: 4 }]}>Lo que queda cada mes pasa solo al siguiente. Toca un mes para verlo.</Text>
        {[...c.historial].reverse().map((f) => (
          <TouchableOpacity key={f.mes} style={[styles.hist, f.mes === mes && { backgroundColor: colors.background }]} onPress={() => setMes(f.mes)}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.movTitulo, { textTransform: "capitalize" }]}>{nombreMes(f.mes)}</Text>
              <Text style={typography.caption}>{fraseSaldo(f.final, c.miNombre, otra)}</Text>
            </View>
            <Text style={[styles.movValor, { color: Math.abs(f.final) < 1 ? colors.textMuted : f.final > 0 ? colors.textPrimary : colors.success }]}>{pesos(Math.abs(f.final))}</Text>
          </TouchableOpacity>
        ))}
      </Card>

      <PrimaryButton title="Descargar el mes completo (Excel + PDF + soportes)" onPress={() => descargar("zip")} loading={armando} />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <TouchableOpacity style={[styles.botonBorde, { flex: 1 }]} onPress={() => descargar("excel")} disabled={armando}>
          <Ionicons name="download-outline" size={16} color={colors.primary} />
          <Text style={styles.botonBordeTexto}>Solo Excel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.botonBorde, { flex: 1 }]} onPress={() => descargar("pdf")} disabled={armando}>
          <Ionicons name="document-text-outline" size={16} color={colors.primary} />
          <Text style={styles.botonBordeTexto}>Solo PDF</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.botonBorde} onPress={() => setAjustes(!ajustes)}>
        <Ionicons name={ajustes ? "chevron-up" : "settings-outline"} size={16} color={colors.primary} />
        <Text style={styles.botonBordeTexto}>{ajustes ? "Cerrar ajustes" : "Ajustes de la cuenta (saldo inicial y dónde se paga)"}</Text>
      </TouchableOpacity>

      {ajustes && (
        <Card>
          <Text style={styles.label}>Nombre de la otra persona</Text>
          <TextInput style={styles.input} value={aNombre} onChangeText={setANombre} placeholder="Mi mamá" placeholderTextColor={colors.textMuted} />
          <Text style={styles.label}>Saldo con el que empezamos</Text>
          <View style={styles.chipsRow}>
            {(["otra", "yo"] as const).map((k) => (
              <TouchableOpacity key={k} style={[styles.chip, aDeudor === k && styles.chipActivo]} onPress={() => setADeudor(k)}>
                <Text style={[styles.chipText, aDeudor === k && styles.chipTextActivo]}>{k === "otra" ? `${aNombre || "Ella"} me debe` : `Yo le debo a ${enMin(aNombre || "ella")}`}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={styles.input} value={aSaldo} onChangeText={setASaldo} keyboardType="numeric" placeholder="Valor (ej. 597640)" placeholderTextColor={colors.textMuted} />
          <Text style={styles.label}>Empieza a contar desde el mes</Text>
          <View style={styles.selector}>
            <TouchableOpacity onPress={() => setADesde(moverMes(aDesde, -1))} style={styles.flecha}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </TouchableOpacity>
            <Text style={[typography.body, { textTransform: "capitalize" }]}>{nombreMes(aDesde)}</Text>
            <TouchableOpacity onPress={() => setADesde(moverMes(aDesde, 1))} style={styles.flecha}>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <Text style={[typography.caption, { marginVertical: 6 }]}>Ej.: si tu Excel cerró septiembre con «debe a Jenny 597.640», pon «{aNombre || "Ella"} me debe», 597640 y empieza desde octubre.</Text>
          <Text style={styles.label}>Dónde me pagan a mí (banco, cuenta, Nequi…)</Text>
          <TextInput style={styles.input} value={aDatosYo} onChangeText={setADatosYo} placeholder="Ej. Bancolombia ahorros ..." placeholderTextColor={colors.textMuted} />
          <Text style={styles.label}>Dónde le pago yo a {enMin(aNombre || "ella")}</Text>
          <TextInput style={styles.input} value={aDatosOtra} onChangeText={setADatosOtra} placeholder="Ej. Davivienda ahorros ..." placeholderTextColor={colors.textMuted} />
          <PrimaryButton title="Guardar ajustes" onPress={guardarAjustes} />
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.label}>Llevar otra cuenta (otra persona)</Text>
            <TextInput style={styles.input} value={nuevaCuenta} onChangeText={setNuevaCuenta} placeholder="Ej. Mi hermana" placeholderTextColor={colors.textMuted} />
            <TouchableOpacity style={styles.botonBorde} onPress={crear}>
              <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
              <Text style={styles.botonBordeTexto}>Crear cuenta</Text>
            </TouchableOpacity>
          </View>
        </Card>
      )}
    </View>
  );
}

const enMin = (t: string) => (/^mi\s/i.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

const styles = StyleSheet.create({
  selector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  flecha: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  heroEtiqueta: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  heroValor: { fontSize: 30, fontWeight: "800", marginTop: 2 },
  heroFrase: { color: colors.white, fontSize: 15, fontWeight: "700", marginTop: 2 },
  heroDetalle: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 4 },
  salda: { marginTop: 10, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 10, padding: 10 },
  saldaTitulo: { color: colors.white, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  saldaTexto: { color: colors.white, fontSize: 13, marginTop: 2 },
  botonAccion: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: radius.md, paddingVertical: 12, backgroundColor: colors.surface },
  botonAccionTexto: { fontWeight: "700", fontSize: 13 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipActivo: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontSize: 13 },
  chipTextActivo: { color: colors.white, fontWeight: "700" },
  label: { fontSize: 12, color: colors.textSecondary, fontWeight: "600", marginTop: 4 },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  mov: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  movTitulo: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  movValor: { fontSize: 14, fontWeight: "800" },
  hist: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: colors.border, borderRadius: 8 },
  soportes: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 },
  soporteChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 220 },
  soporteTexto: { fontSize: 12, color: colors.primary, flexShrink: 1 },
  soporteAgregar: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.primary, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4 },
  soporteAgregarTexto: { fontSize: 12, color: colors.primary, fontWeight: "700" },
  salir: { marginTop: spacing.sm, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 },
  botonBorde: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 12 },
  botonBordeTexto: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
