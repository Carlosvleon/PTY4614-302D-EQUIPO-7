// Busca en el plan real de EMP-EXPORT las cuentas semánticamente correctas
// para cada clave SII. Solo lee.
const API = 'http://localhost:3001/api/v1';
const EMP = 'EMP-EXPORT';

const r0 = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@almahue.local', password: 'Admin123!' }),
});
const { token } = await r0.json();

const res = await fetch(`${API}/cuentas`, {
  headers: { authorization: `Bearer ${token}`, 'x-empresa-id': EMP },
});
const cuentas = await res.json();

const exigeDim = (c) =>
  [c.requiereCc && 'CC', c.requiereArea && 'AREA', c.requiereEspecie && 'ESP', c.requiereElemento && 'ELEM']
    .filter(Boolean)
    .join('+');

const show = (titulo, patron) => {
  console.log(`\n${'─'.repeat(74)}\n${titulo}\n${'─'.repeat(74)}`);
  const hits = cuentas
    .filter((c) => patron.test(c.nombre))
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
  if (!hits.length) return console.log('  (sin coincidencias)');
  for (const c of hits) {
    const flags = [
      c.noImputable ? 'PADRE' : 'hoja',
      c.activa === false ? 'INACTIVA' : null,
      exigeDim(c) ? `exige:${exigeDim(c)}` : null,
    ].filter(Boolean).join(' ');
    console.log(`  ${String(c.codigo).padEnd(16)} ${String(c.nombre).slice(0, 44).padEnd(46)} ${flags}`);
  }
};

show('PROVEEDORES (haber de compras)', /proveedor/i);
show('IVA (crédito y débito)', /\biva\b/i);
show('CONTRATISTAS / mano de obra', /contratista|mano de obra|jornal|labor/i);
show('BANCO (haber de cartola)', /^banco|caja/i);
show('COMPRAS / costo de explotación', /compra|costo/i);
show('VENTAS / ingresos', /venta|ingreso/i);
