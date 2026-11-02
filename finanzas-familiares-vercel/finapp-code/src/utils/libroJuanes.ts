// Actualiza el libro de Excel REAL de Jenny (con toda su historia y sus fórmulas) con los datos de un mes.
// No reconstruye el libro: lo abre (es un ZIP con XML), escribe solo el bloque del mes en la hoja del año
// (con fórmulas como =235000/2), ajusta el TOTAL, el PAGO y la hoja RESUMEN 2, recalcula los valores y lo vuelve a empaquetar.
import { zip } from "./xlsx";

export interface GastoDetalle {
  fecha: string;
  concepto: string;
  detalle: string;
  valor: number; // valor TOTAL (la parte de él se calcula con el porcentaje)
  soporte: string; // nombres de archivo o «SIN SOPORTE»
}
export interface EntradaMes {
  mes: string; // AAAA-MM
  porcentaje: number;
  cuota: number; // 0 = dejar la fórmula/valor que ya tiene el libro
  pago: number;
  gastos: GastoDetalle[];
}
export interface ResultadoLibro {
  bytes: Uint8Array;
  saldo: number;
  saldoAnterior: number;
  cuotaLibro: number;
  avisos: string[];
}

// ---------- ZIP ----------
type Archivos = Map<string, Uint8Array>;
const dec = new TextDecoder();
const enc = new TextEncoder();

async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as any).DecompressionStream;
  if (!DS) throw new Error("Este navegador no puede abrir el Excel. Usa una versión reciente de Chrome, Edge o Safari.");
  const flujo = new Blob([datos as unknown as BlobPart]).stream().pipeThrough(new DS("deflate-raw"));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

export async function leerZip(b: Uint8Array): Promise<Archivos> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fin = -1;
  for (let i = b.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("El archivo no es un Excel válido (.xlsx).");
  const n = dv.getUint16(fin + 10, true);
  let p = dv.getUint32(fin + 16, true);
  const salida: Archivos = new Map();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Excel dañado.");
    const metodo = dv.getUint16(p + 10, true);
    const tam = dv.getUint32(p + 20, true);
    const lnom = dv.getUint16(p + 28, true);
    const lext = dv.getUint16(p + 30, true);
    const lcom = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const nombre = dec.decode(b.subarray(p + 46, p + 46 + lnom));
    const lnomL = dv.getUint16(off + 26, true);
    const lextL = dv.getUint16(off + 28, true);
    const ini = off + 30 + lnomL + lextL;
    const crudo = b.subarray(ini, ini + tam);
    if (!nombre.endsWith("/")) salida.set(nombre, metodo === 0 ? crudo.slice() : await inflar(crudo));
    p += 46 + lnom + lext + lcom;
  }
  return salida;
}

// ---------- utilidades de celdas ----------
const colNum = (s: string) => s.split("").reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
const colLetra = (n: number) => {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const partesRef = (ref: string) => {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref)!;
  return { col: colNum(m[1]), fila: Number(m[2]) };
};
const escXml = (t: string) => t.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c] as string)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const desescXml = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function textosCompartidos(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => desescXml(t[1])).join(""));
}

// ---------- modelo de hojas (para recalcular) ----------
interface CeldaM {
  f?: string;
  v?: number | string;
}
interface HojaM {
  nombre: string;
  ruta: string;
  celdas: Map<string, CeldaM>;
}

function trasladar(f: string, df: number, dc: number): string {
  // mueve las referencias relativas (sin $) de una fórmula compartida
  return f.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(])/g, (_, d1, c, d2, r) => `${d1}${d1 ? c : colLetra(colNum(c) + dc)}${d2}${d2 ? r : Number(r) + df}`);
}

