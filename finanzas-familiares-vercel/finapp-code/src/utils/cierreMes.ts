// Cierre de mes: un mes cerrado no admite cambios hasta que se reabra con la contraseña.
// La contraseña se guarda como huella (hash), nunca en texto. Si la tabla aún no existe, no se bloquea nada.
import { supabase } from "../config/supabase";

export interface MesCerrado {
  mes: string;
  cerrado_por: string | null;
  cerrado_en: string | null;
  saldo: number | null;
}

let cache: { filas: any[]; en: number } | null = null;

async function filas(forzar = false): Promise<any[]> {
  if (!forzar && cache && Date.now() - cache.en < 20_000) return cache.filas;
  const { data, error } = await supabase.from("meses_cerrados").select("*");
  const f = error ? [] : (data ?? []);
  cache = { filas: f, en: Date.now() };
  return f;
}

export async function listarMesesCerrados(forzar = false): Promise<MesCerrado[]> {
  return (await filas(forzar)) as MesCerrado[];
}

export async function mesCerrado(mes: string): Promise<MesCerrado | null> {
  return ((await filas()) as MesCerrado[]).find((x) => x.mes === mes) ?? null;
}

/** Lanza un error si alguna de las fechas (AAAA-MM o AAAA-MM-DD) cae en un mes cerrado. */
export async function exigirMesAbierto(...fechas: (string | null | undefined)[]) {
  const cerrados = new Set(((await filas()) as MesCerrado[]).map((x) => x.mes));
  if (!cerrados.size) return;
  for (const f of fechas) {
    if (!f) continue;
    const mes = String(f).slice(0, 7);
    if (cerrados.has(mes)) {
      throw new Error(`El mes ${mes} está cerrado y no admite cambios. Para modificarlo, ábrelo en «Informe del mes» con la contraseña.`);
    }
  }
}

async function huella(mes: string, clave: string): Promise<string> {
  const texto = `finanzas-familiares|${mes}|${clave}`;
  try {
    const bytes = new TextEncoder().encode(texto);
    const h = await (globalThis as any).crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let x = 5381; // respaldo simple si el navegador no ofrece crypto.subtle
    for (let i = 0; i < texto.length; i++) x = ((x << 5) + x + texto.charCodeAt(i)) | 0;
    return `s${x}`;
  }
}

export async function cerrarMes(mes: string, clave: string, saldo: number, por: string) {
  if (clave.trim().length < 4) throw new Error("La contraseña debe tener al menos 4 caracteres.");
  const { error } = await supabase.from("meses_cerrados").insert({ mes, clave_hash: await huella(mes, clave.trim()), saldo, cerrado_por: por });
  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) throw new Error("Falta crear la tabla de cierres: corre el archivo supabase_cierre_mes.sql en Supabase.");
    throw error;
  }
  await filas(true);
}

export async function reabrirMes(mes: string, clave: string) {
  const { data, error } = await supabase.from("meses_cerrados").select("clave_hash").eq("mes", mes).maybeSingle();
  if (error) throw error;
  if (!data) return;
  if (data.clave_hash !== (await huella(mes, clave.trim()))) throw new Error("Contraseña incorrecta.");
  const { error: err } = await supabase.from("meses_cerrados").delete().eq("mes", mes);
  if (err) throw err;
  await filas(true);
}
