# Postman — emisiones ALM ↔ Export (sandbox)

Colección para un DTE 33 entre **ALM SERVICES SPA** (`77.032.639-7`) y **ALMAHUE EXPORT SPA** (`77.032.638-9`).

## Importar

1. Postman → Import
   - `postman/Almahue-DTE.postman_collection.json`
   - `postman/Almahue-DTE.local.postman_environment.json` (claves GoSocket; **gitignored**)
2. Arriba a la derecha, selecciona el environment **Almahue DTE local**.
3. Pega `billing_api_key` (la de `BILLING_API_KEYS` del `.env` del gateway, solo la parte antes de `@almahue`) si vas a usar la carpeta **billing-gateway**.

Si no tienes el `.local`, copia `Almahue-DTE.postman_environment.example.json` y carga las ApiKeys del portal.

## Qué pegar

| Request | Auth | BillerId |
|---|---|---|
| ALM → Export | ApiKey ALM | `eda79c0c-…` |
| Export → ALM | ApiKey Export | `d159916d-…` |

Carpeta **GoSocket sandbox**: `POST Document/SendDocumentToAuthority` (el XML GUF lo arma el pre-request).  
Carpeta **billing-gateway**: `POST /v1/emissions` con canónico; el adapter usa `source.apiUser` / `source.apiPassword` de ese body.

Health: `GET {{gateway_base}}/health`.

Tras **SendDocument**, el test script guarda `global_document_id` y `sender_code`. Recién ahí corre **GetDocument (tras emitir)** (un GID).  

**GetDocument listado** (POST, sin GID): un request por emisor, rango `date_from`/`date_to` (máximo un mes).

| Request | SenderCode | ReceiverCode | Auth |
|---|---|---|---|
| Export → ALM | `77032638-9` | `77032639-7` | ApiKey Export |
| ALM → Export | `77032639-7` | `77032638-9` | ApiKey ALM |

**GetReceivedDocument** (GET, bandeja): un request por sociedad. `AccountCode` = RUT de esa empresa. No filtra por emisor ni fechas.

| Request | AccountCode | Auth |
|---|---|---|
| ALM | `77032639-7` | ApiKey ALM |
| Export | `77032638-9` | ApiKey Export |

Si GetDocument dice `empresa no autorizada`, el Basic no corresponde a esa emisora (no uses la ApiKey de Export para consultar un DTE de ALM).

## Regenerar XML

```bash
node postman/generate-postman.cjs
```

Requiere `dist/` compilado (`npm run build` o `start:dev`).
