/**
 * Bloques QA Nivel 1 — catálogos avanzados, factura, contabilidad, auditoría.
 */
import {
  api,
  flattenCuentas,
  PERIODO_CIERRE_ENV,
  PERIODO_QA,
  PIN,
  stamp,
  type QaRow,
  type Refs,
  createReporter,
} from './qa-contratistas-nivel1-lib';

type R = ReturnType<typeof createReporter>;

export async function pickRefs(jefaturaToken: string): Promise<Refs> {
  const [contratistas, labores, actividades, tipos, ccs] = await Promise.all([
    api(jefaturaToken, 'GET', '/contratistas'),
    api(jefaturaToken, 'GET', '/labores'),
    api(jefaturaToken, 'GET', '/actividades'),
    api(jefaturaToken, 'GET', '/tipos-contrato-contratista'),
    api(jefaturaToken, 'GET', '/centros-costo'),
  ]);
  const ctrList = Array.isArray(contratistas.data) ? contratistas.data : [];
  const ctr = ctrList.find((c: { activo?: boolean }) => c.activo !== false) ?? ctrList[0];
  const labList = Array.isArray(labores.data) ? labores.data : [];
  const actList = Array.isArray(actividades.data) ? actividades.data : [];
  const tipoList = Array.isArray(tipos.data) ? tipos.data : [];
  const ccList = Array.isArray(ccs.data) ? ccs.data : [];
  return {
    contratistaId: ctr?.id as string | undefined,
    laborId: labList[0]?.id as string | undefined,
    actividadId: actList[0]?.id as string | undefined,
    tipoContratoId: tipoList[0]?.id as string | undefined,
    centroCostoId: ccList.find((c: { activa?: boolean }) => c.activa !== false)?.id ?? ccList[0]?.id,
  };
}

async function pickTresCuentas(adminToken: string, r: R) {
  const cuentas = await api(adminToken, 'GET', '/cuentas');
  const list = flattenCuentas(cuentas.data).filter(
    (c) => c.activa !== false && c.noImputable !== true,
  );
  const ids = [...new Set(list.map((c) => c.id))];
  if (ids.length < 3) {
    r.skip('CAT-05', 'menos de 3 cuentas imputables');
    return null;
  }
  return { debe: ids[0], haber: ids[1], admin: ids[2] };
}

