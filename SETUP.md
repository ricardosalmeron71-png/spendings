# Guía de instalación — Finanzas en Grupo

Sigue los pasos en orden. Te toma entre 45 y 90 minutos la primera vez.

---

## 0. Lo que necesito de ti (checklist)

| # | Qué | Para qué | Costo |
|---|-----|----------|-------|
| 1 | Cuenta en [supabase.com](https://supabase.com) | Base de datos, login, fotos, cron | Plan gratis alcanza para empezar |
| 2 | Cuenta en [expo.dev](https://expo.dev) | Compilar la app y enviar push | Gratis |
| 3 | API key de Anthropic ([console.anthropic.com](https://console.anthropic.com)) | Asistente con IA "Fin" | Pago por uso |
| 4 | Proyecto en [Firebase](https://console.firebase.google.com) | Push en Android (FCM) | Gratis |
| 5 | Apple Developer Program | Publicar en iPhone y push en iOS | 99 USD/año |
| 6 | Google Play Console | Publicar en Android | 25 USD una vez |
| 7 | *(Opcional)* Cuenta en [Belvo](https://belvo.com) | Conexión bancaria automática | Sandbox gratis; producción con contrato |
| 8 | Node.js 20 o superior en tu computadora | Correr y compilar | Gratis |

También decide:
- **Nombre del paquete** (ej. `com.salmeron.finanzas`): reemplaza `com.tuempresa.finanzasgrupo` en `app.json` (`ios.bundleIdentifier` y `android.package`). **No se puede cambiar después de publicar.**
- **Zona horaria** de tu grupo (por defecto `America/Mexico_City`).

---

## 1. Supabase: crear el proyecto

1. En supabase.com → **New project**. Región sugerida: `East US (North Virginia)` (la más cercana a México). Guarda la contraseña de la base de datos.
2. Ve a **Project Settings → API** y copia:
   - `Project URL` → `https://XXXX.supabase.co`
   - `anon public key`
   - `Project ref` (las letras `XXXX` de la URL)

## 2. Supabase: crear la base de datos

**Opción A (más fácil): SQL Editor**
1. Dashboard → **SQL Editor → New query**.
2. Pega todo el contenido de `supabase/migrations/20261101000000_init.sql` y presiona **Run**.
3. Debe terminar en "Success". Esto crea tablas, seguridad por grupo (RLS), triggers de alertas, categorías iniciales (las de tu hoja: Casa, Servicio, Carro, Médico, etc.) y los buckets `evidence` (privado) y `avatars` (público).

**Opción B: Supabase CLI**
```bash
npm i -g supabase
```
```bash
supabase login
```
```bash
supabase link --project-ref TU-PROJECT-REF
```
```bash
supabase db push
```

## 3. Supabase: autenticación

Dashboard → **Authentication → Sign In / Providers → Email**:
- Para pruebas rápidas puedes desactivar **Confirm email**. En producción déjalo activo.

Dashboard → **Authentication → URL Configuration**:
- Agrega `finanzas://` en **Redirect URLs**.

## 4. Edge Functions (asistente IA, recordatorios, banco)

Instala la CLI (paso 2B) y enlaza el proyecto. Luego configura los secretos:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-tu-llave
```
Genera un secreto aleatorio para el cron y **cópialo** (lo usarás también en el paso 5; después Supabase ya no lo muestra):
```bash
openssl rand -hex 32
```
```bash
supabase secrets set CRON_SECRET=EL_VALOR_QUE_COPIASTE
```

Opcionales:
```bash
supabase secrets set EXPO_ACCESS_TOKEN=tu-token-de-expo
```
(Solo si activas "Enhanced Security for Push Notifications" en expo.dev.)

```bash
supabase secrets set ASSISTANT_MODEL=claude-opus-5-5
```
(Es el modelo por defecto. Si quieres reducir costos puedes usar `claude-sonnet-5-5` o `claude-haiku-5-5`.)

Despliega las funciones:
```bash
supabase functions deploy assistant
```
```bash
supabase functions deploy belvo
```
```bash
supabase functions deploy scheduler --no-verify-jwt
```

> `scheduler` no usa JWT porque la llama `pg_cron`; está protegida con el header `x-cron-secret`.

## 5. Tareas programadas (notificaciones con la app cerrada)

1. Dashboard → **Database → Extensions**: activa **pg_cron** y **pg_net**.
2. Abre `supabase/cron.sql`, reemplaza:
   - `<<<TU-PROJECT-REF>>>` por tu project ref
   - `<<<EL MISMO VALOR QUE CRON_SECRET…>>>` por el valor de `CRON_SECRET`
3. Pégalo en el SQL Editor y ejecútalo **una sola vez**.

Qué queda programado:

| Tarea | Cuándo | Qué hace |
|-------|--------|----------|
| `push-queue` | cada minuto | Envía como push todas las notificaciones nuevas (gasto grande, ingreso registrado, presupuesto, nuevo miembro…) |
| `weekly-income` | cada hora | El **día configurado (jueves por defecto)**: 10:00 recuerda a quien no ha registrado ingresos; 20:00 avisa a todo el grupo quién falta |
| `bill-reminders` | diario 9:00 CDMX | Pagos por vencer (N días antes, un día antes, el mismo día) y vencidos (1, 3 y 7 días) |
| `monthly-summary` | día 1, 10:00 | Resumen del mes anterior: ingresos, gastos y % de ahorro |
| `bank-sync` | cada 6 h | Importa movimientos bancarios (si configuraste Belvo) |

Además, la app programa **notificaciones locales** en cada teléfono (pagos, recordatorio de jueves y recordatorio diario de gastos) que funcionan aunque la app esté cerrada y sin internet.

Para probar el cron manualmente:
```bash
curl -X POST "https://TU-PROJECT-REF.supabase.co/functions/v1/scheduler?job=bill_reminders" -H "x-cron-secret: TU_CRON_SECRET"
```

## 6. La app móvil

```bash
npm install
```
```bash
cp .env.example .env
```
Edita `.env` con tu `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

Vincula con Expo (esto escribe tu `projectId` en `app.json`, necesario para push):
```bash
npx eas-cli@latest login
```
```bash
npx eas-cli@latest init
```

Prueba rápida (sin push remotas):
```bash
npx expo start
```
Escanea el QR con **Expo Go**. Funciona todo excepto las push remotas en Android (las notificaciones locales sí funcionan).

**Build de desarrollo (recomendado, con push):**
```bash
npx eas-cli@latest build --profile development --platform android
```
```bash
npx eas-cli@latest build --profile development --platform ios
```
Instala el build en tu teléfono y luego corre `npx expo start --dev-client`.

## 7. Credenciales de push

**Android (FCM v1):**
1. En Firebase crea un proyecto → agrega app Android con tu `android.package`.
2. Descarga `google-services.json`, ponlo en la raíz del proyecto y agrega en `app.json` → `android`: `"googleServicesFile": "./google-services.json"`.
3. Firebase → Configuración del proyecto → Cuentas de servicio → **Generar nueva clave privada**.
4. Súbela a Expo:
   ```bash
   npx eas-cli@latest credentials
   ```
   Android → production → Google Service Account → **FCM V1** → sube el JSON.

**iOS (APNs):** con tu cuenta de Apple Developer, `eas build` crea y administra la llave de push automáticamente (responde "sí" cuando lo pregunte).

## 8. Conexión bancaria (opcional, Belvo)

1. Crea cuenta en Belvo y genera llaves **sandbox** (Dashboard → Developers → API keys).
2. Configura:
   ```bash
   supabase secrets set BELVO_SECRET_ID=xxx BELVO_SECRET_PASSWORD=yyy BELVO_ENV=sandbox
   ```
3. En la app: **Más → Conexión bancaria → Conectar banco**. En sandbox usa los bancos y credenciales de prueba que da Belvo.
4. Cuando el widget termina, redirige a `finanzas://belvo?link=…`. Si tu cuenta de Belvo usa otro nombre de parámetro o requiere registrar la URL de callback, ajústalo en el dashboard de Belvo y en `supabase/functions/belvo/index.ts` (`widgetUrl`).
5. Para producción (bancos reales) Belvo requiere firmar contrato y cambiar `BELVO_ENV=production`.

Los movimientos importados llegan "por revisar", con categoría sugerida según tu historial, y no disparan avisos de gasto grande.

## 9. Publicar en tiendas

```bash
npx eas-cli@latest build --profile production --platform all
```
```bash
npx eas-cli@latest submit --platform ios
```
```bash
npx eas-cli@latest submit --platform android
```

Para la ficha de las tiendas necesitas: ícono 1024×1024 (reemplaza `assets/icon.png`), capturas de pantalla, descripción y una **política de privacidad** (la app guarda datos financieros y fotos; Apple y Google la exigen).

## 10. Primer uso

1. Crea tu cuenta → **Crear grupo** (se cargan las categorías de tu hoja).
2. **Más → Mi grupo → Invitar**: comparte el código de 6 letras con Grecia (o quien sea); ella crea su cuenta y elige **Tengo un código**.
3. **Más → Formas de pago**: agrega "Nómina Ricardo", "Nómina Grecia", "HSBC 2Now", "HSBC Zero", "AMEX", etc. con día de corte y de pago.
4. **Más → Pagos recurrentes**: agrega luz, cable/internet, Spotify, Nissan Kicks, casa, Amazon Prime, agua, etc. (lo de tu segunda hoja).
5. **Más → Presupuestos → ✨ Sugerir con mi historial** (después de unas semanas de datos).
6. **Más → Plan de gastos**: define el ingreso esperado y la regla 50/30/20.

### Importar tu historial de Google Sheets (opcional)

Exporta la hoja como CSV y usa el **Table Editor → Import data from CSV** de Supabase sobre la tabla `transactions`. Columnas necesarias: `group_id`, `user_id`, `kind` (`income`/`expense`), `amount`, `description`, `occurred_on` (AAAA-MM-DD) y, opcional, `category_id`. Los IDs de grupo, usuarios y categorías los ves en las tablas `groups`, `profiles` y `categories`.

---

## Solución de problemas

| Síntoma | Causa probable |
|--------|----------------|
| Pantalla "Falta conectar Supabase" | `.env` vacío o no reiniciaste con `npx expo start -c` |
| No llegan push | Estás en Expo Go (Android), falta `projectId` (paso 6) o credenciales FCM/APNs (paso 7) |
| No llegan avisos del jueves | No corriste `cron.sql`, `CRON_SECRET` no coincide, o el miembro está "exento" en Mi grupo |
| El asistente dice "Falta configurar ANTHROPIC_API_KEY" | Falta el secreto o redeploy de `assistant` |
| Error al subir fotos | No corriste la migración completa (crea los buckets y políticas) |
| `Logs` de funciones | Dashboard → Edge Functions → *función* → Logs |
