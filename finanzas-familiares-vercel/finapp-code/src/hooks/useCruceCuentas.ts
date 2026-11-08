// Cuentas cruzadas con otra persona (ej. tu mamá): gastos y pagos de ida y vuelta, saldo mes a mes, soportes en PDF.
// Convención del saldo: POSITIVO = yo le debo a la otra persona · NEGATIVO = ella me debe a mí.
// Cada movimiento lo registra quien puso la plata: si la puso la otra persona suma (+), si la puse yo resta (−).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../config/supabase";
import { mesHoy, moverMes } from "./useDashboard";
import { reducirFoto, extensionDe } from "./useReporteJuanes";

const BUCKET = "soportes_juanes";

export interface Cuenta {
  id: string;
  nombre: string;
  saldoInicial: number;
  desde: string;
  datosYo: string;
  datosOtra: string;
}
export interface Movimiento {
  id: string;
  cuentaId: string;
  mes: string;
  fecha: string;
  concepto: string;
  monto: number; // con signo
  valor: number; // sin signo
  clase: "gasto" | "pago";
  quien: "yo" | "otra";
  nota: string;
}
export interface SoporteCruce {
  id: string;
  movimientoId: string;
  nombre: string;
  ruta: string;
  tipo: string;
}
export interface FilaHistorial {
  mes: string;
  anterior: number;
  movimientos: number;
  final: number;
}

export interface EntradaMov {
  id?: string;
  fecha: string;
  concepto: string;
  valor: number;
  clase: "gasto" | "pago";
  quien: "yo" | "otra";
  nota?: string;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export function useCruceCuentas(mes: string) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [soportes, setSoportes] = useState<SoporteCruce[]>([]);
  const [miNombre, setMiNombre] = useState("Yo");
  const [cargando, setCargando] = useState(true);
  const [faltaSql, setFaltaSql] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (idElegido?: string | null) => {
      setCargando(true);
      const { data: sesion } = await supabase.auth.getUser();
      const u = sesion.user;
      if (!u) {
        setError("Tu sesión expiró. Vuelve a iniciar sesión.");
        setCargando(false);
        return;
      }
      const nombreMeta = String((u.user_metadata as any)?.nombre ?? "").trim().split(/\s+/)[0];
      setMiNombre(nombreMeta || "Yo");
      const rc = await supabase.from("cruce_cuentas").select("*").eq("usuario_id", u.id).order("creado_en");
      if (rc.error) {
        if (/relation|does not exist|schema cache/i.test(rc.error.message)) setFaltaSql(true);
        else setError(rc.error.message);
        setCargando(false);
        return;
      }
      setFaltaSql(false);
      let filas: any[] = rc.data ?? [];
      if (filas.length === 0) {
        const ins = await supabase.from("cruce_cuentas").insert({ usuario_id: u.id, nombre: "Mi mamá", saldo_inicial: 0, desde: mesHoy() }).select("*").single();
        if (ins.error) {
          setError(ins.error.message);
          setCargando(false);
          return;
        }
        filas = [ins.data];
      }
      const lista: Cuenta[] = filas.map((c) => ({ id: c.id, nombre: c.nombre, saldoInicial: Number(c.saldo_inicial ?? 0), desde: c.desde ?? mesHoy(), datosYo: c.datos_yo ?? "", datosOtra: c.datos_otra ?? "" }));
      setCuentas(lista);
      const elegido = lista.find((c) => c.id === (idElegido ?? cuentaId))?.id ?? lista[0].id;
      setCuentaId(elegido);
      const [rm, rs] = await Promise.all([
        supabase.from("cruce_movimientos").select("*").eq("usuario_id", u.id).eq("cuenta_id", elegido).order("fecha").order("creado_en"),
        supabase.from("cruce_soportes").select("*").eq("usuario_id", u.id).order("creado_en"),
      ]);
      setMovs(
        (rm.data ?? []).map((m: any) => ({
          id: m.id,
          cuentaId: m.cuenta_id,
          mes: m.mes,
          fecha: String(m.fecha).slice(0, 10),
          concepto: m.concepto,
          monto: Number(m.monto),
          valor: Math.abs(Number(m.monto)),
          clase: m.clase === "pago" ? "pago" : "gasto",
          quien: m.quien === "yo" ? "yo" : "otra",
          nota: m.nota ?? "",
        }))
      );
      setSoportes((rs.data ?? []).map((x: any) => ({ id: x.id, movimientoId: x.movimiento_id, nombre: x.nombre, ruta: x.ruta, tipo: x.tipo ?? "" })));
      setError(null);
      setCargando(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cuentaId]
  );

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cuenta = cuentas.find((c) => c.id === cuentaId) ?? null;

