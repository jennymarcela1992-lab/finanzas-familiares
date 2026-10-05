import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert, Modal, ScrollView, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePropiedades, PropiedadConDetalle, DestinoArriendo, ArriendoRow, DatosContrato } from "../../hooks/usePropiedades";
import { ContratoArriendo } from "../../utils/arriendo";
import { usePersonas } from "../../hooks/usePersonas";
import { useDeudas } from "../../hooks/useDeudas";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import FechaInput from "../../components/FechaInput";
import { colors, spacing, typography, radius } from "../../theme/theme";
import { aNumero } from "../../utils/numeros";
import { formatoFecha, pesos, hoyISO, sumarMeses } from "../../utils/amortizacion";
import { diasEntre } from "../../utils/arriendo";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

const FORM_VACIO = {
  nombre: "",
  direccion: "",
  valorComercial: "",
  generaIngresos: true,
};

const CONTRATO_VACIO = {
  arrendatario: "",
  fechaInicio: hoyISO(),
  canon: "",
  diaPago: "5",
  duracion: "12",
  aplicaIpc: true,
};
type FormContrato = typeof CONTRATO_VACIO;

/** Valida y convierte el formulario de contrato. Devuelve un mensaje si falta algo. */
function leerContrato(c: FormContrato): DatosContrato | string {
  const canon = aNumero(c.canon);
  const dia = Math.round(aNumero(c.diaPago));
  const dur = Math.round(aNumero(c.duracion));
  if (!(canon > 0)) return "Escribe el valor del arriendo (canon) al iniciar el contrato.";
  if (!(dia >= 1 && dia <= 31)) return "El día de pago debe estar entre 1 y 31.";
  if (!(dur >= 1 && dur <= 120)) return "La duración del contrato debe estar entre 1 y 120 meses.";
  return { arrendatario: c.arrendatario.trim() || undefined, fechaInicio: c.fechaInicio, canonInicial: canon, diaPago: dia, duracionMeses: dur, aplicaIpc: c.aplicaIpc };
}

