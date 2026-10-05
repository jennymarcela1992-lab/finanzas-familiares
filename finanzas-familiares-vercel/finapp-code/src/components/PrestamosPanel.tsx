import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, StyleSheet, ActivityIndicator, Alert, Modal, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePrestamos, PrestamoConAbonos, DestinoAbono, AbonoRow } from "../hooks/usePrestamos";
import { usePersonas } from "../hooks/usePersonas";
import { useDeudas } from "../hooks/useDeudas";
import Card from "./Card";
import ProgressBar from "./ProgressBar";
import PrimaryButton from "./PrimaryButton";
import FechaInput from "./FechaInput";
import TablaAmortizacion from "./TablaAmortizacion";
import { colors, spacing, typography, radius } from "../theme/theme";
import { aNumero } from "../utils/numeros";
import { TipoTasa, TIPOS_TASA, vistaPrevia, tasaMensual, formatoFecha, pesos, hoyISO, sumarMeses } from "../utils/amortizacion";

const FORM_VACIO = {
  quienPresta: "",
  quienRecibe: "",
  monto: "",
  motivo: "",
  fecha: hoyISO(),
  conCuotas: true,
  tasa: "",
  tipoTasa: "MV" as TipoTasa,
  plazo: "",
  primerPago: sumarMeses(hoyISO(), 1),
  esInversion: false,
  direccion: "prestamos" as "prestamos" | "nos_prestan" | "interno",
  deudaOrigen: "",
  soloIntereses: false,
};

export interface PrestamosPanelRef {
  abrirNuevo: () => void;
}

interface Props {
  /** "inversion": solo los préstamos que nos pagan intereses (se ven en Inversiones). "normal": el resto. */
  modo: "normal" | "inversion";
  onFormCambia?: (abierto: boolean, editando: boolean) => void;
}