  /** Saldo mes a mes: el saldo final de un mes es el saldo anterior del siguiente. */
  const historial = useMemo<FilaHistorial[]>(() => {
    if (!cuenta) return [];
    const meses = new Set<string>([cuenta.desde, mes]);
    movs.forEach((m) => meses.add(m.mes));
    const orden = [...meses].sort();
    // todos los meses seguidos entre el primero y el último (máx. 60)
    const filas: FilaHistorial[] = [];
    let actual = orden[0];
    const ultimo = orden[orden.length - 1];
    let prev = 0;
    let n = 0;
    while (actual <= ultimo && n < 60) {
      const delMes = movs.filter((m) => m.mes === actual).reduce((s, m) => s + m.monto, 0);
      const anterior = actual < cuenta.desde ? 0 : actual === cuenta.desde ? cuenta.saldoInicial : prev;
      const final = redondear(anterior + delMes);
      filas.push({ mes: actual, anterior: redondear(anterior), movimientos: redondear(delMes), final });
      prev = final;
      actual = moverMes(actual, 1);
      n++;
    }
    return filas;
  }, [cuenta, movs, mes]);

  const filaMes = historial.find((f) => f.mes === mes) ?? { mes, anterior: 0, movimientos: 0, final: 0 };
  const movsMes = movs.filter((m) => m.mes === mes);

  async function seleccionarCuenta(id: string) {
    await cargar(id);
  }

