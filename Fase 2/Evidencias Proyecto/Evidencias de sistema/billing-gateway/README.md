# billing-gateway

Intermediario multi-ERP / multi-partner para facturación electrónica.

## Modelo de partners

| `partner` | Rol |
|-----------|-----|
| **`stub`** | Facturador/seller de **pruebas e integración**. Emite documento + PDF/XML dummy. Completa el flujo de negocio sin SII. |
| **`gosocket`** | Facturador real (sandbox/live). Reemplaza a `stub` en el registry cuando hay ApiKeys. |
| *(futuros)* | Mismo contrato `IBillingPartnerAdapter`. |

El ERP **no cambia** al promover: el registry del gateway es **por ERP** (`erpId` + `partner` stub|gosocket), no por sociedad. BillerId, RUT, resolución y Acteco viven en Admin › Empresas y viajan en el canónico. No hay que tocar el gateway al dar de alta otra empresa.
En desarrollo, `src/registry/tenants.local.json` se combina con el registry base y reemplaza únicamente tenants con la misma identidad.

## Arranque

```bash
cp .env.example .env
# Genera una key aleatoria de al menos 32 bytes con un gestor seguro.
# Configura BILLING_API_KEYS=<key>@<erpId> en .env antes de continuar.
npm install
npm run start:dev
# :3040
```

Header: `X-Billing-Api-Key: <clave-local-generada>`
Env: `BILLING_API_KEYS=<clave-local-generada>@almahue` (la key queda atada a `source.erpId`).
No escribas la key en documentación, tests ni historial de comandos. El gateway
falla de forma segura al arrancar si `BILLING_API_KEYS` está vacía o es débil.

```
POST /v1/emissions
GET  /v1/emissions                 → lista (más recientes primero; ?empresaId= opcional)
GET  /v1/emissions/:id
GET  /v1/emissions/:id/trace
GET  /v1/emissions/:id/artifacts/pdf
GET  /v1/emissions/:id/artifacts/xml
```

Header: `X-Billing-Api-Key` (misma key que el ERP). La lista queda acotada al `erpId` de esa key.

Logs de emisión (bloques de color distintos en consola): inbound ERP→gateway, outbound gateway→GoSocket (XML GUF, **sin** Authorization) y response del partner. Consulta persistida: `GET /v1/emissions/:id/trace`. El `emissionId` (`emi_…`) no va en el canónico INBOUND: aparece en el listado, en `GET :id` y en la línea `event":"emission.partner"`.

## Receptor en exportación

`receptor.rut` exige un RUT chileno válido. Cuando
`indicadores.exportacion=true`, también admite un identificador extranjero
estricto `EX-...` (máximo 50 caracteres; solo letras mayúsculas, números y
guiones entre segmentos). Para GUF se envía `NroDocRecep=55555555-5`, según el
RUT genérico SII de exportación. El identificador `EX-*` permanece únicamente
en el canónico para trazabilidad interna: no se inventa un tag XML del partner.

## Idempotencia

La clave efectiva incluye `erpId + empresaId + idempotencyKey` y una huella del
canónico impide reutilizar la misma clave con otro payload. `ACCEPTED`,
`SIMULATED` y `PENDING` son idempotentes; `REJECTED` se puede reintentar.

El store es un **archivo SQLite local** (`BILLING_STORE_PATH`, por defecto
`./data/emissions.sqlite`). Sirve para QA y **una sola instancia**: sobrevive
reinicios del proceso y no reenvía `PENDING`/`ACCEPTED` al partner. El lock
concurrente es solo in-process. Un despliegue **multi-réplica / producción**
sigue necesitando un store compartido (Postgres o Redis); no está implementado
aquí. No uses el file store como coordinación entre réplicas.

## QA GoSocket sandbox

El `src/registry/tenants.json` versionado queda en `partner: stub` para que CI y demos no llamen GoSocket. Para probar sandbox local:

```bash
cp src/registry/tenants.local.example.json src/registry/tenants.local.json
cp .env.example .env
# Configura primero una BILLING_API_KEYS aleatoria según la sección Arranque.
```

Luego edita `.env` local con las ApiKeys QA del portal GoSocket, **una por sociedad**:

- `GOSOCKET_API_USER_ALMAHUE_EMP_EXPORT` / `GOSOCKET_API_PASSWORD_ALMAHUE_EMP_EXPORT`
- `GOSOCKET_API_USER_ALMAHUE_EMP_SERVICES` / `GOSOCKET_API_PASSWORD_ALMAHUE_EMP_SERVICES`
- El sufijo es `{ERP}_{EMPRESA}` en mayúsculas (`EMP-SERVICES` → `EMP_SERVICES`).
- `GOSOCKET_API_USER` / `GOSOCKET_API_PASSWORD`: fallback si no hay par por empresa (una sola sociedad).
- `GOSOCKET_SANDBOX_URL`: `https://developers-sbx.gosocket.net/api/v1/`
- `GOSOCKET_MAPPING`: por defecto `11111111-1111-1111-1111-111111111111`.

BillerId, CAE y Acteco siguen en **Admin › Empresas** del ERP (van en el canónico). Las ApiKeys no se cargan en el ERP.

No escribas credenciales reales en archivos versionables. El certificado digital y CAF los carga MJ en el portal GoSocket; si no están configurados, GoSocket puede rechazar aunque el adapter y las ApiKeys funcionen.