export default function PropiedadesScreen() {
  const {
    propiedades,
    ipc,
    cargando,
    error,
    crearPropiedad,
    editarPropiedad,
    eliminarPropiedad,
    moverAVehiculo,
    guardarContrato,
    terminarContrato,
    eliminarContrato,
    registrarArriendoRecibido,
    eliminarArriendo,
    guardarIpc,
  } = usePropiedades();
  const { deudas, recargar: recargarDeudas } = useDeudas();
  const { personas } = usePersonas();

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [verIpc, setVerIpc] = useState(false);
  const [formContrato, setFormContrato] = useState<FormContrato>(CONTRATO_VACIO);
  const cambiarC = (k: keyof FormContrato) => (v: any) => setFormContrato((f) => ({ ...f, [k]: v }));

  // modal de contrato (nuevo o corregir) y de terminar contrato
  const [contratoDe, setContratoDe] = useState<{ prop: PropiedadConDetalle; contrato: ContratoArriendo | null } | null>(null);
  const [terminar, setTerminar] = useState<{ prop: PropiedadConDetalle; contrato: ContratoArriendo } | null>(null);
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [motivoFin, setMotivoFin] = useState("");

  // modal de arriendo
  const [prop, setProp] = useState<PropiedadConDetalle | null>(null);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [mes, setMes] = useState(hoyISO().slice(0, 7));
  const [destino, setDestino] = useState<string>("hogar"); // "hogar" | "p:<persona>" | "c:<deudaId>"
  const [valorCredito, setValorCredito] = useState("");

  const cambiar = (k: keyof typeof FORM_VACIO) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  function abrirNueva() {
    if (mostrarForm && !editandoId) return setMostrarForm(false);
    setForm(FORM_VACIO);
    setFormContrato(CONTRATO_VACIO);
    setEditandoId(null);
    setMostrarForm(true);
  }

  function abrirEdicion(p: PropiedadConDetalle) {
    setForm({
      nombre: p.nombre,
      direccion: p.direccion ?? "",
      valorComercial: p.valor_comercial ? Math.round(Number(p.valor_comercial)).toLocaleString("es-CO") : "",
      generaIngresos: p.genera_ingresos,
    });
    setEditandoId(p.id);
    setMostrarForm(true);
  }

  async function guardar() {
    if (!form.nombre.trim()) return Alert.alert("Falta el nombre", "Escribe el nombre de la propiedad.");
    let contrato: DatosContrato | null = null;
    if (!editandoId && form.generaIngresos && formContrato.canon.trim()) {
      const c = leerContrato(formContrato);
      if (typeof c === "string") return Alert.alert("Contrato", c);
      contrato = c;
    }
    const datos = {
      nombre: form.nombre.trim(),
      direccion: form.direccion.trim() || undefined,
      valorComercial: aNumero(form.valorComercial) || null,
      generaIngresos: form.generaIngresos,
      contrato,
    };
    setGuardando(true);
    try {
      if (editandoId) await editarPropiedad(editandoId, datos);
      else await crearPropiedad(datos);
      setMostrarForm(false);
      setEditandoId(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar la propiedad.");
    } finally {
      setGuardando(false);
    }
  }

  // ---------- Arriendo recibido ----------
  const creditosConCuota = (p: PropiedadConDetalle | null) => {
    const ligados = new Set((p?.creditos ?? []).map((c) => c.id));
    return deudas.filter((d) => d.proximaCuota).sort((a, b) => Number(ligados.has(b.id)) - Number(ligados.has(a.id)));
  };

  function abrirArriendo(p: PropiedadConDetalle) {
    setProp(p);
    const falta = Math.max(0, p.arriendo.valor - p.recibidoMes);
    setMonto(Math.round(falta || p.arriendo.valor).toLocaleString("es-CO"));
    setFecha(hoyISO());
    setMes(hoyISO().slice(0, 7));
    const ligado = deudas.find((d) => p.creditos.some((c) => c.id === d.id) && d.proximaCuota);
    if (ligado) {
      setDestino(`c:${ligado.id}`);
      setValorCredito(Math.min(falta || p.arriendo.valor, ligado.restanteProxima).toLocaleString("es-CO"));
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

  async function guardarArriendo() {
    if (!prop) return;
    const m = aNumero(monto);
    if (!(m > 0)) return Alert.alert("Falta el valor", "Escribe cuánto se recibió.");
    let dest: DestinoArriendo = { tipo: "hogar" };
    if (destino.startsWith("p:")) dest = { tipo: "persona", persona: destino.slice(2) };
    if (destino.startsWith("c:")) {
      const v = aNumero(valorCredito);
      if (!(v > 0)) return Alert.alert("Falta el valor", "Escribe cuánto del arriendo va al crédito.");
      if (v > m) return Alert.alert("Valor no válido", "Lo que va al crédito no puede ser mayor que el arriendo recibido.");
      dest = { tipo: "credito", deudaId: destino.slice(2), valor: v };
    }
    setGuardando(true);
    try {
      await registrarArriendoRecibido(prop.id, m, { fecha, mes, destino: dest });
      if (dest.tipo === "credito") await recargarDeudas();
      setProp(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el arriendo.");
    } finally {
      setGuardando(false);
    }
  }

  function confirmarBorrarArriendo(a: ArriendoRow) {
    Alert.alert("Borrar arriendo", `¿Borrar el arriendo de ${pesos(Number(a.monto))} (${nombreMes(a.mes)})? Si pagó un crédito, ese pago también se borra.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: () => eliminarArriendo(a).then(recargarDeudas).catch((e) => Alert.alert("Error", e.message)) },
    ]);
  }

  // ---------- Contratos ----------
  function abrirContrato(p: PropiedadConDetalle, c: ContratoArriendo | null) {
    setFormContrato(
      c
        ? {
            arrendatario: c.arrendatario ?? "",
            fechaInicio: c.fecha_inicio,
            canon: Math.round(c.canon_inicial).toLocaleString("es-CO"),
            diaPago: String(c.dia_pago),
            duracion: String(c.duracion_meses),
            aplicaIpc: c.aplica_ipc,
          }
        : { ...CONTRATO_VACIO, diaPago: String(p.contratos[0]?.dia_pago ?? 5), canon: p.contratos[0] ? Math.round(p.arriendo.valor || p.contratos[0].canon_inicial).toLocaleString("es-CO") : "" }
    );
    setContratoDe({ prop: p, contrato: c && c.id ? c : null });
  }

  async function guardarContratoModal() {
    if (!contratoDe) return;
    const c = leerContrato(formContrato);
    if (typeof c === "string") return Alert.alert("Contrato", c);
    setGuardando(true);
    try {
      await guardarContrato(contratoDe.prop.id, c, contratoDe.contrato?.id ?? null);
      setContratoDe(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar el contrato.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarTerminar() {
    if (!terminar) return;
    if (fechaFin < terminar.contrato.fecha_inicio) return Alert.alert("Fecha no válida", "La fecha de salida no puede ser antes del inicio del contrato.");
    setGuardando(true);
    try {
      await terminarContrato(terminar.contrato, fechaFin, motivoFin.trim() || undefined);
      setTerminar(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo terminar el contrato.");
    } finally {
      setGuardando(false);
    }
  }

  // ---------- IPC ----------
  const aniosIpc = Array.from(new Set([...Object.keys(ipc).map(Number), ...propiedades.flatMap((p) => p.arriendo.ipcFaltante), Number(hoyISO().slice(0, 4)) - 1])).sort((a, b) => b - a);
  const faltantes = Array.from(new Set(propiedades.flatMap((p) => p.arriendo.ipcFaltante)));

  function renderEstado(p: PropiedadConDetalle) {
    const cfg = {
      recibido: { t: `Recibido ${pesos(p.recibidoMes)}`, c: colors.success, bg: "#E3F3EC", i: "checkmark-circle" },
      parcial: { t: `Parcial: falta ${pesos(p.arriendo.valor - p.recibidoMes)}`, c: colors.warning, bg: "#FCEFD9", i: "time" },
      por_vencer: { t: p.diasParaPago === 0 ? "Vence hoy" : `Vence en ${p.diasParaPago} día(s)`, c: colors.warning, bg: "#FCEFD9", i: "alarm" },
      vencido: { t: `Vencido hace ${Math.abs(p.diasParaPago)} día(s)`, c: colors.danger, bg: "#FBE3E2", i: "alert-circle" },
      pendiente: { t: `Vence el ${formatoFecha(p.fechaPagoMes)}`, c: colors.textSecondary, bg: colors.background, i: "calendar" },
      sin_contrato: { t: "", c: colors.textSecondary, bg: colors.background, i: "home-outline" },
      uso_propio: { t: "", c: colors.textSecondary, bg: colors.background, i: "home" },
    }[p.estadoMes];
    if (p.estadoMes === "uso_propio") return null;
    if (p.estadoMes === "sin_contrato")
      return (
        <View style={[styles.estado, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.i as any} size={14} color={cfg.c} />
          <Text style={[styles.estadoTexto, { color: cfg.c }]}>
            {p.contrato && p.contrato.fecha_inicio > hoyISO() ? `Nuevo contrato empieza el ${formatoFecha(p.contrato.fecha_inicio)}` : "Desocupada: sin contrato vigente, no se espera arriendo."}
          </Text>
        </View>
      );
    return (
      <View style={[styles.estado, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.i as any} size={14} color={cfg.c} />
        <Text style={[styles.estadoTexto, { color: cfg.c }]}>
          Arriendo de {MESES[Number(p.fechaPagoMes.slice(5, 7)) - 1]}: {cfg.t}
        </Text>
      </View>
    );
  }

  function bannerIpc(p: PropiedadConDetalle) {
    const v = p.arriendo;
    const out: React.ReactNode[] = [];
    v.ajustes
      .filter((x) => x.pendiente)
      .forEach((x) =>
        out.push(
          <View key={`f${x.fecha}`} style={styles.ipcPide}>
            <Text style={styles.ipcPideTxt}>
              El contrato se renovó el {formatoFecha(x.fecha)}. Escribe el IPC de {x.anioIpc} para subir el arriendo desde esa fecha:
            </Text>
            <FilaIpc anio={x.anioIpc} valor={ipc[x.anioIpc]} guardar={guardarIpc} />
          </View>
        )
      );
    const prox = v.proximoIpc;
    if (prox && prox.falta && diasEntre(hoyISO(), prox.fecha) <= 45 && !v.ipcFaltante.includes(prox.anioIpc))
      out.push(
        <View key="prox" style={styles.ipcPide}>
          <Text style={styles.ipcPideTxt}>
            El contrato vence el {formatoFecha(prox.fecha)} y el arriendo sube con el IPC de {prox.anioIpc}. Escríbelo cuando el DANE lo publique (enero):
          </Text>
          <FilaIpc anio={prox.anioIpc} valor={ipc[prox.anioIpc]} guardar={guardarIpc} />
        </View>
      );
    return out;
  }

  function renderPropiedad(p: PropiedadConDetalle) {
    const abiertaP = abierta === p.id;
    const r = p.rendimiento12m;
    const c = p.contrato;
    const vigente = c && c.fecha_inicio <= hoyISO();
    return (
      <Card>
        <TouchableOpacity onPress={() => setAbierta(abiertaP ? null : p.id)} activeOpacity={0.85}>
          <View style={styles.rowStart}>
            <View style={styles.iconoCircle}>
              <Ionicons name={p.genera_ingresos ? "business" : "home"} size={17} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.h3}>{p.nombre}</Text>
              {!p.genera_ingresos && <Text style={typography.caption}>Uso propio · suma al patrimonio</Text>}
              {p.genera_ingresos && c?.arrendatario && <Text style={typography.caption}>Arrendatario: {c.arrendatario}</Text>}
              {p.genera_ingresos && !c && <Text style={typography.caption}>Desocupada</Text>}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              {p.genera_ingresos && vigente ? (
                <>
                  <Text style={styles.valor}>{pesos(p.arriendo.valor)}</Text>
                  <Text style={typography.caption}>al mes · día {c!.dia_pago}</Text>
                </>
              ) : p.valor_comercial ? (
                <>
                  <Text style={styles.valor}>{pesos(Number(p.valor_comercial))}</Text>
                  <Text style={typography.caption}>valor comercial</Text>
                </>
              ) : null}
            </View>
          </View>

          {renderEstado(p)}

          {c && (
            <Text style={styles.ipcTexto}>
              Contrato desde {formatoFecha(c.fecha_inicio)} por {c.duracion_meses} meses
              {p.arriendo.proximoAjuste ? ` · vence/renueva el ${formatoFecha(p.arriendo.proximoAjuste)}` : ""}
              {c.aplica_ipc ? "" : " · sin aumento por IPC"}
            </Text>
          )}
          {p.arriendo.ultimoAjuste && (
            <Text style={styles.ipcTexto}>
              Último aumento: {p.arriendo.ultimoAjuste.ipc.toLocaleString("es-CO")}% (IPC {p.arriendo.ultimoAjuste.anioIpc}) el {formatoFecha(p.arriendo.ultimoAjuste.fecha)} · canon inicial{" "}
              {pesos(c?.canon_inicial ?? 0)}
            </Text>
          )}

          {p.creditos.map((cr) => (
            <View key={cr.id} style={styles.creditoFila}>
              <Ionicons name="card" size={13} color={colors.primary} />
              <Text style={styles.creditoTexto}>
                {cr.nombre} ({Math.round(cr.porcentaje * 100) / 100}%)
                {cr.proximaCuotaValor !== null
                  ? `: cuota #${cr.proximaCuotaNumero} ${pesos(cr.proximaCuotaValor)}${cr.porcentaje < 100 ? ` (le toca ${pesos((cr.proximaCuotaValor * cr.porcentaje) / 100)})` : ""} vence ${formatoFecha(cr.proximaCuotaFecha!)}`
                  : ": sin cuotas pendientes"}
              </Text>
            </View>
          ))}

          {p.genera_ingresos ? (
            <View style={styles.rendFila}>
              <Mini t="Arriendos 12m" v={pesos(r.arriendos)} />
              <Mini t="Gastos" v={`−${pesos(r.gastos)}`} />
              <Mini t="Cuotas" v={`−${pesos(r.cuotas)}`} />
              <Mini t="Rendimiento" v={`${r.neto < 0 ? "−" : ""}${pesos(Math.abs(r.neto))}`} fuerte />
            </View>
          ) : (
            <View style={styles.rendFila}>
              <Mini t="Gastos 12m" v={pesos(r.gastos)} />
              <Mini t="Cuotas (su parte)" v={pesos(r.cuotas)} />
              <Mini t="Costo 12m" v={pesos(r.gastos + r.cuotas)} fuerte />
            </View>
          )}
          {p.rentabilidadAnual !== null && (
            <Text style={styles.ipcTexto}>
              Rentabilidad últimos 12 meses: {(p.rentabilidadAnual * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })}% sobre un valor de {pesos(Number(p.valor_comercial))}
            </Text>
          )}
          <Text style={styles.hint}>{abiertaP ? "Ocultar detalle ▲" : "Ver detalle ▼"}</Text>
        </TouchableOpacity>
        {bannerIpc(p)}

        <View style={styles.acciones}>
          {p.genera_ingresos && (c || p.arriendos.length > 0) && (
            <TouchableOpacity style={styles.accion} onPress={() => abrirArriendo(p)}>
              <Ionicons name="cash" size={15} color={colors.primary} />
              <Text style={styles.accionTexto}>Registrar arriendo</Text>
            </TouchableOpacity>
          )}
          {p.genera_ingresos && c && (
            <TouchableOpacity
              style={styles.accion}
              onPress={() => {
                setFechaFin(hoyISO());
                setMotivoFin("");
                setTerminar({ prop: p, contrato: c });
              }}
            >
              <Ionicons name="exit" size={15} color={colors.danger} />
              <Text style={[styles.accionTexto, { color: colors.danger }]}>Se fue el arrendatario</Text>
            </TouchableOpacity>
          )}
          {p.genera_ingresos && !c && (
            <TouchableOpacity style={styles.accion} onPress={() => abrirContrato(p, null)}>
              <Ionicons name="document-text" size={15} color={colors.primary} />
              <Text style={styles.accionTexto}>Nuevo contrato</Text>
            </TouchableOpacity>
          )}
          {p.genera_ingresos && c && (
            <TouchableOpacity style={styles.accion} onPress={() => abrirContrato(p, c)}>
              <Ionicons name="document-text" size={15} color={colors.primary} />
              <Text style={styles.accionTexto}>Corregir contrato</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.accion} onPress={() => abrirEdicion(p)}>
            <Ionicons name="create" size={15} color={colors.primary} />
            <Text style={styles.accionTexto}>Editar</Text>
          </TouchableOpacity>
          {!p.genera_ingresos && (
            <TouchableOpacity
              style={styles.accion}
              onPress={() =>
                Alert.alert("Mover a Vehículos", `¿${p.nombre} es un vehículo? Se pasa a Vehículos (uso propio, con su valor comercial) junto con sus gastos y créditos, y se quita de Propiedades.`, [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Mover",
                    onPress: () =>
                      moverAVehiculo(p)
                        .then(() => Alert.alert("Listo", `${p.nombre} ahora está en Vehículos.`))
                        .catch((e) => Alert.alert("Error", e.message)),
                  },
                ])
              }
            >
              <Ionicons name="car" size={15} color={colors.primary} />
              <Text style={styles.accionTexto}>Es un vehículo</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.accion}
            onPress={() =>
              Alert.alert("Eliminar propiedad", `¿Eliminar ${p.nombre}, sus contratos y arriendos registrados? Los gastos y créditos no se borran, solo se desvinculan.`, [
                { text: "Cancelar", style: "cancel" },
                { text: "Eliminar", style: "destructive", onPress: () => eliminarPropiedad(p.id).catch((e) => Alert.alert("Error", e.message)) },
              ])
            }
          >
            <Ionicons name="trash" size={15} color={colors.danger} />
          </TouchableOpacity>
        </View>

        {abiertaP && (
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.label}>
              {p.genera_ingresos ? "Rendimiento" : "Costo"} de este año ({p.rendimientoAnio.desde.slice(0, 4)})
            </Text>
            {p.genera_ingresos && <Fila t="Arriendos recibidos" v={p.rendimientoAnio.arriendos} />}
            <Fila t="Gastos de la propiedad" v={-p.rendimientoAnio.gastos} />
            <Fila t="Pagos a créditos (su porcentaje)" v={-p.rendimientoAnio.cuotas} />
            <Fila t={p.genera_ingresos ? "Rendimiento neto" : "Costo total"} v={p.rendimientoAnio.neto} fuerte />
            <Text style={styles.ayuda}>Los gastos se asocian a la propiedad desde Gastos. Los créditos y su porcentaje, desde Deudas.</Text>

            {p.contratos.length > 0 && (
              <>
                <Text style={[styles.label, { marginTop: spacing.sm }]}>Contratos</Text>
                {p.contratos.map((k) => (
                  <TouchableOpacity
                    key={k.id ?? "viejo"}
                    style={styles.arriendoFila}
                    onPress={() =>
                      k.id &&
                      Alert.alert("Contrato", `${k.arrendatario ?? "Sin nombre"} · desde ${formatoFecha(k.fecha_inicio)}`, [
                        { text: "Cerrar", style: "cancel" },
                        { text: "Corregir", onPress: () => abrirContrato(p, k) },
                        { text: "Borrar", style: "destructive", onPress: () => eliminarContrato(k).catch((e) => Alert.alert("Error", e.message)) },
                      ])
                    }
                  >
                    <Ionicons name={k.fecha_fin ? "document-outline" : "document-text"} size={14} color={k.fecha_fin ? colors.textMuted : colors.primary} />
                    <Text style={[styles.listaTexto, { flex: 1 }]}>
                      {k.arrendatario ?? "Sin nombre"} · {formatoFecha(k.fecha_inicio)} → {k.fecha_fin ? formatoFecha(k.fecha_fin) : "vigente"} · canon inicial {pesos(k.canon_inicial)}
                      {k.motivo_fin ? ` · ${k.motivo_fin}` : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {p.gastosRecientes.length > 0 && (
              <>
                <Text style={[styles.label, { marginTop: spacing.sm }]}>Últimos gastos</Text>
                {p.gastosRecientes.map((g) => (
                  <Text key={g.id} style={styles.listaTexto}>
                    {formatoFecha(g.fecha)} · {g.item} · {pesos(g.valor)}
                  </Text>
                ))}
              </>
            )}

            {p.genera_ingresos && (
              <>
                <Text style={[styles.label, { marginTop: spacing.sm }]}>Arriendos recibidos</Text>
                {p.arriendos.length === 0 && <Text style={styles.listaTexto}>Todavía no hay arriendos registrados.</Text>}
                {p.arriendos.slice(0, 12).map((a) => (
                  <TouchableOpacity key={a.id} style={styles.arriendoFila} onPress={() => confirmarBorrarArriendo(a)}>
                    <Text style={[styles.listaTexto, { flex: 1 }]}>
                      {nombreMes(a.mes)} · {pesos(Number(a.monto))} · recibido {formatoFecha(a.fecha)}
                      {a.destino_persona ? ` · para ${a.destino_persona}` : ""}
                    </Text>
                    <Ionicons name="close-circle-outline" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}
      </Card>
    );
  }

  function camposContrato() {
    return (
      <>
        <TextInput style={styles.input} placeholder="Arrendatario" placeholderTextColor={colors.textMuted} value={formContrato.arrendatario} onChangeText={cambiarC("arrendatario")} />
        <Text style={styles.label}>Fecha de inicio del contrato</Text>
        <FechaInput value={formContrato.fechaInicio} onChange={cambiarC("fechaInicio")} />
        <Text style={styles.label}>Valor del arriendo al iniciar el contrato</Text>
        <TextInput style={styles.input} placeholder="Ej. 1.500.000" placeholderTextColor={colors.textMuted} value={formContrato.canon} onChangeText={cambiarC("canon")} keyboardType="numeric" />
        <Text style={styles.label}>Duración del contrato (meses) — en cada vencimiento sube con el IPC</Text>
        <TextInput style={styles.input} placeholder="12" placeholderTextColor={colors.textMuted} value={formContrato.duracion} onChangeText={cambiarC("duracion")} keyboardType="numeric" />
        <View style={styles.switchFila}>
          <Text style={[typography.body, { flex: 1 }]}>Subir con el IPC del año anterior en cada vencimiento</Text>
          <Switch value={formContrato.aplicaIpc} onValueChange={cambiarC("aplicaIpc")} trackColor={{ true: colors.primary }} />
        </View>
        <Text style={styles.label}>Día del mes en que se paga el arriendo</Text>
        <TextInput style={styles.input} placeholder="Ej. 5" placeholderTextColor={colors.textMuted} value={formContrato.diaPago} onChangeText={cambiarC("diaPago")} keyboardType="numeric" />
      </>
    );
  }

  const deudaElegida = destino.startsWith("c:") ? deudas.find((d) => d.id === destino.slice(2)) : null;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Propiedades" subtitle="Arriendos, uso propio y rendimiento" actionLabel="Nueva" onAction={abrirNueva} actionActive={mostrarForm && !editandoId} />

      {mostrarForm ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={[typography.h3, { marginBottom: spacing.sm }]}>{editandoId ? "Editar propiedad" : "Nueva propiedad"}</Text>
            <TextInput style={styles.input} placeholder="Nombre (ej. Apto Torre 4)" placeholderTextColor={colors.textMuted} value={form.nombre} onChangeText={cambiar("nombre")} />
            <TextInput style={styles.input} placeholder="Dirección" placeholderTextColor={colors.textMuted} value={form.direccion} onChangeText={cambiar("direccion")} />
            <Text style={styles.label}>Valor comercial de la propiedad (suma al patrimonio)</Text>
            <TextInput style={styles.input} placeholder="Ej. 350.000.000" placeholderTextColor={colors.textMuted} value={form.valorComercial} onChangeText={cambiar("valorComercial")} keyboardType="numeric" />

            <View style={styles.switchFila}>
              <Text style={[typography.body, { flex: 1 }]}>Se arrienda (genera ingresos). Apágalo si es de uso propio: solo suma a patrimonio y gastos.</Text>
              <Switch value={form.generaIngresos} onValueChange={cambiar("generaIngresos")} trackColor={{ true: colors.primary }} />
            </View>

            {form.generaIngresos && !editandoId && (
              <>
                <Text style={[typography.h3, { marginVertical: spacing.sm }]}>Contrato de arriendo (opcional)</Text>
                {camposContrato()}
              </>
            )}
            {form.generaIngresos && editandoId && <Text style={styles.ayuda}>El contrato se maneja desde la tarjeta: «Corregir contrato», «Se fue el arrendatario» o «Nuevo contrato».</Text>}

            <Text style={styles.ayuda}>Para asociar un crédito (o un porcentaje de él) a esta propiedad, edítalo en Deudas.</Text>
            <PrimaryButton title={editandoId ? "Guardar cambios" : "Crear propiedad"} onPress={guardar} loading={guardando} />
            <PrimaryButton title="Cancelar" variant="outline" onPress={() => setMostrarForm(false)} style={{ marginTop: spacing.sm }} />
          </Card>
        </ScrollView>
      ) : cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando propiedades: {error}</Text>
      ) : (
        <FlatList
          data={propiedades}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay propiedades registradas.</Text>}
          renderItem={({ item }) => renderPropiedad(item)}
          ListFooterComponent={
            <Card>
              <TouchableOpacity onPress={() => setVerIpc(!verIpc)} style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.h3}>IPC anual (para subir los arriendos)</Text>
                  <Text style={typography.caption}>
                    {faltantes.length ? `Falta registrar: ${faltantes.join(", ")}` : "Variación anual del IPC que publica el DANE en enero."}
                  </Text>
                </View>
                <Ionicons name={verIpc ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
              </TouchableOpacity>
              {verIpc && aniosIpc.map((anio) => <FilaIpc key={anio} anio={anio} valor={ipc[anio]} guardar={guardarIpc} />)}
            </Card>
          }
        />
      )}

      <Modal visible={!!prop} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <ScrollView style={styles.modalCaja} contentContainerStyle={{ paddingBottom: spacing.md }} keyboardShouldPersistTaps="handled">
            <Text style={typography.h2}>Arriendo recibido</Text>
            <Text style={typography.caption}>
              {prop?.nombre} · vigente {pesos(prop?.arriendo.valor ?? 0)}
              {prop && prop.recibidoMes > 0 ? ` · ya recibido este mes ${pesos(prop.recibidoMes)}` : ""}
            </Text>

            <Text style={[styles.label, { marginTop: spacing.md }]}>¿De qué mes es?</Text>
            <View style={styles.chipsRow}>
              {[sumarMeses(hoyISO(), -1).slice(0, 7), hoyISO().slice(0, 7), sumarMeses(hoyISO(), 1).slice(0, 7)].map((m) => (
                <TouchableOpacity key={m} style={[styles.chip, mes === m && styles.chipActivo]} onPress={() => setMes(m)}>
                  <Text style={[styles.chipText, mes === m && styles.chipTextActivo]}>{nombreMes(m)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Valor recibido</Text>
            <TextInput style={styles.input} value={monto} onChangeText={setMonto} keyboardType="numeric" placeholder="Valor recibido" placeholderTextColor={colors.textMuted} />
            <Text style={styles.label}>Fecha en que se recibió</Text>
            <FechaInput value={fecha} onChange={setFecha} max={hoyISO()} />

            <Text style={styles.label}>¿A dónde va este dinero?</Text>
            <View style={styles.chipsRow}>
              <TouchableOpacity style={[styles.chip, destino === "hogar" && styles.chipActivo]} onPress={() => elegirDestino("hogar")}>
                <Text style={[styles.chipText, destino === "hogar" && styles.chipTextActivo]}>Queda en el hogar</Text>
              </TouchableOpacity>
              {personas.map((n) => (
                <TouchableOpacity key={n} style={[styles.chip, destino === `p:${n}` && styles.chipActivo]} onPress={() => elegirDestino(`p:${n}`)}>
                  <Text style={[styles.chipText, destino === `p:${n}` && styles.chipTextActivo]}>Para {n}</Text>
                </TouchableOpacity>
              ))}
              {creditosConCuota(prop).map((d) => (
                <TouchableOpacity key={d.id} style={[styles.chip, destino === `c:${d.id}` && styles.chipActivo]} onPress={() => elegirDestino(`c:${d.id}`)}>
                  <Text style={[styles.chipText, destino === `c:${d.id}` && styles.chipTextActivo]}>Pagar {d.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {deudaElegida?.proximaCuota && (
              <View style={styles.destinoBox}>
                <Text style={styles.destinoInfo}>
                  Cuota #{deudaElegida.proximaCuota.numero_cuota} vence {formatoFecha(deudaElegida.proximaCuota.fecha_vencimiento)} · falta {pesos(deudaElegida.restanteProxima)}
                  {deudaElegida.entidad_pago ? ` · se paga en ${deudaElegida.entidad_pago}` : ""}
                  {deudaElegida.numero_cuenta ? ` (${deudaElegida.numero_cuenta})` : ""}
                </Text>
                <Text style={styles.label}>Valor que va al crédito</Text>
                <TextInput style={styles.input} value={valorCredito} onChangeText={setValorCredito} keyboardType="numeric" placeholder="Valor para la cuota" placeholderTextColor={colors.textMuted} />
                {aNumero(monto) > aNumero(valorCredito) && aNumero(valorCredito) > 0 && (
                  <Text style={styles.destinoInfo}>Quedan disponibles {pesos(aNumero(monto) - aNumero(valorCredito))}</Text>
                )}
              </View>
            )}
            {destino.startsWith("p:") && <Text style={styles.ayuda}>Queda registrado que este arriendo se le entregó a {destino.slice(2)}.</Text>}

            <PrimaryButton title="Guardar" onPress={guardarArriendo} loading={guardando} />
            <TouchableOpacity onPress={() => setProp(null)} style={{ marginTop: spacing.md }}>
              <Text style={{ textAlign: "center", color: colors.textSecondary }}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!contratoDe} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <ScrollView style={styles.modalCaja} contentContainerStyle={{ paddingBottom: spacing.md }} keyboardShouldPersistTaps="handled">
            <Text style={typography.h2}>{contratoDe?.contrato ? "Corregir contrato" : "Nuevo contrato"}</Text>
            <Text style={[typography.caption, { marginBottom: spacing.sm }]}>{contratoDe?.prop.nombre}</Text>
            {contratoDe && camposContrato()}
            <PrimaryButton title="Guardar contrato" onPress={guardarContratoModal} loading={guardando} />
            <TouchableOpacity onPress={() => setContratoDe(null)} style={{ marginTop: spacing.md }}>
              <Text style={{ textAlign: "center", color: colors.textSecondary }}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!terminar} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={typography.h2}>Terminar contrato</Text>
            <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
              {terminar?.prop.nombre} · {terminar?.contrato.arrendatario ?? "arrendatario"}. Desde esa fecha deja de esperarse el arriendo. Luego puedes crear un contrato nuevo.
            </Text>
            <Text style={styles.label}>¿Hasta qué fecha estuvo el arrendatario?</Text>
            <FechaInput value={fechaFin} onChange={setFechaFin} />
            <TextInput style={styles.input} placeholder="Motivo (opcional)" placeholderTextColor={colors.textMuted} value={motivoFin} onChangeText={setMotivoFin} />
            <PrimaryButton title="Confirmar salida" onPress={guardarTerminar} loading={guardando} />
            <TouchableOpacity onPress={() => setTerminar(null)} style={{ marginTop: spacing.md }}>
              <Text style={{ textAlign: "center", color: colors.textSecondary }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Mini({ t, v, fuerte }: { t: string; v: string; fuerte?: boolean }) {
  return (
    <View style={styles.mini}>
      <Text style={styles.miniT}>{t}</Text>
      <Text style={[styles.miniV, fuerte && { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
        {v}
      </Text>
    </View>
  );
}

function Fila({ t, v, fuerte }: { t: string; v: number; fuerte?: boolean }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={[styles.listaTexto, fuerte && { fontWeight: "800", color: colors.textPrimary }]}>{t}</Text>
      <Text style={[styles.listaTexto, { fontWeight: fuerte ? "800" : "600", color: colors.textPrimary }]}>
        {v < 0 ? "−" : ""}
        {pesos(Math.abs(v))}
      </Text>
    </View>
  );
}

function FilaIpc({ anio, valor, guardar }: { anio: number; valor?: number; guardar: (a: number, v: number) => Promise<void> }) {
  const [texto, setTexto] = useState(valor !== undefined ? String(valor).replace(".", ",") : "");
  const [ok, setOk] = useState(false);
  return (
    <View style={styles.ipcFila}>
      <Text style={[styles.listaTexto, { width: 60, fontWeight: "700", color: colors.textPrimary }]}>{anio}</Text>
      <TextInput
        style={[styles.input, { flex: 1, marginBottom: 0 }, valor === undefined && { borderWidth: 1, borderColor: colors.danger }]}
        value={texto}
        onChangeText={(t) => {
          setTexto(t);
          setOk(false);
        }}
        keyboardType="decimal-pad"
        placeholder="% (ej. 5,20)"
        placeholderTextColor={colors.textMuted}
      />
      <TouchableOpacity
        style={styles.ipcBoton}
        onPress={async () => {
          const v = aNumero(texto);
          if (!(v >= -50 && v <= 100)) return Alert.alert("Valor no válido", "Escribe el IPC en porcentaje, ej. 5,20");
          try {
            await guardar(anio, v);
            setOk(true);
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        }}
      >
        <Ionicons name={ok ? "checkmark-done" : "checkmark"} size={16} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  label: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 4 },
  ayuda: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6 },
  chipActivo: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  chipTextActivo: { color: colors.white },
  switchFila: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.sm },
  rowStart: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  iconoCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  valor: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  estado: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.sm },
  estadoTexto: { fontSize: 12, fontWeight: "700", flex: 1 },
  ipcTexto: { fontSize: 11, color: colors.textSecondary, marginTop: 6 },
  creditoFila: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 6 },
  creditoTexto: { fontSize: 12, color: colors.primary, flex: 1 },
  rendFila: { flexDirection: "row", gap: 6, marginTop: spacing.sm },
  mini: { flex: 1, backgroundColor: colors.background, borderRadius: radius.sm, padding: 6 },
  miniT: { fontSize: 10, color: colors.textMuted },
  miniV: { fontSize: 12, fontWeight: "800", color: colors.textPrimary },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
  acciones: { flexDirection: "row", gap: 8, marginTop: spacing.sm, flexWrap: "wrap" },
  accion: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.background },
  accionTexto: { fontSize: 13, fontWeight: "600", color: colors.primary },
  listaTexto: { fontSize: 12, color: colors.textSecondary, paddingVertical: 2 },
  arriendoFila: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 4 },
  destinoBox: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md },
  destinoInfo: { fontSize: 12, color: colors.primary, marginBottom: spacing.sm },
  ipcFila: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm },
  ipcPide: { backgroundColor: "#FCEFD9", borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.sm },
  ipcPideTxt: { fontSize: 12, color: colors.warning, fontWeight: "600" },
  ipcBoton: { backgroundColor: colors.primary, padding: 9, borderRadius: radius.sm },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.lg },
  modalCaja: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, maxHeight: "90%", flexGrow: 0 },
});
