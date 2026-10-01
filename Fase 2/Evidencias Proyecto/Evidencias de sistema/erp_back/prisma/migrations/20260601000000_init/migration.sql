-- Baseline ERP schema (schema erp)
CREATE SCHEMA IF NOT EXISTS "erp";
SET search_path TO "erp";

-- CreateEnum
CREATE TYPE "EstadoProforma" AS ENUM ('BORRADOR', 'DEFINITIVA', 'FACTURADA');

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "giro" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sucursal" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rol" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "permisos" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "rolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UiTablePreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tableKey" TEXT NOT NULL,
    "visibleColumns" JSONB NOT NULL,
    "columnOrder" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UiTablePreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentroCosto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "vigenciaDesde" TIMESTAMP(3),
    "vigenciaHasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentroCosto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contratista" (
    "id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "especialidad" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "vigenciaHasta" TIMESTAMP(3),
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contratista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Labor" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Labor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Actividad" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborActividad" (
    "laborId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,

    CONSTRAINT "LaborActividad_pkey" PRIMARY KEY ("laborId","actividadId")
);

-- CreateTable
CREATE TABLE "TarifaContratista" (
    "id" TEXT NOT NULL,
    "contratistaId" TEXT NOT NULL,
    "laborId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "tarifa" DECIMAL(18,2) NOT NULL,
    "unidad" TEXT NOT NULL,
    "centroCostoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vigenciaDesde" TIMESTAMP(3) NOT NULL,
    "vigenciaHasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TarifaContratista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProformaContratista" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "contratistaId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "montoNeto" DECIMAL(18,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'CLP',
    "estado" "EstadoProforma" NOT NULL DEFAULT 'BORRADOR',
    "facturaNumeroRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProformaContratista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaContratista" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "proformaId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "montoNeto" DECIMAL(18,2) NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proformasGrupoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacturaContratista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_rut_key" ON "Empresa"("rut");

-- CreateIndex
CREATE UNIQUE INDEX "Sucursal_empresaId_codigo_key" ON "Sucursal"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Rol_codigo_key" ON "Rol"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "UiTablePreference_userId_idx" ON "UiTablePreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UiTablePreference_userId_tableKey_key" ON "UiTablePreference"("userId", "tableKey");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CentroCosto_empresaId_codigo_key" ON "CentroCosto"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Contratista_empresaId_rut_key" ON "Contratista"("empresaId", "rut");

-- CreateIndex
CREATE UNIQUE INDEX "Labor_empresaId_codigo_key" ON "Labor"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Actividad_empresaId_codigo_key" ON "Actividad"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "TarifaContratista_empresaId_idx" ON "TarifaContratista"("empresaId");

-- CreateIndex
CREATE INDEX "TarifaContratista_contratistaId_idx" ON "TarifaContratista"("contratistaId");

-- CreateIndex
CREATE INDEX "ProformaContratista_empresaId_periodo_idx" ON "ProformaContratista"("empresaId", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "ProformaContratista_empresaId_numero_key" ON "ProformaContratista"("empresaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "FacturaContratista_proformaId_key" ON "FacturaContratista"("proformaId");

-- CreateIndex
CREATE UNIQUE INDEX "FacturaContratista_empresaId_numero_key" ON "FacturaContratista"("empresaId", "numero");

-- AddForeignKey
ALTER TABLE "Sucursal" ADD CONSTRAINT "Sucursal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UiTablePreference" ADD CONSTRAINT "UiTablePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentroCosto" ADD CONSTRAINT "CentroCosto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contratista" ADD CONSTRAINT "Contratista_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Labor" ADD CONSTRAINT "Labor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborActividad" ADD CONSTRAINT "LaborActividad_laborId_fkey" FOREIGN KEY ("laborId") REFERENCES "Labor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborActividad" ADD CONSTRAINT "LaborActividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaContratista" ADD CONSTRAINT "TarifaContratista_contratistaId_fkey" FOREIGN KEY ("contratistaId") REFERENCES "Contratista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaContratista" ADD CONSTRAINT "TarifaContratista_laborId_fkey" FOREIGN KEY ("laborId") REFERENCES "Labor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaContratista" ADD CONSTRAINT "TarifaContratista_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaContratista" ADD CONSTRAINT "TarifaContratista_centroCostoId_fkey" FOREIGN KEY ("centroCostoId") REFERENCES "CentroCosto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaContratista" ADD CONSTRAINT "TarifaContratista_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaContratista" ADD CONSTRAINT "ProformaContratista_contratistaId_fkey" FOREIGN KEY ("contratistaId") REFERENCES "Contratista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaContratista" ADD CONSTRAINT "ProformaContratista_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaContratista" ADD CONSTRAINT "FacturaContratista_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "ProformaContratista"("id") ON DELETE CASCADE ON UPDATE CASCADE;
