-- Área de negocio y vínculos N:N con plan de cuentas (Reu6 D9).

CREATE TABLE IF NOT EXISTS erp."AreaNegocio" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AreaNegocio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AreaNegocio_empresaId_codigo_key" ON erp."AreaNegocio"("empresaId", "codigo");

ALTER TABLE erp."AreaNegocio"
  ADD CONSTRAINT "AreaNegocio_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES erp."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS erp."CuentaCentroCosto" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "centroCostoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuentaCentroCosto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CuentaCentroCosto_cuentaId_centroCostoId_key" ON erp."CuentaCentroCosto"("cuentaId", "centroCostoId");
CREATE INDEX IF NOT EXISTS "CuentaCentroCosto_empresaId_idx" ON erp."CuentaCentroCosto"("empresaId");

ALTER TABLE erp."CuentaCentroCosto"
  ADD CONSTRAINT "CuentaCentroCosto_cuentaId_fkey"
  FOREIGN KEY ("cuentaId") REFERENCES erp."CuentaContable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE erp."CuentaCentroCosto"
  ADD CONSTRAINT "CuentaCentroCosto_centroCostoId_fkey"
  FOREIGN KEY ("centroCostoId") REFERENCES erp."CentroCosto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS erp."CuentaElementoCosto" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "elementoCostoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuentaElementoCosto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CuentaElementoCosto_cuentaId_elementoCostoId_key" ON erp."CuentaElementoCosto"("cuentaId", "elementoCostoId");
CREATE INDEX IF NOT EXISTS "CuentaElementoCosto_empresaId_idx" ON erp."CuentaElementoCosto"("empresaId");

ALTER TABLE erp."CuentaElementoCosto"
  ADD CONSTRAINT "CuentaElementoCosto_cuentaId_fkey"
  FOREIGN KEY ("cuentaId") REFERENCES erp."CuentaContable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE erp."CuentaElementoCosto"
  ADD CONSTRAINT "CuentaElementoCosto_elementoCostoId_fkey"
  FOREIGN KEY ("elementoCostoId") REFERENCES erp."ElementoCosto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS erp."CuentaAreaNegocio" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "areaNegocioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuentaAreaNegocio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CuentaAreaNegocio_cuentaId_areaNegocioId_key" ON erp."CuentaAreaNegocio"("cuentaId", "areaNegocioId");
CREATE INDEX IF NOT EXISTS "CuentaAreaNegocio_empresaId_idx" ON erp."CuentaAreaNegocio"("empresaId");

ALTER TABLE erp."CuentaAreaNegocio"
  ADD CONSTRAINT "CuentaAreaNegocio_cuentaId_fkey"
  FOREIGN KEY ("cuentaId") REFERENCES erp."CuentaContable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE erp."CuentaAreaNegocio"
  ADD CONSTRAINT "CuentaAreaNegocio_areaNegocioId_fkey"
  FOREIGN KEY ("areaNegocioId") REFERENCES erp."AreaNegocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
