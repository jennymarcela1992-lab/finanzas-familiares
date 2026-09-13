# Finanzas Familiares — App completa (v1)

React Native + Expo + TypeScript + Supabase.

## Estado: TODOS los módulos del Plan Maestro están escritos

1. ✅ Login/registro (Supabase Auth)
2. ✅ Dashboard / Cierre mensual (aporte configurable, saldo, excedente a ahorro)
3. ✅ Ingresos y Nómina
4. ✅ Gastos (compartidos/personales, rubro, nota)
5. ✅ Ahorros (metas + aportes)
6. ✅ Deudas y créditos (con tabla de amortización automática)
7. ✅ Préstamos personales
8. ✅ Propiedades en arriendo (vinculadas a Deudas)
9. ✅ Vehículo rentado (cuota diaria + día de descanso)
10. ✅ Inversiones / miniproyectos (ROI, margen neto)
11. ✅ Mini-presupuestos de eventos/viajes

## Cómo correrlo (cuando tengas Node.js disponible — local o en GitHub Codespaces)
```bash
npm install
npm run web      # o npm run android / npm run ios
```

## Bases de datos en Supabase
Todo el SQL de cada tabla está en el historial de esta conversación con Claude,
un bloque por módulo, en el orden en que se construyeron. Cópialos y corre cada
uno en el SQL Editor de tu proyecto antes de probar la app.

Tablas: usuarios, gastos, metas_ahorro, aportes_ahorro, deudas, cuotas_deuda,
prestamos_personales, abonos_prestamo, nomina_mensual, deducciones_nomina,
propiedades, arriendos_recibidos, vehiculos, pagos_vehiculo, inversiones,
movimientos_inversion, presupuestos_evento, items_presupuesto, aportes_mes.

## Próximos pasos (fuera del código)
- Probar todo junto en un entorno real (Node.js local o GitHub Codespaces)
- Ajustar las políticas de seguridad (RLS) cuando se venda a otras parejas,
  para que cada hogar solo vea sus propios datos (hoy todo usuario autenticado
  ve todo, correcto solo para uso privado de una pareja)
- Notificaciones push reales (FCM) entre los dos usuarios
- RevenueCat + publicación en Play Store y App Store
