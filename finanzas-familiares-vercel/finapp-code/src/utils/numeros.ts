// Convierte lo que la persona escribe en un número, entendiendo el formato colombiano:
//   "100.000.000" -> 100000000   "45.000" -> 45000   "$1.250.000,50" -> 1250000.5
//   "1,8" -> 1.8   "1.8" -> 1.8   "24,5%" -> 24.5   "12.50" (dólares) -> 12.5
export function aNumero(texto: string | null | undefined): number {
  if (!texto) return NaN;
  let s = String(texto).replace(/[^\d.,-]/g, "");
  if (!s) return NaN;
  const tienePunto = s.includes(".");
  const tieneComa = s.includes(",");
  if (tienePunto && tieneComa) {
    // el separador que aparece de último es el decimal
    const decimal = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const miles = decimal === "," ? "." : ",";
    s = s.split(miles).join("").replace(decimal, ".");
  } else if (tieneComa) {
    const partes = s.split(",");
    s = partes.length === 2 && partes[1].length !== 3 ? partes.join(".") : partes.join("");
  } else if (tienePunto) {
    const partes = s.split(".");
    s = partes.length === 2 && partes[1].length !== 3 ? s : partes.join("");
  }
  return parseFloat(s);
}
