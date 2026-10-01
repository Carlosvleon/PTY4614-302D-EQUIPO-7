// Reapunta las claves SII inequívocas de EMP-EXPORT a su cuenta correcta.
// Solo toca lo que tiene una única lectura contable posible.
const API = 'http://localhost:3001/api/v1';
const EMP = 'EMP-EXPORT';

const FIXES = [
  // clave,        código destino,  nombre,                lado,   por qué
  ['PROVEEDORES',  '2-1-04-01-001', 'Proveedores',         'HABER', 'estaba en 2-1-01-01 OBLIGACIONES CON BANCOS CP (padre)'],
  ['IVA_CREDITO',  '1-1-09-01-001', 'IVA crédito fiscal',  'DEBE',  'estaba en 1-1-03-01 VALORES NEGOCIABLES (padre)'],
  ['IVA_DEBITO',   '2-1-09-02-001', 'IVA débito fiscal',   'HABER', 'estaba en 2-1-03-01, cuenta de seed ajena al plan Agrosoft'],
  ['BANCO',        '1-1-01-02-001', 'Banco Chile $',       'DEBE',  'no existía: el haber de cartola caía en CAJA'],
];

const r0 = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@almahue.local', password: 'Admin123!' }),
});
const { token } = await r0.json();
const H = { authorization: `Bearer ${token}`, 'x-empresa-id': EMP, 'content-type': 'application/json' };

const cuentas = await (await fetch(`${API}/cuentas`, { headers: H })).json();
const porCodigo = new Map(cuentas.map((c) => [c.codigo, c]));

const items = [];
for (const [clave, codigo, nombre, lado, motivo] of FIXES) {
  const c = porCodigo.get(codigo);
  if (!c) {
    console.log(`SALTA ${clave}: no existe la cuenta ${codigo}`);
    continue;
  }
  if (c.noImputable || c.activa === false) {
    console.log(`SALTA ${clave}: ${codigo} no es imputable/activa`);
    continue;
  }
  const dim = [c.requiereCc && 'CC', c.requiereArea && 'AREA', c.requiereEspecie && 'ESP', c.requiereElemento && 'ELEM']
    .filter(Boolean).join('+');
  if (dim) {
    console.log(`SALTA ${clave}: ${codigo} exige ${dim}`);
    continue;
  }
  items.push({ tipoDocumentoSii: clave, codigoSii: clave, nombre, cuentaContableId: c.id, lado, activa: true });
  console.log(`APLICA ${clave.padEnd(14)} → ${codigo} ${c.nombre}`);
  console.log(`        motivo: ${motivo}`);
}

if (!items.length) {
  console.log('\nNada que aplicar.');
  process.exit(0);
}

const res = await fetch(`${API}/config-contable-sii`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({ items }),
});
console.log(`\nPUT → ${res.status}`);
console.log(JSON.stringify(await res.json(), null, 2).slice(0, 1200));
