export type ConnectionMode = 'stub' | 'sandbox' | 'live';

export const STUB_DISCLAIMER =
  'Partner stub (facturador de pruebas/QA). Documento emitido para completar flujo; no es DTE SII. Reemplazar por gosocket en registry cuando existan ApiKeys.';

export interface TenantBillingConfig {
  erpId: string;
  empresaId?: string;
  /** RUT emisor o "*" para todos los RUT del erpId */
  rutEmisor: string;
  partner: string;
  connectionMode: ConnectionMode;
  activo: boolean;
  /** Fallback de BillerID si el canónico no trae source.billerId. La fuente de verdad es Admin › Empresas. */
  billerId?: string;
  /** ApiUser GoSocket de esa sociedad (tenants.local.json gitignored). Preferir .env GOSOCKET_API_USER_{ERP}_{EMPRESA}. */
  apiUser?: string;
  /** Password de esa ApiKey. No versionar. */
  apiPassword?: string;
}

export interface CanonicalDocumentV1 {
  schemaVersion: string;
  idempotencyKey: string;
  source: {
    erpId: string;
    empresaId: string;
    documentoId: string;
    /** UUID BillerID GoSocket de la empresa emisora. */
    billerId?: string;
    /** Solo para Postman/QA: ApiUser de esa sociedad. El ERP no lo envía. */
    apiUser?: string;
    /** Solo para Postman/QA: password de esa ApiKey. El ERP no lo envía. */
    apiPassword?: string;
  };
  emisor: {
    rut: string;
    razonSocial: string;
    giro?: string;
    direccion?: string;
    comuna?: string;
    ciudad?: string;
    /** N° resolución SII/QA (CAE). Lo envía el ERP (config de la sociedad). */
    nroResolucion?: string;
    /** Fecha resolución SII/QA YYYY-MM-DD. Lo envía el ERP. */
    fechaResolucion?: string;
    /** Código de actividad SII (Acteco, 6 dígitos). Lo envía el ERP. */
    acteco?: string;
  };
  receptor: {
    rut: string;
    razonSocial: string;
    giro?: string;
    direccion?: string;
    comuna?: string;
    ciudad?: string;
  };
  documento: {
    tipoDte: number;
    fechaEmision: string;
    fechaVencimiento?: string;
    formaPago?: string;
    moneda?: string;
    numeroInterno: string;
    referencia?: {
      tipo?: string;
      folio?: string;
      fecha?: string;
      /** 1 anula, 2 corrige texto, 3 corrige montos. Obligatorio en NC/ND (Pablo 01/09). */
      codRef?: 1 | 2 | 3;
    };
    /** COMEX / DTE 110–112. El mapper GUF solo lo emite en tipos de exportación. */
    comex?: {
      tipoCambio?: number;
      montoOtraMoneda?: number;
      montoExentoOtraMoneda?: number;
      bultoCantidad?: number;
      bultoTipoCodigo?: string;
      /** Marca de bulto (tag SII Marcas). */
      bultoMarca?: string;
      paisDestino?: string;
      puertoEmbarque?: string;
      puertoDesembarque?: string;
      clausulaVenta?: string;
      viaTransporte?: string;
      modalidadVenta?: string;
      /** Código Aduana de moneda (Anexo 51). Ej. "13" = USD. */
      tpoMoneda?: string;
      /** Código Aduana del país del receptor (CodPaisRecep, M en 110/111/112). */
      codPaisRecep?: string;
      /** Glosa de transporte / ind. traslado (MJ). */
      indTraslado?: string;
    };
  };
  totales: {
    neto: number;
    exento?: number;
    iva: number;
    tasaIva?: number;
    total: number;
  };
    lineas: Array<{
    nro: number;
    descripcion: string;
    /**
     * Descripción extra (SII DscItem, máx. 1000). Ausente = no se envía.
     * El nombre va en NmbItem + DscComercial (GAP: TED IT1 sale de DscComercial).
     */
    detalle?: string;
    cantidad: number;
    unidad?: string;
    precio: number;
    descuentoPct?: number;
    montoNeto: number;
  }>;
  glosas?: string[];
  indicadores?: {
    exportacion?: boolean;
    exento?: boolean;
  };
}

export interface EmissionArtifactsMeta {
  pdfAvailable: boolean;
  xmlAvailable: boolean;
  /** true en stub: PDF/XML son dummies de preview/QA */
  dummy: boolean;
}

export interface EmissionResult {
  emissionId: string;
  partner: string;
  connectionMode: ConnectionMode;
  status: 'ACCEPTED' | 'REJECTED' | 'PENDING' | 'SIMULATED';
  folioOficial: string | null;
  folioSimulado: string | null;
  globalDocumentId: string | null;
  countryDocumentId: string | null;
  messages: string[];
  disclaimer: string | null;
  artifacts: EmissionArtifactsMeta;
  /** true = no se contactó partner real */
  stub: boolean;
  /** Cuerpo sanitizado de GoSocket (Success/Messages/OtherData). Solo partner gosocket. */
  partnerPayload?: Record<string, unknown>;
  /** Request a GoSocket (sin Authorization). Persistido para GET /v1/emissions/:id/trace. */
  partnerRequest?: GoSocketOutboundRequest;
  partnerHttpStatus?: number;
}

export interface GoSocketOutboundRequest {
  url: string;
  method: 'POST';
  body: {
    FileContent: string;
    Async: boolean;
    Mapping: string;
    Sign: boolean;
    DefaultCertificate: boolean;
    IgnoreDownWorkload: boolean;
    /** UUID BillerId de la sociedad emisora (viene en el canónico). */
    BillerId: string;
    ValidateNumber: boolean;
  };
}

export interface EmissionListItem {
  emissionId: string;
  status: EmissionResult['status'];
  partner: string;
  connectionMode: ConnectionMode;
  empresaId: string;
  documentoId: string;
  numeroInterno: string;
  folioOficial: string | null;
  tracePath: string;
}

export interface EmissionTrace {
  emissionId: string;
  status: EmissionResult['status'];
  partner: string;
  connectionMode: ConnectionMode;
  inbound: CanonicalDocumentV1;
  outbound: GoSocketOutboundRequest | null;
  response: {
    httpStatus: number | null;
    body: Record<string, unknown> | null;
  };
}
