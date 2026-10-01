// Verifica contra la API: el GET expone las dimensiones y los flags de la
// cuenta, el PUT acepta un mapeo completo y rechaza uno al que le falta una
// dimensión obligatoria.
const API = process.env.API_BASE || 'http://localhost:3001/api/v1';
const EMPRESA = 'EMP-EXPORT';
const CC_ADMIN = 'CC-EMP-EXPORT-119f087a-5189-4452-ac41-8a730e6fde62';
const AREA_PACK = 'AREA-EX-PACK';
const CTA_MO_CONTRATISTA = 'cmtal4x77005h64tyg3dyb03q';

const login = async () => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@almahue.local', password: 'Admin123!' }),
  });
  if (!res.ok) throw new Error(`login ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.token ?? body.accessToken;
};

const run = async () => {
  const token = await login();
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    'x-empresa-id': EMPRESA,
  };

  const get = await fetch(`${API}/config-contable-sii`, { headers });
  const rows = await get.json();
  const ctr = rows.find((r) => r.tipoDocumentoSii === 'CONTRATISTAS');
  const ventas = rows.find((r) => r.tipoDocumentoSii === 'VENTAS');
  console.log('1) GET expone dimensiones y flags');
  console.log('   CONTRATISTAS', JSON.stringify({
    cuenta: ctr.cuentaCodigo,
    requiereCc: ctr.cuentaRequiereCc,
    centroCostoId: ctr.centroCostoId,
  }));
  console.log('   VENTAS      ', JSON.stringify({
    cuenta: ventas.cuentaCodigo,
    requiereCc: ventas.cuentaRequiereCc,
    requiereArea: ventas.cuentaRequiereArea,
    centroCostoId: ventas.centroCostoId,
    areaNegocioId: ventas.areaNegocioId,
  }));

  const completo = await fetch(`${API}/config-contable-sii`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      items: [{
        tipoDocumentoSii: 'CONTRATISTAS',
        nombre: 'Gasto MO contratistas',
        cuentaContableId: CTA_MO_CONTRATISTA,
        centroCostoId: CC_ADMIN,
        lado: 'DEBE',
      }],
    }),
  });
  console.log(`2) PUT con dimensión completa → ${completo.status} (espera 200)`);

  const incompleto = await fetch(`${API}/config-contable-sii`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      items: [{
        tipoDocumentoSii: 'CONTRATISTAS',
        nombre: 'Gasto MO contratistas',
        cuentaContableId: CTA_MO_CONTRATISTA,
        lado: 'DEBE',
      }],
    }),
  });
  console.log(`3) PUT sin centro de costo → ${incompleto.status} (espera 400)`);
  console.log('  ', (await incompleto.text()).slice(0, 220));

  const inexistente = await fetch(`${API}/config-contable-sii`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      items: [{
        tipoDocumentoSii: 'CONTRATISTAS',
        nombre: 'Gasto MO contratistas',
        cuentaContableId: CTA_MO_CONTRATISTA,
        centroCostoId: 'CC-QUE-NO-EXISTE',
        lado: 'DEBE',
      }],
    }),
  });
  console.log(`4) PUT con centro de costo inexistente → ${inexistente.status} (espera 400)`);
  console.log('  ', (await inexistente.text()).slice(0, 220));

  // Dejar el mapeo como corresponde.
  await fetch(`${API}/config-contable-sii`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      items: [
        {
          tipoDocumentoSii: 'CONTRATISTAS',
          nombre: 'Gasto MO contratistas',
          cuentaContableId: CTA_MO_CONTRATISTA,
          centroCostoId: CC_ADMIN,
          lado: 'DEBE',
        },
        {
          tipoDocumentoSii: 'VENTAS',
          codigoSii: '33',
          nombre: 'Factura electrónica venta',
          cuentaContableId: ventas.cuentaContableId,
          centroCostoId: CC_ADMIN,
          areaNegocioId: AREA_PACK,
          lado: 'HABER',
        },
      ],
    }),
  });
  console.log('5) mapeos restaurados');
};

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