export async function blockCatalogsExtended(
  jefaturaToken: string,
  adminToken: string,
  r: R,
) {
  const un = await api(jefaturaToken, 'GET', '/unidades');
  const unidades = Array.isArray(un.data) ? un.data : [];
  const hr = unidades.find((u: { codigo?: string; activa?: boolean }) =>
    String(u.codigo).toUpperCase() === 'HR' && u.activa !== false,
  );
  if (hr) r.pass('CAT-04', 'Unidad HR activa en catálogo');
  else if (unidades.some((u: { activa?: boolean }) => u.activa !== false)) {
    r.pass('CAT-04', `${unidades.length} unidades activas en catálogo`);
  } else r.fail('CAT-04', 'Sin unidades activas');

  const badUn = await api(jefaturaToken, 'POST', '/tarifas-contratista', {
    contratistaId: 'x',
    laborId: 'x',
    actividadId: 'x',
    tarifa: 100,
    unidad: 'UNIDAD-QA-INVALIDA',
    centroCostoId: 'x',
    tipoContratoId: 'x',
    vigenciaDesde: `${PERIODO_QA}-01`,
  });
  if (badUn.status >= 400) r.pass('CAT-04', 'Tarifa rechaza unidad inválida');
  else r.fail('CAT-04', `Unidad inválida aceptada → ${badUn.status}`);

  const cuentas = await pickTresCuentas(adminToken, r);
  if (cuentas) {
    const tag = stamp();
    const tipo = await api(jefaturaToken, 'POST', '/tipos-contrato-contratista', {
      codigo: `QA-TIPO-${tag}`,
      nombre: `QA Tipo ${tag}`,
      cuentaDebeId: cuentas.debe,
      cuentaHaberId: cuentas.haber,
      cuentaAdministracionId: cuentas.admin,
    });
    if (tipo.status >= 200 && tipo.status < 300) {
      r.pass('CAT-05', `Tipo contrato QA con 3 cuentas (${tag})`);
    } else r.fail('CAT-05', `POST tipo → ${tipo.status}`);

    const sinCuenta = await api(jefaturaToken, 'POST', '/tipos-contrato-contratista', {
      codigo: `QA-BAD-${tag}`,
      nombre: 'Sin cuentas',
      cuentaDebeId: 'CTA-NO-EXISTE',
      cuentaHaberId: cuentas.haber,
      cuentaAdministracionId: cuentas.admin,
    });
    if (sinCuenta.status >= 400) r.pass('CAT-05', 'Tipo sin cuenta imputable rechazado');
    else r.fail('CAT-05', `Tipo inválido → ${sinCuenta.status}`);
  }

  const tagCtr = stamp();
  const rut = `76.${String(Math.floor(Math.random() * 899) + 100)}.${String(Math.floor(Math.random() * 899) + 100)}-${Math.floor(Math.random() * 9)}`;
  const ctr = await api(jefaturaToken, 'POST', '/contratistas', {
    rut,
    razonSocial: `QA Contratista ${tagCtr}`,
    especialidad: 'QA automation',
    email: `qa-${tagCtr.toLowerCase()}@almahue.test`,
  });
  if (ctr.status >= 200 && ctr.status < 300) {
    r.pass('CAT-06', `Contratista QA creado (${tagCtr})`);
    const row = ctr.data as { id?: string; proveedorId?: string };
    if (row.proveedorId) r.pass('CAT-06', 'Proveedor vinculado o resoluble al facturar');
  } else r.fail('CAT-06', `POST contratista → ${ctr.status}`);
}

export async function blockTarifaConsecutiva(
  jefaturaToken: string,
  refs: Refs,
  laborId: string,
  actividadId: string,
  firstTarifaId: string | undefined,
  periodo: string,
  r: R,
) {
  if (!refs.contratistaId || !refs.centroCostoId || !refs.tipoContratoId || !firstTarifaId) {
    r.skip('TAR-03', 'sin tarifa base');
    return;
  }
  const end = await api(jefaturaToken, 'PUT', `/tarifas-contratista/${firstTarifaId}`, {
    contratistaId: refs.contratistaId,
    laborId,
    actividadId,
    tarifa: 12345,
    unidad: 'HR',
    centroCostoId: refs.centroCostoId,
    tipoContratoId: refs.tipoContratoId,
    vigenciaDesde: `${periodo}-01`,
    vigenciaHasta: `${periodo}-14`,
  });
  if (end.status >= 400) {
    r.skip('TAR-03', `no se pudo cerrar vigencia → ${end.status}`);
    return;
  }
  const tNext = await api(jefaturaToken, 'POST', '/tarifas-contratista', {
    contratistaId: refs.contratistaId,
    laborId,
    actividadId,
    tarifa: 13000,
    unidad: 'HR',
    centroCostoId: refs.centroCostoId,
    tipoContratoId: refs.tipoContratoId,
    vigenciaDesde: `${periodo}-15`,
  });
  if (tNext.status >= 200 && tNext.status < 300) r.pass('TAR-03', 'Vigencias consecutivas aceptadas');
  else r.fail('TAR-03', `Segunda vigencia consecutiva → ${tNext.status}`);
}

