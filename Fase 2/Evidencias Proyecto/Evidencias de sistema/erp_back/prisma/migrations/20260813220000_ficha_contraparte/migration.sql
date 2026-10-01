-- Ficha única cliente/proveedor: bancos, contactos, despacho e historial (Reu6 D8).

CREATE TABLE IF NOT EXISTS erp."ClienteCuentaBancaria" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "tipoCuenta" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "monedaCodigo" TEXT NOT NULL DEFAULT 'CLP',
    "titular" TEXT,
    "rutTitular" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClienteCuentaBancaria_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClienteCuentaBancaria_empresaId_idx" ON erp."ClienteCuentaBancaria"("empresaId");
CREATE INDEX IF NOT EXISTS "ClienteCuentaBancaria_clienteId_idx" ON erp."ClienteCuentaBancaria"("clienteId");
ALTER TABLE erp."ClienteCuentaBancaria"
  ADD CONSTRAINT "ClienteCuentaBancaria_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES erp."Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS erp."ClienteContacto" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClienteContacto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClienteContacto_empresaId_idx" ON erp."ClienteContacto"("empresaId");
CREATE INDEX IF NOT EXISTS "ClienteContacto_clienteId_idx" ON erp."ClienteContacto"("clienteId");
ALTER TABLE erp."ClienteContacto"
  ADD CONSTRAINT "ClienteContacto_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES erp."Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS erp."ClienteDireccion" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'DESPACHO',
    "linea" TEXT NOT NULL,
    "comuna" TEXT,
    "ciudad" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClienteDireccion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClienteDireccion_empresaId_idx" ON erp."ClienteDireccion"("empresaId");
CREATE INDEX IF NOT EXISTS "ClienteDireccion_clienteId_idx" ON erp."ClienteDireccion"("clienteId");
ALTER TABLE erp."ClienteDireccion"
  ADD CONSTRAINT "ClienteDireccion_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES erp."Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS erp."ClienteCambio" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "usuarioNombre" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClienteCambio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClienteCambio_empresaId_idx" ON erp."ClienteCambio"("empresaId");
CREATE INDEX IF NOT EXISTS "ClienteCambio_clienteId_idx" ON erp."ClienteCambio"("clienteId");
ALTER TABLE erp."ClienteCambio"
  ADD CONSTRAINT "ClienteCambio_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES erp."Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS erp."ProveedorCuentaBancaria" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "tipoCuenta" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "monedaCodigo" TEXT NOT NULL DEFAULT 'CLP',
    "titular" TEXT,
    "rutTitular" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProveedorCuentaBancaria_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProveedorCuentaBancaria_empresaId_idx" ON erp."ProveedorCuentaBancaria"("empresaId");
CREATE INDEX IF NOT EXISTS "ProveedorCuentaBancaria_proveedorId_idx" ON erp."ProveedorCuentaBancaria"("proveedorId");
ALTER TABLE erp."ProveedorCuentaBancaria"
  ADD CONSTRAINT "ProveedorCuentaBancaria_proveedorId_fkey"
  FOREIGN KEY ("proveedorId") REFERENCES erp."Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS erp."ProveedorContacto" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProveedorContacto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProveedorContacto_empresaId_idx" ON erp."ProveedorContacto"("empresaId");
CREATE INDEX IF NOT EXISTS "ProveedorContacto_proveedorId_idx" ON erp."ProveedorContacto"("proveedorId");
ALTER TABLE erp."ProveedorContacto"
  ADD CONSTRAINT "ProveedorContacto_proveedorId_fkey"
  FOREIGN KEY ("proveedorId") REFERENCES erp."Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS erp."ProveedorDireccion" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'DESPACHO',
    "linea" TEXT NOT NULL,
    "comuna" TEXT,
    "ciudad" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProveedorDireccion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProveedorDireccion_empresaId_idx" ON erp."ProveedorDireccion"("empresaId");
CREATE INDEX IF NOT EXISTS "ProveedorDireccion_proveedorId_idx" ON erp."ProveedorDireccion"("proveedorId");
ALTER TABLE erp."ProveedorDireccion"
  ADD CONSTRAINT "ProveedorDireccion_proveedorId_fkey"
  FOREIGN KEY ("proveedorId") REFERENCES erp."Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS erp."ProveedorCambio" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "usuarioNombre" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProveedorCambio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProveedorCambio_empresaId_idx" ON erp."ProveedorCambio"("empresaId");
CREATE INDEX IF NOT EXISTS "ProveedorCambio_proveedorId_idx" ON erp."ProveedorCambio"("proveedorId");
ALTER TABLE erp."ProveedorCambio"
  ADD CONSTRAINT "ProveedorCambio_proveedorId_fkey"
  FOREIGN KEY ("proveedorId") REFERENCES erp."Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
