import { supabase } from "../config/supabase";
import { APORTE_BASE } from "../config/hogar";

export interface AportePersona {
  nombre: string;
  aporte: number;
  esBase: boolean; // true = no se ha ajustado, se usa el valor base
}

const sinTildes = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const palabras = (x: string) => sinTildes(x).split(/\s+/).filter(Boolean);

/**
 * ¿Dos nombres son la misma persona del hogar? Ej. "Jhon Ostos" y "Jhon Fredy Ostos Torres",
 * o "Jenny" y "Jenny Marcela Morales": el nombre corto está contenido en el largo y empiezan igual.
 */
export function mismaPersona(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const A = palabras(a);
  const B = palabras(b);
  if (!A.length || !B.length) return false;
  const [corto, largo] = A.length <= B.length ? [A, B] : [B, A];
  return corto[0] === largo[0] && corto.every((w) => largo.includes(w));
}

/** Nombre con el que se muestra a alguien: el de la lista del hogar que corresponde (o el mismo si no hay). */
export function nombreCanonico(nombre: string, personas: string[]): string {
  return personas.find((p) => mismaPersona(p, nombre)) ?? nombre;
}

/**
 * Personas del hogar: usuarios registrados y las agregadas a mano en Ingresos, sin repetir a nadie
 * (cada usuario lo anota con su nombre completo y el otro quizá con uno corto). Si un nombre ya se usa en
 * los aportes, ese se respeta para no partir los datos. `yo` = cómo aparece el usuario actual en la lista.
 */
export async function personasDelHogar(): Promise<{ personas: string[]; mesInicio: string | null; yo: string }> {
  const [{ data }, { data: aportes }, { data: sesion }] = await Promise.all([
    supabase.from("usuarios").select("id, nombre, email, creado_en"),
    supabase.from("aportes_mes").select("usuario_nombre"),
    supabase.auth.getUser(),
  ]);
  const usuario = sesion.user;
  const actual: string = usuario?.user_metadata?.nombre ?? usuario?.email ?? "";
  // que cada usuario quede registrado en la tabla de usuarios (así el otro lo ve en su pantalla)
  if (usuario && !(data ?? []).some((u: any) => u.id === usuario.id)) {
    supabase.from("usuarios").insert({ id: usuario.id, nombre: actual, email: usuario.email }).then(() => undefined, () => undefined);
  }

  const lista: string[] = [];
  const agregar = (n: string | null | undefined, preferido: boolean) => {
    const nombre = (n ?? "").trim();
    if (!nombre) return;
    const i = lista.findIndex((x) => mismaPersona(x, nombre));
    if (i === -1) lista.push(nombre);
    else if (preferido) lista[i] = nombre;
  };
  // primero los nombres que ya tienen datos (aportes), luego los usuarios registrados
  (aportes ?? []).forEach((a: any) => agregar(a.usuario_nombre, false));
  let mesInicio: string | null = null;
  (data ?? []).forEach((u: any) => {
    agregar(u.nombre || u.email, false);
    const m = u.creado_en ? String(u.creado_en).slice(0, 7) : null;
    if (m && (!mesInicio || m < mesInicio)) mesInicio = m;
  });
  agregar(actual, false);
  const yo = nombreCanonico(actual, lista);
  // el usuario actual va primero
  const personas = [yo, ...lista.filter((x) => x !== yo)].filter(Boolean);
  return { personas, mesInicio, yo };
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
