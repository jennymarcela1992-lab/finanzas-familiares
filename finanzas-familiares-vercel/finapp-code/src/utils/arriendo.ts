// Arriendo: valor vigente con el incremento anual por IPC y fecha de pago de cada mes.
import { hoyISO } from "./amortizacion";

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
  proximoAjuste: string | null; // próximo aniversario del contrato
  ipcFaltante: number[]; // años de IPC que no están registrados (se tomó 0%)
  ajustes: { fecha: string; anioIpc: number; ipc: number; valor: number }[];
}

function sumarAnios(fecha: string, n: number) {
  const [a, m, d] = fecha.split("-").map(Number);
  const anio = a + n;
  const ultimo = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  return `${anio}-${String(m).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/**
 * En Colombia el arriendo de vivienda sube cada año, en el aniversario del contrato,
 * máximo el IPC del año calendario anterior (ej. aniversario en marzo de 2026 → IPC de 2025).
 */
export function arriendoVigente(p: PropiedadArriendo, ipc: Record<number, number>, fecha: string = hoyISO()): ValorArriendo {
  const inicio = p.fecha_inicio_contrato;
  const base = Number(p.valor_arriendo_inicial ?? p.valor_arriendo ?? 0);
  if (!inicio || p.aplica_ipc === false) {
    return { valor: Number(p.valor_arriendo ?? base), ultimoAjuste: null, proximoAjuste: inicio ? null : null, ipcFaltante: [], ajustes: [] };
  }
  let valor = base;
  const ajustes: ValorArriendo["ajustes"] = [];
  const faltante: number[] = [];
  let k = 1;
  let aniversario = sumarAnios(inicio, k);
  while (aniversario <= fecha) {
    const anioIpc = Number(aniversario.slice(0, 4)) - 1;
    const v = ipc[anioIpc];
    if (v === undefined || v === null) faltante.push(anioIpc);
    valor = Math.round(valor * (1 + (Number(v) || 0) / 100));
    ajustes.push({ fecha: aniversario, anioIpc, ipc: Number(v) || 0, valor });
    k++;
    aniversario = sumarAnios(inicio, k);
  }
  const ultimo = ajustes[ajustes.length - 1];
  return {
    valor,
    ultimoAjuste: ultimo ? { fecha: ultimo.fecha, ipc: ultimo.ipc, anioIpc: ultimo.anioIpc } : null,
    proximoAjuste: aniversario,
    ipcFaltante: faltante,
    ajustes,
  };
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
