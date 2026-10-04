import { supabase } from "../config/supabase";
import { APORTE_BASE } from "../config/hogar";

export interface AportePersona {
  nombre: string;
  aporte: number;
  esBase: boolean; // true = no se ha ajustado, se usa el valor base
}

/** Personas del hogar (usuarios registrados) y el primer mes en que empezaron a usar la app. */
export async function personasDelHogar(): Promise<{ personas: string[]; mesInicio: string | null }> {
  const { data } = await supabase.from("usuarios").select("nombre, email, creado_en");
  const { data: sesion } = await supabase.auth.getUser();
  const nombres = new Set<string>();
  const actual = sesion.user?.user_metadata?.nombre ?? sesion.user?.email;
  if (actual) nombres.add(actual);
  let mesInicio: string | null = null;
  (data ?? []).forEach((u: any) => {
    const n = u.nombre || u.email;
    if (n) nombres.add(n);
    const m = u.creado_en ? String(u.creado_en).slice(0, 7) : null;
    if (m && (!mesInicio || m < mesInicio)) mesInicio = m;
  });
  return { personas: Array.from(nombres), mesInicio };
}

/**
 * Aporte de cada persona en un mes: el valor ajustado si existe, si no el aporte base.
 * Antes de que el hogar empezara a usar la app no se asume aporte base (para no inflar meses viejos).
 */
export function aportesDelMes(
  mes: string,
  personas: string[],
  filas: { mes: string; usuario_nombre: string; aporte: number }[],
  mesInicio: string | null
): AportePersona[] {
  const delMes = filas.filter((f) => f.mes === mes);
  const nombres = new Set([...personas, ...delMes.map((f) => f.usuario_nombre)]);
  const usarBase = !mesInicio || mes >= mesInicio;
  return Array.from(nombres).map((nombre) => {
    const fila = delMes.find((f) => f.usuario_nombre === nombre);
    if (fila) return { nombre, aporte: Number(fila.aporte), esBase: false };
    return { nombre, aporte: usarBase ? APORTE_BASE : 0, esBase: true };
  });
}

const normal = (s: string) => s.trim().toLowerCase();
/** ¿Es alguien del hogar? (para saber si un préstamo es a un tercero) */
export function esDelHogar(nombre: string, personas: string[]): boolean {
  const n = normal(nombre);
  return personas.some((p) => normal(p) === n || normal(p).split(" ")[0] === n.split(" ")[0]);
}
