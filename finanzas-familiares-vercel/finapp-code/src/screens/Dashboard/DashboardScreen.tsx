import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, Modal, Platform, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useCierreMensual } from "../../hooks/useCierreMensual";
import { useAhorros } from "../../hooks/useAhorros";
import { useAuth } from "../../hooks/useAuth";
import { useVehiculos } from "../../hooks/useVehiculos";
import { useDashboard, mesHoy, moverMes, PagoProximo } from "../../hooks/useDashboard";
import { generarBackupJSON } from "../../utils/backup";
import Card from "../../components/Card";
import ProgressBar from "../../components/ProgressBar";
import PrimaryButton from "../../components/PrimaryButton";
import TrendChart, { abreviar } from "../../components/TrendChart";
import { colors, spacing, typography, radius } from "../../theme/theme";
import { aNumero } from "../../utils/numeros";
import { formatoFecha, hoyISO, pesos } from "../../utils/amortizacion";

const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (mes: string) => `${MESES_LARGOS[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const nombreMesSolo = (mes: string) => MESES_LARGOS[Number(mes.slice(5, 7)) - 1];

function diasHasta(fecha: string) {
  const [a, m, d] = fecha.split("-").map(Number);
  const [ha, hm, hd] = hoyISO().split("-").map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(ha, hm - 1, hd)) / 86400000);
}

/** Variación vs. mes anterior en texto: "12% más que septiembre". */
function variacion(actual: number, anterior: number, mesAnterior: string) {
  if (anterior <= 0) return null;
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  if (pct === 0) return { pct, texto: `igual que ${nombreMesSolo(mesAnterior)}` };
  return { pct, texto: `${Math.abs(pct)}% ${pct > 0 ? "más" : "menos"} que ${nombreMesSolo(mesAnterior)}` };
}

export default function DashboardScreen() {
  const [mes, setMes] = useState(mesHoy());
  const { datos, cargando: cargandoDatos, error: errorDatos, recargar } = useDashboard(mes);
  const { resumen, definirAporte, enviarExcedenteAAhorro, recargar: recargarCierre } = useCierreMensual(mes);
  const { metas: metasAhorro } = useAhorros();
  const { usuario } = useAuth();
  const { vehiculos } = useVehiculos();

  const [exportando, setExportando] = useState(false);
  const [editandoAporte, setEditandoAporte] = useState<string | null>(null);
  const [nuevoAporte, setNuevoAporte] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mostrarEnviarExcedente, setMostrarEnviarExcedente] = useState(false);
  const [metaElegida, setMetaElegida] = useState<string | null>(null);
  const [montoExcedente, setMontoExcedente] = useState("");
  const [verAportes, setVerAportes] = useState(false);

  const esMesActual = mes === mesHoy();
  const nombre = (usuario?.user_metadata?.nombre ?? usuario?.email ?? "").split(" ")[0].split("@")[0];

  async function manejarExportarBackup() {
    setExportando(true);
    try {
      const json = await generarBackupJSON();
      const nombreArchivo = `backup_finanzas_${hoyISO()}.json`;
      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.download = nombreArchivo;
        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);
        URL.revokeObjectURL(url);
      } else {
        const ruta = FileSystem.documentDirectory + nombreArchivo;
        await FileSystem.writeAsStringAsync(ruta, json, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(ruta, { mimeType: "application/json", dialogTitle: "Backup completo" });
        else Alert.alert("Backup guardado", `Se guardó en: ${ruta}`);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo generar el backup.");
    } finally {
      setExportando(false);
    }
  }

  async function manejarGuardarAporte(nombrePersona: string) {
    if (!nuevoAporte.trim()) return;
    setGuardando(true);
    try {
      const esUsuarioActual = usuario?.user_metadata?.nombre === nombrePersona || usuario?.email === nombrePersona;
      await definirAporte(nombrePersona, aNumero(nuevoAporte), esUsuarioActual ? usuario?.id : undefined);
      setEditandoAporte(null);
      setNuevoAporte("");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar el aporte.");
    } finally {
      setGuardando(false);
    }
  }

  async function manejarEnviarExcedente() {
    if (!metaElegida || !montoExcedente.trim()) {
      Alert.alert("Faltan datos", "Elige una meta y el monto a enviar.");
      return;
    }
    setGuardando(true);
    try {
      await enviarExcedenteAAhorro(metaElegida, aNumero(montoExcedente));
      setMostrarEnviarExcedente(false);
      setMontoExcedente("");
      setMetaElegida(null);
      await recargar();
      Alert.alert("Listo", "El excedente quedó registrado en tu meta de ahorro.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo enviar el excedente.");
    } finally {
      setGuardando(false);
    }
  }

  // Vehículos en mora se suman a "Próximos pagos"
  const proximos: PagoProximo[] = [
    ...(datos?.proximos ?? []),
    ...vehiculos
      .filter((v) => v.diasEnMora > 0)
      .map((v) => ({ tipo: "vehiculo" as const, titulo: v.nombre, detalle: `${v.diasEnMora} día(s) sin pago este mes`, valor: null, fecha: null, vencido: true })),
  ].sort((a, b) => Number(b.vencido) - Number(a.vencido) || (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999"));

  // ---------- Encabezado con selector de mes ----------
  const encabezado = (
    <View style={styles.encabezado}>
      <View style={{ flex: 1 }}>
        <Text style={typography.caption}>{nombre ? `Hola, ${nombre}` : "Resumen del hogar"}</Text>
        <Text style={[typography.h1, { textTransform: "capitalize" }]}>{nombreMes(mes)}</Text>
      </View>
      <View style={styles.selectorMes}>
        <TouchableOpacity onPress={() => setMes(moverMes(mes, -1))} style={styles.flecha} accessibilityLabel="Mes anterior">
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMes(moverMes(mes, 1))} style={[styles.flecha, esMesActual && { opacity: 0.3 }]} disabled={esMesActual} accessibilityLabel="Mes siguiente">
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (cargandoDatos && !datos) {
    return (
      <View style={styles.container}>
        <View style={{ padding: spacing.lg }}>{encabezado}</View>
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      </View>
    );
  }
  if (errorDatos || !datos) return <Text style={styles.errorText}>Error cargando el resumen: {errorDatos}</Text>;

  const { actual, anterior } = datos;
  const salidas = actual.gastos + actual.cuotas;
  const salidasAnt = anterior.gastos + anterior.cuotas;
  const varEntradas = variacion(actual.ingresos, anterior.ingresos, anterior.mes);
  const varSalidas = variacion(salidas, salidasAnt, anterior.mes);
  const quedo = actual.balance;
  const totalRubros = datos.rubros.reduce((s, r) => s + r.valor, 0);
  const maxRubro = Math.max(1, ...datos.rubros.map((r) => r.valor));
  const neto = datos.totalAhorrado - datos.totalDeuda;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md, width: "100%", maxWidth: 760, alignSelf: "center" }}
      refreshControl={<RefreshControl refreshing={cargandoDatos} onRefresh={() => { recargar(); recargarCierre(); }} />}
    >
      {encabezado}

      {/* ---------- 1. Balance del mes ---------- */}
      <Card style={{ backgroundColor: colors.primary }}>
        <Text style={styles.heroEtiqueta}>{esMesActual ? "Te queda este mes" : `Quedó en ${nombreMesSolo(mes)}`}</Text>
        <Text style={styles.heroValor}>
          {quedo < 0 ? "−" : ""}
          {pesos(Math.abs(quedo))}
        </Text>
        <View style={styles.heroEstado}>
          <Ionicons name={quedo >= 0 ? "checkmark-circle" : "warning"} size={14} color={colors.white} />
          <Text style={styles.heroEstadoTexto}>
            {actual.ingresos === 0 && salidas === 0
              ? "Sin movimientos registrados"
              : quedo >= 0
              ? `Las entradas cubren las salidas${actual.ingresos > 0 ? ` (usaste el ${Math.round((salidas / actual.ingresos) * 100)}%)` : ""}`
              : "Las salidas superan las entradas"}
          </Text>
        </View>

        <View style={styles.heroFila}>
          <View style={styles.heroBloque}>
            <View style={styles.rowStart}>
              <Ionicons name="arrow-down-circle" size={15} color="#9EC5F4" />
              <Text style={styles.heroBloqueTitulo}>Entradas</Text>
            </View>
            <Text style={styles.heroBloqueValor}>{pesos(actual.ingresos)}</Text>
            {varEntradas && <Text style={styles.heroVar}>{varEntradas.pct > 0 ? "▲" : varEntradas.pct < 0 ? "▼" : "="} {varEntradas.texto}</Text>}
          </View>
          <View style={styles.heroSeparador} />
          <View style={styles.heroBloque}>
            <View style={styles.rowStart}>
              <Ionicons name="arrow-up-circle" size={15} color="#F5B08F" />
              <Text style={styles.heroBloqueTitulo}>Salidas</Text>
            </View>
            <Text style={styles.heroBloqueValor}>{pesos(salidas)}</Text>
            {varSalidas && <Text style={styles.heroVar}>{varSalidas.pct > 0 ? "▲" : varSalidas.pct < 0 ? "▼" : "="} {varSalidas.texto}</Text>}
          </View>
        </View>

        <View style={styles.heroDesglose}>
          <Desglose texto="Nómina (neto)" valor={actual.nomina} />
          {actual.arriendos > 0 && <Desglose texto="Arriendos" valor={actual.arriendos} />}
          {actual.vehiculo > 0 && <Desglose texto="Vehículo" valor={actual.vehiculo} />}
          <Desglose texto="Gastos registrados" valor={-actual.gastos} />
          {actual.cuotas > 0 && <Desglose texto="Pagos de créditos" valor={-actual.cuotas} />}
        </View>
      </Card>

      {/* ---------- 2. Próximos pagos ---------- */}
      <Card>
        <View style={styles.tituloFila}>
          <Text style={typography.h3}>Próximos pagos y cobros</Text>
          <Text style={typography.caption}>30 días</Text>
        </View>
        {proximos.length === 0 ? (
          <View style={[styles.rowStart, { marginTop: spacing.sm }]}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={typography.body}>Nada pendiente en los próximos 30 días.</Text>
          </View>
        ) : (
          proximos.slice(0, 8).map((p, i) => <FilaPago key={i} p={p} />)
        )}
        {proximos.length > 8 && <Text style={[typography.caption, { marginTop: spacing.sm }]}>y {proximos.length - 8} más…</Text>}
      </Card>

      {/* ---------- 3. Tendencia ---------- */}
      <Card>
        <Text style={[typography.h3, { marginBottom: spacing.sm }]}>Últimos 6 meses</Text>
        <TrendChart key={mes} datos={datos.meses.map((m) => ({ mes: m.mes, entradas: m.ingresos, salidas: m.gastos + m.cuotas }))} />
      </Card>

      {/* ---------- 4. Gastos por rubro ---------- */}
      <Card>
        <View style={styles.tituloFila}>
          <Text style={typography.h3}>¿En qué se fue la plata?</Text>
          <Text style={typography.caption}>{pesos(totalRubros)}</Text>
        </View>
        {datos.rubros.length === 0 ? (
          <Text style={styles.vacio}>Sin gastos registrados en {nombreMesSolo(mes)}.</Text>
        ) : (
          datos.rubros.map((r) => {
            const ant = datos.rubrosAnterior[r.etiqueta] ?? 0;
            const v = variacion(r.valor, ant, anterior.mes);
            return (
              <View key={r.etiqueta} style={{ marginTop: spacing.sm }}>
                <View style={styles.tituloFila}>
                  <Text style={styles.rubroNombre} numberOfLines={1}>
                    {r.etiqueta} <Text style={styles.rubroPct}>{Math.round((r.valor / totalRubros) * 100)}%</Text>
                  </Text>
                  <Text style={styles.rubroValor}>{pesos(r.valor)}</Text>
                </View>
                <View style={styles.barraFondo}>
                  <View style={[styles.barraRelleno, { width: `${Math.max(2, (r.valor / maxRubro) * 100)}%` }]} />
                </View>
                {v && v.pct !== 0 && (
                  <Text style={styles.rubroVar}>
                    {v.pct > 0 ? "▲" : "▼"} {v.texto}
                  </Text>
                )}
              </View>
            );
          })
        )}
      </Card>

      {/* ---------- 5. Patrimonio y deudas ---------- */}
      <Card>
        <Text style={typography.h3}>Patrimonio</Text>
        <View style={styles.tiles}>
          <Tile icono="wallet" titulo="Ahorrado" valor={datos.totalAhorrado} />
          <Tile icono="card" titulo="Debes" valor={datos.totalDeuda} />
          <Tile icono="analytics" titulo="Neto" valor={neto} />
        </View>
        <Text style={styles.ayuda}>Neto = ahorros − saldo de créditos. No incluye el valor de propiedades ni vehículos.</Text>

        {datos.metas.length > 0 && (
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.subtitulo}>Metas de ahorro</Text>
            {datos.metas.map((m) => (
              <Progreso key={m.nombre} nombre={m.nombre} izquierda={`${pesos(m.ahorrado)} de ${pesos(m.objetivo)}`} avance={m.objetivo > 0 ? m.ahorrado / m.objetivo : 0} />
            ))}
          </View>
        )}
        {datos.deudas.length > 0 && (
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.subtitulo}>Créditos (lo pagado)</Text>
            {datos.deudas.map((d) => (
              <Progreso key={d.nombre} nombre={d.nombre} izquierda={`Saldo ${pesos(d.saldo)}`} avance={d.inicial > 0 ? 1 - d.saldo / d.inicial : 0} />
            ))}
          </View>
        )}
      </Card>

      {/* ---------- 6. Aportes del hogar (cierre del mes) ---------- */}
      {resumen && (
        <Card>
          <TouchableOpacity onPress={() => setVerAportes(!verAportes)} style={styles.tituloFila}>
            <View>
              <Text style={typography.h3}>Aportes del hogar</Text>
              <Text style={typography.caption}>
                Comprometido {abreviar(resumen.totalAportes)} · pagado {abreviar(resumen.totalPagado)} ·{" "}
                {resumen.excedente >= 0 ? "excedente" : "faltante"} {abreviar(Math.abs(resumen.excedente))}
              </Text>
            </View>
            <Ionicons name={verAportes ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {verAportes && (
            <View style={{ marginTop: spacing.sm }}>
              {resumen.personas.length === 0 && (
                <Text style={typography.body}>Todavía no hay aportes definidos ni gastos compartidos en {nombreMesSolo(mes)}.</Text>
              )}
              {resumen.personas.map((p) => (
                <View key={p.usuarioNombre} style={styles.personaFila}>
                  <View style={styles.rowBetween}>
                    <View style={styles.rowStart}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{p.usuarioNombre.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View>
                        <Text style={typography.h3}>{p.usuarioNombre}</Text>
                        <Text style={typography.caption}>
                          Aporte {pesos(p.aporte)} · pagó {pesos(p.pagado)}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.pill, p.saldo > 0 ? styles.pillWarning : styles.pillSuccess]}>
                      <Text style={[styles.pillText, p.saldo > 0 ? styles.pillTextWarning : styles.pillTextSuccess]}>
                        {p.saldo > 0 ? `Le falta ${abreviar(p.saldo)}` : p.saldo < 0 ? `+${abreviar(Math.abs(p.saldo))}` : "Al día"}
                      </Text>
                    </View>
                  </View>
                  {editandoAporte === p.usuarioNombre ? (
                    <View style={styles.editRow}>
                      <TextInput style={styles.editInput} placeholder="Nuevo aporte" value={nuevoAporte} onChangeText={setNuevoAporte} keyboardType="numeric" autoFocus />
                      <TouchableOpacity style={styles.editSaveBtn} onPress={() => manejarGuardarAporte(p.usuarioNombre)} disabled={guardando}>
                        <Ionicons name="checkmark" size={18} color={colors.white} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => setEditandoAporte(p.usuarioNombre)} style={styles.editLinkRow}>
                      <Ionicons name="pencil" size={13} color={colors.primary} />
                      <Text style={styles.editLink}>Ajustar aporte de {nombreMesSolo(mes)}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {resumen.excedente > 0 && (
                <PrimaryButton title="Enviar excedente a ahorro" onPress={() => setMostrarEnviarExcedente(true)} style={{ marginTop: spacing.md }} />
              )}
            </View>
          )}
        </Card>
      )}

      <TouchableOpacity onPress={manejarExportarBackup} style={styles.backupBoton} disabled={exportando}>
        {exportando ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Ionicons name="cloud-download-outline" size={16} color={colors.primary} />
            <Text style={styles.backupTexto}>Exportar todos mis datos (backup)</Text>
          </>
        )}
      </TouchableOpacity>

      <Modal visible={mostrarEnviarExcedente} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={typography.h2}>Enviar excedente</Text>
            <Text style={[typography.body, { marginBottom: spacing.md }]}>Disponible: {pesos(resumen?.excedente ?? 0)}</Text>
            <Text style={styles.label}>Elige la meta</Text>
            <View style={styles.chipsRow}>
              {metasAhorro.map((m) => (
                <TouchableOpacity key={m.id} style={[styles.chip, metaElegida === m.id && styles.chipActivo]} onPress={() => setMetaElegida(m.id)}>
                  <Text style={[styles.chipText, metaElegida === m.id && styles.chipTextActivo]}>{m.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {metasAhorro.length === 0 && <Text style={typography.caption}>Primero crea una meta en la pestaña Ahorros.</Text>}
            <TextInput style={styles.input} placeholder="Monto a enviar" value={montoExcedente} onChangeText={setMontoExcedente} keyboardType="numeric" />
            <PrimaryButton title="Confirmar envío" onPress={manejarEnviarExcedente} loading={guardando} />
            <TouchableOpacity onPress={() => setMostrarEnviarExcedente(false)} style={{ marginTop: spacing.md }}>
              <Text style={{ textAlign: "center", color: colors.textSecondary }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ---------- Piezas pequeñas ----------

function Desglose({ texto, valor }: { texto: string; valor: number }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={styles.desgloseTexto}>{texto}</Text>
      <Text style={styles.desgloseValor}>
        {valor < 0 ? "−" : ""}
        {pesos(Math.abs(valor))}
      </Text>
    </View>
  );
}

function FilaPago({ p }: { p: PagoProximo }) {
  const dias = p.fecha ? diasHasta(p.fecha) : null;
  const icono = p.tipo === "cuota" ? "card" : p.tipo === "arriendo" ? "business" : "car";
  let cuando = "Este mes";
  if (p.vencido) cuando = dias !== null ? `Vencida hace ${Math.abs(dias)} d` : "En mora";
  else if (dias === 0) cuando = "Hoy";
  else if (dias === 1) cuando = "Mañana";
  else if (dias !== null) cuando = `En ${dias} días`;
  const urgente = p.vencido || (dias !== null && dias <= 3);
  return (
    <View style={styles.pagoFila}>
      <View style={[styles.pagoIcono, p.tipo === "arriendo" && { backgroundColor: "#E3F3EC" }]}>
        <Ionicons name={icono as any} size={16} color={p.tipo === "arriendo" ? colors.success : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pagoTitulo} numberOfLines={1}>
          {p.titulo}
        </Text>
        <Text style={styles.pagoDetalle} numberOfLines={1}>
          {p.detalle}
          {p.fecha ? ` · ${formatoFecha(p.fecha)}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {p.valor !== null && <Text style={styles.pagoValor}>{pesos(p.valor)}</Text>}
        <View style={[styles.pill, urgente ? (p.vencido ? styles.pillDanger : styles.pillWarning) : styles.pillNeutro]}>
          {urgente && <Ionicons name={p.vencido ? "alert-circle" : "time"} size={10} color={p.vencido ? colors.danger : colors.warning} />}
          <Text style={[styles.pillText, urgente ? { color: p.vencido ? colors.danger : colors.warning } : { color: colors.textSecondary }]}>{cuando}</Text>
        </View>
      </View>
    </View>
  );
}

