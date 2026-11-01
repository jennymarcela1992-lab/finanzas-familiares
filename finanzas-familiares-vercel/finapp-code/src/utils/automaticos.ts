// Movimientos que se registran solos al abrir la app:
//  1. Cuotas de créditos con débito automático: cuando vence la cuota, queda pagada por la persona indicada.
//  2. Gastos automáticos (recurrentes): cada mes, en su día, se anota el gasto a nombre de quien lo paga.
// No duplica: antes de registrar revisa lo que ya existe.
import { supabase } from "../config/supabase";
import { hoyISO } from "./amortizacion";
import { registrarPagoDeuda, restanteDeCuota } from "./pagosDeuda";

let enCurso: Promise<void> | null = null;
let ultimaVez = 0;

/** Ejecuta los procesos automáticos como máximo una vez cada 10 minutos (todas las pantallas comparten la misma ejecución). */
export function asegurarAutomaticos(): Promise<void> {
  if (enCurso) return enCurso;
  if (Date.now() - ultimaVez < 10 * 60 * 1000) return Promise.resolve();
  enCurso = (async () => {
    try {
      await procesarDebitosAutomaticos();
    } catch (e) {
      console.warn("Débitos automáticos:", e);
    }
    try {
      await procesarGastosRecurrentes();
    } catch (e) {
      console.warn("Gastos automáticos:", e);
    }
    ultimaVez = Date.now();
    enCurso = null;
  })();
  return enCurso;
}

/** Fuerza una nueva ejecución (ej. después de crear un gasto automático). */
export function reiniciarAutomaticos() {
  ultimaVez = 0;
}

async function procesarDebitosAutomaticos() {
  const { data: deudas, error } = await supabase.from("deudas").select("id, nombre, pago_automatico_por").not("pago_automatico_por", "is", null);
  if (error || !deudas?.length) return;
  const hoy = hoyISO();
  for (const d of deudas as any[]) {
    if (!d.pago_automatico_por) continue;
    const { data: cuotas } = await supabase
      .from("cuotas_deuda")
      .select("*")
      .eq("deuda_id", d.id)
      .eq("estado", "pendiente")
      .lte("fecha_vencimiento", hoy)
      .order("numero_cuota");
    for (const c of (cuotas ?? []) as any[]) {
      // releer por si otra pantalla o dispositivo ya la registró
      const { data: actual } = await supabase.from("cuotas_deuda").select("*").eq("id", c.id).single();
      if (!actual || actual.estado === "pagada") continue;
      const valor = restanteDeCuota(actual);
      if (valor <= 0) continue;
      const { data: gasto, error: errG } = await supabase
        .from("gastos")
        .insert({
          fecha: c.fecha_vencimiento,
          item: `Cuota ${d.nombre} (débito automático)`,
          valor,
          moneda: "COP",
          valor_cop: valor,
          usuario_pago_nombre: d.pago_automatico_por,
          rubro: "Créditos",
          es_compartido: true,
          deuda_id: d.id,
          nota: `Cuota #${c.numero_cuota} debitada automáticamente`,
        })
        .select()
        .single();
      if (errG || !gasto) continue;
      try {
        await registrarPagoDeuda({ deudaId: d.id, valor, fecha: c.fecha_vencimiento, origen: "persona", pagadoPor: d.pago_automatico_por, gastoId: gasto.id });
      } catch {
        await supabase.from("gastos").delete().eq("id", gasto.id);
      }
    }
  }
}

function fechaDelMes(anio: number, mes: number, dia: number) {
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/** Fechas en que toca anotar un gasto automático entre `desde` y `hasta` (incluidas). */
export function fechasRecurrentes(dia: number, desde: string, hasta: string): string[] {
  const out: string[] = [];
  let anio = Number(desde.slice(0, 4));
  let mes = Number(desde.slice(5, 7));
  for (let k = 0; k < 600; k++) {
    const f = fechaDelMes(anio, mes, dia);
    if (f > hasta) break;
    if (f >= desde) out.push(f);
    mes++;
    if (mes > 12) {
      mes = 1;
      anio++;
    }
  }
  return out;
}

async function procesarGastosRecurrentes() {
  const { data: plantillas, error } = await supabase.from("gastos_recurrentes").select("*").eq("activo", true);
  if (error || !plantillas?.length) return;
  const hoy = hoyISO();
  for (const r of plantillas as any[]) {
    const limite = r.hasta && r.hasta < hoy ? r.hasta : hoy;
    const desde = r.ultima_generada && r.ultima_generada >= r.desde ? siguienteDia(r.ultima_generada) : r.desde;
    const fechas = fechasRecurrentes(Number(r.dia), desde, limite);
    if (!fechas.length) continue;
    const { data: existentes } = await supabase.from("gastos").select("fecha").eq("recurrente_id", r.id).in("fecha", fechas);
    const ya = new Set((existentes ?? []).map((g: any) => String(g.fecha).slice(0, 10)));
    const nuevos = fechas
      .filter((f) => !ya.has(f))
      .map((f) => ({
        fecha: f,
        item: r.item,
        valor: Number(r.valor),
        moneda: "COP",
        valor_cop: Number(r.valor),
        rubro: r.rubro,
        usuario_pago_nombre: r.usuario_pago_nombre,
        es_compartido: r.es_compartido,
        propiedad_id: r.propiedad_id,
        vehiculo_id: r.vehiculo_id,
        nota: r.nota ? `${r.nota} · automático` : "Gasto automático",
        recurrente_id: r.id,
      }));
    if (nuevos.length) {
      const { error: errIns } = await supabase.from("gastos").insert(nuevos);
      if (errIns) continue;
    }
    await supabase.from("gastos_recurrentes").update({ ultima_generada: fechas[fechas.length - 1] }).eq("id", r.id);
  }
}

function siguienteDia(f: string) {
  const d = new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)) + 1));
  return d.toISOString().slice(0, 10);
}
