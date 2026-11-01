# 💰 spendings$$

App móvil (Android y iPhone) para controlar ingresos, gastos, pagos y metas **en familia o en grupo**, con asistente inteligente, recordatorios aunque la app esté cerrada y conexión bancaria opcional.

Construida con **Expo (React Native) + Supabase + Claude**.

👉 **Instalación paso a paso: [SETUP.md](./SETUP.md)**

## Funciones

**Movimientos**
- Ingresos y egresos con categoría, "¿quién?", forma de pago, fecha y notas.
- Evidencia opcional: **varias fotos** por movimiento (cámara o galería), comprimidas y guardadas en un bucket privado.
- Categoría sugerida automáticamente y autocompletado según tu historial.
- Búsqueda y filtros por tipo, categoría, miembro, evidencia y "por revisar"; exportar a CSV.

**Grupo**
- Crea un grupo y comparte un código de 6 letras; roles dueño/admin/miembro.
- Cambios en tiempo real entre teléfonos.
- **Registro semanal de ingresos**: cada jueves (configurable) se recuerda a quien no ha registrado y a las 20:00 se avisa al grupo quién falta. Opción "No tuve ingresos" y miembros exentos.
- Avatars con foto, o con emoji y color.

**Calendario y pagos**
- Pagos recurrentes (semanal, quincenal, mensual, bimestral, trimestral, anual) con fecha de corte, fecha límite, responsable, "se paga con", cargo automático y abonos parciales (pagado / resto).
- Calendario mensual con pagos, ingresos y mapa de calor de gasto diario.

**Notificaciones**
- **Locales** (las programa el teléfono y funcionan con la app cerrada): pagos por vencer, recordatorio del jueves y recordatorio diario de gastos.
- **Push del servidor** (pg_cron → Edge Function → Expo Push): quién no registró ingresos, gasto grande de otro miembro, presupuesto al 80 % y al 100 %, pagos vencidos, resumen mensual, meta cumplida, nuevo miembro y movimientos bancarios importados.
- Bandeja de notificaciones dentro de la app.

**Planeación**
- Presupuesto total y por categoría con aviso configurable, marcador de "ritmo del mes" y botón **✨ Sugerir con mi historial**.
- Plan de gastos mensual: ingreso esperado, plantillas 50/30/20, 60/20/20, etc., compromisos fijos y dinero libre.
- Metas de ahorro con aportaciones y cálculo de "aparta $X por semana".

**Métricas e inteligencia**
- Balance, tasa de ahorro, proyección al cierre del mes y comparación contra el mes anterior.
- Gráficas: ingresos contra gastos (6 meses), gasto acumulado contra presupuesto, dona por categoría, y desglose por tipo, persona, forma de pago y día de la semana.
- Motor de consejos local: gastos hormiga, categorías disparadas, suscripciones, fines de semana, pagos de la semana, presupuestos en riesgo y movimientos por revisar.
- **Asistente "Fin"** (Claude): responde con base en los datos reales del grupo, propone presupuestos y da ideas para ahorrar y aumentar ingresos.

**Banco (opcional)**
- Conexión con Belvo (open finance en México), solo lectura. Sincroniza cada 6 h; los movimientos llegan auto-categorizados y marcados para revisión.

## Arquitectura

```
src/
  app/                 Pantallas (expo-router)
    (auth)/            Login / registro
    (tabs)/            Inicio, Movimientos, +, Calendario, Asistente, Más
    transaction/       Nuevo / detalle (fotos)
    bills/             Pagos recurrentes
    budgets, plan, goals, metrics, categories, payment-methods,
    group, profile, notifications, reminders, bank, onboarding, join
  components/          UI, gráficas SVG, avatars, pickers
  hooks/queries.ts     Datos (React Query + Supabase + Realtime)
  lib/                 supabase, sesión, notificaciones, insights, fotos, fechas, tema
supabase/
  migrations/          Esquema, RLS, triggers, RPCs y buckets
  cron.sql             Tareas programadas (pg_cron + pg_net)
  functions/
    assistant/         Asistente IA (Claude)
    scheduler/         Recordatorios y cola de push
    belvo/             Conexión bancaria
```

La seguridad se aplica en la base de datos con **Row Level Security**: cada persona solo ve los datos de los grupos donde es miembro, y las fotos solo las ven los miembros de su grupo.

## Comandos

```bash
npm install
```
```bash
npx expo start
```
```bash
npx tsc --noEmit
```
```bash
npx expo lint
```