function leerHoja(nombre: string, ruta: string, xml: string, textos: string[]): HojaM {
  const celdas = new Map<string, CeldaM>();
  const compartidas = new Map<string, { f: string; fila: number; col: number }>();
  for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = m[1];
    const attrs = m[2];
    const cuerpo = m[3] ?? "";
    const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
    const c: CeldaM = {};
    const fm = /<f([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(cuerpo);
    if (fm) {
      const fa = fm[1];
      const si = /\bsi="(\d+)"/.exec(fa)?.[1];
      const { col, fila } = partesRef(ref);
      if (fm[2] !== undefined && fm[2] !== "") {
        c.f = desescXml(fm[2]);
        if (/t="shared"/.test(fa) && si !== undefined) compartidas.set(si, { f: c.f, fila, col });
      } else if (si !== undefined && compartidas.has(si)) {
        const base = compartidas.get(si)!;
        c.f = trasladar(base.f, fila - base.fila, col - base.col);
      }
    }
    const vm = /<v>([\s\S]*?)<\/v>/.exec(cuerpo);
    if (t === "inlineStr") c.v = [...cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => desescXml(x[1])).join("");
    else if (vm) {
      if (t === "s") c.v = textos[Number(vm[1])] ?? "";
      else if (t === "str" || t === "e") c.v = desescXml(vm[1]);
      else c.v = Number(vm[1]);
    }
    if (c.f !== undefined || c.v !== undefined) celdas.set(ref, c);
  }
  return { nombre, ruta, celdas };
}

// ---------- evaluador de fórmulas (suma, resta, multiplicación, división, %, SUM, referencias entre hojas) ----------
class Calculadora {
  private memo = new Map<string, number>();
  private enCurso = new Set<string>();
  constructor(private hojas: Map<string, HojaM>) {}

  valor(hoja: string, ref: string): number {
    const h = this.hojas.get(hoja);
    const c = h?.celdas.get(ref);
    if (!c) return 0;
    if (c.f === undefined) return typeof c.v === "number" ? c.v : 0;
    const clave = `${hoja}!${ref}`;
    if (this.memo.has(clave)) return this.memo.get(clave)!;
    if (this.enCurso.has(clave)) return 0;
    this.enCurso.add(clave);
    let r = 0;
    try {
      r = this.evaluar(c.f, hoja);
    } catch {
      r = NaN;
    }
    this.enCurso.delete(clave);
    this.memo.set(clave, r);
    return r;
  }

  private evaluar(f: string, hoja: string): number {
    const t = tokenizar(f);
    let i = 0;
    const self = this;
    const peek = () => t[i];
    const prox = () => t[i++];
    function rango(h: string, a: string, b: string): number[] {
      const A = partesRef(a);
      const B = partesRef(b);
      const out: number[] = [];
      for (let r = Math.min(A.fila, B.fila); r <= Math.max(A.fila, B.fila); r++)
        for (let c = Math.min(A.col, B.col); c <= Math.max(A.col, B.col); c++) {
          const cel = self.hojas.get(h)?.celdas.get(`${colLetra(c)}${r}`);
          if (cel && cel.f === undefined && typeof cel.v !== "number") continue; // texto: no suma
          out.push(self.valor(h, `${colLetra(c)}${r}`));
        }
      return out;
    }
    function primario(): number {
      const k = prox();
      if (!k) throw new Error("fórmula incompleta");
      if (k.t === "num") return k.n!;
      if (k.t === "op" && k.s === "-") return -unario();
      if (k.t === "op" && k.s === "+") return unario();
      if (k.t === "op" && k.s === "(") {
        const v = suma();
        if (prox()?.s !== ")") throw new Error("falta )");
        return v;
      }
      if (k.t === "fn") {
        if (k.s !== "SUM") throw new Error("función no soportada " + k.s);
        prox(); // (
        let total = 0;
        while (peek() && peek().s !== ")") {
          const p = peek();
          if (p.t === "ref") {
            prox();
            if (p.r2) rango(p.h ?? hoja, p.r!, p.r2).forEach((x) => (total += x));
            else {
              const cel = self.hojas.get(p.h ?? hoja)?.celdas.get(p.r!);
              if (!cel || cel.f !== undefined || typeof cel.v === "number") total += self.valor(p.h ?? hoja, p.r!);
            }
          } else total += suma();
          if (peek()?.s === ",") prox();
        }
        prox(); // )
        return total;
      }
      if (k.t === "ref") {
        if (k.r2) throw new Error("rango fuera de SUM");
        return self.valor(k.h ?? hoja, k.r!);
      }
      throw new Error("token inesperado");
    }
    function unario(): number {
      return postfijo();
    }
    function postfijo(): number {
      let v = primario();
      while (peek()?.t === "op" && peek().s === "%") {
        prox();
        v /= 100;
      }
      return v;
    }
    function producto(): number {
      let v = postfijo();
      while (peek()?.t === "op" && (peek().s === "*" || peek().s === "/")) {
        const o = prox().s;
        const w = postfijo();
        v = o === "*" ? v * w : v / w;
      }
      return v;
    }
    function suma(): number {
      let v = producto();
      while (peek()?.t === "op" && (peek().s === "+" || peek().s === "-")) {
        const o = prox().s;
        const w = producto();
        v = o === "+" ? v + w : v - w;
      }
      return v;
    }
    const res = suma();
    if (i < t.length) throw new Error("sobran símbolos");
    return res;
  }
}

interface Tok {
  t: "num" | "op" | "ref" | "fn";
  s?: string;
  n?: number;
  h?: string;
  r?: string;
  r2?: string;
}
function tokenizar(f: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < f.length) {
    const ch = f[i];
    if (ch === " ") {
      i++;
      continue;
    }
    let m: RegExpExecArray | null;
    const resto = f.slice(i);
    if ((m = /^(?:'([^']+)'|([A-Za-z_][\w.]*))!(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?/.exec(resto))) {
      out.push({ t: "ref", h: m[1] ?? m[2], r: m[3].replace(/\$/g, ""), r2: m[4]?.replace(/\$/g, "") });
      i += m[0].length;
    } else if ((m = /^([A-Za-z]+)\(/.exec(resto))) {
      out.push({ t: "fn", s: m[1].toUpperCase() });
      i += m[1].length;
    } else if ((m = /^(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?/.exec(resto))) {
      out.push({ t: "ref", r: m[1].replace(/\$/g, ""), r2: m[2]?.replace(/\$/g, "") });
      i += m[0].length;
    } else if ((m = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)/.exec(resto))) {
      out.push({ t: "num", n: Number(m[1]) });
      i += m[0].length;
    } else if ("+-*/%(),".includes(ch)) {
      out.push({ t: "op", s: ch });
      i++;
    } else throw new Error("símbolo no soportado: " + ch);
  }
  return out;
}

// ---------- lectura de estructura del libro ----------
function rutasHojas(archivos: Archivos): { nombre: string; ruta: string; id: string }[] {
  const wb = dec.decode(archivos.get("xl/workbook.xml")!);
  const rels = dec.decode(archivos.get("xl/_rels/workbook.xml.rels")!);
  const destino = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const tg = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && tg) destino.set(id, tg.startsWith("/") ? tg.slice(1) : `xl/${tg}`);
  }
  return [...wb.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => {
    const id = /r:id="([^"]+)"/.exec(m[1])![1];
    return { nombre: desescXml(/\bname="([^"]*)"/.exec(m[1])![1]), ruta: destino.get(id)!, id };
  });
}

