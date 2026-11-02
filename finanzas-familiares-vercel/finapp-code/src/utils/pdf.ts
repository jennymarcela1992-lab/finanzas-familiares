// Generador mínimo de PDF (sin librerías): texto, filas con valores, barras y saltos de página.
// Usa las fuentes estándar Helvetica y Helvetica-Bold, así que no hay que incrustar nada.

export type Bloque =
  | { t: "titulo"; texto: string; sub?: string }
  | { t: "seccion"; texto: string }
  | { t: "fila"; a: string; b?: string; c?: string; fuerte?: boolean; color?: [number, number, number] }
  | { t: "parrafo"; texto: string; color?: [number, number, number] }
  | { t: "barras"; meses: { etiqueta: string; ingresos: number; salidas: number; saldo: number; etiquetaSaldo: string }[] }
  | { t: "espacio"; n?: number };

const W = 595;
const H = 842;
const M = 40;
const AZUL: [number, number, number] = [0.04, 0.18, 0.36];
const NARANJA: [number, number, number] = [0.92, 0.41, 0.2];
const AZUL_SERIE: [number, number, number] = [0.16, 0.47, 0.84];
const GRIS: [number, number, number] = [0.45, 0.45, 0.45];

// anchos de Helvetica (milésimas de em) para los caracteres ASCII 32..126
const ANCHOS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const limpiar = (t: string) =>
  t
    .replace(/[−–—]/g, "-")
    .replace(/[▲]/g, "^")
    .replace(/[▼]/g, "v")
    .replace(/[•]/g, "-")
    .replace(/[^\u0000-ÿ]/g, "?");

function ancho(t: string, tam: number, negrita = false) {
  let w = 0;
  for (const ch of t.normalize("NFD").replace(/[̀-ͯ]/g, "")) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? ANCHOS[c - 32] : 556;
  }
  return (w / 1000) * tam * (negrita ? 1.07 : 1);
}

const esc = (t: string) => limpiar(t).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const col = (c: [number, number, number]) => `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`;
const num = (n: number) => n.toFixed(2);

function partir(texto: string, tam: number, maxAncho: number, negrita = false): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ancho(prueba, tam, negrita) <= maxAncho || !actual) actual = prueba;
    else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

