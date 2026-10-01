import { formatCalendarDate, formatDateTime } from '../../lib/calendar-date.ts';
import type { DocumentoComercial } from '../../types/domain.ts';
import { SMTP_DOCUMENTOS_HINT } from './correo-documentos.ts';

export type TrackerTone = 'ok' | 'warn' | 'error' | 'muted';

export type TrackerPaso = {
  key: string;
  titulo: string;
  detalle: string;
  hecho: boolean;
  tone: TrackerTone;
};

export function correoClienteDeLista(
  clienteId: string | undefined,
  clientes: Array<{ id: string; email?: string | null }>,
): string {
  if (!clienteId) return '';
  return String(clientes.find((c) => c.id === clienteId)?.email ?? '').trim();
}

/** Seguimiento del DTE (Sergio 03/09 `[19:33]` fecha/hora + usuario; `[21:40]` casilla). */
export function pasosTrackerDte(
  doc: DocumentoComercial,
  opts: {
    clienteEmail?: string;
    smtpHabilitado?: boolean;
    asociados?: DocumentoComercial[];
  },
): TrackerPaso[] {
  const emitido = Boolean(doc.billingEmittedAt || doc.billingEmissionId);
  const status = (doc.billingStatus || '').toUpperCase();
  const siiOk = status === 'ACCEPTED';
  const siiRechazo = status === 'REJECTED';
  const siiPendiente = status === 'PENDING' || (emitido && !siiOk && !siiRechazo);
  const casilla = String(opts.clienteEmail ?? '').trim();
  const smtp = Boolean(opts.smtpHabilitado);

  const cuando = doc.billingEmittedAt
    ? formatDateTime(doc.billingEmittedAt)
    : doc.fecha
      ? `Fecha documento ${formatCalendarDate(doc.fecha)}`
      : '';

  let correoDetalle: string;
  let correoHecho = false;
  let correoTone: TrackerTone = 'muted';
  if (!casilla) {
    correoDetalle = 'El cliente no tiene correo en el maestro';
  } else if (!smtp) {
    correoDetalle = `${SMTP_DOCUMENTOS_HINT} Casilla: ${casilla}`;
  } else {
    correoDetalle = `Enviado a ${casilla}`;
    correoHecho = true;
    correoTone = 'ok';
  }

  return [
    {
      key: 'emitido',
      titulo: 'Documento emitido',
      detalle: [doc.creadoPorNombre && `Por ${doc.creadoPorNombre}`, cuando]
        .filter(Boolean)
        .join(' · ') || 'Registrado en el ERP',
      hecho: true,
      tone: 'ok',
    },
    {
      key: 'gosocket',
      titulo: 'Enviado a GoSocket',
      detalle: emitido
        ? [
          doc.folioOficial && `Folio SII ${doc.folioOficial}`,
          doc.billingEmissionId && `Emisión ${doc.billingEmissionId}`,
        ].filter(Boolean).join(' · ') || 'Encolado en el facturador'
        : 'Todavía no se envió al facturador',
      hecho: emitido,
      tone: emitido ? 'ok' : 'muted',
    },
    {
      key: 'sii',
      titulo: siiRechazo ? 'Rechazado por el SII' : siiOk ? 'Aceptado por el SII' : 'Revisión del SII',
      detalle: siiRechazo
        ? (doc.billingDisclaimer || 'El SII rechazó el DTE')
        : siiOk
          ? 'Aceptado'
          : siiPendiente
            ? 'Pendiente de revisión del SII'
            : 'Sin estado SII',
      hecho: siiOk || siiRechazo,
      tone: siiRechazo ? 'error' : siiOk ? 'ok' : siiPendiente ? 'warn' : 'muted',
    },
    {
      key: 'correo',
      titulo: 'Correo al cliente',
      detalle: correoDetalle,
      hecho: correoHecho,
      tone: correoTone,
    },
    ...pasosTrackerAsociados(doc, opts.asociados ?? []),
  ];
}

function folioTracker(d: DocumentoComercial): string {
  return String(d.folioOficial || d.folio || '').trim() || d.id;
}

/** Tras el correo: anulación (CodRef 1) o correcciones 2/3. */
function pasosTrackerAsociados(
  doc: DocumentoComercial,
  asociados: DocumentoComercial[],
): TrackerPaso[] {
  const tipo = (doc.tipo || '').toUpperCase();
  const extra: TrackerPaso[] = [];
  const otros = asociados.filter((d) => d.id !== doc.id);

  if (tipo === 'FACTURA') {
    for (const d of otros) {
      const t = (d.tipo || '').toUpperCase();
      if (t !== 'NC' && t !== 'ND') continue;
      const folio = folioTracker(d);
      if (d.referenciaCod === 1 && t === 'NC') {
        extra.push({
          key: `anula-${d.id}`,
          titulo: 'Anulada',
          detalle: `Nota de crédito ${folio} (CodRef 1). La factura ya no se usa para cobrar.`,
          hecho: true,
          tone: 'ok',
        });
      } else if (d.referenciaCod === 2) {
        extra.push({
          key: `txt-${d.id}`,
          titulo: 'Corrección de texto',
          detalle: `${t} ${folio} (CodRef 2)`,
          hecho: true,
          tone: 'ok',
        });
      } else if (d.referenciaCod === 3) {
        extra.push({
          key: `mnt-${d.id}`,
          titulo: 'Corrección de montos',
          detalle: `${t} ${folio} (CodRef 3)`,
          hecho: true,
          tone: 'ok',
        });
      } else {
        extra.push({
          key: `asoc-${d.id}`,
          titulo: `${t} asociada`,
          detalle: folio,
          hecho: true,
          tone: 'ok',
        });
      }
    }
    return extra;
  }

  if (tipo === 'NC' || tipo === 'ND') {
    const origen = String(doc.referenciaFolio || doc.folioOrigen || '').trim();
    if (doc.referenciaCod === 1 && tipo === 'NC') {
      extra.push({
        key: 'anula-origen',
        titulo: 'Anula la factura origen',
        detalle: origen ? `Factura ${origen}` : 'CodRef 1 · anulación total',
        hecho: true,
        tone: 'ok',
      });
    } else if (doc.referenciaCod === 2 || doc.referenciaCod === 3) {
      extra.push({
        key: 'modifica-origen',
        titulo: doc.referenciaCod === 2 ? 'Corrige texto de la factura' : 'Corrige montos de la factura',
        detalle: origen ? `Factura ${origen}` : `CodRef ${doc.referenciaCod}`,
        hecho: true,
        tone: 'ok',
      });
    }
  }
  return extra;
}