function modelo(archivos: Archivos): Map<string, HojaM> {
  const textos = archivos.has("xl/sharedStrings.xml") ? textosCompartidos(dec.decode(archivos.get("xl/sharedStrings.xml")!)) : [];
  const hojas = new Map<string, HojaM>();
  for (const h of rutasHojas(archivos)) hojas.set(h.nombre, leerHoja(h.nombre, h.ruta, dec.decode(archivos.get(h.ruta)!), textos));
  return hojas;
}

/** Recalcula todas las fórmulas y escribe los valores guardados (para que se vean bien aunque el visor no recalcule). */
function escribirValores(archivos: Archivos, hojas: Map<string, HojaM>) {
  const calc = new Calculadora(hojas);
  for (const h of hojas.values()) {
    const xml = dec.decode(archivos.get(h.ruta)!);
    const nuevo = xml.replace(/<c r="([A-Z]+\d+)"((?:\s+[\w:]+="[^"]*")*)\s*>([\s\S]*?)<\/c>/g, (todo, ref: string, attrs: string, cuerpo: string) => {
      const fm = /<f[^>]*?(?:\/>|>[\s\S]*?<\/f>)/.exec(cuerpo);
      if (!fm) return todo;
      const v = calc.valor(h.nombre, ref);
      const a = attrs.replace(/\s*\bt="[^"]*"/, "");
      return Number.isFinite(v) ? `<c r="${ref}"${a}>${fm[0]}<v>${v}</v></c>` : `<c r="${ref}"${a} t="e">${fm[0]}<v>#VALUE!</v></c>`;
    });
    archivos.set(h.ruta, enc.encode(nuevo));
  }
  return calc;
}

