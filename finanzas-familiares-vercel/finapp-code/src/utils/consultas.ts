// Supabase devuelve como máximo 1000 filas por consulta. Las tablas grandes (cuotas de todos los créditos,
// pagos diarios del vehículo, gastos de varios años) pasan ese límite y las filas que sobran se perdían sin aviso:
// por eso algunos créditos no aparecían en el Dashboard. `todo` trae la consulta completa por páginas.
const PAGINA = 1000;

/**
 * Trae todas las filas de una consulta, página por página.
 * `armar` debe devolver una consulta NUEVA cada vez y con un orden estable (ej. terminar en .order("id")).
 */
export async function todo<T = any>(armar: () => any): Promise<{ data: T[] | null; error: any }> {
  const filas: T[] = [];
  for (let desde = 0; desde < 200000; desde += PAGINA) {
    const { data, error } = await armar().range(desde, desde + PAGINA - 1);
    if (error) return { data: filas.length ? filas : null, error };
    const lote = (data ?? []) as T[];
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return { data: filas, error: null };
}
