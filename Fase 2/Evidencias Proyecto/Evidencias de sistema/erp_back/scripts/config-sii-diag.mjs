// Diagnóstico Config SII → cuentas imputables. Solo lee.
const API = 'http://localhost:3001/api/v1';

const login = async () => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@almahue.local', password: 'Admin123!' }),
  });
  if (!r.ok) throw new Error(`login ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.token;
};

const get = async (token, path, empresaId) => {
  const r = await fetch(`${API}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      ...(empresaId ? { 'x-empresa-id': empresaId } : {}),
    },
  });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
};

const token = await login();
const empresas = await get(token, '/empresas');
console.log('EMPRESAS:', empresas.map((e) => `${e.id} (${e.rut})`).join(' · '));

for (const emp of empresas) {
  console.log(`\n${'='.repeat(72)}\nEMPRESA ${emp.id}\n${'='.repeat(72)}`);

  const cuentas = await get(token, '/cuentas', emp.id);
  console.log(`cuentas=${cuentas.length}  campos=${Object.keys(cuentas[0] ?? {}).join(',')}`);

  const byId = new Map(cuentas.map((c) => [c.id, c]));
  const hijosDe = new Map();
  for (const c of cuentas) {
    if (!c.padreId) continue;
    if (!hijosDe.has(c.padreId)) hijosDe.set(c.padreId, []);
    hijosDe.get(c.padreId).push(c);
  }

  const exigeDim = (c) =>
    !!(c.requiereCc || c.requiereArea || c.requiereEspecie || c.requiereElemento);
  const usable = (c) => c.activa !== false && !c.noImputable && !exigeDim(c);

  // Primera hoja usable dentro del subárbol de `raiz`, por código.
  const mejorEnSubarbol = (raizId) => {
    const out = [];
    const walk = (id) => {
      const c = byId.get(id);
      if (!c) return;
      if (usable(c)) out.push(c);
      for (const h of hijosDe.get(id) ?? []) walk(h.id);
    };
    walk(raizId);
    out.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    return out[0];
  };

  const configs = await get(token, '/config-contable-sii', emp.id);
  console.log(`\nconfig-sii=${configs.length}`);
  if (!configs.length) console.log('  (vacío)');

  for (const cfg of configs) {
    const act = byId.get(cfg.cuentaContableId);
    if (!act) {
      console.log(`  ${cfg.tipoDocumentoSii.padEnd(16)} cuenta ${cfg.cuentaContableId} NO ESTÁ en /cuentas`);
      continue;
    }
    const problemas = [];
    if (act.noImputable) problemas.push('noImputable');
    if (act.requiereCc) problemas.push('requiereCc');
    if (act.requiereArea) problemas.push('requiereArea');
    if (act.requiereEspecie) problemas.push('requiereEspecie');
    if (act.requiereElemento) problemas.push('requiereElemento');
    if (act.activa === false) problemas.push('inactiva');

    if (!problemas.length) {
      console.log(`  OK       ${cfg.tipoDocumentoSii.padEnd(16)} ${act.codigo} ${act.nombre}`);
      continue;
    }
    const sug = mejorEnSubarbol(act.id);
    console.log(
      `  CORREGIR ${cfg.tipoDocumentoSii.padEnd(16)} ${act.codigo} ${act.nombre}` +
        `\n           problema: ${problemas.join('+')}  lado=${cfg.lado}` +
        `\n           sugerida: ${sug ? `${sug.codigo} ${sug.nombre} (${sug.id})` : 'NINGUNA en su subárbol'}`,
    );
  }

  const esperadas = ['VENTAS','CLIENTES','IVA_DEBITO','COMPRAS','PROVEEDORES','IVA_CREDITO','CONTRATISTAS','BANCO'];
  const tiene = new Set(configs.map((c) => c.tipoDocumentoSii));
  const faltan = esperadas.filter((k) => !tiene.has(k));
  console.log(`\nclaves faltantes: ${faltan.length ? faltan.join(', ') : '(ninguna)'}`);

  const libres = cuentas.filter(usable).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
  console.log(`hojas imputables sin dimensión obligatoria: ${libres.length}`);
  console.log(libres.slice(0, 12).map((c) => `  ${c.codigo} ${c.nombre}`).join('\n'));
}