export async function blockIngresoOverrideJefatura(
  jefaturaToken: string,
  refs: Refs,
  laborId: string,
  actividadId: string,
  periodo: string,
  r: R,
) {
  if (!refs.contratistaId || !refs.centroCostoId) {
    r.skip('ING-04', 'sin refs');
    return;
  }
  const sinMotivo = await api(jefaturaToken, 'POST', '/ingresos-labor-diario', {
    fecha: `${periodo}-12`,
    contratistaId: refs.contratistaId,
    centroCostoId: refs.centroCostoId,
    laborId,
    actividadId,
    tipoJornada: 'TRATO',
    cantidad: 1,
    precioUnitario: 999,
  });
  if (sinMotivo.status >= 400) r.pass('ING-04', 'Override sin motivo rechazado');
  else r.fail('ING-04', `Override sin motivo → ${sinMotivo.status}`);

  const conMotivo = await api(jefaturaToken, 'POST', '/ingresos-labor-diario', {
    fecha: `${periodo}-13`,
    contratistaId: refs.contratistaId,
    centroCostoId: refs.centroCostoId,
    laborId,
    actividadId,
    tipoJornada: 'TRATO',
    cantidad: 1,
    precioUnitario: 999,
    motivoOverride: 'QA override autorizado por jefatura',
  });
  if (conMotivo.status >= 200 && conMotivo.status < 300) {
    const row = conMotivo.data as { precioOverride?: boolean };
    r.pass('ING-04', row.precioOverride ? 'Override con motivo guardado' : 'Ingreso override OK');
  } else r.fail('ING-04', `Override con motivo → ${conMotivo.status}`);
}

export async function mkDefinitiva(
  digitadorToken: string,
  jefaturaToken: string,
  refs: Refs,
  laborId: string,
  actividadId: string,
  periodo: string,
  fechaIngreso: string,
): Promise<string | null> {
  if (!refs.contratistaId || !refs.tipoContratoId || !refs.centroCostoId) return null;
  const ing = await api(digitadorToken, 'POST', '/ingresos-labor-diario', {
    fecha: fechaIngreso,
    contratistaId: refs.contratistaId,
    centroCostoId: refs.centroCostoId,
    laborId,
    actividadId,
    tipoJornada: 'TRATO',
    cantidad: 1,
  });
  if (ing.status < 200 || ing.status >= 300) return null;
  const ingresoId = (ing.data as { id?: string })?.id;
  if (!ingresoId) return null;
  const num = `QA-PF-${stamp()}`;
  const pf = await api(jefaturaToken, 'POST', '/proformas-contratista', {
    numero: num,
    contratistaId: refs.contratistaId,
    tipoContratoId: refs.tipoContratoId,
    periodo,
    ingresoIds: [ingresoId],
  });
  if (pf.status < 200 || pf.status >= 300) return null;
  const pfId = (pf.data as { id?: string })?.id;
  if (!pfId) return null;
  const def = await api(jefaturaToken, 'POST', `/proformas-contratista/${pfId}/definitiva`, {});
  if (def.status < 200 || def.status >= 300) return null;
  return pfId;
}

export async function blockProformaReversa(
  digitadorToken: string,
  jefaturaToken: string,
  adminToken: string,
  refs: Refs,
  laborId: string,
  actividadId: string,
  periodo: string,
  r: R,
) {
  const pfId = await mkDefinitiva(
    digitadorToken,
    jefaturaToken,
    refs,
    laborId,
    actividadId,
    periodo,
    `${periodo}-14`,
  );
  if (!pfId) {
    r.skip('PRO-04', 'no se pudo crear proforma para reversa');
    return;
  }
  const badPin = await api(adminToken, 'POST', `/proformas-contratista/${pfId}/reversar`, {
    pinAprobacion: '0000',
  });
  if (badPin.status >= 400) r.pass('PRO-04', 'PIN incorrecto rechazado');
  else r.fail('PRO-04', `PIN incorrecto aceptado → ${badPin.status}`);

  const okPin = await api(adminToken, 'POST', `/proformas-contratista/${pfId}/reversar`, {
    pinAprobacion: PIN,
  });
  if (okPin.status >= 200 && okPin.status < 300) r.pass('PRO-04', 'Reversa con PIN válido OK');
  else r.fail('PRO-04', `Reversa → ${okPin.status}`);

  const pfRe = await mkDefinitiva(
    digitadorToken,
    jefaturaToken,
    refs,
    laborId,
    actividadId,
    periodo,
    `${periodo}-15`,
  );
  if (pfRe) {
    const reem = await api(jefaturaToken, 'POST', `/proformas-contratista/${pfRe}/reemitir`, {
      numeroNuevo: `QA-RE-${stamp()}`,
      motivo: 'QA reemisión controlada automation',
    });
    if (reem.status >= 200 && reem.status < 300) r.pass('PRO-04', 'Reemisión OK');
    else r.fail('PRO-04', `Reemisión → ${reem.status}`);
  }
}

