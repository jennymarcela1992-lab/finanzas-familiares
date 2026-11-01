// Arriendo: valor vigente con el incremento anual por IPC y fecha de pago de cada mes.
import { hoyISO, sumarMeses } from "./amortizacion";

export interface PropiedadArriendo {
  valor_arriendo: number;
  valor_arriendo_inicial?: number | null;
  fecha_inicio_contrato?: string | null;
  aplica_ipc?: boolean | null;
  dia_pago_arriendo?: number | null;
}

export interface ValorArriendo {
  valor: number; // arriendo vigente en la fecha consultada
  ultimoAjuste: { fecha: string; ipc: number; anioIpc: number } | null;
  proximoAjuste: string | null; // próximo vencimiento (renovación) del contrato
  ipcFaltante: number[]; // años de IPC que no están registrados (ese aumento queda pendiente)
  ajustes: { fecha: string; anioIpc: number; ipc: number | null; valor: number; pendiente?: boolean }[];
  /** Próxima renovación y el IPC que se necesita para el aumento (si aún no está registrado). */
  proximoIpc: { fecha: string; anioIpc: number; falta: boolean } | null;
}

export interface ContratoArriendo {
  id: string | null; // null = contrato tomado de los datos viejos de la propiedad
  propiedad_id: string;
  arrendatario: string | null;
  fecha_inicio: string;
  canon_inicial: number;
  dia_pago: number;
  duracion_meses: number;
  aplica_ipc: boolean;
  fecha_fin: string | null;
  motivo_fin: string | null;
}

/** Contratos de una propiedad (más reciente primero). Sin tabla de contratos, se arma uno con los datos viejos. */
export function contratosDe(prop: any, filas: any[] | null): ContratoArriendo[] {
  if (filas) {
    return filas
      .filter((c) => c.propiedad_id === prop.id)
      .map((c) => ({
        id: c.id,
        propiedad_id: c.propiedad_id,
        arrendatario: c.arrendatario ?? null,
        fecha_inicio: String(c.fecha_inicio).slice(0, 10),
        canon_inicial: Number(c.canon_inicial),
        dia_pago: Number(c.dia_pago ?? 5),
        duracion_meses: Number(c.duracion_meses) || 12,
        aplica_ipc: c.aplica_ipc !== false,
        fecha_fin: c.fecha_fin ? String(c.fecha_fin).slice(0, 10) : null,
        motivo_fin: c.motivo_fin ?? null,
      }))
      .sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio));
  }
  const canon = Number(prop.valor_arriendo_inicial ?? prop.valor_arriendo ?? 0);
  if (prop.genera_ingresos === false || !(canon > 0)) return [];
  return [
    {
      id: null,
      propiedad_id: prop.id,
      arrendatario: prop.arrendatario ?? null,
      fecha_inicio: prop.fecha_inicio_contrato ? String(prop.fecha_inicio_contrato).slice(0, 10) : String(prop.creado_en ?? hoyISO()).slice(0, 10),
      canon_inicial: canon,
      dia_pago: Number(prop.dia_pago_arriendo ?? 5),
      duracion_meses: 12,
      aplica_ipc: prop.aplica_ipc !== false && !!prop.fecha_inicio_contrato,
      fecha_fin: null,
      motivo_fin: null,
    },
  ];
}

/** Contrato vigente en una fecha: ya empezó (o empieza pronto) y no se ha terminado. */
export function contratoActivo(contratos: ContratoArriendo[], fecha: string = hoyISO()): ContratoArriendo | null {
  return contratos.find((c) => !c.fecha_fin || c.fecha_fin >= fecha) ?? null;
}

/**
 * Canon vigente de un contrato. Sube SOLO en cada vencimiento del contrato (inicio + duración, cada periodo),
 * con el IPC del año calendario anterior a esa fecha. Si ese IPC no está registrado, el aumento queda pendiente
 * (el canon no sube) hasta que se escriba.
 */
export function canonVigente(c: ContratoArriendo, ipc: Record<number, number>, fecha: string = hoyISO()): ValorArriendo {
  let valor = Number(c.canon_inicial);
  const ajustes: ValorArriendo["ajustes"] = [];
  const faltante: number[] = [];
  const dur = Math.max(1, c.duracion_meses || 12);
  let k = 1;
  let venc = sumarMeses(c.fecha_inicio, dur);
  const limite = c.fecha_fin && c.fecha_fin < fecha ? c.fecha_fin : fecha;
  while (venc <= limite && k < 200) {
    const anioIpc = Number(venc.slice(0, 4)) - 1;
    if (c.aplica_ipc) {
      const v = ipc[anioIpc];
      if (v === undefined || v === null || isNaN(Number(v))) {
        faltante.push(anioIpc);
        ajustes.push({ fecha: venc, anioIpc, ipc: null, valor, pendiente: true });
      } else {
        valor = Math.round(valor * (1 + Number(v) / 100));
        ajustes.push({ fecha: venc, anioIpc, ipc: Number(v), valor });
      }
    }
    k++;
    venc = sumarMeses(c.fecha_inicio, dur * k);
  }
  const hechos = ajustes.filter((a) => !a.pendiente);
  const ultimo = hechos[hechos.length - 1];
  const activo = !c.fecha_fin || c.fecha_fin >= fecha;
  const anioProx = Number(venc.slice(0, 4)) - 1;
  return {
    valor,
    ultimoAjuste: ultimo ? { fecha: ultimo.fecha, ipc: ultimo.ipc ?? 0, anioIpc: ultimo.anioIpc } : null,
    proximoAjuste: activo ? venc : null,
    ipcFaltante: faltante,
    ajustes,
    proximoIpc: activo && c.aplica_ipc ? { fecha: venc, anioIpc: anioProx, falta: ipc[anioProx] === undefined } : null,
  };
}

/** Lo que se espera recibir de arriendo en una fecha (0 si no hay contrato vigente o no genera ingresos). */
export function arriendoDePropiedad(prop: any, contratosFilas: any[] | null, ipc: Record<number, number>, fecha: string = hoyISO()) {
  if (prop.genera_ingresos === false) return { contrato: null, valor: null as ValorArriendo | null, contratos: [] as ContratoArriendo[] };
  const contratos = contratosDe(prop, contratosFilas);
  const contrato = contratoActivo(contratos, fecha);
  return { contrato, contratos, valor: contrato ? canonVigente(contrato, ipc, fecha) : null };
}

/** Compatibilidad: canon vigente a partir de los datos viejos de la propiedad. */
export function arriendoVigente(p: PropiedadArriendo & { id?: string }, ipc: Record<number, number>, fecha: string = hoyISO()): ValorArriendo {
  const c = contratosDe({ ...p, id: p.id ?? "x" }, null)[0];
  if (!c) return { valor: Number(p.valor_arriendo ?? 0), ultimoAjuste: null, proximoAjuste: null, ipcFaltante: [], ajustes: [], proximoIpc: null };
  return canonVigente(c, ipc, fecha);
}

/** Fecha en que vence el arriendo de un mes (AAAA-MM) según el día de pago pactado. */
export function fechaPagoArriendo(mes: string, diaPago?: number | null) {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const d = Math.min(Math.max(1, Number(diaPago) || 5), ultimo);
  return `${mes}-${String(d).padStart(2, "0")}`;
}

export function diasEntre(desde: string, hasta: string) {
  const f = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((f(hasta) - f(desde)) / 86400000);
}
