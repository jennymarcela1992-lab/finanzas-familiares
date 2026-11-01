export interface Gasto {
  id: string;
  fecha: string;
  item: string;
  valor: number;
  moneda: string;
  usuarioPagoId: string;
  personaAsociadaId?: string;
  esCompartido: boolean;
  rubro: string;
  metodoPago?: string;
  nota?: string;
  comprobanteUrl?: string;
  esRecurrente?: boolean;
}

export interface AportePersona {
  usuarioId: string;
  aporte: number;
  pagado: number;
  saldo: number;
}

export interface Deuda {
  id: string;
  nombre: string;
  valorInicial: number;
  tasaInteres: number;
  plazoMeses: number;
  entidadPago: string;
  numeroCuenta: string;
  aliasPago?: string;
  diasAvisoPrevio: number;
  propiedadId?: string;
}

export interface PrestamoPersonal {
  id: string;
  quienPresta: string;
  quienRecibe: string;
  monto: number;
  saldoPendiente: number;
  fecha: string;
  motivo?: string;
}

export interface Propiedad {
  id: string;
  nombre: string;
  direccion: string;
  arrendatario: string;
  valorArriendo: number;
  diaPagoArriendo: number;
  creditoId?: string;
}

export interface Vehiculo {
  id: string;
  nombre: string;
  placa: string;
  arrendatario: string;
  cuotaDiaria: number;
  diaDescanso: number;
}
