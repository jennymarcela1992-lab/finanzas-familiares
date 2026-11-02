import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePatrimonioPersonal, ItemPatrimonio, TipoPatrimonio } from "../../hooks/usePersonales";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius, esOscuro } from "../../theme/theme";
import { aNumero } from "../../utils/numeros";
import { pesos } from "../../utils/amortizacion";
import { descargarXlsx } from "../../utils/xlsx";

const GRUPOS: { tipo: TipoPatrimonio; titulo: string; icono: any; vacio: string; categorias: string[]; etiquetaValor: string; etiquetaInicial: string }[] = [
  { tipo: "activo", titulo: "Activos y patrimonio", icono: "business", vacio: "Casa, apartamento, lote, vehículo, joyas...", categorias: ["Vivienda", "Lote", "Vehículo", "Arte o joyas", "Negocio propio", "Otro activo"], etiquetaValor: "Valor comercial hoy", etiquetaInicial: "Lo que costó (opcional)" },
  { tipo: "inversion", titulo: "Inversiones", icono: "trending-up", vacio: "CDT, fondos, acciones, cripto, participación en empresas...", categorias: ["CDT", "Fondo de inversión", "Acciones", "Cripto", "Participación en empresa", "Otra inversión"], etiquetaValor: "Valor actual", etiquetaInicial: "Lo que invertí" },
  { tipo: "ahorro", titulo: "Ahorros y efectivo", icono: "wallet", vacio: "Cuenta de ahorros, fondo de emergencia, pensión voluntaria...", categorias: ["Cuenta de ahorros", "Fondo de emergencia", "Pensión voluntaria", "Cesantías", "Efectivo", "Otro ahorro"], etiquetaValor: "Saldo actual", etiquetaInicial: "" },
  { tipo: "deuda", titulo: "Mis deudas", icono: "card", vacio: "Hipoteca, tarjeta, crédito de consumo, préstamos...", categorias: ["Hipoteca", "Tarjeta de crédito", "Crédito de consumo", "Crédito de vehículo", "Préstamo personal", "Otra deuda"], etiquetaValor: "Lo que debo hoy", etiquetaInicial: "Monto original (opcional)" },
];
const SERIE = esOscuro ? { activo: "#3987e5", inversion: "#199e70", ahorro: "#c98500", deuda: "#d95926" } : { activo: "#2a78d6", inversion: "#1baf7a", ahorro: "#eda100", deuda: "#eb6834" };

