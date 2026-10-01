/**
 * QA integral API — Contratistas Nivel 1.
 * Ejecutar: npm run qa:contratistas-nivel1
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  BASE,
  EMP1,
  EMP2,
  PERIODO_QA,
  createReporter,
  login,
  api,
  stamp,
  type QaRow,
  type Refs,
} from './qa-contratistas-nivel1-lib';
import {
  pickRefs,
  blockCatalogsExtended,
  blockTarifaConsecutiva,
  blockIngresoOverrideJefatura,
  blockProformaReversa,
  blockFactura,
  blockContabilidad,
  blockAuditoria,
  resolvePeriodoOperacion,
  resolvePeriodoCierre,
} from './qa-contratistas-nivel1-phase2';

const results: QaRow[] = [];
const r = createReporter(results);

async function blockEnvironment() {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) {
    r.fail('ENV-01', `health HTTP ${res.status}`);
    return false;
  }
  const body = (await res.json()) as { status?: string; db?: string };
  if (body.status === 'ok' && body.db === 'ok') {
    r.pass('ENV-01', 'status=ok, db=ok');
    return true;
  }
  r.fail('ENV-01', `status=${body.status} db=${body.db}`);
  return false;
}

async function blockPermissions(
  adminToken: string,
  digitadorToken: string,
  jefaturaToken: string,
) {
  const dLab = await api(digitadorToken, 'POST', '/labores', {
    codigo: `QA-D-${stamp()}`,
    nombre: 'QA Digitador',
  });
  if (dLab.status === 403) r.pass('PER-01', 'Digitador POST /labores → 403');
  else r.fail('PER-01', `Digitador POST /labores → ${dLab.status}`);

  const dTar = await api(digitadorToken, 'POST', '/tarifas-contratista', {
    contratistaId: 'x',
    laborId: 'x',
    actividadId: 'x',
    tarifa: 1,
    unidad: 'HR',
    centroCostoId: 'x',
    tipoContratoId: 'x',
    vigenciaDesde: `${PERIODO_QA}-01`,
  });
  if (dLab.status !== 403 && dTar.status !== 403) {
    r.fail('PER-01', `Digitador sin 403 (lab=${dLab.status}, tar=${dTar.status})`);
  }

  const jClose = await api(jefaturaToken, 'POST', '/contratistas/traspaso-cierre', {
    periodo: PERIODO_QA,
  });
  if (jClose.status === 403) r.pass('PER-02', 'Jefatura POST traspaso-cierre → 403');
  else r.fail('PER-02', `Jefatura cierre → ${jClose.status}`);

  const jReopen = await api(
    jefaturaToken,
    'POST',
    `/contratistas/traspaso-cierre/${PERIODO_QA}/reabrir`,
    { motivo: 'QA no debe poder' },
  );
  if (jReopen.status === 403) r.pass('PER-02', 'Jefatura reapertura → 403');
  else r.fail('PER-02', `Jefatura reapertura → ${jReopen.status}`);

  const aGet = await api(adminToken, 'GET', `/contratistas/traspaso-cierre/${PERIODO_QA}`);
  if (aGet.status === 200) r.pass('PER-03', 'Admin GET traspaso-cierre → 200');
  else r.fail('PER-03', `Admin GET traspaso → ${aGet.status}`);

  const dAud = await api(digitadorToken, 'GET', '/contratistas/auditoria');
  if (dAud.status === 403) r.pass('AUD-02', 'Digitador GET auditoría → 403');
  else r.fail('AUD-02', `Digitador auditoría → ${dAud.status}`);
}

async function blockCatalogs(jefaturaToken: string) {
  const tag = stamp();
  const lab = await api(jefaturaToken, 'POST', '/labores', {
    codigo: `QA-LAB-${tag}`,
    nombre: `QA Labor ${tag}`,
  });
  if (lab.status >= 200 && lab.status < 300) r.pass('CAT-01', `Labor creada (${tag})`);
  else {
    r.fail('CAT-01', `POST labor → ${lab.status}`);
    return null;
  }
  const labId = (lab.data as { id?: string })?.id;
  const act = await api(jefaturaToken, 'POST', '/actividades', {
    codigo: `QA-ACT-${tag}`,
    nombre: `QA Act ${tag}`,
  });
  if (act.status >= 200 && act.status < 300) r.pass('CAT-02', `Actividad creada (${tag})`);
  else {
    r.fail('CAT-02', `POST actividad → ${act.status}`);
    return null;
  }
  const actId = (act.data as { id?: string })?.id;
  if (labId && actId) {
    const link = await api(jefaturaToken, 'POST', '/labor-actividad', { laborId: labId, actividadId: actId });
    if (link.status >= 200 && link.status < 300) r.pass('CAT-03', 'Asociación N:M creada');
    else r.fail('CAT-03', `POST labor-actividad → ${link.status}`);
    const dup = await api(jefaturaToken, 'POST', '/labor-actividad', { laborId: labId, actividadId: actId });
    if ([200, 201, 409, 400].includes(dup.status)) {
      r.pass('CAT-03', `Segundo vínculo → HTTP ${dup.status}`);
    } else r.fail('CAT-03', `Duplicado → ${dup.status}`);
  }
  return { labId, actId, tag };
}

async function blockRates(
  jefaturaToken: string,
  digitadorToken: string,
  refs: Refs,
  catalog: { labId?: string; actId?: string } | null,
  periodo: string,
): Promise<string | undefined> {
  if (!refs.contratistaId || !refs.centroCostoId || !refs.tipoContratoId) {
    r.skip('TAR-01', 'sin datos semilla');
    return undefined;
  }
  const laborId = catalog?.labId ?? refs.laborId;
  const actividadId = catalog?.actId ?? refs.actividadId;
  if (!laborId || !actividadId) {
    r.skip('TAR-01', 'sin labor/actividad');
    return undefined;
  }

  const baseTarifa = {
    contratistaId: refs.contratistaId,
    laborId,
    actividadId,
    tarifa: 12345,
    unidad: 'HR',
    centroCostoId: refs.centroCostoId,
    tipoContratoId: refs.tipoContratoId,
    vigenciaDesde: `${periodo}-01`,
  };
  const t1 = await api(jefaturaToken, 'POST', '/tarifas-contratista', baseTarifa);
  const tarifaId = (t1.data as { id?: string })?.id;
  if (t1.status >= 200 && t1.status < 300) r.pass('TAR-01', 'Tarifa QA creada');
  else {
    r.fail('TAR-01', `POST tarifa → ${t1.status}`);
    return undefined;
  }

  const t2 = await api(jefaturaToken, 'POST', '/tarifas-contratista', {
    ...baseTarifa,
    tarifa: 99999,
    vigenciaDesde: `${periodo}-05`,
  });
  if (t2.status === 400 || t2.status === 409) r.pass('TAR-02', 'Solapamiento rechazado');
  else r.fail('TAR-02', `Segunda tarifa solapada → ${t2.status}`);

  await blockTarifaConsecutiva(jefaturaToken, refs, laborId, actividadId, tarifaId, periodo, r);

  const ingOk = await api(digitadorToken, 'POST', '/ingresos-labor-diario', {
    fecha: `${periodo}-10`,
    contratistaId: refs.contratistaId,
    centroCostoId: refs.centroCostoId,
    laborId,
    actividadId,
    tipoJornada: 'TRATO',
    cantidad: 2,
  });
  if (ingOk.status >= 200 && ingOk.status < 300) {
    const row = ingOk.data as { tarifaId?: string; precioUnitario?: number };
    if (row.tarifaId && row.precioUnitario) {
      r.pass('ING-01', `Snapshot tarifa ${row.tarifaId} @ ${row.precioUnitario}`);
    } else r.pass('ING-01', 'Ingreso con tarifa resuelta');
  } else r.fail('ING-01', `POST ingreso → ${ingOk.status}`);

  const ingNoTar = await api(digitadorToken, 'POST', '/ingresos-labor-diario', {
    fecha: `${periodo}-10`,
    contratistaId: refs.contratistaId,
    centroCostoId: refs.centroCostoId,
    laborId,
    actividadId: 'ACT-NO-TARIFA-QA',
    tipoJornada: 'TRATO',
    cantidad: 1,
  });
  if (ingNoTar.status >= 400) r.pass('ING-02', 'Captura sin tarifa rechazada');
  else r.fail('ING-02', `Ingreso sin tarifa → ${ingNoTar.status}`);

  const ingOv = await api(digitadorToken, 'POST', '/ingresos-labor-diario', {
    fecha: `${periodo}-11`,
    contratistaId: refs.contratistaId,
    centroCostoId: refs.centroCostoId,
    laborId,
    actividadId,
    tipoJornada: 'TRATO',
    cantidad: 1,
    precioUnitario: 1,
  });
  if (ingOv.status === 400 || ingOv.status === 403) r.pass('ING-03', 'Override digitador rechazado');
  else r.fail('ING-03', `Override digitador → ${ingOv.status}`);

  await blockIngresoOverrideJefatura(jefaturaToken, refs, laborId, actividadId, periodo, r);
  return tarifaId;
}

async function blockProformas(jefaturaToken: string, refs: Refs, periodo: string) {
  if (!refs.contratistaId || !refs.tipoContratoId) {
    r.skip('PRO-01', 'sin contratista/tipo');
    return;
  }
  const ingresos = await api(jefaturaToken, 'GET', '/ingresos-labor-diario');
  const list = Array.isArray(ingresos.data) ? ingresos.data : [];
  const pendientes = list.filter(
    (i: {
      estado?: string;
      proformaId?: string | null;
      contratistaId?: string;
      tipoContratoId?: string;
      fecha?: string;
    }) =>
      i.estado === 'PENDIENTE'
      && !i.proformaId
      && i.contratistaId === refs.contratistaId
      && i.tipoContratoId === refs.tipoContratoId
      && String(i.fecha ?? '').slice(0, 7) === periodo,
  );
  if (pendientes.length < 1) {
    r.skip('PRO-01', 'sin ingresos pendientes');
    r.skip('PRO-03', 'sin ingresos');
    return;
  }
  const ids = pendientes.map((p: { id: string }) => p.id);
  const previewBody = {
    numero: `QA-PREV-${stamp()}`,
    contratistaId: refs.contratistaId,
    tipoContratoId: refs.tipoContratoId,
    periodo,
    ingresoIds: [ids[0]],
  };
  const preview = await api(jefaturaToken, 'POST', '/proformas-contratista/preview', previewBody);
  if (preview.status >= 200 && preview.status < 300) {
    const total = (preview.data as { montoNeto?: number })?.montoNeto;
    r.pass('PRO-01', `Preview OK${total != null ? ` total=${total}` : ''}`);
  } else {
    r.fail('PRO-01', `Preview → ${preview.status} ${JSON.stringify(preview.data).slice(0, 120)}`);
  }

  const badPreview = await api(jefaturaToken, 'POST', '/proformas-contratista/preview', {
    numero: `QA-PREV-BAD-${stamp()}`,
    contratistaId: refs.contratistaId,
    tipoContratoId: refs.tipoContratoId,
    periodo,
    ingresoIds: ['ILD-FAKE-QA'],
  });
  if (badPreview.status >= 400) r.pass('PRO-02', 'Preview inválido rechazado');
  else r.fail('PRO-02', `Preview inválido → ${badPreview.status}`);

  const num = `QA-PF-${stamp()}`;
  const create = await api(jefaturaToken, 'POST', '/proformas-contratista', {
    numero: num,
    contratistaId: refs.contratistaId,
    tipoContratoId: refs.tipoContratoId,
    periodo,
    ingresoIds: [ids[0]],
  });
  if (create.status >= 200 && create.status < 300) {
    r.pass('PRO-03', `Proforma borrador ${num}`);
    const pfId = (create.data as { id?: string })?.id;
    if (pfId) {
      const def = await api(jefaturaToken, 'POST', `/proformas-contratista/${pfId}/definitiva`, {});
      if (def.status >= 200 && def.status < 300) r.pass('PRO-03', 'Borrador → Definitiva OK');
      else r.fail('PRO-03', `Definitiva → ${def.status}`);
    }
  } else r.fail('PRO-03', `Crear proforma → ${create.status}`);
}

async function blockTenant(adminToken: string, jefaturaToken: string) {
  const list1 = await api(jefaturaToken, 'GET', '/contratistas', undefined, EMP1);
  const first = (Array.isArray(list1.data) ? list1.data : [])[0] as { id?: string } | undefined;
  if (!first?.id) {
    r.skip('TEN-01', 'sin contratistas EMP-1');
    return;
  }
  const list2 = await api(adminToken, 'GET', '/contratistas', undefined, EMP2);
  if (list2.status !== 200) {
    r.fail('TEN-01', `Listado EMP-2 → ${list2.status}`);
    return;
  }
  const ids2 = (Array.isArray(list2.data) ? list2.data : []).map((c: { id: string }) => c.id);
  if (!ids2.includes(first.id)) r.pass('TEN-01', 'Contratista EMP-1 ausente en EMP-2');
  else r.fail('TEN-01', 'Contratista EMP-1 visible en EMP-2');
}

async function main() {
  console.log('\n══ QA Contratistas Nivel 1 (API — ampliado) ══\n');
  const healthy = await blockEnvironment();
  if (!healthy) {
    writeReport();
    process.exit(1);
  }

  let adminToken: string;
  let digitadorToken: string;
  let jefaturaToken: string;
  try {
    adminToken = (await login('admin@almahue.local', 'Admin123!')).token;
    digitadorToken = (await login('jsanchez@almahue.cl', 'demo123')).token;
    jefaturaToken = (await login('jcontratistas@almahue.cl', 'demo123')).token;
  } catch (e) {
    r.fail('ENV-02', `Login API: ${e instanceof Error ? e.message : e}`);
    writeReport();
    process.exit(1);
  }
  r.pass('ENV-02', 'Login admin/digitador/jefatura vía API OK');
  const periodoOps = await resolvePeriodoOperacion(adminToken, r);

  await blockPermissions(adminToken, digitadorToken, jefaturaToken);
  const refs = await pickRefs(jefaturaToken);
  const catalog = await blockCatalogs(jefaturaToken);
  await blockCatalogsExtended(jefaturaToken, adminToken, r);
  const laborId = catalog?.labId ?? refs.laborId;
  const actividadId = catalog?.actId ?? refs.actividadId;
  await blockRates(jefaturaToken, digitadorToken, refs, catalog, periodoOps);
  await blockProformas(jefaturaToken, refs, periodoOps);
  if (laborId && actividadId) {
    await blockProformaReversa(
      digitadorToken,
      jefaturaToken,
      adminToken,
      refs,
      laborId,
      actividadId,
      periodoOps,
      r,
    );
    await blockFactura(
      digitadorToken,
      jefaturaToken,
      adminToken,
      refs,
      laborId,
      actividadId,
      periodoOps,
      r,
    );
    const periodoCierre = await resolvePeriodoCierre(adminToken);
    await blockContabilidad(
      adminToken,
      digitadorToken,
      jefaturaToken,
      refs,
      laborId,
      actividadId,
      periodoCierre,
      r,
    );
  }
  await blockAuditoria(jefaturaToken, r);
  await blockTenant(adminToken, jefaturaToken);

  writeReport();
  const fails = results.filter((x) => !x.ok && !x.detail.startsWith('SKIP:')).length;
  process.exit(fails > 0 ? 1 : 0);
}

function writeReport() {
  const ok = results.filter((x) => x.ok).length;
  const skips = results.filter((x) => x.detail.startsWith('SKIP:')).length;
  const fails = results.filter((x) => !x.ok && !x.detail.startsWith('SKIP:')).length;
  console.log(`\n── API: ${ok} OK · ${skips} skip · ${fails} FAIL · ${results.length} filas ──\n`);

  const outDir = path.join(__dirname, '..', 'qa-results');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'contratistas-nivel1-api.json');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        tool: 'api',
        summary: { ok, skip: skips, fail: fails, total: results.length },
        results,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`JSON → ${jsonPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
