// Qué porcentaje de cada crédito corresponde a cada propiedad o vehículo.
// Ej.: un crédito hipotecario que financió 60% el apartamento y 40% la finca.
import { supabase } from "../config/supabase";

export interface VinculoActivo {
  deuda_id: string;
  tipo: "propiedad" | "vehiculo";
  activo_id: string;
  porcentaje: number; // 0 a 100
}

/**
 * Lee los vínculos. Si la tabla nueva aún no existe (falta el SQL 9), usa los campos viejos
 * (deudas.propiedad_id / vehiculo_id y propiedades.credito_id) al 100%.
 */
export async function cargarVinculos(): Promise<VinculoActivo[]> {
  const [rV, rD, rP] = await Promise.all([
    supabase.from("deuda_activos").select("*"),
    supabase.from("deudas").select("id, propiedad_id, vehiculo_id"),
    supabase.from("propiedades").select("id, credito_id"),
  ]);
  const out: VinculoActivo[] = [];
  const clave = (v: VinculoActivo) => `${v.deuda_id}|${v.tipo}|${v.activo_id}`;
  const vistos = new Set<string>();
  const agregar = (v: VinculoActivo) => {
    if (!v.deuda_id || !v.activo_id || vistos.has(clave(v))) return;
    vistos.add(clave(v));
    out.push(v);
  };
  const tablaOk = !rV.error;
  if (tablaOk) {
    (rV.data ?? []).forEach((r: any) =>
      agregar({
        deuda_id: r.deuda_id,
        tipo: r.propiedad_id ? "propiedad" : "vehiculo",
        activo_id: r.propiedad_id ?? r.vehiculo_id,
        porcentaje: Number(r.porcentaje ?? 100),
      })
    );
  }
  // créditos de las tablas viejas que aún no tienen fila en la tabla nueva
  const conFila = new Set(out.map((v) => v.deuda_id));
  (rD.data ?? []).forEach((d: any) => {
    if (conFila.has(d.id)) return;
    if (d.propiedad_id) agregar({ deuda_id: d.id, tipo: "propiedad", activo_id: d.propiedad_id, porcentaje: 100 });
    if (d.vehiculo_id) agregar({ deuda_id: d.id, tipo: "vehiculo", activo_id: d.vehiculo_id, porcentaje: 100 });
  });
  (rP.error ? [] : rP.data ?? []).forEach((p: any) => {
    if (p.credito_id && !conFila.has(p.credito_id)) agregar({ deuda_id: p.credito_id, tipo: "propiedad", activo_id: p.id, porcentaje: 100 });
  });
  return out;
}

/** Reemplaza los vínculos de un crédito. */
export async function guardarVinculos(deudaId: string, lista: { tipo: "propiedad" | "vehiculo"; activoId: string; porcentaje: number }[]) {
  const primeraProp = lista.find((l) => l.tipo === "propiedad")?.activoId ?? null;
  const primerVeh = lista.find((l) => l.tipo === "vehiculo")?.activoId ?? null;
  const { error: errDel } = await supabase.from("deuda_activos").delete().eq("deuda_id", deudaId);
  if (!errDel && lista.length) {
    const { error } = await supabase.from("deuda_activos").insert(
      lista.map((l) => ({
        deuda_id: deudaId,
        propiedad_id: l.tipo === "propiedad" ? l.activoId : null,
        vehiculo_id: l.tipo === "vehiculo" ? l.activoId : null,
        porcentaje: Math.max(0, Math.min(100, l.porcentaje)),
      }))
    );
    if (error) throw error;
  }
  // campos viejos (compatibilidad): el primero de cada tipo
  await supabase.from("deudas").update({ propiedad_id: primeraProp, vehiculo_id: primerVeh }).eq("id", deudaId);
  await supabase.from("propiedades").update({ credito_id: null }).eq("credito_id", deudaId);
}

/** Pagos de crédito que le corresponden a un activo según su porcentaje. */
export function pagosDelActivo<T extends { deuda_id: string; valor: number }>(
  pagos: T[],
  vinculos: VinculoActivo[],
  tipo: "propiedad" | "vehiculo",
  activoId: string
): (T & { valorActivo: number; porcentaje: number })[] {
  const pct = new Map(vinculos.filter((v) => v.tipo === tipo && v.activo_id === activoId).map((v) => [v.deuda_id, v.porcentaje]));
  return pagos
    .filter((p) => pct.has(p.deuda_id))
    .map((p) => ({ ...p, porcentaje: pct.get(p.deuda_id)!, valorActivo: (Number(p.valor) * pct.get(p.deuda_id)!) / 100 }));
}
