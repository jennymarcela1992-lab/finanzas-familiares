// Reporte de gastos de Juanes para su papá: toma de los gastos de la familia (y de los propios) los que dicen
// «ruta», «onces» o «Juanes» (o tienen el rubro Juanes), más líneas manuales, y calcula la parte que le corresponde.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../config/supabase";
import { Platform } from "react-native";
import { moverMes } from "./useDashboard";

export interface LineaReporte {
  clave: string; // id único
  fecha: string;
  concepto: string; // agrupador: «Ruta escolar», «Onces» o el nombre del gasto
  detalle: string;
  valor: number;
  origen: "familia" | "personal" | "manual";
  idManual?: string;
  comprobante?: string; // foto que ya se subió al registrar el gasto de la familia (bucket «comprobantes»)
}

export interface Soporte {
  id: string;
  clave: string;
  nombre: string;
  ruta: string;
  bucket: "soportes_juanes" | "comprobantes";
  tipo: string;
  propio: boolean; // true = se subió aquí y se puede quitar
}

const BUCKET_SOPORTES = "soportes_juanes";
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf" };
export const extensionDe = (nombre: string, tipo?: string) => EXT[tipo ?? ""] ?? (nombre.includes(".") ? nombre.split(".").pop()!.toLowerCase() : "jpg");

function rutaComprobante(v: string): string {
  if (v.startsWith("http")) {
    const i = v.indexOf("/comprobantes/");
    return i >= 0 ? decodeURIComponent(v.slice(i + 14).split("?")[0]) : v;
  }
  return v;
}

// En el navegador reduce las fotos (máx. 1600 px, JPG) para que suban rápido; los PDF se suben tal cual.
async function reducirFoto(file: File): Promise<Blob> {
  if (Platform.OS !== "web" || typeof document === "undefined" || !file.type.startsWith("image/") || file.type === "image/heic" || file.type === "image/heif") return file;
  try {
    const url = URL.createObjectURL(file);
    const img: HTMLImageElement = await new Promise((ok, falla) => {
      const i = new (window as any).Image();
      i.onload = () => ok(i);
      i.onerror = falla;
      i.src = url;
    });
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const r: Blob | null = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
    return r && r.size < file.size ? r : file;
  } catch {
    return file;
  }
}