  async function crearCuenta(nombre: string) {
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) throw new Error("Tu sesión expiró.");
    const { data, error: err } = await supabase.from("cruce_cuentas").insert({ usuario_id: uid, nombre: nombre.trim() || "Nueva cuenta", saldo_inicial: 0, desde: mesHoy() }).select("id").single();
    if (err) throw err;
    await cargar((data as any).id);
  }

  async function guardarCuenta(c: Partial<Omit<Cuenta, "id">>) {
    if (!cuenta) return;
    const cambios: any = {};
    if (c.nombre !== undefined) cambios.nombre = c.nombre.trim() || cuenta.nombre;
    if (c.saldoInicial !== undefined) cambios.saldo_inicial = c.saldoInicial;
    if (c.desde !== undefined) cambios.desde = c.desde;
    if (c.datosYo !== undefined) cambios.datos_yo = c.datosYo.trim() || null;
    if (c.datosOtra !== undefined) cambios.datos_otra = c.datosOtra.trim() || null;
    const { error: err } = await supabase.from("cruce_cuentas").update(cambios).eq("id", cuenta.id);
    if (err) throw err;
    await cargar(cuenta.id);
  }

  async function guardarMov(e: EntradaMov): Promise<string> {
    if (!cuenta) throw new Error("No hay cuenta.");
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) throw new Error("Tu sesión expiró.");
    const monto = redondear(e.quien === "otra" ? e.valor : -e.valor);
    const fila = { cuenta_id: cuenta.id, mes: e.fecha.slice(0, 7), fecha: e.fecha, concepto: e.concepto.trim(), monto, clase: e.clase, quien: e.quien, nota: e.nota?.trim() || null };
    let id = e.id;
    if (id) {
      const { error: err } = await supabase.from("cruce_movimientos").update(fila).eq("id", id);
      if (err) throw err;
    } else {
      const { data, error: err } = await supabase.from("cruce_movimientos").insert({ ...fila, usuario_id: uid }).select("id").single();
      if (err) throw err;
      id = (data as any).id as string;
    }
    await cargar(cuenta.id);
    return id!;
  }

  async function borrarMov(id: string) {
    const propios = soportes.filter((s) => s.movimientoId === id);
    if (propios.length) await supabase.storage.from(BUCKET).remove(propios.map((s) => s.ruta));
    const { error: err } = await supabase.from("cruce_movimientos").delete().eq("id", id);
    if (err) throw err;
    await cargar(cuentaId);
  }

  async function subirSoporte(movimientoId: string, file: File) {
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) throw new Error("Tu sesión expiró.");
    const blob = await reducirFoto(file);
    const tipo = blob.type || file.type || "application/octet-stream";
    const ext = extensionDe(file.name, tipo);
    const ruta = `${uid}/cruce/${cuentaId}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error: e1 } = await supabase.storage.from(BUCKET).upload(ruta, blob, { contentType: tipo });
    if (e1) throw new Error(`No se pudo subir el archivo: ${e1.message}`);
    const { error: e2 } = await supabase.from("cruce_soportes").insert({ usuario_id: uid, movimiento_id: movimientoId, nombre: file.name, ruta, tipo });
    if (e2) {
      await supabase.storage.from(BUCKET).remove([ruta]);
      throw e2;
    }
    await cargar(cuentaId);
  }

  async function borrarSoporte(s: SoporteCruce) {
    await supabase.storage.from(BUCKET).remove([s.ruta]);
    const { error: err } = await supabase.from("cruce_soportes").delete().eq("id", s.id);
    if (err) throw err;
    await cargar(cuentaId);
  }

  async function urlSoporte(s: SoporteCruce): Promise<string | null> {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(s.ruta, 60 * 10);
    return data?.signedUrl ?? null;
  }

  async function bytesSoporte(s: SoporteCruce): Promise<Uint8Array | null> {
    const { data } = await supabase.storage.from(BUCKET).download(s.ruta);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  }

  return { cuentas, cuenta, miNombre, movs, movsMes, soportes, historial, filaMes, cargando, faltaSql, error, seleccionarCuenta, crearCuenta, guardarCuenta, guardarMov, borrarMov, subirSoporte, borrarSoporte, urlSoporte, bytesSoporte };
}

// ---- textos del saldo (comparten pantalla, Excel y PDF) ----
const enFrase = (nombre: string) => (/^mi\s/i.test(nombre) ? nombre.charAt(0).toLowerCase() + nombre.slice(1) : nombre);
const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function fraseSaldo(saldo: number, yo: string, otra: string): string {
  const pers = enFrase(otra);
  if (Math.abs(saldo) < 1) return "Cuentas en cero: nadie le debe a nadie";
  if (saldo > 0) return yo === "Yo" ? `Yo le debo a ${pers}` : `${yo} le debe a ${pers}`;
  return yo === "Yo" ? conMayuscula(`${pers} me debe`) : `${conMayuscula(pers)} le debe a ${yo}`;
}

/** Quién paga a quién y dónde, según el signo del saldo. */
export function comoSalda(saldo: number, yo: string, c: Cuenta): { paga: string; recibe: string; donde: string } | null {
  if (Math.abs(saldo) < 1) return null;
  const pers = enFrase(c.nombre);
  if (saldo > 0) return { paga: yo === "Yo" ? "Yo" : yo, recibe: conMayuscula(pers), donde: c.datosOtra };
  return { paga: conMayuscula(pers), recibe: yo === "Yo" ? "mí" : yo, donde: c.datosYo };
}