export default function PatrimonioPersonal() {
  const { items, cargando, error, faltaSql, guardar, borrar } = usePatrimonioPersonal();
  const [grupo, setGrupo] = useState<TipoPatrimonio | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [valor, setValor] = useState("");
  const [inicial, setInicial] = useState("");
  const [cuota, setCuota] = useState("");
  const [tasa, setTasa] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const total = (t: TipoPatrimonio) => items.filter((x) => x.tipo === t).reduce((s, x) => s + x.valor, 0);
  const activos = total("activo");
  const inversiones = total("inversion");
  const ahorros = total("ahorro");
  const deudas = total("deuda");
  const bienes = activos + inversiones + ahorros;
  const neto = bienes - deudas;
  const cuotas = items.filter((x) => x.tipo === "deuda").reduce((s, x) => s + (x.cuotaMensual ?? 0), 0);
  const invertido = items.filter((x) => x.tipo === "inversion").reduce((s, x) => s + (x.valorInicial ?? x.valor), 0);

  function abrir(t: TipoPatrimonio, it?: ItemPatrimonio) {
    setGrupo(t);
    setEditando(it?.id ?? null);
    setNombre(it?.nombre ?? "");
    setCategoria(it?.categoria ?? "");
    setValor(it ? Math.round(it.valor).toLocaleString("es-CO") : "");
    setInicial(it?.valorInicial != null ? Math.round(it.valorInicial).toLocaleString("es-CO") : "");
    setCuota(it?.cuotaMensual != null ? Math.round(it.cuotaMensual).toLocaleString("es-CO") : "");
    setTasa(it?.tasaAnual != null ? String(it.tasaAnual).replace(".", ",") : "");
    setNota(it?.nota ?? "");
  }

  async function onGuardar() {
    if (!grupo) return;
    if (!nombre.trim()) return Alert.alert("Falta el nombre", "Escribe cómo se llama.");
    const v = aNumero(valor);
    if (!(v >= 0) || valor.trim() === "") return Alert.alert("Falta el valor", "Escribe el valor actual.");
    setGuardando(true);
    try {
      await guardar(
        {
          tipo: grupo,
          nombre,
          categoria,
          valor: v,
          valorInicial: inicial.trim() ? aNumero(inicial) : null,
          cuotaMensual: grupo === "deuda" && cuota.trim() ? aNumero(cuota) : null,
          tasaAnual: tasa.trim() ? Number(tasa.replace(",", ".")) || null : null,
          nota,
        },
        editando
      );
      setGrupo(null);
      setEditando(null);
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message ?? "Error");
    } finally {
      setGuardando(false);
    }
  }

  function confirmarBorrar(it: ItemPatrimonio) {
    Alert.alert("Borrar", `¿Borrar «${it.nombre}»?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: () => borrar(it.id).catch((e) => Alert.alert("Error", e.message)) },
    ]);
  }

  function exportar() {
    const H = (t: string) => ({ v: t, estilo: "encabezado" as const });
    const D = (n: number) => ({ v: Math.round(n), estilo: "dinero" as const });
    const ok = descargarXlsx("Mi_patrimonio.xlsx", [
      {
        nombre: "Mi patrimonio",
        anchos: [24, 34, 22, 18, 18, 18, 12],
        filas: [
          [{ v: "Mi patrimonio", estilo: "titulo" }],
          [],
          [H("Tipo"), H("Nombre"), H("Categoría"), H("Valor actual"), H("Invertido / original"), H("Cuota mensual"), H("Tasa anual %")],
          ...GRUPOS.flatMap((g) => items.filter((x) => x.tipo === g.tipo).map((x) => [g.titulo, x.nombre, x.categoria ?? "", D(x.valor), x.valorInicial != null ? D(x.valorInicial) : "", x.cuotaMensual != null ? D(x.cuotaMensual) : "", x.tasaAnual ?? ""])),
          [],
          [{ v: "Activos", estilo: "negrita" }, "", "", { v: activos, estilo: "dineroNegrita" }],
          [{ v: "Inversiones", estilo: "negrita" }, "", "", { v: inversiones, estilo: "dineroNegrita" }],
          [{ v: "Ahorros", estilo: "negrita" }, "", "", { v: ahorros, estilo: "dineroNegrita" }],
          [{ v: "Deudas", estilo: "negrita" }, "", "", { v: -deudas, estilo: "dineroNegrita" }],
          [{ v: "PATRIMONIO NETO", estilo: "negrita" }, "", "", { v: neto, estilo: "dineroNegrita" }],
        ],
      },
    ]);
    if (!ok) Alert.alert("Solo en el navegador", "La descarga del Excel funciona desde la versión web de la app.");
  }

  if (faltaSql)
    return (
      <Card>
        <Text style={typography.h3}>Falta un paso en Supabase</Text>
        <Text style={typography.body}>Corre el archivo supabase_finanzas_personales.sql en Supabase (SQL Editor) y vuelve a abrir esta pantalla.</Text>
      </Card>
    );
  if (cargando && !items.length) return <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />;
  if (error) return <Text style={{ color: colors.danger, padding: spacing.lg }}>Error: {error}</Text>;

  const def = GRUPOS.find((g) => g.tipo === grupo);
  const composicion = [
    { t: "Activos", v: activos, c: SERIE.activo },
    { t: "Inversiones", v: inversiones, c: SERIE.inversion },
    { t: "Ahorros", v: ahorros, c: SERIE.ahorro },
  ].filter((x) => x.v > 0);

  return (
    <View style={{ gap: spacing.md }}>
      <Card style={{ backgroundColor: colors.hero }}>
        <Text style={styles.heroEtiqueta}>Mi patrimonio neto</Text>
        <Text style={[styles.heroValor, neto < 0 && { color: "#FFB4A8" }]}>{pesos(neto)}</Text>
        <Text style={styles.heroDetalle}>
          Tengo {pesos(bienes)} · debo {pesos(deudas)}
        </Text>
        <View style={styles.privado}>
          <Ionicons name="lock-closed" size={12} color={colors.white} />
          <Text style={styles.privadoTexto}>Privado: no aparece en el patrimonio del hogar</Text>
        </View>
      </Card>

      <View style={styles.kpis}>
        <Kpi titulo="Activos" valor={pesos(activos)} />
        <Kpi titulo="Inversiones" valor={pesos(inversiones)} nota={invertido > 0 && inversiones > 0 ? `${inversiones >= invertido ? "+" : ""}${Math.round((inversiones / invertido - 1) * 100)}% sobre lo invertido` : undefined} />
        <Kpi titulo="Ahorros" valor={pesos(ahorros)} />
        <Kpi titulo="Deudas" valor={pesos(deudas)} nota={cuotas > 0 ? `${pesos(cuotas)} en cuotas al mes` : undefined} color={deudas > 0 ? colors.danger : undefined} />
      </View>

      {composicion.length > 0 && (
        <Card>
          <Text style={typography.h3}>De qué está hecho lo que tengo</Text>
          <View style={styles.apilada}>
            {composicion.map((x, k) => (
              <View key={x.t} style={{ flex: x.v, backgroundColor: x.c, marginRight: k < composicion.length - 1 ? 2 : 0, borderRadius: 3 }} />
            ))}
          </View>
          {composicion.map((x) => (
            <View key={x.t} style={styles.leyendaFila}>
              <View style={[styles.swatch, { backgroundColor: x.c }]} />
              <Text style={styles.leyendaTexto}>{x.t}</Text>
              <Text style={styles.leyendaValor}>{pesos(x.v)}</Text>
              <Text style={styles.leyendaPct}>{Math.round((x.v / bienes) * 100)}%</Text>
            </View>
          ))}
          {deudas > 0 && bienes > 0 && <Text style={styles.ayuda}>Las deudas equivalen al {Math.round((deudas / bienes) * 100)}% de lo que tengo.</Text>}
        </Card>
      )}

      {grupo && def && (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={typography.h3}>
              {editando ? "Editar" : "Agregar"} · {def.titulo}
            </Text>
            <TouchableOpacity onPress={() => setGrupo(null)} accessibilityLabel="Cerrar sin guardar" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={28} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <TextInput style={styles.input} placeholder="Nombre (ej. Apartamento torre 4)" placeholderTextColor={colors.textMuted} value={nombre} onChangeText={setNombre} />
          <View style={styles.chipsRow}>
            {def.categorias.map((c) => (
              <TouchableOpacity key={c} style={[styles.chip, categoria === c && styles.chipActivo]} onPress={() => setCategoria(categoria === c ? "" : c)}>
                <Text style={[styles.chipText, categoria === c && styles.chipTextActivo]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>{def.etiquetaValor}</Text>
          <TextInput style={styles.input} placeholder="Ej. 350.000.000" placeholderTextColor={colors.textMuted} value={valor} onChangeText={setValor} keyboardType="numeric" />
          {!!def.etiquetaInicial && (
            <>
              <Text style={styles.label}>{def.etiquetaInicial}</Text>
              <TextInput style={styles.input} placeholder="Ej. 280.000.000" placeholderTextColor={colors.textMuted} value={inicial} onChangeText={setInicial} keyboardType="numeric" />
            </>
          )}
          {grupo === "deuda" && (
            <>
              <Text style={styles.label}>Cuota mensual (opcional)</Text>
              <TextInput style={styles.input} placeholder="Ej. 1.500.000" placeholderTextColor={colors.textMuted} value={cuota} onChangeText={setCuota} keyboardType="numeric" />
            </>
          )}
          {(grupo === "deuda" || grupo === "inversion") && (
            <>
              <Text style={styles.label}>{grupo === "deuda" ? "Tasa de interés anual % (opcional)" : "Rentabilidad anual esperada % (opcional)"}</Text>
              <TextInput style={styles.input} placeholder="Ej. 12,5" placeholderTextColor={colors.textMuted} value={tasa} onChangeText={setTasa} keyboardType="numeric" />
            </>
          )}
          <TextInput style={styles.input} placeholder="Nota (opcional)" placeholderTextColor={colors.textMuted} value={nota} onChangeText={setNota} />
          <PrimaryButton title={editando ? "Guardar cambios" : "Guardar"} onPress={onGuardar} loading={guardando} />
          <TouchableOpacity onPress={() => setGrupo(null)} style={{ marginTop: spacing.sm, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }}>
            <Text style={{ textAlign: "center", color: colors.textPrimary, fontWeight: "600" }}>Salir sin guardar</Text>
          </TouchableOpacity>
        </Card>
      )}

      {GRUPOS.map((g) => {
        const lista = items.filter((x) => x.tipo === g.tipo);
        return (
          <Card key={g.tipo}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name={g.icono} size={18} color={colors.primary} />
              <Text style={[typography.h3, { flex: 1 }]}>{g.titulo}</Text>
              <Text style={styles.filaValor}>{pesos(total(g.tipo))}</Text>
            </View>
            {lista.length === 0 && <Text style={[typography.caption, { marginTop: 6 }]}>{g.vacio}</Text>}
            {lista.map((it) => {
              const rend = it.tipo === "inversion" && it.valorInicial && it.valorInicial > 0 ? it.valor / it.valorInicial - 1 : null;
              return (
                <View key={it.id} style={styles.item}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => abrir(g.tipo, it)} activeOpacity={0.6} accessibilityLabel={`Editar ${it.nombre}`}>
                    <Text style={styles.itemTitulo}>{it.nombre}</Text>
                    <Text style={typography.caption}>
                      {[
                        it.categoria,
                        it.tipo === "deuda" && it.cuotaMensual ? `cuota ${pesos(it.cuotaMensual)}/mes` : null,
                        it.tipo === "deuda" && it.valorInicial ? `original ${pesos(it.valorInicial)}` : null,
                        it.tipo === "inversion" && it.valorInicial ? `invertí ${pesos(it.valorInicial)}` : null,
                        it.tipo === "activo" && it.valorInicial ? `costó ${pesos(it.valorInicial)}` : null,
                        it.tasaAnual != null ? `${String(it.tasaAnual).replace(".", ",")}% anual` : null,
                        it.nota,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </TouchableOpacity>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.filaValor}>{pesos(it.valor)}</Text>
                    {rend !== null && <Text style={[typography.caption, { color: rend >= 0 ? colors.success : colors.danger, fontWeight: "700" }]}>{rend >= 0 ? "▲" : "▼"} {Math.abs(Math.round(rend * 100))}%</Text>}
                  </View>
                  <TouchableOpacity onPress={() => confirmarBorrar(it)} accessibilityLabel={`Borrar ${it.nombre}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              );
            })}
            <TouchableOpacity style={styles.agregar} onPress={() => abrir(g.tipo)}>
              <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
              <Text style={styles.agregarTexto}>Agregar</Text>
            </TouchableOpacity>
          </Card>
        );
      })}

      {items.length > 0 && (
        <TouchableOpacity style={styles.botonBorde} onPress={exportar}>
          <Ionicons name="download-outline" size={16} color={colors.primary} />
          <Text style={styles.botonBordeTexto}>Descargar mi patrimonio en Excel</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.ayuda}>Actualiza los valores cuando cambien (el saldo de la deuda, el valor de la inversión). Las deudas se restan del patrimonio neto.</Text>
    </View>
  );
}