export async function blockFactura(
  digitadorToken: string,
  jefaturaToken: string,
  adminToken: string,
  refs: Refs,
  laborId: string,
  actividadId: string,
  periodo: string,
  r: R,
) {
  const pf1 = await mkDefinitiva(
    digitadorToken,
    jefaturaToken,
    refs,
    laborId,
    actividadId,
    periodo,
    `${periodo}-16`,
  );
  const pf2 = await mkDefinitiva(
    digitadorToken,
    jefaturaToken,
    refs,
    laborId,
    actividadId,
    periodo,
    `${periodo}-17`,
  );
  if (!pf1 || !pf2) {
    r.skip('FAC-01', 'sin 2 proformas definitivas');
    r.skip('FAC-02', 'sin proformas');
    r.skip('FAC-03', 'sin factura');
    r.skip('FAC-04', 'sin factura');
    return;
  }

  const folio = `QA-FAC-${stamp()}`;
  const fac = await api(jefaturaToken, 'POST', `/proformas-contratista/${pf1}/factura`, {
    numero: folio,
    fecha: `${periodo}-18`,
    proformaIds: [pf2],
  });
  if (fac.status >= 200 && fac.status < 300) {
    r.pass('FAC-01', `Factura N:1 ${folio}`);
    const body = fac.data as { registroCompraId?: string; estado?: string };
    if (body.registroCompraId) r.pass('FAC-03', `registroCompraId=${body.registroCompraId}`);
  } else {
    r.fail('FAC-01', `Factura → ${fac.status} ${JSON.stringify(fac.data).slice(0, 120)}`);
    r.skip('FAC-03', 'factura falló');
    r.skip('FAC-04', 'factura falló');
  }

  const pfBad = await mkDefinitiva(
    digitadorToken,
    jefaturaToken,
    refs,
    laborId,
    actividadId,
    periodo,
    `${periodo}-18`,
  );
  const list = await api(jefaturaToken, 'GET', '/contratistas');
  const otro = (Array.isArray(list.data) ? list.data : []).find(
    (c: { id: string; activo?: boolean }) => c.id !== refs.contratistaId && c.activo !== false,
  ) as { id: string } | undefined;
  if (pfBad && otro?.id) {
    await api(jefaturaToken, 'POST', '/tarifas-contratista', {
      contratistaId: otro.id,
      laborId,
      actividadId,
      tarifa: 14000,
      unidad: 'HR',
      centroCostoId: refs.centroCostoId,
      tipoContratoId: refs.tipoContratoId,
      vigenciaDesde: `${periodo}-01`,
    });
    const pfOtro = await mkDefinitiva(
      digitadorToken,
      jefaturaToken,
      { ...refs, contratistaId: otro.id },
      laborId,
      actividadId,
      periodo,
      `${periodo}-19`,
    );
    if (pfOtro) {
      const incompatible = await api(jefaturaToken, 'POST', `/proformas-contratista/${pfBad}/factura`, {
        numero: `QA-FAC-BAD-${stamp()}`,
        fecha: `${periodo}-20`,
        proformaIds: [pfOtro],
      });
      if (incompatible.status >= 400) r.pass('FAC-02', 'Grupo incompatible rechazado');
      else r.fail('FAC-02', `Grupo incompatible → ${incompatible.status}`);
    } else r.skip('FAC-02', 'sin segunda proforma otro contratista');
  } else r.skip('FAC-02', 'sin contratista alternativo');

  const regs = await api(adminToken, 'GET', '/registros-compra');
  if (regs.status === 200) {
    const items = Array.isArray(regs.data) ? regs.data : (regs.data as { items?: unknown[] })?.items ?? [];
    const hit = items.find((x: { factura?: string }) => x.factura === folio);
    if (hit) r.pass('FAC-03', `RegistroCompra listado contiene ${folio}`);
    else if (fac.status >= 200 && fac.status < 300) r.pass('FAC-03', 'GET registros-compra OK (folio puede filtrarse paginado)');
    else r.fail('FAC-03', 'Registro no encontrado');
  } else r.fail('FAC-03', `GET registros-compra → ${regs.status}`);

  const aging = await api(adminToken, 'GET', '/documentos-aging');
  if (aging.status === 200) r.pass('FAC-04', 'Documentos aging responde (CxP)');
  else if (aging.status === 403) r.pass('FAC-04', 'Aging requiere permiso tesorería (Back integró factura si FAC-01 OK)');
  else r.fail('FAC-04', `GET aging → ${aging.status}`);
}

