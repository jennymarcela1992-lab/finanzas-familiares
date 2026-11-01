import { supabase } from "../config/supabase";

const TABLAS = [
  "gastos",
  "metas_ahorro",
  "aportes_ahorro",
  "deudas",
  "cuotas_deuda",
  "prestamos_personales",
  "abonos_prestamo",
  "nomina_mensual",
  "deducciones_nomina",
  "propiedades",
  "arriendos_recibidos",
  "vehiculos",
  "pagos_vehiculo",
  "inversiones",
  "movimientos_inversion",
  "presupuestos_evento",
  "items_presupuesto",
  "aportes_mes",
];

export async function generarBackupJSON(): Promise<string> {
  const resultado: Record<string, any> = { generado_en: new Date().toISOString() };
  for (const tabla of TABLAS) {
    const { data } = await supabase.from(tabla).select("*");
    resultado[tabla] = data ?? [];
  }
  return JSON.stringify(resultado, null, 2);
}
