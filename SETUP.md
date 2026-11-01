# Guía de instalación — Finanzas en Grupo

Esta guía asume que usas tu proyecto de Supabase **`ingles`** (el mismo de tu app de inglés) y que todo se hace **desde el celular**, con el navegador y GitHub. Sin computadora.

## Cómo convive con la app de inglés

Todo lo de esta app queda aislado y con prefijo propio:

| Qué | Dónde queda |
|-----|-------------|
| Tablas, funciones y tipos | Esquema nuevo `finanzas` (no se toca `public`) |
| Fotos | Buckets `fin_evidence` y `fin_avatars` |
| Funciones del servidor | `fin-assistant`, `fin-scheduler`, `fin-belvo` |
| Secretos | `FIN_ANTHROPIC_API_KEY`, `FIN_CRON_SECRET` |
| Tareas programadas | Nombres que empiezan con `fin-` |

Lo único compartido son los **usuarios** (Authentication): quien ya tenga cuenta en la app de inglés puede entrar con el mismo correo y contraseña, y al entrar se le crea su perfil de finanzas.

⚠️ **No cambies** en Authentication ajustes como "Confirm email" ni proveedores: afectan también a la app de inglés.

---

## 0. Lo que necesitas (checklist)

| # | Qué | Para qué | Costo |
|---|-----|----------|-------|
| 1 | Tu proyecto Supabase `ingles` | Base de datos, login, fotos, cron | Ya lo tienes (gratis) |
| 2 | Cuenta en [expo.dev](https://expo.dev) | Compilar el APK | Gratis (pocas compilaciones al mes) |
| 3 | API key de Anthropic ([console.anthropic.com](https://console.anthropic.com)) | Asistente "Fin" | Pago por uso |
| 4 | Proyecto en [Firebase](https://console.firebase.google.com) | Push remotas en Android (opcional) | Gratis |
| 5 | *(Opcional)* Cuenta en [Belvo](https://belvo.com) | Conexión bancaria | Sandbox gratis |

Solo Android es gratis. En iPhone se necesita Apple Developer (99 USD al año).

---

## 1. Supabase: crear las tablas

1. Abre tu proyecto `ingles` → **SQL Editor → New query**.
2. Copia el contenido de `supabase/migrations/20261101000000_init.sql` desde GitHub (botón *Raw* → seleccionar todo → copiar) y pégalo.
3. Presiona **Run**. Debe terminar en "Success".

Es seguro para el proyecto de inglés: solo **crea** cosas nuevas dentro del esquema `finanzas`, los buckets `fin_*` y un disparador llamado `finanzas_on_auth_user_created` (a prueba de fallos: si algo falla, nunca bloquea un registro).

**Exponer el esquema en la API** (obligatorio):
- **Project Settings → API → Data API Settings → Exposed schemas** → agrega `finanzas` y guarda.

Copia también, de esa misma pantalla de API:
- `Project URL`: `https://bwdkfahrgvqfqxryjfll.supabase.co`
- `anon public key`
- el **Project ref**: `bwdkfahrgvqfqxryjfll` (la parte antes de `.supabase.co`)

En **Authentication → URL Configuration → Redirect URLs** agrega `finanzas://` (solo añade, no cambia nada existente).

## 2. Llaves y tokens

Consigue estos valores:

| Valor | Dónde se obtiene |
|-------|------------------|
| `SUPABASE_ACCESS_TOKEN` | supabase.com → foto de perfil → **Account → Access Tokens → Generate new token** |
| `FIN_ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `FIN_CRON_SECRET` | Invéntalo: una cadena larga y aleatoria (40+ caracteres, letras y números). Anótala, la usarás también en el paso 4 |
| `EXPO_TOKEN` | expo.dev → Account Settings → Access Tokens → Create |

## 3. Guardarlos en GitHub

En tu repositorio: **Settings → Secrets and variables → Actions → New repository secret**. Crea estos 7:

| Nombre | Valor |
|--------|-------|
| `SUPABASE_URL` | `https://bwdkfahrgvqfqxryjfll.supabase.co` |
| `SUPABASE_ANON_KEY` | la llave `anon public` |
| `SUPABASE_PROJECT_REF` | `bwdkfahrgvqfqxryjfll` |
| `SUPABASE_ACCESS_TOKEN` | el token de Supabase |
| `FIN_ANTHROPIC_API_KEY` | tu llave de Anthropic |
| `FIN_CRON_SECRET` | tu cadena aleatoria |
| `EXPO_TOKEN` | el token de Expo |

## 4. Desplegar las funciones del servidor

1. En GitHub abre **Actions → Desplegar funciones de Supabase → Run workflow** (elige la rama `claude/eloquent-ramanujan-dsz763`).
2. Espera 2–4 minutos hasta que salga en verde. Esto sube `fin-assistant`, `fin-belvo` y `fin-scheduler` y guarda sus secretos.

## 5. Tareas programadas (avisos con la app cerrada)

1. En Supabase: **Database → Extensions** → activa **pg_cron** y **pg_net** (si no estaban).
2. Abre `supabase/cron.sql` en GitHub (*Raw*), cópialo y, antes de pegarlo en el **SQL Editor**, reemplaza:
   - `<<<TU-PROJECT-REF>>>` → `bwdkfahrgvqfqxryjfll`
   - `<<<EL MISMO VALOR QUE FIN_CRON_SECRET>>>` → tu cadena aleatoria
3. Ejecútalo **una sola vez**.

| Tarea | Cuándo | Qué hace |
|-------|--------|----------|
| `fin-push-queue` | cada minuto | Envía como push las notificaciones nuevas (gasto grande, ingreso, presupuesto, nuevo miembro…) |
| `fin-weekly-income` | cada hora | El **día configurado (jueves por defecto)**: 10:00 recuerda a quien no ha registrado; 20:00 avisa al grupo quién falta |
| `fin-bill-reminders` | diario 9:00 CDMX | Pagos por vencer y vencidos |
| `fin-monthly-summary` | día 1, 10:00 | Resumen del mes anterior |
| `fin-bank-sync` | cada 6 h | Importa movimientos bancarios (solo si configuras Belvo) |

Además, la app programa **notificaciones locales** en el teléfono (pagos, recordatorio del jueves y diario) que funcionan con la app cerrada y sin internet.

> Plan gratis: Supabase pausa los proyectos tras ~1 semana sin actividad. La app de inglés y estas tareas lo mantienen activo, pero si lo pausan, reactívalo desde el dashboard.

## 6. Compilar e instalar el APK (Android)

1. En `app.json` (editar desde GitHub con el lápiz) cambia `com.tuempresa.finanzasgrupo` (2 veces) por un nombre tuyo, por ejemplo `com.salmeron.finanzas`. No se puede cambiar después de publicar.
2. **Actions → Compilar APK Android → Run workflow**.
3. En 15–25 minutos aparece un enlace de descarga en el resumen de la ejecución. Ábrelo en el celular, descarga el APK e instálalo (Android pedirá permitir instalar de fuentes desconocidas).

## 7. Push del servidor en Android (opcional, gratis)

Sin esto, siguen funcionando los recordatorios locales; esto añade los avisos del grupo ("fulano no registró ingresos").

1. En Firebase crea un proyecto y agrega una app Android con tu nombre de paquete.
2. Descarga `google-services.json`, súbelo a la raíz del repositorio (**Add file → Upload files**) y en `app.json`, dentro de `android`, agrega `"googleServicesFile": "./google-services.json"`.
3. Firebase → Configuración → **Cuentas de servicio → Generar nueva clave privada**.
4. En expo.dev abre tu proyecto → **Credentials → Android → FCM V1** y sube ese archivo.
5. Vuelve a ejecutar el workflow del APK.

## 8. Conexión bancaria (opcional)

1. Crea cuenta en Belvo y genera llaves **sandbox**.
2. Agrega a tus secretos de GitHub `BELVO_SECRET_ID` y `BELVO_SECRET_PASSWORD`, y edita `.github/workflows/deploy-functions.yml` para pasarlos en el paso "Guardar secretos" (junto con `BELVO_ENV=sandbox`), o pídeme que lo haga.
3. Re-ejecuta "Desplegar funciones". En la app: **Más → Conexión bancaria**.
4. Si Belvo regresa el identificador de la conexión con otro nombre de parámetro, ajusta `bank.tsx` (hoy espera `link`).

## 9. Primer uso

1. Abre la app → crea cuenta (o entra con la de inglés) → **Crear grupo** (se cargan las categorías de tu hoja).
2. **Más → Mi grupo → Invitar**: comparte el código de 6 letras con Grecia.
3. **Más → Formas de pago**: "Nómina Ricardo", "HSBC 2Now", "AMEX", etc.
4. **Más → Pagos recurrentes**: luz, cable/internet, Spotify, Nissan Kicks, casa, etc.
5. **Más → Presupuestos → ✨ Sugerir con mi historial** (tras unas semanas de datos) y **Más → Plan de gastos**.

### Importar tu historial de Google Sheets (opcional)

Exporta la hoja como CSV y usa **Table Editor → esquema `finanzas` → `transactions` → Import data from CSV**. Columnas: `group_id`, `user_id`, `kind` (`income`/`expense`), `amount`, `description`, `occurred_on` (AAAA-MM-DD) y, opcional, `category_id`.

---

## Solución de problemas

| Síntoma | Causa probable |
|--------|----------------|
| "relation … does not exist" o la app no carga datos | Falta agregar `finanzas` en **Exposed schemas** (paso 1) |
| Pantalla "Falta conectar Supabase" | Faltan `SUPABASE_URL` / `SUPABASE_ANON_KEY` en los secretos al compilar |
| No llegan push del servidor | Falta el paso 7, o el cron (paso 5) |
| No llegan avisos del jueves | No corriste `cron.sql`, `FIN_CRON_SECRET` no coincide, o el miembro está "exento" |
| El asistente dice "Falta configurar FIN_ANTHROPIC_API_KEY" | Re-ejecuta "Desplegar funciones" con el secreto cargado |
| Error al subir fotos | No corriste la migración completa (crea los buckets) |
| El workflow de funciones falla | Revisa `SUPABASE_ACCESS_TOKEN` y `SUPABASE_PROJECT_REF` |

## Deshacer todo (si algún día quieres quitar esta app del proyecto)

Ejecuta en el SQL Editor (solo borra lo de finanzas; la app de inglés no se toca):

```sql
select cron.unschedule(jobname) from cron.job where jobname like 'fin-%';
drop trigger if exists finanzas_on_auth_user_created on auth.users;
drop schema finanzas cascade;
drop policy if exists "fin evidence member read" on storage.objects;
drop policy if exists "fin evidence member insert" on storage.objects;
drop policy if exists "fin evidence member delete" on storage.objects;
drop policy if exists "fin avatars public read" on storage.objects;
drop policy if exists "fin avatars own write" on storage.objects;
drop policy if exists "fin avatars own update" on storage.objects;
drop policy if exists "fin avatars own delete" on storage.objects;
```
Y borra los buckets `fin_evidence` y `fin_avatars` desde **Storage**.