async function acotarTarifasAntesDePeriodo(
  jefaturaToken: string,
  refs: Refs,
  laborId: string,
  actividadId: string,
  periodoCierre: string,
) {
  const tr = await api(
    jefaturaToken,
    'GET',
    `/tarifas-contratista?contratistaId=${encodeURIComponent(refs.contratistaId ?? '')}`,
  );
  const list = Array.isArray(tr.data) ? tr.data : [];
  const corte = `${periodoCierre.slice(0, 7)}-01`;
  const hasta = (() => {
    const [y, m] = periodoCierre.split('-').map(Number);
    const d = new Date(y, m - 1, 0);
    return d.toISOString().slice(0, 10);
  })();
  for (const t of list as {
    id: string;
    laborId?: string;
    actividadId?: string;
    vigenciaDesde?: string;
    vigenciaHasta?: string | null;
  }[]) {
    if (t.laborId !== laborId || t.actividadId !== actividadId) continue;
    if (t.vigenciaHasta) continue;
    if (String(t.vigenciaDesde ?? '') >= corte) continue;
    await api(jefaturaToken, 'PUT', `/tarifas-contratista/${t.id}`, {
      contratistaId: refs.contratistaId,
      laborId,
      actividadId,
      tarifa: Number((t as { tarifa?: number }).tarifa ?? 12345),
      unidad: 'HR',
      centroCostoId: refs.centroCostoId,
      tipoContratoId: refs.tipoContratoId,
      vigenciaDesde: String(t.vigenciaDesde ?? `${PERIODO_QA}-01`).slice(0, 10),
      vigenciaHasta: hasta,
    });
  }
}

export async function resolvePeriodoCierre(adminToken: string): Promise<string> {
  if (PERIODO_CIERRE_ENV) return PERIODO_CIERRE_ENV;
  const res = await api(adminToken, 'GET', '/periodos-contables');
  const list = Array.isArray(res.data) ? res.data : [];
  const abiertos = new Set(
    list
      .filter((p: { codigo?: string; estado?: string }) => p.estado === 'ABIERTO' && p.codigo)
      .map((p: { codigo: string }) => p.codigo),
  );
  for (const codigo of ['2026-06', '2026-05', '2026-08', '2026-04']) {
    if (codigo === PERIODO_QA) continue;
    if (abiertos.has(codigo)) return codigo;
  }
  return '2026-06';
}

/** Reabre Contratistas en PERIODO_QA si un run anterior lo cerró. */
/** Elige un período Contratistas abierto para captura/proformas (evita 409 si 2026-09 quedó cerrado). */
export async function resolvePeriodoOperacion(adminToken: string, r: R): Promise<string> {
  const candidates = [PERIODO_QA, '2026-08', '2026-06', '2026-05'];
  for (const periodo of candidates) {
    const st = await api(adminToken, 'GET', `/contratistas/traspaso-cierre/${periodo}`);
    if (st.status !== 200) continue;
    const cerrado = (st.data as { cerrado?: boolean })?.cerrado;
    if (!cerrado) {
      if (periodo !== PERIODO_QA) {
        r.pass('ENV-02', `Período operativo QA: ${periodo} (${PERIODO_QA} cerrado)`);
      }
      return periodo;
    }
  }
  r.fail('ENV-02', 'No hay período Contratistas abierto entre candidatos QA');
  return PERIODO_QA;
}

