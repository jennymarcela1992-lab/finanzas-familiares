// Cálculos de créditos con cuota fija (sistema francés), como los usan los bancos en Colombia.
// Todo es puro (sin base de datos) para poder probarlo y reutilizarlo en la pantalla.

export type TipoTasa = "EA" | "MV" | "NAMV";

export const TIPOS_TASA: { valor: TipoTasa; etiqueta: string; ayuda: string }[] = [
  { valor: "EA", etiqueta: "E.A.", ayuda: "Efectiva anual (la más común en el extracto, ej. 24,5%)" },
  { valor: "MV", etiqueta: "M.V.", ayuda: "Mensual vencida (ej. 1,8%)" },
  { valor: "NAMV", etiqueta: "N.A.M.V.", ayuda: "Nominal anual mes vencido (ej. 22%)" },
];

/** Convierte la tasa que da el banco a tasa mensual (en decimal, ej. 0.018). */
export function tasaMensual(tasa: number, tipo: TipoTasa): number {
  const t = tasa / 100;
  if (tipo === "EA") return Math.pow(1 + t, 1 / 12) - 1;
  if (tipo === "NAMV") return t / 12;
  return t;
}

/** Cuota fija de capital + interés (sin seguros). */
export function cuotaFija(saldo: number, iMensual: number, numeroCuotas: number): number {
  if (numeroCuotas <= 0) return 0;
  if (iMensual === 0) return saldo / numeroCuotas;
  const f = Math.pow(1 + iMensual, numeroCuotas);
  return (saldo * iMensual * f) / (f - 1);
}

/** Cuántas cuotas hacen falta para pagar `saldo` pagando `cuota` (capital + interés) cada mes. */
export function numeroDeCuotas(saldo: number, iMensual: number, cuota: number): number {
  if (saldo <= 0) return 0;
  if (iMensual === 0) return Math.ceil(saldo / cuota);
  const base = 1 - (iMensual * saldo) / cuota;
  if (base <= 0) return Infinity; // la cuota no alcanza ni para los intereses
  return Math.ceil(-Math.log(base) / Math.log(1 + iMensual) - 1e-9);
}

// ---------- Fechas (como texto AAAA-MM-DD, para que la zona horaria no corra los días) ----------