function Kpi({ titulo, valor, nota, color }: { titulo: string; valor: string; nota?: string; color?: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiTitulo}>{titulo}</Text>
      <Text style={[styles.kpiValor, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
      {!!nota && <Text style={styles.kpiNota}>{nota}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  heroEtiqueta: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  heroValor: { color: colors.white, fontSize: 30, fontWeight: "800", marginTop: 2 },
  heroDetalle: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 4 },
  privado: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 10, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  privadoTexto: { color: colors.white, fontSize: 11, fontWeight: "600" },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  kpi: { flexGrow: 1, flexBasis: "45%", minWidth: 150, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  kpiTitulo: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  kpiValor: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, marginTop: 2 },
  kpiNota: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  apilada: { flexDirection: "row", height: 18, marginVertical: spacing.sm },
  leyendaFila: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  leyendaTexto: { flex: 1, fontSize: 13, color: colors.textPrimary },
  leyendaValor: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  leyendaPct: { width: 40, textAlign: "right", fontSize: 12, color: colors.textSecondary },
  ayuda: { fontSize: 11, color: colors.textMuted, marginTop: 6, marginBottom: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 },
  itemTitulo: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  filaValor: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  agregar: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  agregarTexto: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipActivo: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontSize: 13 },
  chipTextActivo: { color: colors.white, fontWeight: "700" },
  label: { fontSize: 12, color: colors.textSecondary, fontWeight: "600", marginTop: 4 },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  botonBorde: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 12 },
  botonBordeTexto: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