// ---------- edición de celdas en el XML ----------
const reCelda = (ref: string) => new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);

interface Escritura {
  f?: string;
  n?: number;
  texto?: string;
}
function ponerCelda(xml: string, ref: string, w: Escritura | null, estiloPorDefecto?: string): string {
  const m = reCelda(ref).exec(xml);
  const estilo = (m && /\bs="([^"]+)"/.exec(m[1])?.[1]) ?? estiloPorDefecto;
  const s = estilo ? ` s="${estilo}"` : "";
  let nueva: string;
  if (!w) nueva = `<c r="${ref}"${s}/>`;
  else if (w.texto !== undefined) nueva = `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escXml(w.texto)}</t></is></c>`;
  else if (w.f !== undefined) nueva = `<c r="${ref}"${s}><f>${escXml(w.f)}</f></c>`;
  else nueva = `<c r="${ref}"${s}><v>${w.n}</v></c>`;
  if (m) return xml.replace(m[0], () => nueva);
  const { col, fila } = partesRef(ref);
  const rm = new RegExp(`<row r="${fila}"([^>]*?)(/>|>([\\s\\S]*?)</row>)`).exec(xml);
  if (!rm) throw new Error(`No encuentro la fila ${fila} en la hoja.`);
  if (rm[2] === "/>") return xml.replace(rm[0], () => `<row r="${fila}"${rm[1]}>${nueva}</row>`);
  const celdas = [...rm[3].matchAll(/<c r="([A-Z]+)\d+"/g)];
  const siguiente = celdas.find((c) => colNum(c[1]) > col);
  const cuerpo = siguiente ? rm[3].replace(`<c r="${siguiente[1]}${fila}"`, () => `${nueva}<c r="${siguiente[1]}${fila}"`) : rm[3] + nueva;
  return xml.replace(rm[0], () => `<row r="${fila}"${rm[1]}>${cuerpo}</row>`);
}

// ---------- reglas del bloque mensual ----------
const FILA_CUOTA = 3;
const FILAS_CONCEPTO = [4, 5, 6, 7, 8, 9];
const FILA_TOTAL = 10;
const FILA_PAGO = 12;
const FILA_SALDO = 14;

function claveConcepto(t: string): string {
  const x = sinTildes(t);
  if (/pension/.test(x)) return "pension";
  if (/ruta|transporte/.test(x)) return "ruta";
  if (/natacion|tenis|curso/.test(x)) return "natacion";
  if (/uniforme|tennis/.test(x)) return "uniforme";
  if (/cita|medic|salud|gafa|droga|terapia|odont/.test(x)) return "salud";
  if (/alimentacion|almuerzo|restaurante/.test(x)) return "alimentacion";
  if (/matricula|libros|lista|utiles|maleta/.test(x)) return "util";
  if (/onces?/.test(x)) return "onces";
  return "otro:" + x;
}
const esSalud = (t: string) => /medic|cita|gafa|salud|droga|terapia|odont/.test(sinTildes(t));

const redondear = (n: number) => String(Math.round(n * 100) / 100);
function formulaParte(totales: number[], porc: number): string {
  const suma = totales.map(redondear).join("+");
  const cuerpo = totales.length > 1 ? `(${suma})` : suma;
  if (porc === 50) return `${cuerpo}/2`;
  return `${cuerpo}*${redondear(porc)}%`;
}

function textoCelda(hoja: HojaM, ref: string): string {
  const v = hoja.celdas.get(ref)?.v;
  return typeof v === "string" ? v : "";
}

