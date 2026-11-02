// Detalle de las "otras entradas" de un mes: de dónde salió cada peso (arriendos, vehículo, inversiones, préstamos).
import { useEffect, useState } from "react";
import { supabase } from "../config/supabase";
import { moverMes } from "./useDashboard";

export interface LineaDetalle {
  titulo: string;
  sub: string;
  valor: number;
}
export type ClaveDetalle = "arriendos" | "vehiculo" | "inversiones" | "prestamos" | "desembolsos";
export type DetalleIngresos = Record<ClaveDetalle, LineaDetalle[]>;

const VACIO: DetalleIngresos = { arriendos: [], vehiculo: [], inversiones: [], prestamos: [], desembolsos: [] };
const dia = (f: string) => {
  const [a, m, d] = String(f).slice(0, 10).split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(d)} ${meses[Number(m) - 1]} ${a}`;
};

export function useDetalleIngresos(mes: string) {
  const [detalle, setDetalle] = useState<DetalleIngresos>(VACIO);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const desde = `${mes}-01`;
      const hasta = `${moverMes(mes, 1)}-01`; // exclusivo
      const [rArr, rProp, rVeh, rPV, rMov, rInv, rPre, rAb, rDes, rDeu, rPagos] = await Promise.all([
        supabase.from("arriendos_recibidos").select("*").eq("mes", mes),
        supabase.from("propiedades").select("id, nombre"),
        supabase.from("vehiculos").select("id, nombre, placa, cuota_diaria"),
        supabase.from("pagos_vehiculo").select("vehiculo_id, fecha, estado, monto").gte("fecha", desde).lt("fecha", hasta),
        supabase.from("movimientos_inversion").select("*").gte("fecha", desde).lt("fecha", hasta),
        supabase.from("inversiones").select("id, nombre"),
        supabase.from("prestamos_personales").select("*"),
        supabase.from("abonos_prestamo").select("*").gte("fecha", desde).lt("fecha", hasta),
        supabase.from("desembolsos_deuda").select("*").gte("fecha", desde).lt("fecha", hasta),
        supabase.from("deudas").select("id, nombre"),
        supabase.from("pagos_deuda").select("arriendo_id, deuda_id, valor").not("arriendo_id", "is", null),
      ]);
      const lista = (r: any) => ((r.error ? [] : r.data) ?? []) as any[];
      const nombre = (filas: any[], id: string, def: string) => filas.find((x) => x.id === id)?.nombre ?? def;
      const props = lista(rProp);
      const deudas = lista(rDeu);
      const pagos = lista(rPagos);

      const arriendos: LineaDetalle[] = lista(rArr)
        .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
        .map((a) => {
          const aCredito = pagos.filter((p) => p.arriendo_id === a.id);
          const destinos = [
            ...aCredito.map((p) => `${Math.round(Number(p.valor)).toLocaleString("es-CO")} a ${nombre(deudas, p.deuda_id, "crédito")}`),
            ...(a.destino_persona ? [`para ${a.destino_persona}`] : []),
          ];
          return {
            titulo: nombre(props, a.propiedad_id, "Propiedad"),
            sub: `${dia(a.fecha)}${a.nota ? ` · ${a.nota}` : ""}${destinos.length ? ` · ${destinos.join(", ")}` : " · queda en el hogar"}`,
            valor: Number(a.monto),
          };
        });

      const vehs = lista(rVeh);
      const porVeh = new Map<string, { dias: number; total: number }>();
      lista(rPV)
        .filter((p) => p.estado === "pagado")
        .forEach((p) => {
          const v = vehs.find((x) => x.id === p.vehiculo_id);
          const acc = porVeh.get(p.vehiculo_id) ?? { dias: 0, total: 0 };
          acc.dias += 1;
          acc.total += Number(p.monto ?? v?.cuota_diaria ?? 0);
          porVeh.set(p.vehiculo_id, acc);
        });
      const vehiculo: LineaDetalle[] = [...porVeh.entries()].map(([id, x]) => {
        const v = vehs.find((y) => y.id === id);
        return { titulo: `${v?.nombre ?? "Vehículo"}${v?.placa ? ` · ${v.placa}` : ""}`, sub: `${x.dias} día(s) cobrados`, valor: x.total };
      });

      const prestamos = new Map(lista(rPre).map((p) => [p.id, p]));
      const esInv = (p: any) => !!p?.es_inversion && p.direccion !== "nos_prestan";
      const inversiones: LineaDetalle[] = [
        ...lista(rMov)
          .filter((m) => m.tipo === "ingreso")
          .map((m) => ({ titulo: nombre(lista(rInv), m.inversion_id, "Inversión"), sub: `${dia(m.fecha)}${m.concepto ? ` · ${m.concepto}` : ""}`, valor: Number(m.monto) })),
        ...lista(rAb)
          .filter((a) => !a.registro_inicial && esInv(prestamos.get(a.prestamo_id)))
          .map((a) => {
            const p = prestamos.get(a.prestamo_id);
            return { titulo: `Pago de ${p?.quien_recibe ?? "préstamo"}`, sub: `${dia(a.fecha)} · préstamo con intereses (inversión)`, valor: Number(a.monto) };
          }),
      ];

      const cobrados: LineaDetalle[] = lista(rAb)
        .filter((a) => {
          const p = prestamos.get(a.prestamo_id);
          return !a.registro_inicial && p && p.direccion === "prestamos" && !p.es_inversion;
        })
        .map((a) => ({ titulo: `Abono de ${prestamos.get(a.prestamo_id)?.quien_recibe ?? "préstamo"}`, sub: dia(a.fecha), valor: Number(a.monto) }));
      const recibidos: LineaDetalle[] = [...prestamos.values()]
        .filter((p) => p.direccion === "nos_prestan" && String(p.fecha).slice(0, 7) === mes)
        .map((p) => ({ titulo: `Préstamo recibido de ${p.quien_presta ?? "un tercero"}`, sub: dia(p.fecha), valor: Number(p.monto) }));

      const desembolsos: LineaDetalle[] = lista(rDes).map((x) => ({ titulo: nombre(deudas, x.deuda_id, "Crédito"), sub: `${dia(x.fecha)} · dinero recibido del prestamista`, valor: Number(x.valor) }));

      if (vivo) setDetalle({ arriendos, vehiculo, inversiones, prestamos: [...cobrados, ...recibidos], desembolsos });
    })().catch(() => vivo && setDetalle(VACIO));
    return () => {
      vivo = false;
    };
  }, [mes]);

  return detalle;
}