export interface ConfigReporte {
  cuota: number;
  pago: number;
  saldoAnterior: number;
  porcentaje: number;
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** ¿Este gasto es de los que van en el reporte? Devuelve el concepto agrupador o null. */
export function conceptoJuanes(item: string, nota: string | null | undefined, rubro: string | null | undefined, categoria?: string | null): string | null {
  const t = sinTildes(`${item} ${nota ?? ""}`);
  if (/\bruta(s)?\b/.test(t)) return "Ruta escolar";
  if (/\bonces?\b/.test(t)) return "Onces";
  const esJuanes = /\bjuanes\b/.test(t) || sinTildes(rubro ?? "") === "juanes" || sinTildes(categoria ?? "") === "juanes";
  return esJuanes ? item.trim() || "Gasto de Juanes" : null;
}

export function useReporteJuanes(mes: string) {
  const [lineas, setLineas] = useState<LineaReporte[]>([]);
  const [config, setConfig] = useState<ConfigReporte>({ cuota: 0, pago: 0, saldoAnterior: 0, porcentaje: 50 });
  const [soportes, setSoportes] = useState<Soporte[]>([]);
  const [libroSubido, setLibroSubido] = useState<boolean | null>(null); // ¿ya hay un libro base guardado?
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [faltaSql, setFaltaSql] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) {
      setError("Tu sesión expiró. Vuelve a iniciar sesión.");
      setCargando(false);
      return;
    }
    const desde = `${mes}-01`;
    const hasta = `${moverMes(mes, 1)}-01`;
    const [rG, rP, rL, rC, rS] = await Promise.all([
      supabase.from("gastos").select("id, fecha, item, nota, rubro, valor, valor_cop, borrado, usuario_pago_nombre, comprobante_url").gte("fecha", desde).lt("fecha", hasta),
      supabase.from("movimientos_personales").select("*").eq("usuario_id", uid).eq("tipo", "gasto").gte("fecha", desde).lt("fecha", hasta),
      supabase.from("reporte_juanes_lineas").select("*").eq("usuario_id", uid).eq("mes", mes).order("creado_en"),
      supabase.from("reporte_juanes_mes").select("*").eq("usuario_id", uid).eq("mes", mes).maybeSingle(),
      supabase.from("reporte_juanes_soportes").select("*").eq("usuario_id", uid).eq("mes", mes).order("creado_en"),
    ]);
    if (rL.error && /relation|does not exist|schema cache/i.test(rL.error.message)) {
      setFaltaSql(true);
      setCargando(false);
      return;
    }
    setFaltaSql(false);
    const out: LineaReporte[] = [];
    ((rG.error ? [] : rG.data) ?? []).forEach((g: any) => {
      if (g.borrado) return;
      const c = conceptoJuanes(g.item ?? "", g.nota, g.rubro);
      if (c) out.push({ clave: `g-${g.id}`, fecha: String(g.fecha).slice(0, 10), concepto: c, detalle: `${g.item}${g.usuario_pago_nombre ? ` · pagó ${g.usuario_pago_nombre}` : ""}`, valor: Number(g.valor_cop ?? g.valor), origen: "familia", comprobante: g.comprobante_url ? rutaComprobante(g.comprobante_url) : undefined });
    });
    ((rP.error ? [] : rP.data) ?? []).forEach((m: any) => {
      const c = conceptoJuanes(m.concepto ?? "", m.nota, null, m.categoria);
      if (c) out.push({ clave: `p-${m.id}`, fecha: String(m.fecha).slice(0, 10), concepto: c, detalle: `${m.concepto} (mis finanzas)`, valor: Number(m.valor), origen: "personal" });
    });
    ((rL.error ? [] : rL.data) ?? []).forEach((l: any) => out.push({ clave: `m-${l.id}`, fecha: `${mes}-01`, concepto: l.concepto, detalle: l.nota ?? "Agregado a mano", valor: Number(l.valor_total), origen: "manual", idManual: l.id }));
    out.sort((a, b) => a.fecha.localeCompare(b.fecha));
    setLineas(out);
    const sop: Soporte[] = ((rS.error ? [] : rS.data) ?? []).map((x: any) => ({ id: x.id, clave: x.clave, nombre: x.nombre, ruta: x.ruta, bucket: BUCKET_SOPORTES, tipo: x.tipo ?? "", propio: true }));
    out.forEach((l) => {
      if (l.comprobante) sop.push({ id: `c-${l.clave}`, clave: l.clave, nombre: "Foto registrada en Gastos", ruta: l.comprobante, bucket: "comprobantes", tipo: "image/jpeg", propio: false });
    });
    setSoportes(sop);
    const c: any = rC.error ? null : rC.data;
    setConfig(c ? { cuota: Number(c.cuota ?? 0), pago: Number(c.pago ?? 0), saldoAnterior: Number(c.saldo_anterior ?? 0), porcentaje: Number(c.porcentaje ?? 50) } : { cuota: 0, pago: 0, saldoAnterior: 0, porcentaje: 50 });
    setExcluidas(new Set());
    setError(null);
    setCargando(false);
  }, [mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const incluidas = useMemo(() => lineas.filter((l) => !excluidas.has(l.clave)), [lineas, excluidas]);
  const totalGastos = incluidas.reduce((s, l) => s + l.valor, 0);
  const parteGastos = (totalGastos * config.porcentaje) / 100;
  const totalCargo = parteGastos + config.cuota;
  const saldo = config.saldoAnterior + totalCargo - config.pago;

  function alternar(clave: string) {
    setExcluidas((prev) => {
      const n = new Set(prev);
      n.has(clave) ? n.delete(clave) : n.add(clave);
      return n;
    });
  }

  async function guardarConfig(c: ConfigReporte) {
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) throw new Error("Tu sesión expiró.");
    const { error: err } = await supabase.from("reporte_juanes_mes").upsert({ usuario_id: uid, mes, cuota: c.cuota, pago: c.pago, saldo_anterior: c.saldoAnterior, porcentaje: c.porcentaje });
    if (err) throw err;
    setConfig(c);
  }

  async function agregarLinea(concepto: string, valorTotal: number, nota?: string) {
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) throw new Error("Tu sesión expiró.");
    const { data, error: err } = await supabase.from("reporte_juanes_lineas").insert({ usuario_id: uid, mes, concepto: concepto.trim(), valor_total: valorTotal, nota: nota?.trim() || null }).select("id").single();
    if (err) throw err;
    await cargar();
    return (data as any).id as string;
  }

  async function subirSoporte(clave: string, file: File) {
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) throw new Error("Tu sesión expiró.");
    const blob = await reducirFoto(file);
    const tipo = blob.type || file.type || "application/octet-stream";
    const ext = extensionDe(file.name, tipo);
    const ruta = `${uid}/${mes}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error: e1 } = await supabase.storage.from(BUCKET_SOPORTES).upload(ruta, blob, { contentType: tipo });
    if (e1) throw new Error(`No se pudo subir el archivo: ${e1.message}`);
    const { error: e2 } = await supabase.from("reporte_juanes_soportes").insert({ usuario_id: uid, mes, clave, nombre: file.name, ruta, tipo });
    if (e2) {
      await supabase.storage.from(BUCKET_SOPORTES).remove([ruta]);
      throw e2;
    }
    await cargar();
  }

  async function borrarSoporte(s: Soporte) {
    if (!s.propio) return;
    await supabase.storage.from(BUCKET_SOPORTES).remove([s.ruta]);
    const { error: err } = await supabase.from("reporte_juanes_soportes").delete().eq("id", s.id);
    if (err) throw err;
    await cargar();
  }

  async function urlSoporte(s: Soporte): Promise<string | null> {
    const { data } = await supabase.storage.from(s.bucket).createSignedUrl(s.ruta, 60 * 10);
    return data?.signedUrl ?? null;
  }

  async function bytesSoporte(s: Soporte): Promise<Uint8Array | null> {
    const { data } = await supabase.storage.from(s.bucket).download(s.ruta);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  }

  // ---- Libro de Excel de Jenny (con su historia y fórmulas) ----
  async function nombresLibros(): Promise<string[]> {
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) return [];
    const { data } = await supabase.storage.from(BUCKET_SOPORTES).list(`${uid}/libro`, { limit: 100 });
    return (data ?? []).map((x) => x.name);
  }

  const revisarLibro = useCallback(async () => {
    setLibroSubido((await nombresLibros()).includes("base.xlsx"));
  }, []);
  useEffect(() => {
    revisarLibro();
  }, [revisarLibro]);

  async function subirLibroBase(file: File) {
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) throw new Error("Tu sesión expiró.");
    const { error: err } = await supabase.storage.from(BUCKET_SOPORTES).upload(`${uid}/libro/base.xlsx`, file, { upsert: true, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    if (err) throw new Error(`No se pudo guardar el libro: ${err.message}`);
    // al cambiar el libro base se descartan los libros mensuales generados con el anterior
    const otros = (await nombresLibros()).filter((n) => n !== "base.xlsx");
    if (otros.length) await supabase.storage.from(BUCKET_SOPORTES).remove(otros.map((n) => `${uid}/libro/${n}`));
    await revisarLibro();
  }

  /** Libro sobre el que se arma el mes: el último mes ya generado ANTES de este, o el libro base. */
  async function libroPara(m: string): Promise<{ bytes: Uint8Array; origen: string } | null> {
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) return null;
    const nombres = await nombresLibros();
    const previos = nombres.filter((n) => /^\d{4}-\d{2}\.xlsx$/.test(n) && n.slice(0, 7) < m).sort();
    const elegido = previos.length ? previos[previos.length - 1] : nombres.includes("base.xlsx") ? "base.xlsx" : null;
    if (!elegido) return null;
    const { data } = await supabase.storage.from(BUCKET_SOPORTES).download(`${uid}/libro/${elegido}`);
    return data ? { bytes: new Uint8Array(await data.arrayBuffer()), origen: elegido } : null;
  }

  async function guardarLibroMes(m: string, bytes: Uint8Array) {
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) return;
    await supabase.storage.from(BUCKET_SOPORTES).upload(`${uid}/libro/${m}.xlsx`, new Blob([bytes as unknown as BlobPart]), { upsert: true, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  async function borrarLinea(id: string) {
    const propios = soportes.filter((x) => x.clave === `m-${id}` && x.propio);
    if (propios.length) {
      await supabase.storage.from(BUCKET_SOPORTES).remove(propios.map((x) => x.ruta));
      await supabase.from("reporte_juanes_soportes").delete().in("id", propios.map((x) => x.id));
    }
    const { error: err } = await supabase.from("reporte_juanes_lineas").delete().eq("id", id);
    if (err) throw err;
    await cargar();
  }

  return { lineas, soportes, libroSubido, subirLibroBase, libroPara, guardarLibroMes, revisarLibro, subirSoporte, borrarSoporte, urlSoporte, bytesSoporte, incluidas, excluidas, config, cargando, faltaSql, error, totalGastos, parteGastos, totalCargo, saldo, alternar, guardarConfig, agregarLinea, borrarLinea };
}