function Tile({ icono, titulo, valor }: { icono: any; titulo: string; valor: number }) {
  return (
    <View style={styles.tile}>
      <Ionicons name={icono} size={16} color={colors.primary} />
      <Text style={styles.tileTitulo}>{titulo}</Text>
      <Text style={styles.tileValor} numberOfLines={1} adjustsFontSizeToFit>
        {valor < 0 ? "−" : ""}
        {abreviar(Math.abs(valor))}
      </Text>
    </View>
  );
}

function Progreso({ nombre, izquierda, avance }: { nombre: string; izquierda: string; avance: number }) {
  const a = Math.max(0, Math.min(1, avance));
  return (
    <View style={{ marginTop: spacing.sm }}>
      <View style={styles.rowBetween}>
        <Text style={styles.progresoNombre} numberOfLines={1}>
          {nombre}
        </Text>
        <Text style={styles.progresoPct}>{Math.round(a * 100)}%</Text>
      </View>
      <View style={{ marginVertical: 4 }}>
        <ProgressBar progreso={a} />
      </View>
      <Text style={typography.caption}>{izquierda}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  encabezado: { flexDirection: "row", alignItems: "center" },
  selectorMes: { flexDirection: "row", gap: 6 },
  flecha: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowStart: { flexDirection: "row", alignItems: "center", gap: 6 },
  tituloFila: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  heroEtiqueta: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  heroValor: { color: colors.white, fontSize: 32, fontWeight: "800", letterSpacing: -0.5, marginTop: 2 },
  heroEstado: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  heroEstadoTexto: { color: "rgba(255,255,255,0.85)", fontSize: 12 },
  heroFila: { flexDirection: "row", marginTop: spacing.lg, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: radius.md, padding: spacing.md },
  heroBloque: { flex: 1 },
  heroSeparador: { width: 1, backgroundColor: "rgba(255,255,255,0.15)", marginHorizontal: spacing.md },
  heroBloqueTitulo: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
  heroBloqueValor: { color: colors.white, fontSize: 17, fontWeight: "800", marginTop: 4 },
  heroVar: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 },
  heroDesglose: { marginTop: spacing.md, gap: 4 },
  desgloseTexto: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  desgloseValor: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "600" },

  pagoFila: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 },
  pagoIcono: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  pagoTitulo: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  pagoDetalle: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  pagoValor: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, marginBottom: 3 },

  rubroNombre: { fontSize: 13, color: colors.textPrimary, fontWeight: "600", flex: 1, marginRight: 8 },
  rubroPct: { fontSize: 11, color: colors.textMuted, fontWeight: "500" },
  rubroValor: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  rubroVar: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  barraFondo: { height: 8, backgroundColor: colors.border, borderRadius: radius.pill, overflow: "hidden", marginTop: 4 },
  barraRelleno: { height: 8, backgroundColor: "#eb6834", borderRadius: radius.pill },

  tiles: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  tile: { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  tileTitulo: { fontSize: 11, color: colors.textSecondary },
  tileValor: { fontSize: 17, fontWeight: "800", color: colors.textPrimary },
  subtitulo: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  progresoNombre: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, flex: 1, marginRight: 8 },
  progresoPct: { fontSize: 12, fontWeight: "700", color: colors.primary },
  ayuda: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
  vacio: { fontSize: 12, color: colors.textMuted, fontStyle: "italic", marginTop: spacing.sm },

  personaFila: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 4 },
  avatarText: { color: colors.primary, fontWeight: "800" },
  pill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pillWarning: { backgroundColor: "#FCEFD9" },
  pillDanger: { backgroundColor: "#FBE3E2" },
  pillSuccess: { backgroundColor: colors.primaryLight },
  pillNeutro: { backgroundColor: colors.background },
  pillText: { fontSize: 10, fontWeight: "700" },
  pillTextWarning: { color: colors.warning },
  pillTextSuccess: { color: colors.success },
  editRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm, gap: 8 },
  editInput: { flex: 1, backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  editSaveBtn: { backgroundColor: colors.primary, padding: 9, borderRadius: radius.sm },
  editLinkRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.sm },
  editLink: { color: colors.primary, fontSize: 12, fontWeight: "600" },

  errorText: { color: colors.danger, padding: spacing.lg },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.xl },
  modalCaja: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  label: { ...typography.caption, marginBottom: spacing.sm },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, marginBottom: 6 },
  chipActivo: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  chipTextActivo: { color: colors.white },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.md, fontSize: 15 },
  backupBoton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 },
  backupTexto: { fontSize: 13, color: colors.primary, fontWeight: "600" },
});