// ---------- hoja de detalle (con estilos agregados al libro) ----------
function agregarEstilos(archivos: Archivos): { titulo: number; encabezado: number; dinero: number; dineroNegrita: number; negrita: number } {
  let st = dec.decode(archivos.get("xl/styles.xml")!);
  const fuentes = /<fonts count="(\d+)"/.exec(st);
  const xfs = /<cellXfs count="(\d+)"/.exec(st);
  if (!fuentes || !xfs) throw new Error("No pude leer los estilos del libro.");
  const nf = Number(fuentes[1]);
  const nx = Number(xfs[1]);
  st = st.replace(/<fonts count="\d+"([^>]*)>/, `<fonts count="${nf + 2}"$1>`).replace("</fonts>", `<font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>`);
  const nuevos = [
    `<xf numFmtId="0" fontId="${nf + 1}" fillId="0" borderId="0" xfId="0" applyFont="1"/>`, // título
    `<xf numFmtId="0" fontId="${nf}" fillId="0" borderId="0" xfId="0" applyFont="1"/>`, // encabezado / negrita
    `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`, // dinero
    `<xf numFmtId="3" fontId="${nf}" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>`, // dinero negrita
  ];
  st = st.replace(/<cellXfs count="\d+"([^>]*)>/, `<cellXfs count="${nx + nuevos.length}"$1>`).replace("</cellXfs>", `${nuevos.join("")}</cellXfs>`);
  archivos.set("xl/styles.xml", enc.encode(st));
  return { titulo: nx, encabezado: nx + 1, negrita: nx + 1, dinero: nx + 2, dineroNegrita: nx + 3 };
}

function xmlHojaDetalle(nombreMes: string, porc: number, gastos: GastoDetalle[], e: ReturnType<typeof agregarEstilos>): string {
  const celdaT = (ref: string, t: string, s = 0) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escXml(t)}</t></is></c>`;
  const celdaN = (ref: string, n: number, s: number) => `<c r="${ref}" s="${s}"><v>${n}</v></c>`;
  const celdaF = (ref: string, f: string, s: number) => `<c r="${ref}" s="${s}"><f>${escXml(f)}</f></c>`;
  const filas: string[] = [];
  filas.push(`<row r="1">${celdaT("A1", `Detalle de gastos de Juanes - ${nombreMes}`, e.titulo)}</row>`);
  filas.push(`<row r="2">${celdaT("A2", `Parte a cargo de Juan Carlos Bernal: ${porc}% (cada valor «A cargo» es una fórmula: valor total x ${porc}%)`)}</row>`);
  filas.push(`<row r="4">${["Fecha", "Concepto", "Detalle", "Valor total", "A cargo de Juan Carlos", "Soporte (archivo en la carpeta Soportes del ZIP)"].map((t, i) => celdaT(`${colLetra(i + 1)}4`, t, e.encabezado)).join("")}</row>`);
  let r = 5;
  for (const g of gastos) {
    filas.push(`<row r="${r}">${celdaT(`A${r}`, g.fecha)}${celdaT(`B${r}`, g.concepto)}${celdaT(`C${r}`, g.detalle)}${celdaN(`D${r}`, Math.round(g.valor * 100) / 100, e.dinero)}${celdaF(`E${r}`, `D${r}*${porc}%`, e.dinero)}${celdaT(`F${r}`, g.soporte)}</row>`);
    r++;
  }
  if (gastos.length) filas.push(`<row r="${r + 1}">${celdaT(`A${r + 1}`, "TOTAL", e.negrita)}${celdaF(`D${r + 1}`, `SUM(D5:D${r - 1})`, e.dineroNegrita)}${celdaF(`E${r + 1}`, `SUM(E5:E${r - 1})`, e.dineroNegrita)}</row>`);
  const cols = [12, 28, 44, 16, 22, 60].map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${filas.join("")}</sheetData></worksheet>`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// ---------- función principal ----------