export function crearPdf(bloques: Bloque[], pie = "Finanzas Familiares"): Uint8Array {
  const paginas: string[][] = [[]];
  let y = H - M; // y medida desde abajo
  const pag = () => paginas[paginas.length - 1];
  const nueva = () => {
    paginas.push([]);
    y = H - M;
  };
  const asegurar = (alto: number) => {
    if (y - alto < M + 20) nueva();
  };
  const texto = (x: number, yy: number, t: string, tam: number, negrita = false, color: [number, number, number] = [0.1, 0.1, 0.1]) =>
    pag().push(`BT /${negrita ? "F2" : "F1"} ${tam} Tf ${col(color)} rg ${num(x)} ${num(yy)} Td (${esc(t)}) Tj ET`);
  const rect = (x: number, yy: number, w: number, h: number, color: [number, number, number]) => pag().push(`${col(color)} rg ${num(x)} ${num(yy)} ${num(w)} ${num(h)} re f`);

  for (const b of bloques) {
    if (b.t === "titulo") {
      asegurar(70);
      rect(0, H - 78, W, 78, AZUL);
      texto(M, H - 40, b.texto, 20, true, [1, 1, 1]);
      if (b.sub) texto(M, H - 60, b.sub, 10, false, [0.85, 0.9, 1]);
      y = H - 78 - 24;
    } else if (b.t === "seccion") {
      asegurar(40);
      y -= 8;
      texto(M, y, b.texto.toUpperCase(), 10, true, AZUL);
      y -= 4;
      pag().push(`${col([0.8, 0.8, 0.8])} RG 0.6 w ${num(M)} ${num(y)} m ${num(W - M)} ${num(y)} l S`);
      y -= 14;
    } else if (b.t === "fila") {
      const maxA = W - 2 * M - (b.b ? 130 : 0) - (b.c ? 70 : 0);
      const lineas = partir(b.a, 10, maxA, !!b.fuerte);
      asegurar(lineas.length * 13);
      lineas.forEach((l, i) => {
        texto(M, y, l, 10, !!b.fuerte, b.color ?? [0.1, 0.1, 0.1]);
        if (i === 0 && b.b) texto(W - M - (b.c ? 70 : 0) - ancho(b.b, 10, !!b.fuerte), y, b.b, 10, !!b.fuerte, b.color ?? [0.1, 0.1, 0.1]);
        if (i === 0 && b.c) texto(W - M - ancho(b.c, 9), y, b.c, 9, false, GRIS);
        y -= 13;
      });
    } else if (b.t === "parrafo") {
      const lineas = partir(b.texto, 9.5, W - 2 * M);
      lineas.forEach((l) => {
        asegurar(13);
        texto(M, y, l, 9.5, false, b.color ?? [0.25, 0.25, 0.25]);
        y -= 12.5;
      });
      y -= 3;
    } else if (b.t === "barras") {
      const alto = 110;
      asegurar(alto + 56);
      const max = Math.max(1, ...b.meses.map((m) => Math.max(m.ingresos, m.salidas)));
      const base = y - alto;
      const colW = (W - 2 * M) / b.meses.length;
      b.meses.forEach((m, i) => {
        const x0 = M + i * colW + colW / 2 - 17;
        const hI = Math.max(1, (m.ingresos / max) * alto);
        const hS = Math.max(1, (m.salidas / max) * alto);
        rect(x0, base, 16, hI, AZUL_SERIE);
        rect(x0 + 18, base, 16, hS, NARANJA);
        texto(M + i * colW + colW / 2 - ancho(m.etiqueta, 9) / 2, base - 12, m.etiqueta, 9, false);
        texto(M + i * colW + colW / 2 - ancho(m.etiquetaSaldo, 8, true) / 2, base - 23, m.etiquetaSaldo, 8, true, m.saldo < 0 ? [0.8, 0.2, 0.2] : [0.1, 0.5, 0.3]);
      });
      pag().push(`${col([0.7, 0.7, 0.7])} RG 0.6 w ${num(M)} ${num(base)} m ${num(W - M)} ${num(base)} l S`);
      rect(M, base - 40, 8, 8, AZUL_SERIE);
      texto(M + 12, base - 39, "Ingresos", 8.5);
      rect(M + 70, base - 40, 8, 8, NARANJA);
      texto(M + 82, base - 39, "Salidas", 8.5);
      texto(M + 140, base - 39, "Debajo de cada mes: saldo (+ sobro, - falto)", 8, false, GRIS);
      y = base - 54;
    } else {
      y -= b.n ?? 8;
    }
  }

  // ---- armado del archivo ----
  const objetos: string[] = [];
  const total = paginas.length;
  // 1 catálogo, 2 páginas, 3 y 4 fuentes, luego (página, contenido) por cada hoja
  objetos[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const kids = paginas.map((_, i) => `${5 + i * 2} 0 R`).join(" ");
  objetos[2] = `<< /Type /Pages /Kids [${kids}] /Count ${total} >>`;
  objetos[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objetos[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  paginas.forEach((cont, i) => {
    const pieTxt = `${pie} - pagina ${i + 1} de ${total}`;
    const flujo = [...cont, `BT /F1 8 Tf ${col(GRIS)} rg ${num(W / 2 - ancho(pieTxt, 8) / 2)} 24 Td (${esc(pieTxt)}) Tj ET`].join("\n");
    objetos[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`;
    objetos[6 + i * 2] = `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`;
  });
  let salida = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objetos.length; i++) {
    offsets[i] = salida.length;
    salida += `${i} 0 obj\n${objetos[i]}\nendobj\n`;
  }
  const xref = salida.length;
  salida += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objetos.length; i++) salida += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  salida += `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(salida.length);
  for (let i = 0; i < salida.length; i++) bytes[i] = salida.charCodeAt(i) & 0xff;
  return bytes;
}

/** Descarga el PDF en el navegador. Devuelve false si no se puede (celular nativo). */
export function descargarPdf(nombreArchivo: string, bloques: Bloque[]): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;
  const bytes = crearPdf(bloques);
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