export function hoyISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dia}`;
}

export function esFechaValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split("-").map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= diasDelMes(a, m);
}

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * Fecha de la cuota número `n` (1 = primer pago). Mantiene el día de pago y,
 * si el mes no tiene ese día (ej. 31 en febrero), usa el último día del mes.
 */
export function fechaCuota(fechaPrimerPago: string, n: number, diaPago?: number | null): string {
  const [a, m, d] = fechaPrimerPago.split("-").map(Number);
  const dia = diaPago && diaPago >= 1 && diaPago <= 31 ? diaPago : d;
  const total = (m - 1) + (n - 1);
  const anio = a + Math.floor(total / 12);
  const mes = (((total % 12) + 12) % 12) + 1;
  const diaReal = Math.min(dia, diasDelMes(anio, mes));
  return `${anio}-${String(mes).padStart(2, "0")}-${String(diaReal).padStart(2, "0")}`;
}

/** Suma meses a una fecha AAAA-MM-DD (para créditos viejos que no guardaban el primer pago). */
export function sumarMeses(fecha: string, meses: number): string {
  return fechaCuota(fecha, meses + 1);
}

export function formatoFecha(iso: string): string {
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}

export function pesos(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

// ---------- Tabla de amortización ----------

export interface FilaCuota {
  numero_cuota: number;
  fecha_vencimiento: string;
  capital: number;
  interes: number;
  seguro: number;
  abono_extra: number; // abono fijo mensual a capital (si hay)
  cuota_total: number; // capital + interés + seguro + abono extra
  saldo: number; // saldo después de pagar esta cuota
}

/**
 * Genera las cuotas a partir de un saldo.
 * - `numeroInicial`: número de la primera cuota que se genera (para continuar después de las pagadas).
 * - `cuotasRestantes`: cuántas cuotas quedan (se calcula la cuota fija), o
 * - `cuotaObjetivo`: una cuota fija de capital+interés ya conocida (se calcula cuántas cuotas faltan).
 * - `abonoMensual` / `abonoDesde`: abono extra fijo a capital en cada cuota que vence desde esa fecha
 *   (siempre acorta el plazo; la cuota base no cambia).
 * Devuelve las filas y `cuotasBase`: cuántas cuotas tendría el plan SIN abonos extra (sirve como plazo de referencia).
 */
export function generarCuotas(params: {
  saldo: number;
  iMensual: number;
  seguroMensual: number;
  fechaPrimerPago: string;
  diaPago?: number | null;
  numeroInicial: number;
  cuotasRestantes?: number;
  cuotaObjetivo?: number;
  abonoMensual?: number;
  abonoDesde?: string | null;
}): FilaCuota[] & { cuotasBase?: number } {
  const { iMensual, seguroMensual, fechaPrimerPago, diaPago, numeroInicial } = params;
  let saldo = Math.round(params.saldo);
  if (saldo <= 0) return [];

  let n: number;
  let cuota: number;
  if (params.cuotaObjetivo && params.cuotaObjetivo > 0) {
    cuota = Math.round(params.cuotaObjetivo);
    n = numeroDeCuotas(saldo, iMensual, cuota);
    if (!isFinite(n)) throw new Error("La cuota no alcanza para cubrir los intereses.");
  } else {
    n = Math.max(1, Math.round(params.cuotasRestantes ?? 1));
    cuota = Math.round(cuotaFija(saldo, iMensual, n));
  }

  const extraMensual = Math.max(0, Math.round(params.abonoMensual || 0));
  const filas: FilaCuota[] & { cuotasBase?: number } = [];
  for (let k = 0; k < n && saldo > 0; k++) {
    const numero = numeroInicial + k;
    const fecha = fechaCuota(fechaPrimerPago, numero, diaPago);
    const interes = Math.round(saldo * iMensual);
    const ultima = k === n - 1;
    let capital = cuota - interes;
    if (ultima || capital >= saldo) capital = saldo; // la última cuota cierra el saldo exacto
    const aplicaExtra = extraMensual > 0 && (!params.abonoDesde || fecha >= params.abonoDesde);
    const abono_extra = aplicaExtra ? Math.min(extraMensual, saldo - capital) : 0;
    saldo = saldo - capital - abono_extra;
    const seguro = Math.round(seguroMensual || 0);
    filas.push({
      numero_cuota: numero,
      fecha_vencimiento: fecha,
      capital,
      interes,
      seguro,
      abono_extra,
      cuota_total: capital + interes + seguro + abono_extra,
      saldo,
    });
  }
  filas.cuotasBase = n;
  return filas;
}

/** Resumen rápido para mostrar en el formulario antes de guardar. */
export function vistaPrevia(valor: number, tasa: number, tipo: TipoTasa, plazo: number, seguro: number) {
  const i = tasaMensual(tasa, tipo);
  const cuota = Math.round(cuotaFija(valor, i, plazo));
  const totalIntereses = cuota * plazo - valor;
  return { iMensual: i, cuotaSinSeguro: cuota, cuotaConSeguro: cuota + Math.round(seguro || 0), totalIntereses };
}

// ---------- Proyección con eventos en el tiempo (aumentos y abonos con fecha) ----------

export interface EventoCredito {
  fecha: string; // AAAA-MM-DD
  delta: number; // + aumento del préstamo, − abono a capital
  modo: "mantener_cuota" | "recalcular_cuota"; // recalcular = mantener la fecha final y cambiar la cuota
}

/**
 * Genera las cuotas desde `numeroInicial`, aplicando cada evento antes de la primera cuota que vence en o después de su fecha.
 *  - Si `cuotaInicio` viene, se arranca con esa cuota (capital + interés); si no, se calcula para `cuotasRestantes`.
 *  - "mantener_cuota": la cuota no cambia y el plazo se ajusta solo.
 *  - "recalcular_cuota": se mantiene la fecha final vigente y se recalcula la cuota.
 */
export function proyectarCuotas(p: {
  saldoInicio: number;
  iMensual: number;
  seguroMensual: number;
  fechaPrimerPago: string;
  diaPago?: number | null;
  numeroInicial: number;
  cuotaInicio?: number | null;
  cuotasRestantes?: number;
  eventos?: EventoCredito[];
  abonoMensual?: number;
  abonoDesde?: string | null;
}): { filas: FilaCuota[]; cuotasPlanInicial: number } {
  const i = p.iMensual;
  let saldo = Math.round(p.saldoInicio);
  const eventos = [...(p.eventos ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let e = 0;
  let cuota: number;
  let cierre: number | null; // número de la última cuota cuando el plazo está fijo
  if (p.cuotaInicio && p.cuotaInicio > 0) {
    cuota = Math.round(p.cuotaInicio);
    cierre = null;
  } else {
    const n = Math.max(1, Math.round(p.cuotasRestantes ?? 1));
    cuota = Math.round(cuotaFija(saldo, i, n));
    cierre = p.numeroInicial - 1 + n;
  }
  // plazo del plan con el que se arranca (sin eventos futuros ni abonos fijos): sirve como referencia para recalcular
  const cuotasPlanInicial = saldo > 0 ? (cierre !== null ? cierre - p.numeroInicial + 1 : numeroDeCuotas(saldo, i, cuota)) : 0;
  if (!isFinite(cuotasPlanInicial)) throw new Error("La cuota no alcanza para cubrir los intereses.");

  const extraMensual = Math.max(0, Math.round(p.abonoMensual || 0));
  const filas: FilaCuota[] = [];
  for (let k = p.numeroInicial; k < p.numeroInicial + 1200; k++) {
    const fecha = fechaCuota(p.fechaPrimerPago, k, p.diaPago);
    while (e < eventos.length && eventos[e].fecha <= fecha) {
      const ev = eventos[e++];
      const restantesAntes = cierre !== null ? cierre - k + 1 : saldo > 0 ? numeroDeCuotas(saldo, i, cuota) : 1;
      saldo = Math.max(0, saldo + Math.round(ev.delta));
      if (ev.modo === "recalcular_cuota" && saldo > 0) {
        const n = Math.max(1, isFinite(restantesAntes) ? restantesAntes : 1);
        cuota = Math.round(cuotaFija(saldo, i, n));
        cierre = k - 1 + n;
      } else {
        cierre = null;
      }
    }
    if (saldo <= 0) break;
    const interes = Math.round(saldo * i);
    if (cierre === null && cuota <= interes) throw new Error("La cuota no alcanza para cubrir los intereses.");
    let capital = cuota - interes;
    if ((cierre !== null && k >= cierre) || capital >= saldo) capital = saldo;
    const aplicaExtra = extraMensual > 0 && (!p.abonoDesde || fecha >= p.abonoDesde);
    const abono_extra = aplicaExtra ? Math.min(extraMensual, saldo - capital) : 0;
    saldo -= capital + abono_extra;
    const seguro = Math.round(p.seguroMensual || 0);
    filas.push({ numero_cuota: k, fecha_vencimiento: fecha, capital, interes, seguro, abono_extra, cuota_total: capital + interes + seguro + abono_extra, saldo });
    if (saldo <= 0) break;
  }
  return { filas, cuotasPlanInicial };
}