export async function actualizarLibro(base: Uint8Array, e: EntradaMes): Promise<ResultadoLibro> {
  const archivos = await leerZip(base);
  const avisos: string[] = [];
  const anio = e.mes.slice(0, 4);
  const m = Number(e.mes.slice(5, 7));
  const hojasInfo = rutasHojas(archivos);
  const infoAnio = hojasInfo.find((h) => h.nombre.trim() === anio);
  if (!infoAnio) throw new Error(`Tu libro no tiene una hoja llamada «${anio}». Crea la hoja del año (copiando la anterior) y vuelve a subir el libro.`);

  const hojas0 = modelo(archivos);
  const hojaAnio = hojas0.get(infoAnio.nombre)!;
  const cL = 2 + 2 * (m - 1); // columna del nombre del concepto
  const cV = cL + 1; // columna del valor
  const L = colLetra(cL);
  const V = colLetra(cV);
  const Vprev = m > 1 ? colLetra(cV - 2) : null;
  let xml = dec.decode(archivos.get(infoAnio.ruta)!);

  // 1) conceptos del mes (suma de valores totales por concepto, conservando cada valor para la fórmula)
  const grupos = new Map<string, { nombre: string; totales: number[] }>();
  for (const g of e.gastos) {
    const k = claveConcepto(g.concepto);
    const x = grupos.get(k) ?? { nombre: g.concepto.trim(), totales: [] };
    x.totales.push(g.valor);
    grupos.set(k, x);
  }
  // 2) asignar a las filas 4..9 según los nombres que ya trae el bloque del mes
  const slots = FILAS_CONCEPTO.map((fila) => ({ fila, etiqueta: textoCelda(hojaAnio, `${L}${fila}`), usada: false }));
  const asignacion = new Map<number, { nombre: string; totales: number[]; cambiaEtiqueta: boolean }>();
  const pendientes: { nombre: string; totales: number[]; k: string }[] = [];
  for (const [k, g] of grupos) {
    const s = slots.find((x) => !x.usada && x.etiqueta.trim() !== "" && claveConcepto(x.etiqueta) === k);
    if (s) {
      s.usada = true;
      asignacion.set(s.fila, { ...g, cambiaEtiqueta: false });
    } else pendientes.push({ ...g, k });
  }
  for (const p of pendientes) {
    const s = slots.find((x) => !x.usada && x.etiqueta.trim() === "") ?? slots.find((x) => !x.usada);
    if (s) {
      s.usada = true;
      asignacion.set(s.fila, { nombre: p.nombre, totales: p.totales, cambiaEtiqueta: true });
    } else {
      // no caben más: se suman en «Otros» (última fila)
      const ult = asignacion.get(FILAS_CONCEPTO[FILAS_CONCEPTO.length - 1])!;
      ult.totales = [...ult.totales, ...p.totales];
      if (!/otros/i.test(ult.nombre)) ult.nombre = "Otros";
      ult.cambiaEtiqueta = true;
      avisos.push(`Había más conceptos de los que caben en el bloque del mes; «${p.nombre}» se sumó en «Otros» (el detalle completo está en la hoja de detalle).`);
    }
  }
  for (const s of slots) {
    const a = asignacion.get(s.fila);
    if (a) {
      if (a.cambiaEtiqueta) xml = ponerCelda(xml, `${L}${s.fila}`, { texto: a.nombre });
      xml = ponerCelda(xml, `${V}${s.fila}`, { f: formulaParte(a.totales, e.porcentaje) });
    } else xml = ponerCelda(xml, `${V}${s.fila}`, null); // se conserva el nombre pero sin valor
  }
  // 3) cuota, total, pago
  const calcAntes = new Calculadora(hojas0);
  const cuotaActual = calcAntes.valor(infoAnio.nombre, `${V}${FILA_CUOTA}`);
  if (e.cuota > 0 && Math.abs(e.cuota - cuotaActual) > 1) xml = ponerCelda(xml, `${V}${FILA_CUOTA}`, { n: Math.round(e.cuota * 100) / 100 });
  xml = ponerCelda(xml, `${V}${FILA_TOTAL}`, { f: `SUM(${V}${FILA_CUOTA}:${V}${FILAS_CONCEPTO[FILAS_CONCEPTO.length - 1]})` });
  xml = ponerCelda(xml, `${V}${FILA_PAGO}`, { n: e.pago });
  if (!reCelda(`${V}${FILA_SALDO}`).test(xml) || !/<f>/.test(reCelda(`${V}${FILA_SALDO}`).exec(xml)?.[2] ?? "")) {
    if (!Vprev) avisos.push("Enero: el saldo se arma con la hoja del año anterior; revisa la fórmula del saldo.");
    else xml = ponerCelda(xml, `${V}${FILA_SALDO}`, { f: `${Vprev}${FILA_SALDO}+${V}${FILA_TOTAL}-${V}${FILA_PAGO}` });
  }
  archivos.set(infoAnio.ruta, enc.encode(xml));

  // 4) RESUMEN 2: la columna del año se rearma con los meses hasta el último con datos
  const infoRes = hojasInfo.find((h) => h.nombre.trim().toUpperCase() === "RESUMEN 2");
  if (infoRes) {
    const hojasMid = modelo(archivos);
    const res = hojasMid.get(infoRes.nombre)!;
    const hojaA = hojasMid.get(infoAnio.nombre)!;
    let colAnio = "";
    for (const [ref, c] of res.celdas) if (/^[A-Z]+4$/.test(ref) && Number(c.v) === Number(anio)) colAnio = ref.replace("4", "");
    if (colAnio) {
      // último mes que ya trae el resumen (por sus propias fórmulas); el mes que se actualiza cuenta siempre
      let ultimo = m;
      const filaCuotaRes = (() => {
        for (const [ref, c] of res.celdas) if (/^B\d+$/.test(ref) && typeof c.v === "string" && sinTildes(c.v).startsWith("cuota")) return Number(ref.slice(1));
        return 0;
      })();
      const fExist = filaCuotaRes ? res.celdas.get(`${colAnio}${filaCuotaRes}`)?.f ?? "" : "";
      for (const mm of fExist.matchAll(/'[^']+'!([A-Z]+)\d+/g)) ultimo = Math.max(ultimo, Math.floor((colNum(mm[1]) - 3) / 2) + 1);
      const q = `'${infoAnio.nombre}'!`;
      const cuota: string[] = [];
      const colegio: string[] = [];
      const salud: string[] = [];
      const pagos: string[] = [];
      for (let k = 1; k <= ultimo; k++) {
        const lc = colLetra(2 + 2 * (k - 1));
        const vc = colLetra(3 + 2 * (k - 1));
        cuota.push(`${q}${vc}${FILA_CUOTA}`);
        pagos.push(`${q}${vc}${FILA_PAGO}`);
        for (const fila of FILAS_CONCEPTO) {
          const cel = hojaA.celdas.get(`${vc}${fila}`);
          const hay = cel && (cel.f !== undefined || (typeof cel.v === "number" && cel.v !== 0));
          if (!hay) continue;
          (esSalud(textoCelda(hojaA, `${lc}${fila}`)) ? salud : colegio).push(`${q}${vc}${fila}`);
        }
      }
      let rx = dec.decode(archivos.get(infoRes.ruta)!);
      const filaDe = (rotulo: string) => {
        for (const [ref, c] of res.celdas) if (/^B\d+$/.test(ref) && typeof c.v === "string" && sinTildes(c.v).startsWith(rotulo)) return Number(ref.slice(1));
        return 0;
      };
      const asignar = (rotulo: string, celdas: string[]) => {
        const fila = filaDe(rotulo);
        if (fila && celdas.length) rx = ponerCelda(rx, `${colAnio}${fila}`, { f: celdas.join("+") });
      };
      asignar("cuota", cuota);
      asignar("colegio", colegio);
      asignar("medicamentos", salud);
      asignar("pagos", pagos);
      archivos.set(infoRes.ruta, enc.encode(rx));
    } else avisos.push(`La hoja RESUMEN 2 no tiene una columna para ${anio}; no se actualizó el resumen.`);
  }

  // 5) hoja de detalle del mes (con soportes)
  const nombreDetalle = `Detalle ${e.mes}`;
  const est = agregarEstilos(archivos);
  const hojaXml = xmlHojaDetalle(`${MESES[m - 1]} ${anio}`, e.porcentaje, e.gastos, est);
  let wb = dec.decode(archivos.get("xl/workbook.xml")!);
  let rels = dec.decode(archivos.get("xl/_rels/workbook.xml.rels")!);
  let ct = dec.decode(archivos.get("[Content_Types].xml")!);
  const existente = hojasInfo.find((h) => h.nombre === nombreDetalle);
  if (existente) archivos.set(existente.ruta, enc.encode(hojaXml));
  else {
    let n = 1;
    while (archivos.has(`xl/worksheets/sheet${n}.xml`)) n++;
    const ruta = `xl/worksheets/sheet${n}.xml`;
    const ids = [...wb.matchAll(/sheetId="(\d+)"/g)].map((x) => Number(x[1]));
    const relIds = [...rels.matchAll(/\bId="rId(\d+)"/g)].map((x) => Number(x[1]));
    const rid = `rId${Math.max(0, ...relIds) + 1}`;
    archivos.set(ruta, enc.encode(hojaXml));
    wb = wb.replace("</sheets>", `<sheet name="${escXml(nombreDetalle)}" sheetId="${Math.max(0, ...ids) + 1}" r:id="${rid}"/></sheets>`);
    rels = rels.replace("</Relationships>", `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/></Relationships>`);
    ct = ct.replace("</Types>", `<Override PartName="/${ruta}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  }
  // 6) recalcular siempre al abrir y quitar la cadena de cálculo vieja
  wb = /<calcPr[^>]*\/>/.test(wb) ? wb.replace(/<calcPr([^>]*?)\/>/, (_, a) => `<calcPr${a.replace(/\s*fullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"/>`) : wb.replace("</workbook>", `<calcPr fullCalcOnLoad="1"/></workbook>`);
  if (archivos.has("xl/calcChain.xml")) {
    archivos.delete("xl/calcChain.xml");
    rels = rels.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/, "");
    ct = ct.replace(/<Override\b[^>]*calcChain[^>]*\/>/, "");
  }
  archivos.set("xl/workbook.xml", enc.encode(wb));
  archivos.set("xl/_rels/workbook.xml.rels", enc.encode(rels));
  archivos.set("[Content_Types].xml", enc.encode(ct));

  // 7) valores guardados de todas las fórmulas
  const hojasFin = modelo(archivos);
  const calc = escribirValores(archivos, hojasFin);
  const saldo = calc.valor(infoAnio.nombre, `${V}${FILA_SALDO}`);
  const saldoAnterior = Vprev ? calc.valor(infoAnio.nombre, `${Vprev}${FILA_SALDO}`) : 0;
  const cuotaLibro = calc.valor(infoAnio.nombre, `${V}${FILA_CUOTA}`);

  const lista = [...archivos.entries()].map(([nombre, datos]) => ({ nombre, datos }));
  lista.sort((a, b) => (a.nombre === "[Content_Types].xml" ? -1 : b.nombre === "[Content_Types].xml" ? 1 : 0));
  return { bytes: zip(lista), saldo, saldoAnterior, cuotaLibro, avisos };
}

/** Para pruebas y para mostrar el saldo que trae el libro sin modificarlo. */
export async function saldoDelLibro(base: Uint8Array, mes: string): Promise<{ saldo: number; cuota: number }> {
  const archivos = await leerZip(base);
  const hojas = modelo(archivos);
  const info = rutasHojas(archivos).find((h) => h.nombre.trim() === mes.slice(0, 4));
  if (!info) return { saldo: 0, cuota: 0 };
  const calc = new Calculadora(hojas);
  const V = colLetra(3 + 2 * (Number(mes.slice(5, 7)) - 1));
  return { saldo: calc.valor(info.nombre, `${V}${FILA_SALDO}`), cuota: calc.valor(info.nombre, `${V}${FILA_CUOTA}`) };
}

/** Solo para pruebas: recalcula todo el libro y devuelve el valor de cualquier celda. */
export async function valorCelda(base: Uint8Array, hoja: string, ref: string): Promise<number> {
  const archivos = await leerZip(base);
  return new Calculadora(modelo(archivos)).valor(hoja, ref);
}