const PrestamosPanel = forwardRef<PrestamosPanelRef, Props>(function PrestamosPanel({ modo, onFormCambia }, ref) {
  const { prestamos, cargando, error, crearPrestamo, editarPrestamo, eliminarPrestamo, registrarAbono, eliminarAbono, marcarPagadasHasta, deshacerPagadas } = usePrestamos();
  const [valorCredito, setValorCredito] = useState("");
  // cuotas que ya estaban pagadas antes de usar la app
  const [yaPagadasDe, setYaPagadasDe] = useState<PrestamoConAbonos | null>(null);
  const [hastaPagadas, setHastaPagadas] = useState("2026-09-30");
  const { personas } = usePersonas();
  const { deudas, recargar: recargarDeudas } = useDeudas();

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  const [pagoDe, setPagoDe] = useState<PrestamoConAbonos | null>(null);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [destino, setDestino] = useState("hogar");
  const [nota, setNota] = useState("");

  const cambiar = (k: keyof typeof FORM_VACIO) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  const previa = useMemo(() => {
    const m = aNumero(form.monto);
    const plazo = Math.round(aNumero(form.plazo));
    const tasa = aNumero(form.tasa) || 0;
    if (!form.conCuotas || !(m > 0) || !(plazo > 0)) return null;
    if (form.soloIntereses) {
      const interes = Math.round(m * tasaMensual(tasa, form.tipoTasa));
      return { cuotaSinSeguro: interes, totalIntereses: interes * plazo, total: interes * plazo + m };
    }
    const v = vistaPrevia(m, tasa, form.tipoTasa, plazo, 0);
    return { cuotaSinSeguro: v.cuotaSinSeguro, totalIntereses: v.totalIntereses, total: v.cuotaSinSeguro * plazo };
  }, [form]);

  const lista = useMemo(() => prestamos.filter((p) => (modo === "inversion" ? p.es_inversion : !p.es_inversion)), [prestamos, modo]);
  const enOtraVista = prestamos.length - lista.length;

  useEffect(() => {
    onFormCambia?.(mostrarForm, !!editandoId);
  }, [mostrarForm, editandoId]);

  function abrirNuevo() {
    if (mostrarForm && !editandoId) return setMostrarForm(false);
    setForm({ ...FORM_VACIO, quienPresta: personas[0] ?? "", esInversion: modo === "inversion", conCuotas: true, direccion: "prestamos" });
    setEditandoId(null);
    setMostrarForm(true);
  }

  useImperativeHandle(ref, () => ({ abrirNuevo }));

  function abrirEdicion(p: PrestamoConAbonos) {
    setForm({
      quienPresta: p.quien_presta,
      quienRecibe: p.quien_recibe,
      monto: Math.round(Number(p.monto)).toLocaleString("es-CO"),
      motivo: p.motivo ?? "",
      fecha: String(p.fecha).slice(0, 10),
      conCuotas: !!p.plazo_meses,
      tasa: p.tasa ? String(p.tasa).replace(".", ",") : "",
      tipoTasa: (p.tipo_tasa ?? "MV") as TipoTasa,
      plazo: p.plazo_meses ? String(p.plazo_meses) : "",
      primerPago: p.fecha_primer_pago ?? sumarMeses(hoyISO(), 1),
      esInversion: p.es_inversion,
      direccion: p.direccion,
      deudaOrigen: p.deuda_origen_id ?? "",
      soloIntereses: p.solo_intereses,
    });
    setEditandoId(p.id);
    setMostrarForm(true);
  }

  async function guardar() {
    const m = aNumero(form.monto);
    if (!form.quienPresta.trim() || !form.quienRecibe.trim() || !(m > 0)) return Alert.alert("Faltan datos", "Completa quién presta, quién recibe y el monto.");
    const plazo = Math.round(aNumero(form.plazo));
    if (form.conCuotas && !(plazo > 0)) return Alert.alert("Falta el plazo", "Escribe en cuántas cuotas se paga.");
    const datos = {
      quienPresta: form.quienPresta.trim(),
      quienRecibe: form.quienRecibe.trim(),
      monto: m,
      motivo: form.motivo.trim() || undefined,
      fecha: form.fecha,
      tasa: form.conCuotas ? aNumero(form.tasa) || 0 : 0,
      tipoTasa: form.tipoTasa,
      plazoMeses: form.conCuotas ? plazo : null,
      fechaPrimerPago: form.conCuotas ? form.primerPago : null,
      esInversion: form.esInversion,
      deudaOrigenId: form.deudaOrigen || null,
      soloIntereses: form.conCuotas && form.soloIntereses,
      direccion: form.direccion,
    };
    if (form.esInversion && form.direccion !== "prestamos")
      return Alert.alert("Revisa", "Un préstamo de Inversiones es uno que el hogar le hizo a alguien. Elige «Nosotros le prestamos a alguien» o apaga «Es una inversión».");
    setGuardando(true);
    try {
      if (editandoId) await editarPrestamo(editandoId, datos);
      else await crearPrestamo(datos);
      setMostrarForm(false);
      if (form.esInversion !== (modo === "inversion"))
        Alert.alert("Listo", form.esInversion ? "El préstamo quedó en Inversiones → Préstamos con intereses." : "El préstamo quedó en la pantalla de Préstamos.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar el préstamo.");
    } finally {
      setGuardando(false);
    }
  }

  function abrirPago(p: PrestamoConAbonos) {
    setPagoDe(p);
    const m = Math.round(p.conCuotas ? p.restanteProxima : p.saldoPendiente);
    setMonto(m.toLocaleString("es-CO"));
    setFecha(hoyISO());
    setNota("");
    // como el arriendo: si el dinero salió de un crédito, se sugiere usar el pago para la cuota de ese crédito
    const origen = p.direccion !== "nos_prestan" && p.deuda_origen_id ? deudas.find((d) => d.id === p.deuda_origen_id && d.proximaCuota) : null;
    if (origen) {
      setDestino(`c:${origen.id}`);
      setValorCredito(Math.min(m, origen.restanteProxima).toLocaleString("es-CO"));
    } else {
      setDestino("hogar");
      setValorCredito("");
    }
  }

  function elegirDestino(d: string) {
    setDestino(d);
    if (d.startsWith("c:")) {
      const deuda = deudas.find((x) => x.id === d.slice(2));
      if (deuda) setValorCredito(Math.min(aNumero(monto) || 0, deuda.restanteProxima).toLocaleString("es-CO"));
    }
  }

  function abrirYaPagadas(p: PrestamoConAbonos) {
    const hoy = hoyISO();
    setHastaPagadas(hoy < "2026-09-30" ? hoy : "2026-09-30");
    setYaPagadasDe(p);
  }

  async function guardarYaPagadas() {
    if (!yaPagadasDe) return;
    setGuardando(true);
    try {
      const n = await marcarPagadasHasta(yaPagadasDe, hastaPagadas);
      setYaPagadasDe(null);
      Alert.alert("Listo", n ? `${n} cuota(s) quedaron como pagadas. No cuentan como ingreso de esos meses.` : "No había cuotas pendientes hasta esa fecha.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudieron marcar las cuotas.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarPago() {
    if (!pagoDe) return;
    const v = aNumero(monto);
    if (!(v > 0)) return Alert.alert("Falta el valor", "Escribe cuánto pagaron.");
    let dest: DestinoAbono = { tipo: "hogar" };
    if (destino.startsWith("p:")) dest = { tipo: "persona", persona: destino.slice(2) };
    if (destino.startsWith("c:")) {
      const vc = aNumero(valorCredito);
      if (!(vc > 0)) return Alert.alert("Falta el valor", "Escribe cuánto de este pago va al crédito.");
      if (vc > v) return Alert.alert("Valor no válido", "Lo que va al crédito no puede ser mayor que el pago recibido.");
      dest = { tipo: "credito", deudaId: destino.slice(2), valor: vc };
    }
    setGuardando(true);
    try {
      await registrarAbono(pagoDe.id, v, fecha, dest, nota.trim() || undefined);
      if (dest.tipo === "credito") await recargarDeudas();
      setPagoDe(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el pago.");
    } finally {
      setGuardando(false);
    }
  }

  function destinoTexto(a: AbonoRow) {
    if (a.registro_inicial) return "ya estaba pagada (antes de la app)";
    if (a.deuda_id) {
      const nombre = deudas.find((d) => d.id === a.deuda_id)?.nombre ?? "un crédito";
      const vc = Number(a.valor_credito ?? a.monto);
      return vc < Number(a.monto) - 0.5 ? `${pesos(vc)} pagó ${nombre}, ${pesos(Number(a.monto) - vc)} quedó en el hogar` : `pagó ${nombre}`;
    }
    if (a.destino_persona) return `para ${a.destino_persona}`;
    return "quedó en el hogar";
  }

  const pct = (i: number) => `${(i * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })}%`;
  const ea = (i: number) => Math.pow(1 + i, 12) - 1;

  function resumenInversion() {
    if (!lista.length) return null;
    const prestado = lista.reduce((s, p) => s + Number(p.monto), 0);
    const intereses = lista.reduce((s, p) => s + p.interesesRecibidos, 0);
    const capital = lista.reduce((s, p) => s + p.capitalPendiente, 0);
    const porRecibir = lista.reduce((s, p) => s + p.interesesPorRecibir, 0);
    const costo = lista.reduce((s, p) => s + (p.deudaOrigen ? p.capitalPendiente * p.deudaOrigen.iMensual : 0), 0);
    const ingresoMes = lista.reduce((s, p) => s + p.capitalPendiente * p.iMensual, 0);
    return (
      <Card style={{ marginBottom: spacing.sm }}>
        <Text style={typography.h3}>Préstamos con intereses</Text>
        <View style={styles.statsGrid}>
          <Stat t="Prestado" v={pesos(prestado)} />
          <Stat t="Capital por recuperar" v={pesos(capital)} />
          <Stat t="Intereses recibidos" v={pesos(intereses)} verde />
          <Stat t="Intereses por recibir" v={pesos(porRecibir)} />
        </View>
        <Text style={styles.listaTxt}>
          Este mes rinde aprox. {pesos(ingresoMes)}
          {costo > 0 ? ` · el crédito que lo financia cuesta ${pesos(costo)} · ganancia neta ${pesos(ingresoMes - costo)}` : ""}
        </Text>
      </Card>
    );
  }

  function bloqueInversion(p: PrestamoConAbonos) {
    const d = p.deudaOrigen;
    const ingresoMes = p.capitalPendiente * p.iMensual;
    const costoMes = d ? p.capitalPendiente * d.iMensual : 0;
    const margen = d ? p.iMensual - d.iMensual : 0;
    return (
      <View style={styles.invBox}>
        <View style={styles.statsGrid}>
          <Stat t="Intereses recibidos" v={pesos(p.interesesRecibidos)} verde />
          <Stat t="Capital recuperado" v={pesos(p.capitalRecuperado)} />
          <Stat t="Capital pendiente" v={pesos(p.capitalPendiente)} />
          <Stat t="Intereses por recibir" v={pesos(p.interesesPorRecibir)} />
        </View>
        <Text style={styles.listaTxt}>
          Tasa {pct(p.iMensual)} M.V. ({pct(ea(p.iMensual))} E.A.) · rendimiento a la fecha {pct(Number(p.monto) > 0 ? p.interesesRecibidos / Number(p.monto) : 0)}
        </Text>
        <View style={[styles.origen, d && margen < 0 && { backgroundColor: "#FDE6E3" }]}>
          <Ionicons name={d ? "card" : "home"} size={14} color={d && margen < 0 ? colors.danger : colors.primary} />
          <Text style={[styles.listaTxt, { flex: 1 }]}>
            {d ? (
              <>
                El dinero salió del crédito <Text style={{ fontWeight: "700" }}>{d.nombre}</Text> ({pct(d.iMensual)} M.V.). Este mes: reciben {pesos(ingresoMes)}, el crédito cuesta{" "}
                {pesos(costoMes)} →{" "}
                <Text style={{ fontWeight: "700", color: margen >= 0 ? colors.success : colors.danger }}>
                  {margen >= 0 ? "ganan" : "pierden"} {pesos(Math.abs(ingresoMes - costoMes))}
                </Text>{" "}
                ({margen >= 0 ? "+" : ""}
                {pct(margen)} al mes).
              </>
            ) : (
              "El dinero salió del hogar / ahorros."
            )}
          </Text>
        </View>
      </View>
    );
  }

  function renderPrestamo(p: PrestamoConAbonos) {
    const abiertoP = abierto === p.id;
    const total = p.conCuotas ? p.cuotas.reduce((s, c) => s + c.cuota_total, 0) : Number(p.monto);
    const avance = total > 0 ? Math.min(1, p.totalAbonado / total) : 0;
    // objeto compatible con la tabla de amortización de créditos
    const comoDeuda: any = {
      nombre: `Préstamo ${p.quien_recibe}`,
      valor_inicial: Number(p.monto),
      tasa_interes: Number(p.tasa ?? 0),
      tipo_tasa: p.tipo_tasa ?? "MV",
      iMensual: p.iMensual,
      cuotas: p.cuotas,
      abonos: [],
      desembolsos: [],
      proximaCuota: p.proximaCuota,
      montoTotal: Number(p.monto),
      saldoActual: p.proximaCuota ? Math.round(p.proximaCuota.saldo + p.proximaCuota.capital) : 0,
    };
    return (
      <Card>
        <TouchableOpacity onPress={() => setAbierto(abiertoP ? null : p.id)} activeOpacity={0.85}>
          <View style={styles.rowStart}>
            <View style={styles.iconoCircle}>
              <Ionicons name="people" size={17} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.h3}>
                {p.quien_presta} → {p.quien_recibe}
              </Text>
              <Text style={typography.caption}>
                {pesos(Number(p.monto))} · {formatoFecha(String(p.fecha).slice(0, 10))}
                {p.motivo ? ` · ${p.motivo}` : ""}
                {p.direccion === "prestamos" ? " · le prestamos" : p.direccion === "nos_prestan" ? " · nos prestaron" : " · entre nosotros"}
              </Text>
            </View>
            <Text style={styles.pct}>{Math.round(avance * 100)}%</Text>
          </View>
          <View style={{ marginTop: spacing.sm, marginBottom: 4 }}>
            <ProgressBar progreso={avance} />
          </View>
          <Text style={typography.caption}>
            {p.direccion === "nos_prestan" ? "Pagado" : "Recibido"} {pesos(p.totalAbonado)} · falta {pesos(p.saldoPendiente)}
            {p.conCuotas ? ` · ${p.cuotas.filter((c) => c.estado === "pagada").length} de ${p.cuotas.length} cuotas` : ""}
            {p.solo_intereses ? " · solo intereses, capital al final" : ""}
          </Text>
          {p.es_inversion && bloqueInversion(p)}
          {!p.es_inversion && p.deudaOrigen && <Text style={styles.listaTxt}>El dinero salió del crédito {p.deudaOrigen.nombre}.</Text>}
          {p.proximaCuota && (
            <View style={styles.aviso}>
              <Ionicons name="alarm" size={14} color={colors.warning} />
              <Text style={styles.avisoTxt}>
                Próxima cuota #{p.proximaCuota.numero_cuota}: {pesos(p.restanteProxima)} vence {formatoFecha(p.proximaCuota.fecha_vencimiento)}
              </Text>
            </View>
          )}
          <Text style={styles.hint}>{abiertoP ? "Ocultar detalle ▲" : p.conCuotas ? "Ver tabla de amortización y pagos ▼" : "Ver pagos ▼"}</Text>
        </TouchableOpacity>

        <View style={styles.acciones}>
          {p.saldoPendiente > 0 && (
            <TouchableOpacity style={styles.accion} onPress={() => abrirPago(p)}>
              <Ionicons name="cash" size={15} color={colors.primary} />
              <Text style={styles.accionTxt}>Registrar pago</Text>
            </TouchableOpacity>
          )}
          {p.conCuotas && (p.cuotas.some((c) => c.estado === "pendiente" && c.fecha_vencimiento <= hoyISO()) || p.abonos.some((a) => a.registro_inicial)) && (
            <TouchableOpacity style={styles.accion} onPress={() => abrirYaPagadas(p)}>
              <Ionicons name="checkmark-done" size={15} color={colors.primary} />
              <Text style={styles.accionTxt}>Cuotas ya pagadas</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.accion} onPress={() => abrirEdicion(p)}>
            <Ionicons name="create" size={15} color={colors.primary} />
            <Text style={styles.accionTxt}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.accion}
            onPress={() =>
              Alert.alert("Eliminar préstamo", "¿Eliminar este préstamo y todos sus pagos? Si algún pago abonó a un crédito, ese pago también se borra.", [
                { text: "Cancelar", style: "cancel" },
                { text: "Eliminar", style: "destructive", onPress: () => eliminarPrestamo(p).then(recargarDeudas).catch((e) => Alert.alert("Error", e.message)) },
              ])
            }
          >
            <Ionicons name="trash" size={15} color={colors.danger} />
            <Text style={[styles.accionTxt, { color: colors.danger }]}>Eliminar</Text>
          </TouchableOpacity>
        </View>

        {abiertoP && (
          <View style={{ marginTop: spacing.md }}>
            {p.conCuotas && (
              <>
                <Text style={styles.label}>Tabla de amortización</Text>
                <TablaAmortizacion deuda={comoDeuda} />
              </>
            )}
            <Text style={[styles.label, { marginTop: spacing.md }]}>Pagos registrados</Text>
            {p.abonos.length === 0 && <Text style={styles.listaTxt}>Todavía no hay pagos.</Text>}
            {p.abonos.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={styles.abonoFila}
                onPress={() =>
                  Alert.alert("Borrar pago", `¿Borrar el pago de ${pesos(Number(a.monto))} del ${formatoFecha(a.fecha)}?${a.deuda_id ? " También se borra el pago al crédito." : ""}`, [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Borrar", style: "destructive", onPress: () => eliminarAbono(a).then(recargarDeudas).catch((e) => Alert.alert("Error", e.message)) },
                  ])
                }
              >
                <Ionicons name={a.registro_inicial ? "checkmark-done" : a.deuda_id ? "card" : a.destino_persona ? "person" : "home"} size={14} color={a.registro_inicial ? colors.textMuted : colors.primary} />
                <Text style={[styles.listaTxt, { flex: 1 }]}>
                  {formatoFecha(a.fecha)} · <Text style={{ fontWeight: "700" }}>{pesos(Number(a.monto))}</Text> · {destinoTexto(a)}
                  {a.nota ? ` · ${a.nota}` : ""}
                </Text>
                <Ionicons name="close-circle-outline" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Card>
    );
  }

  const esNosPrestan = pagoDe?.direccion === "nos_prestan";

  return (
    <View style={styles.container}>

      {mostrarForm ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={[typography.h3, { marginBottom: spacing.sm }]}>{editandoId ? "Editar préstamo" : "Nuevo préstamo"}</Text>
            <Text style={styles.label}>¿Quién le prestó a quién?</Text>
            <View style={styles.chips}>
              {(
                [
                  ["prestamos", "Nosotros le prestamos a alguien"],
                  ["nos_prestan", "Alguien nos prestó"],
                  ["interno", "Entre nosotros"],
                ] as const
              ).map(([k, t]) => (
                <TouchableOpacity
                  key={k}
                  onPress={() =>
                    setForm((f) => ({
                      ...f,
                      direccion: k,
                      // ubica a la persona del hogar en el lado que corresponde
                      quienPresta: k === "nos_prestan" ? (personas.includes(f.quienPresta) ? "" : f.quienPresta) : personas.includes(f.quienPresta) ? f.quienPresta : personas[0] ?? "",
                      quienRecibe: k === "nos_prestan" ? (personas.includes(f.quienRecibe) ? f.quienRecibe : personas[0] ?? "") : personas.includes(f.quienRecibe) && k === "prestamos" ? "" : f.quienRecibe,
                    }))
                  }
                  style={[styles.chip, form.direccion === k && styles.chipActivo]}
                >
                  <Text style={[styles.chipTxt, form.direccion === k && styles.chipTxtActivo]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>{form.direccion === "nos_prestan" ? "¿Quién nos prestó? (nombre o entidad)" : "¿Quién del hogar prestó?"}</Text>
            {form.direccion !== "nos_prestan" && (
              <View style={styles.chips}>
                {[...personas, "Hogar"].map((n) => (
                  <TouchableOpacity key={n} onPress={() => cambiar("quienPresta")(n)} style={[styles.chip, form.quienPresta === n && styles.chipActivo]}>
                    <Text style={[styles.chipTxt, form.quienPresta === n && styles.chipTxtActivo]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {form.direccion === "nos_prestan" && (
              <TextInput style={styles.input} placeholder="Ej. Mamá, Banco…" placeholderTextColor={colors.textMuted} value={form.quienPresta} onChangeText={cambiar("quienPresta")} />
            )}

            <Text style={styles.label}>{form.direccion === "prestamos" ? "¿A quién le prestamos? (nombre)" : "¿Quién del hogar lo recibió?"}</Text>
            {form.direccion === "prestamos" ? (
              <TextInput style={styles.input} placeholder="Ej. Jenny Ostos" placeholderTextColor={colors.textMuted} value={form.quienRecibe} onChangeText={cambiar("quienRecibe")} />
            ) : (
              <View style={styles.chips}>
                {[...personas, "Hogar"].map((n) => (
                  <TouchableOpacity key={n} onPress={() => cambiar("quienRecibe")(n)} style={[styles.chip, form.quienRecibe === n && styles.chipActivo]}>
                    <Text style={[styles.chipTxt, form.quienRecibe === n && styles.chipTxtActivo]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={styles.label}>Valor prestado</Text>
            <TextInput style={styles.input} placeholder="Ej. 5.000.000" placeholderTextColor={colors.textMuted} value={form.monto} onChangeText={cambiar("monto")} keyboardType="numeric" />
            <Text style={styles.label}>Fecha del préstamo</Text>
            <FechaInput value={form.fecha} onChange={cambiar("fecha")} max={hoyISO()} />
            <TextInput style={styles.input} placeholder="Motivo (opcional)" placeholderTextColor={colors.textMuted} value={form.motivo} onChangeText={cambiar("motivo")} />

            <Text style={styles.label}>¿De dónde salió el dinero prestado?</Text>
            <View style={styles.chips}>
              <TouchableOpacity onPress={() => cambiar("deudaOrigen")("")} style={[styles.chip, !form.deudaOrigen && styles.chipActivo]}>
                <Text style={[styles.chipTxt, !form.deudaOrigen && styles.chipTxtActivo]}>Del hogar / ahorros</Text>
              </TouchableOpacity>
              {deudas.map((d) => (
                <TouchableOpacity key={d.id} onPress={() => cambiar("deudaOrigen")(d.id)} style={[styles.chip, form.deudaOrigen === d.id && styles.chipActivo]}>
                  <Text style={[styles.chipTxt, form.deudaOrigen === d.id && styles.chipTxtActivo]}>Crédito {d.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {!!form.deudaOrigen && (
              <Text style={styles.ayuda}>
                El préstamo no se cuenta como salida del hogar (el dinero vino del crédito). En Inversiones verás cuánto cuesta ese crédito frente a lo que les pagan.
              </Text>
            )}

            <View style={styles.switchFila}>
              <Text style={[typography.body, { flex: 1 }]}>Es una inversión: nos pagan intereses (se ve en Inversiones)</Text>
              <Switch value={form.esInversion} onValueChange={cambiar("esInversion")} trackColor={{ true: colors.primary }} />
            </View>

            <View style={styles.switchFila}>
              <Text style={[typography.body, { flex: 1 }]}>Se paga en cuotas mensuales (genera tabla de amortización)</Text>
              <Switch value={form.conCuotas} onValueChange={cambiar("conCuotas")} trackColor={{ true: colors.primary }} />
            </View>
            {form.conCuotas && (
              <>
                <Text style={styles.label}>Tasa de interés (0 si no cobra intereses)</Text>
                <TextInput style={styles.input} placeholder="Ej. 1,5" placeholderTextColor={colors.textMuted} value={form.tasa} onChangeText={cambiar("tasa")} keyboardType="decimal-pad" />
                <View style={styles.chips}>
                  {TIPOS_TASA.map((t) => (
                    <TouchableOpacity key={t.valor} onPress={() => cambiar("tipoTasa")(t.valor)} style={[styles.chip, form.tipoTasa === t.valor && styles.chipActivo]}>
                      <Text style={[styles.chipTxt, form.tipoTasa === t.valor && styles.chipTxtActivo]}>{t.etiqueta}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Forma de pago</Text>
                <View style={styles.chips}>
                  <TouchableOpacity onPress={() => cambiar("soloIntereses")(false)} style={[styles.chip, !form.soloIntereses && styles.chipActivo]}>
                    <Text style={[styles.chipTxt, !form.soloIntereses && styles.chipTxtActivo]}>Cuota fija (capital + interés)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => cambiar("soloIntereses")(true)} style={[styles.chip, form.soloIntereses && styles.chipActivo]}>
                    <Text style={[styles.chipTxt, form.soloIntereses && styles.chipTxtActivo]}>Solo intereses, capital al final</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.label}>Número de cuotas (meses)</Text>
                <TextInput style={styles.input} placeholder="Ej. 12" placeholderTextColor={colors.textMuted} value={form.plazo} onChangeText={cambiar("plazo")} keyboardType="numeric" />
                <Text style={styles.label}>Fecha de la primera cuota</Text>
                <FechaInput value={form.primerPago} onChange={cambiar("primerPago")} />
                {previa && (
                  <View style={styles.previa}>
                    <Text style={styles.previaTit}>
                      {form.soloIntereses ? "Intereses mensuales" : "Cuota mensual"}: {pesos(previa.cuotaSinSeguro)}
                    </Text>
                    <Text style={styles.previaTxt}>
                      Intereses totales {pesos(previa.totalIntereses)} · total a recibir {pesos(previa.total)}
                      {form.soloIntereses ? " (el capital se devuelve en la última cuota)" : ""}
                    </Text>
                  </View>
                )}
              </>
            )}
            <PrimaryButton title={editandoId ? "Guardar cambios" : "Guardar préstamo"} onPress={guardar} loading={guardando} />
            <PrimaryButton title="Cancelar" variant="outline" onPress={() => setMostrarForm(false)} style={{ marginTop: spacing.sm }} />
          </Card>
        </ScrollView>
      ) : cargando && !prestamos.length ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando préstamos: {error}</Text>
      ) : (
        <FlatList
          data={lista}
          ListHeaderComponent={modo === "inversion" ? resumenInversion() : enOtraVista > 0 ? <Text style={styles.nota}>Los préstamos que les pagan intereses ({enOtraVista}) están en Inversiones.</Text> : null}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md }}
          ListEmptyComponent={<Text style={styles.empty}>{modo === "inversion" ? "Todavía no hay préstamos con intereses. Toca «Nuevo préstamo»." : "Todavía no hay préstamos registrados."}</Text>}
          renderItem={({ item }) => renderPrestamo(item)}
        />
      )}

      <Modal visible={!!pagoDe} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <ScrollView style={styles.modalCaja} keyboardShouldPersistTaps="handled">
            {pagoDe && (
              <>
                <Text style={typography.h2}>{esNosPrestan ? "Pago que hicimos" : "Pago recibido"}</Text>
                <Text style={typography.caption}>
                  {pagoDe.quien_presta} → {pagoDe.quien_recibe} · falta {pesos(pagoDe.saldoPendiente)}
                </Text>
                {pagoDe.proximaCuota && (
                  <Text style={[styles.listaTxt, { marginTop: 6 }]}>
                    Cuota #{pagoDe.proximaCuota.numero_cuota} vence {formatoFecha(pagoDe.proximaCuota.fecha_vencimiento)} · falta {pesos(pagoDe.restanteProxima)}. Si pagan más, pasa a la siguiente cuota.
                  </Text>
                )}
                <Text style={[styles.label, { marginTop: spacing.md }]}>Valor</Text>
                <TextInput style={styles.input} value={monto} onChangeText={setMonto} keyboardType="numeric" placeholder="Valor" placeholderTextColor={colors.textMuted} />
                <Text style={styles.label}>Fecha</Text>
                <FechaInput value={fecha} onChange={setFecha} max={hoyISO()} />

                <Text style={styles.label}>{esNosPrestan ? "¿Quién hizo el pago?" : "¿A dónde fue este dinero?"}</Text>
                <View style={styles.chips}>
                  {!esNosPrestan && (
                    <TouchableOpacity onPress={() => elegirDestino("hogar")} style={[styles.chip, destino === "hogar" && styles.chipActivo]}>
                      <Text style={[styles.chipTxt, destino === "hogar" && styles.chipTxtActivo]}>Queda en el hogar</Text>
                    </TouchableOpacity>
                  )}
                  {personas.map((n) => (
                    <TouchableOpacity key={n} onPress={() => elegirDestino(`p:${n}`)} style={[styles.chip, destino === `p:${n}` && styles.chipActivo]}>
                      <Text style={[styles.chipTxt, destino === `p:${n}` && styles.chipTxtActivo]}>{esNosPrestan ? n : `Para ${n}`}</Text>
                    </TouchableOpacity>
                  ))}
                  {!esNosPrestan &&
                    deudas
                      .filter((d) => d.proximaCuota)
                      .sort((a, b) => Number(b.id === pagoDe.deuda_origen_id) - Number(a.id === pagoDe.deuda_origen_id))
                      .map((d) => (
                        <TouchableOpacity key={d.id} onPress={() => elegirDestino(`c:${d.id}`)} style={[styles.chip, destino === `c:${d.id}` && styles.chipActivo]}>
                          <Text style={[styles.chipTxt, destino === `c:${d.id}` && styles.chipTxtActivo]}>
                            Abonar a {d.nombre}
                            {d.id === pagoDe.deuda_origen_id ? " (origen del dinero)" : ""}
                          </Text>
                        </TouchableOpacity>
                      ))}
                </View>
                {destino.startsWith("c:") &&
                  (() => {
                    const dd = deudas.find((d) => d.id === destino.slice(2));
                    if (!dd?.proximaCuota) return null;
                    const vm = aNumero(monto);
                    const vc = aNumero(valorCredito);
                    return (
                      <View style={styles.previa}>
                        <Text style={styles.previaTxt}>
                          {dd.nombre}: cuota #{dd.proximaCuota.numero_cuota} vence {formatoFecha(dd.proximaCuota.fecha_vencimiento)} · falta {pesos(dd.restanteProxima)}
                          {dd.entidad_pago ? ` · se paga en ${dd.entidad_pago}` : ""}
                        </Text>
                        <Text style={[styles.label, { marginTop: spacing.sm }]}>Valor que va al crédito</Text>
                        <TextInput style={styles.input} value={valorCredito} onChangeText={setValorCredito} keyboardType="numeric" placeholder="Valor para la cuota" placeholderTextColor={colors.textMuted} />
                        {vm > vc && vc > 0 && <Text style={styles.previaTxt}>Quedan en el hogar {pesos(vm - vc)}</Text>}
                        {vc > dd.restanteProxima && <Text style={styles.previaTxt}>Lo que pase de la cuota se aplica a la siguiente.</Text>}
                      </View>
                    );
                  })()}
                <TextInput style={styles.input} placeholder="Nota (opcional)" placeholderTextColor={colors.textMuted} value={nota} onChangeText={setNota} />
                <PrimaryButton title="Guardar pago" onPress={guardarPago} loading={guardando} />
                <TouchableOpacity onPress={() => setPagoDe(null)} style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
                  <Text style={{ textAlign: "center", color: colors.textSecondary }}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!yaPagadasDe} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <ScrollView style={styles.modalCaja} keyboardShouldPersistTaps="handled">
            {yaPagadasDe &&
              (() => {
                const marcar = yaPagadasDe.cuotas.filter((c) => c.estado === "pendiente" && c.fecha_vencimiento <= hastaPagadas);
                const total = marcar.reduce((t, c) => t + c.cuota_total - c.valor_pagado, 0);
                const hechas = yaPagadasDe.abonos.filter((a) => a.registro_inicial);
                return (
                  <>
                    <Text style={typography.h2}>Cuotas ya pagadas</Text>
                    <Text style={typography.caption}>
                      {yaPagadasDe.quien_presta} → {yaPagadasDe.quien_recibe}. Marca las cuotas que ya te pagaron antes de usar la app. Quedan pagadas en la tabla (con sus intereses) pero no
                      cuentan como ingreso de esos meses.
                    </Text>
                    <Text style={[styles.label, { marginTop: spacing.md }]}>Pagadas hasta</Text>
                    <FechaInput value={hastaPagadas} onChange={setHastaPagadas} max={hoyISO()} />
                    <View style={styles.previa}>
                      <Text style={styles.previaTit}>
                        {marcar.length ? `Se marcan ${marcar.length} cuota(s): #${marcar[0].numero_cuota} a #${marcar[marcar.length - 1].numero_cuota}` : "No hay cuotas pendientes hasta esa fecha"}
                      </Text>
                      {marcar.length > 0 && (
                        <Text style={styles.previaTxt}>
                          Total {pesos(total)} · intereses {pesos(marcar.reduce((t, c) => t + c.interes, 0))} · capital {pesos(marcar.reduce((t, c) => t + c.capital, 0))}
                        </Text>
                      )}
                    </View>
                    <PrimaryButton title="Marcar como pagadas" onPress={guardarYaPagadas} loading={guardando} />
                    {hechas.length > 0 && (
                      <TouchableOpacity
                        style={{ marginTop: spacing.md }}
                        onPress={() =>
                          deshacerPagadas(yaPagadasDe)
                            .then(() => setYaPagadasDe(null))
                            .catch((e) => Alert.alert("Error", e.message))
                        }
                      >
                        <Text style={{ textAlign: "center", color: colors.danger, fontWeight: "600" }}>Deshacer las {hechas.length} cuota(s) marcadas como ya pagadas</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => setYaPagadasDe(null)} style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
                      <Text style={{ textAlign: "center", color: colors.textSecondary }}>Cancelar</Text>
                    </TouchableOpacity>
                  </>
                );
              })()}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
});

export default PrestamosPanel;

function Stat({ t, v, verde }: { t: string; v: string; verde?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statT}>{t}</Text>
      <Text style={[styles.statV, verde && { color: colors.success }]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  label: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 4 },
  ayuda: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.sm },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  chipActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  chipTxtActivo: { color: colors.white },
  switchFila: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: spacing.sm },
  previa: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm },
  previaTit: { fontSize: 15, fontWeight: "800", color: colors.primary },
  previaTxt: { fontSize: 12, color: colors.textPrimary, marginTop: 2 },
  rowStart: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconoCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  pct: { fontSize: 15, fontWeight: "800", color: colors.primary },
  aviso: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, backgroundColor: "#FCEFD9", padding: spacing.sm, borderRadius: radius.sm },
  avisoTxt: { fontSize: 12, color: colors.warning, fontWeight: "600", flex: 1 },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
  acciones: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  accion: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.background },
  accionTxt: { fontSize: 13, fontWeight: "600", color: colors.primary },
  listaTxt: { fontSize: 12, color: colors.textSecondary },
  abonoFila: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  nota: { fontSize: 12, color: colors.textSecondary, backgroundColor: colors.primaryLight, padding: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.sm },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: spacing.sm },
  stat: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.background, borderRadius: radius.sm, padding: 8 },
  statT: { fontSize: 11, color: colors.textMuted },
  statV: { fontSize: 14, fontWeight: "800", color: colors.textPrimary, marginTop: 2 },
  invBox: { marginTop: spacing.sm },
  origen: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: spacing.sm, backgroundColor: colors.primaryLight, padding: spacing.sm, borderRadius: radius.sm },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.lg },
  modalCaja: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, maxHeight: "90%", flexGrow: 0 },
});
