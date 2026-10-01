-- Cerrar bandeja cuando la OC se anula con aprobación aún pendiente.
ALTER TYPE "erp"."EstadoAprobacionOc" ADD VALUE IF NOT EXISTS 'ANULADA';
