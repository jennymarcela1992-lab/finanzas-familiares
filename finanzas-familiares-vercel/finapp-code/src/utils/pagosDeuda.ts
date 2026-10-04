// Pagos de créditos: una cuota SOLO queda pagada cuando hay pagos registrados que la cubren.
// Los pagos pueden venir de un gasto (lo pagó una persona), de un arriendo, o del registro inicial
// (cuotas que ya estaban pagadas cuando se creó el crédito en la app).
import { supabase } from "../config/supabase";

export type OrigenPago = "persona" | "arriendo" | "registro_inicial" | "prestamo";

export interface PagoDeudaRow {
  id: string;
  deuda_id: string;
  fecha: string;
  valor: number;
  origen: OrigenPago;
  pagado_por: string | null;
  gasto_id: string | null;
  arriendo_id: string | null;
  registrado_por: string | null;
  creado_en: string;
}

/** Lo que falta por pagar de la próxima cuota pendiente (para sugerir el valor). */
export function restanteDeCuota(cuota?: { cuota_total: number; valor_pagado?: number | null } | null): number {
  if (!cuota) return 0;
  return Math.max(0, Math.round(Number(cuota.cuota_total) - Number(cuota.valor_pagado ?? 0)));
}

export async function nombreUsuarioActual(): Promise<{ id: string | null; nombre: string }> {
  const { data } = await supabase.auth.getUser();
  return { id: data.user?.id ?? null, nombre: data.user?.user_metadata?.nombre ?? data.user?.email ?? "Alguien" };
}

/**
 * Reparte todos los pagos válidos del crédito entre sus cuotas, en orden (la más antigua primero).
 * Si un pago supera la cuota, el sobrante pasa a la siguiente. Los pagos cuyo gasto está en la papelera no cuentan.
 */
export async function reaplicarPagos(deudaId: string) {
  const [rC, rP] = await Promise.all([
    supabase.from("cuotas_deuda").select("*").eq("deuda_id", deudaId).order("numero_cuota"),
    supabase.from("pagos_deuda").select("*").eq("deuda_id", deudaId),
  ]);
  if (rC.error) throw new Error(`No se pudieron leer las cuotas: ${rC.error.message}`);
  if (rP.error) throw new Error(`No se pudieron leer los pagos: ${rP.error.message}`);
  const cuotas = rC.data ?? [];
  const pagos = (rP.data ?? []) as PagoDeudaRow[];

  const gastoIds = pagos.map((p) => p.gasto_id).filter(Boolean) as string[];
  const enPapelera = new Set<string>();
  if (gastoIds.length) {
    const { data } = await supabase.from("gastos").select("id, borrado").in("id", gastoIds);
    (data ?? []).forEach((g: any) => g.borrado && enPapelera.add(g.id));
  }
  const validos = pagos
    .filter((p) => !p.gasto_id || !enPapelera.has(p.gasto_id))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.creado_en).localeCompare(String(b.creado_en)));

  let i = 0;
  let disponible = validos.length ? Number(validos[0].valor) : 0;
  const cambios: any[] = [];

  for (const c of cuotas) {
    const total = Number(c.cuota_total);
    let aplicado = 0;
    let ultimo: PagoDeudaRow | null = null;
    while (aplicado < total - 0.5 && i < validos.length) {
      const toma = Math.min(disponible, total - aplicado);
      aplicado += toma;
      disponible -= toma;
      ultimo = validos[i];
      if (disponible <= 0.5) {
        i++;
        disponible = i < validos.length ? Number(validos[i].valor) : 0;
      }
    }
    const pagada = aplicado >= total - 1; // tolerancia de $1 por redondeos
    const nuevo = {
      valor_pagado: Math.round(aplicado),
      estado: pagada ? "pagada" : "pendiente",
      pagada_por: pagada && ultimo ? ultimo.pagado_por : null,
      fecha_pago: pagada && ultimo ? ultimo.fecha : null,
    };
    if (
      Number(c.valor_pagado ?? 0) !== nuevo.valor_pagado ||
      c.estado !== nuevo.estado ||
      (c.pagada_por ?? null) !== nuevo.pagada_por ||
      (c.fecha_pago ?? null) !== nuevo.fecha_pago
    ) {
      cambios.push({ ...c, ...nuevo });
    }
  }

  if (cambios.length) {
    const { error } = await supabase.from("cuotas_deuda").upsert(cambios);
    if (error) throw new Error(`No se pudieron actualizar las cuotas: ${error.message}`);
  }
}

/** Registra un pago y actualiza qué cuotas quedan pagadas. */
export async function registrarPagoDeuda(p: {
  deudaId: string;
  valor: number;
  fecha: string;
  origen: OrigenPago;
  pagadoPor: string;
  gastoId?: string | null;
  arriendoId?: string | null;
  abonoPrestamoId?: string | null;
}) {
  if (!(p.valor > 0)) throw new Error("El valor del pago debe ser mayor que cero.");
  const yo = await nombreUsuarioActual();
  const { data, error } = await supabase
    .from("pagos_deuda")
    .insert({
      deuda_id: p.deudaId,
      valor: Math.round(p.valor),
      fecha: p.fecha,
      origen: p.origen,
      pagado_por: p.pagadoPor,
      gasto_id: p.gastoId ?? null,
      arriendo_id: p.arriendoId ?? null,
      ...(p.abonoPrestamoId ? { abono_prestamo_id: p.abonoPrestamoId } : {}),
      registrado_por: yo.nombre,
    })
    .select()
    .single();
  if (error) throw new Error(`No se pudo registrar el pago del crédito: ${error.message}`);
  try {
    await reaplicarPagos(p.deudaId);
  } catch (e) {
    await supabase.from("pagos_deuda").delete().eq("id", data.id);
    throw e;
  }
  return data as PagoDeudaRow;
}

/** Reaplica los pagos de los créditos ligados a estos gastos (al mandarlos a la papelera o restaurarlos). */
export async function reaplicarPorGastos(deudaIds: (string | null | undefined)[]) {
  const unicos = Array.from(new Set(deudaIds.filter(Boolean) as string[]));
  for (const id of unicos) await reaplicarPagos(id);
}
