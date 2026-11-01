CAMBIOS EN LA TABLA DE AMORTIZACION
Objetivo: que la columna Estado muestre la fecha del pago y a quien/donde se pago.

COMO EDITAR EL ARCHIVO EN GITHUB
1. En tu repositorio de GitHub pulsa la tecla t, escribe TablaAmortizacion y pulsa Enter.
2. Pulsa el lapiz (Edit this file), arriba a la derecha.
3. Dentro del editor usa Ctrl+F para buscar el texto de cada cambio.
4. Haz los 3 cambios y luego pulsa "Commit changes" arriba a la derecha y confirma.
5. Espera a que Vercel diga Ready y recarga la app con Ctrl+F5.


=====================================================
CAMBIO 1: AGREGAR UNA FUNCION
=====================================================
Busca esta linea:

const COLOR_PAGADA = colors.successBg;

Pega esto JUSTO ENCIMA de esa linea (sin borrar nada):

function fechaCorta(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(d)} ${meses[Number(m) - 1]} ${a}`;
}


=====================================================
CAMBIO 2: ANCHO DE LA COLUMNA
=====================================================
Busca esta linea:

{ k: "est", t: "Estado", w: 120 },

Cambiala por:

{ k: "est", t: "Estado / quién pagó y cuándo", w: 280 },


=====================================================
CAMBIO 3: EL TEXTO DE LA COLUMNA
=====================================================
Busca estas 3 lineas:

<Text style={[styles.celda, { width: W.est }, pagada ? styles.txtPagada : parcial ? styles.txtParcial : styles.txtPend]} numberOfLines={1}>
  {pagada ? `✓ ${c.pagada_por ?? "Pagada"}` : parcial ? `Parcial ${n0(Number(c.valor_pagado))}` : f.proxima ? "Próxima" : "Pendiente"}
</Text>

Reemplazalas por:

<Text style={[styles.celda, { width: W.est }, pagada ? styles.txtPagada : parcial ? styles.txtParcial : styles.txtPend]}>
  {pagada
    ? `✓ ${c.fecha_pago ? fechaCorta(c.fecha_pago) + " · " : ""}${c.pagada_por ?? "Pagada"}`
    : parcial
    ? `Parcial ${n0(Number(c.valor_pagado))}${c.fecha_pago ? " · " + fechaCorta(c.fecha_pago) : ""}`
    : f.proxima
    ? "Próxima"
    : "Pendiente"}
</Text>


=====================================================
NOTAS
=====================================================
- Si al buscar un texto no lo encuentra, puede que las lineas esten partidas distinto en tu archivo. Mandame una captura y te lo ajusto.
- Este cambio aplica a las tablas de "Deudas y creditos" y de "Prestamos", porque comparten la misma tabla.
- Las cuotas marcadas como "ya pagadas antes de usar la app" pueden mostrar la fecha de vencimiento y no la fecha real del pago. Los pagos nuevos que registres con "Registrar pago" guardan la fecha que escribas.