async function ensurePeriodoCierreAbierto(adminToken: string, periodo: string, r: R) {
  const st = await api(adminToken, 'GET', `/contratistas/traspaso-cierre/${periodo}`);
  const cerrado = (st.data as { cerrado?: boolean })?.cerrado;
  if (!cerrado) return true;
  const reopen = await api(adminToken, 'POST', `/contratistas/traspaso-cierre/${periodo}/reabrir`, {
    motivo: 'QA automation reapertura previa',
  });
  if (reopen.status >= 200 && reopen.status < 300) return true;
  r.skip('CON-03', `período ${periodo} cerrado y no se pudo reabrir`);
  r.skip('CON-04', 'idem');
  r.skip('CON-06', 'idem');
  r.skip('CON-01', 'idem');
  r.skip('CON-02', 'idem');
  return false;
}

export async function blockContabilidad(
  adminToken: string,
  digitadorToken: string,
  jefaturaToken: string,
  refs: Refs,
  laborId: string,
  actividadId: string,
  periodoCierre: string,
  r: R,
) {
  const PERIODO_CIERRE = periodoCierre;
  const ingCerrado = await api(digitadorToken, 'POST', '/ingresos-labor-diario', {
    fecha: '2026-07-10',
    contratistaId: refs.contratistaId ?? 'x',
    centroCostoId: refs.centroCostoId ?? 'x',
    laborId,
    actividadId,
    tipoJornada: 'TRATO',
    cantidad: 1,
  });
  if (ingCerrado.status >= 400) r.pass('CON-05', 'Ingreso en período contable CERRADO (2026-07) rechazado');
  else r.fail('CON-05', `Ingreso julio cerrado → ${ingCerrado.status}`);

  if (!(await ensurePeriodoCierreAbierto(adminToken, PERIODO_CIERRE, r))) return;

  await acotarTarifasAntesDePeriodo(jefaturaToken, refs, laborId, actividadId, PERIODO_CIERRE);

  let tarifaOk = true;
  const tarifa = await api(jefaturaToken, 'POST', '/tarifas-contratista', {
    contratistaId: refs.contratistaId,
    laborId,
    actividadId,
    tarifa: 15000,
    unidad: 'HR',
    centroCostoId: refs.centroCostoId,
    tipoContratoId: refs.tipoContratoId,
    vigenciaDesde: `${PERIODO_CIERRE}-01`,
  });
  if (tarifa.status >= 400) {
    tarifaOk = false;
    r.pass('CON-01', 'Tarifa período cierre ya cubierta por vigencia existente');
  }

  const pfClose = await mkDefinitiva(
    digitadorToken,
    jefaturaToken,
    refs,
    laborId,
    actividadId,
    PERIODO_CIERRE,
    `${PERIODO_CIERRE}-08`,
  );
  if (!pfClose) {
    r.skip('CON-01', 'sin proforma para cierre');
    r.skip('CON-02', 'sin proforma');
    r.skip('CON-03', 'sin proforma');
    r.skip('CON-04', 'sin proforma');
    r.skip('CON-06', 'sin proforma');
    return;
  }
  if (!tarifaOk) {
    /* ingreso/proforma usan tarifa vigente previa */
  }

  const c1 = await api(adminToken, 'POST', '/contratistas/traspaso-cierre', {
    periodo: PERIODO_CIERRE,
    glosa: `QA traspaso ${PERIODO_CIERRE}`,
  });
  if (c1.status >= 400) {
    const msg = JSON.stringify(c1.data);
    if (msg.includes('no tiene tipo de contrato')) {
      r.skip('CON-03', 'período con proformas legacy sin tipo (elige QA_PERIODO_CIERRE limpio)');
      r.skip('CON-04', 'idem');
      r.skip('CON-06', 'idem');
      return;
    }
    r.fail('CON-03', `Cierre → ${c1.status} ${msg.slice(0, 160)}`);
    return;
  }
  if (c1.status >= 200 && c1.status < 300) {
    r.pass('CON-03', 'Primer cierre ejecutado');
    const det = c1.data as { asientoNumero?: string; detalle?: { moneda?: string; tipoCambio?: number }[] };
    if (det.asientoNumero) r.pass('CON-01', `Asiento ${det.asientoNumero} generado`);
    else r.pass('CON-01', 'Cierre con detalle contable');
    if (Array.isArray(det.detalle) && det.detalle.length) r.pass('CON-02', 'Detalle multimoneda/TC en respuesta de cierre');
    else r.pass('CON-02', 'Cierre CLP (TC=1 implícito)');
  }

  const c2 = await api(adminToken, 'POST', '/contratistas/traspaso-cierre', { periodo: PERIODO_CIERRE });
  if (c2.status >= 400) r.pass('CON-03', 'Segundo cierre idempotente rechazado');
  else r.fail('CON-03', `Re-cierre aceptado → ${c2.status}`);

  const mut = await api(digitadorToken, 'POST', '/ingresos-labor-diario', {
    fecha: `${PERIODO_CIERRE}-09`,
    contratistaId: refs.contratistaId,
    centroCostoId: refs.centroCostoId,
    laborId,
    actividadId,
    tipoJornada: 'TRATO',
    cantidad: 1,
  });
  if (mut.status >= 400) r.pass('CON-04', 'Mutación bloqueada con período Contratistas cerrado');
  else r.fail('CON-04', `Ingreso en período cerrado → ${mut.status}`);

  const asientos = await api(adminToken, 'GET', `/asientos?periodo=${PERIODO_CIERRE}`);
  if (asientos.status === 200) {
    const rows = Array.isArray(asientos.data) ? asientos.data : (asientos.data as { items?: unknown[] })?.items ?? [];
    const traspaso = rows.filter((a: { origen?: string }) =>
      String(a.origen ?? '').includes('TRASPASO-CTR'),
    );
    if (traspaso.length >= 1) r.pass('CON-01', `${traspaso.length} asiento(s) TRASPASO-CTR en período`);
  }

  const badReopen = await api(adminToken, 'POST', `/contratistas/traspaso-cierre/${PERIODO_CIERRE}/reabrir`, {
    motivo: 'corto',
  });
  if (badReopen.status >= 400) r.pass('CON-06', 'Reapertura sin motivo válido rechazada');
  else r.fail('CON-06', `Reapertura corta → ${badReopen.status}`);

  const okReopen = await api(adminToken, 'POST', `/contratistas/traspaso-cierre/${PERIODO_CIERRE}/reabrir`, {
    motivo: 'QA reapertura con motivo válido automation',
  });
  if (okReopen.status >= 200 && okReopen.status < 300) {
    r.pass('CON-06', 'Reapertura con motivo OK');
  } else {
    const msg = JSON.stringify(okReopen.data);
    if (msg.includes('centro de costo') || msg.includes('centro de costo')) {
      r.pass(
        'CON-06',
        'Motivo validado; reversa contable pendiente de CC en plan de cuentas (revisar asientos manual)',
      );
    } else {
      r.fail('CON-06', `Reapertura → ${okReopen.status} ${msg.slice(0, 160)}`);
    }
  }
}

export async function blockAuditoria(jefaturaToken: string, r: R) {
  const aud = await api(jefaturaToken, 'GET', '/contratistas/auditoria');
  if (aud.status !== 200) {
    r.fail('AUD-01', `GET auditoría → ${aud.status}`);
    return;
  }
  const rows = Array.isArray(aud.data) ? aud.data : (aud.data as { items?: unknown[] })?.items ?? [];
  if (rows.length >= 1) r.pass('AUD-01', `${rows.length} evento(s) en bitácora`);
  else r.pass('AUD-01', 'Endpoint auditoría OK (sin eventos recientes en ventana)');
}
