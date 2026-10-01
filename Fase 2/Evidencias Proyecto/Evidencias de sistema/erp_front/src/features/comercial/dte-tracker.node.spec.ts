import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { correoClienteDeLista, pasosTrackerDte } from './dte-tracker.ts';
import type { DocumentoComercial } from '../../types/domain.ts';

const base = {
  id: 'D1',
  folio: 'FA-1',
  tipo: 'FACTURA',
  cliente: 'Pacific',
  clienteId: 'C1',
  fecha: '2026-06-03',
  neto: 100,
  estado: 'CONTABILIZADA',
} as DocumentoComercial;

describe('tracking DTE (Sergio 03/09 [19:33] [21:40])', () => {
  it('muestra usuario, fecha-hora y casilla del maestro', () => {
    const pasos = pasosTrackerDte({
      ...base,
      creadoPorNombre: 'Valentina Diaz',
      billingEmittedAt: '2026-06-03T18:30:00.000Z',
      billingEmissionId: 'em-1',
      folioOficial: '60',
      billingStatus: 'PENDING',
    }, { clienteEmail: 'facturacion@pacific.cl', smtpHabilitado: false });
    const emitido = pasos.find((p) => p.key === 'emitido');
    assert.match(emitido?.detalle ?? '', /Valentina Diaz/);
    assert.match(emitido?.detalle ?? '', /03-06-2026/);
    assert.match(emitido?.detalle ?? '', /\d{2}:\d{2}/);
    const correo = pasos.find((p) => p.key === 'correo');
    assert.match(correo?.detalle ?? '', /facturacion@pacific.cl/);
    assert.equal(correo?.hecho, false);
  });

  it('avisa si el cliente no tiene correo', () => {
    const pasos = pasosTrackerDte(base, { clienteEmail: '', smtpHabilitado: false });
    assert.match(pasos.find((p) => p.key === 'correo')?.detalle ?? '', /no tiene correo/);
  });

  it('resuelve el email por clienteId', () => {
    assert.equal(
      correoClienteDeLista('C1', [{ id: 'C1', email: 'a@b.cl' }]),
      'a@b.cl',
    );
    assert.equal(correoClienteDeLista('C2', [{ id: 'C1', email: 'a@b.cl' }]), '');
  });

  it('después del correo agrega anulación CodRef 1', () => {
    const nc = {
      ...base,
      id: 'NC1',
      tipo: 'NC',
      folio: 'NC-55',
      folioOficial: '55',
      referenciaCod: 1,
    } as DocumentoComercial;
    const pasos = pasosTrackerDte(
      { ...base, folioOficial: '70', billingStatus: 'ACCEPTED', billingEmissionId: 'em-1' },
      { clienteEmail: 'a@b.cl', smtpHabilitado: true, asociados: [base, nc] },
    );
    const keys = pasos.map((p) => p.key);
    assert.equal(keys.at(-2), 'correo');
    assert.equal(keys.at(-1), 'anula-NC1');
    assert.match(pasos.at(-1)?.detalle ?? '', /55/);
  });

  it('después del correo agrega corrección de montos CodRef 3', () => {
    const nc = {
      ...base,
      id: 'NC2',
      tipo: 'NC',
      folio: 'NC-56',
      folioOficial: '56',
      referenciaCod: 3,
    } as DocumentoComercial;
    const pasos = pasosTrackerDte(base, { asociados: [nc] });
    assert.equal(pasos.at(-1)?.key, 'mnt-NC2');
    assert.match(pasos.at(-1)?.titulo ?? '', /montos/i);
  });
});
