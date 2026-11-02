// Ingresos y gastos propios de cada persona. La seguridad está en la base de datos (RLS):
// cada usuario solo puede leer y modificar sus propios movimientos.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../config/supabase";
import { moverMes } from "./useDashboard";

export interface MovimientoPersonal {
  id: string;
  tipo: "ingreso" | "gasto";
  fecha: string;
  concepto: string;
  categoria: string | null;
  valor: number;
  nota: string | null;
}

export interface DatosMovimiento {
  tipo: "ingreso" | "gasto";
  fecha: string;
  concepto: string;
  categoria: string;
  valor: number;
  nota?: string;
}

export function usePersonales(mes: string) {
  const [movimientos, setMovimientos] = useState<MovimientoPersonal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faltaSql, setFaltaSql] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) {
      setError("Tu sesión expiró. Vuelve a iniciar sesión.");
      setCargando(false);
      return;
    }
    const { data, error: err } = await supabase
      .from("movimientos_personales")
      .select("*")
      .eq("usuario_id", uid)
      .gte("fecha", `${mes}-01`)
      .lt("fecha", `${moverMes(mes, 1)}-01`)
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false });
    if (err) {
      if (/relation|does not exist|schema cache/i.test(err.message)) setFaltaSql(true);
      else setError(err.message);
      setMovimientos([]);
    } else {
      setFaltaSql(false);
      setError(null);
      setMovimientos((data ?? []).map((m: any) => ({ id: m.id, tipo: m.tipo, fecha: String(m.fecha).slice(0, 10), concepto: m.concepto, categoria: m.categoria, valor: Number(m.valor), nota: m.nota })));
    }
    setCargando(false);
  }, [mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(d: DatosMovimiento, id?: string | null) {
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    const fila = { tipo: d.tipo, fecha: d.fecha, concepto: d.concepto.trim(), categoria: d.categoria || null, valor: d.valor, nota: d.nota?.trim() || null };
    const { error: err } = id
      ? await supabase.from("movimientos_personales").update(fila).eq("id", id).eq("usuario_id", uid)
      : await supabase.from("movimientos_personales").insert({ ...fila, usuario_id: uid });
    if (err) throw err;
    await cargar();
  }

  async function borrar(id: string) {
    const { error: err } = await supabase.from("movimientos_personales").delete().eq("id", id);
    if (err) throw err;
    await cargar();
  }

  return { movimientos, cargando, error, faltaSql, guardar, borrar, recargar: cargar };
}

// ---------- Patrimonio personal: activos, inversiones, ahorros y deudas propias ----------
export type TipoPatrimonio = "activo" | "inversion" | "ahorro" | "deuda";

export interface ItemPatrimonio {
  id: string;
  tipo: TipoPatrimonio;
  nombre: string;
  categoria: string | null;
  valor: number;
  valorInicial: number | null;
  cuotaMensual: number | null;
  tasaAnual: number | null;
  nota: string | null;
}

export interface DatosPatrimonio {
  tipo: TipoPatrimonio;
  nombre: string;
  categoria: string;
  valor: number;
  valorInicial?: number | null;
  cuotaMensual?: number | null;
  tasaAnual?: number | null;
  nota?: string;
}

export function usePatrimonioPersonal() {
  const [items, setItems] = useState<ItemPatrimonio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faltaSql, setFaltaSql] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) {
      setError("Tu sesión expiró. Vuelve a iniciar sesión.");
      setCargando(false);
      return;
    }
    const { data, error: err } = await supabase.from("patrimonio_personal").select("*").eq("usuario_id", uid).order("creado_en");
    if (err) {
      if (/relation|does not exist|schema cache/i.test(err.message)) setFaltaSql(true);
      else setError(err.message);
      setItems([]);
    } else {
      setFaltaSql(false);
      setError(null);
      setItems(
        (data ?? []).map((x: any) => ({
          id: x.id,
          tipo: x.tipo,
          nombre: x.nombre,
          categoria: x.categoria,
          valor: Number(x.valor),
          valorInicial: x.valor_inicial == null ? null : Number(x.valor_inicial),
          cuotaMensual: x.cuota_mensual == null ? null : Number(x.cuota_mensual),
          tasaAnual: x.tasa_anual == null ? null : Number(x.tasa_anual),
          nota: x.nota,
        }))
      );
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(d: DatosPatrimonio, id?: string | null) {
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    const fila = {
      tipo: d.tipo,
      nombre: d.nombre.trim(),
      categoria: d.categoria || null,
      valor: d.valor,
      valor_inicial: d.valorInicial ?? null,
      cuota_mensual: d.cuotaMensual ?? null,
      tasa_anual: d.tasaAnual ?? null,
      nota: d.nota?.trim() || null,
      actualizado_en: new Date().toISOString(),
    };
    const { error: err } = id
      ? await supabase.from("patrimonio_personal").update(fila).eq("id", id).eq("usuario_id", uid)
      : await supabase.from("patrimonio_personal").insert({ ...fila, usuario_id: uid });
    if (err) throw err;
    await cargar();
  }

  async function borrar(id: string) {
    const { error: err } = await supabase.from("patrimonio_personal").delete().eq("id", id);
    if (err) throw err;
    await cargar();
  }

  return { items, cargando, error, faltaSql, guardar, borrar };
}
