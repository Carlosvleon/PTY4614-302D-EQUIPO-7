-- Grupos y escalas de aprobación (fase 2 Reu6)

CREATE TABLE "erp"."GrupoAprobacion" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "modulo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "aprobadorInicialId" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GrupoAprobacion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."UsuarioGrupoAprobacion" (
  "usuarioId" TEXT NOT NULL,
  "grupoId" TEXT NOT NULL,

  CONSTRAINT "UsuarioGrupoAprobacion_pkey" PRIMARY KEY ("usuarioId", "grupoId")
);

CREATE TABLE "erp"."NodoEscalaAprobacion" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "modulo" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "montoMax" DECIMAL(18, 2),
  "escalaAUsuarioId" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NodoEscalaAprobacion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "erp"."GrupoAprobacion"
  ADD CONSTRAINT "GrupoAprobacion_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."GrupoAprobacion"
  ADD CONSTRAINT "GrupoAprobacion_aprobadorInicialId_fkey"
  FOREIGN KEY ("aprobadorInicialId") REFERENCES "erp"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "erp"."UsuarioGrupoAprobacion"
  ADD CONSTRAINT "UsuarioGrupoAprobacion_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "erp"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."UsuarioGrupoAprobacion"
  ADD CONSTRAINT "UsuarioGrupoAprobacion_grupoId_fkey"
  FOREIGN KEY ("grupoId") REFERENCES "erp"."GrupoAprobacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."NodoEscalaAprobacion"
  ADD CONSTRAINT "NodoEscalaAprobacion_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."NodoEscalaAprobacion"
  ADD CONSTRAINT "NodoEscalaAprobacion_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "erp"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "erp"."NodoEscalaAprobacion"
  ADD CONSTRAINT "NodoEscalaAprobacion_escalaAUsuarioId_fkey"
  FOREIGN KEY ("escalaAUsuarioId") REFERENCES "erp"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "GrupoAprobacion_empresaId_modulo_idx"
  ON "erp"."GrupoAprobacion"("empresaId", "modulo");

CREATE INDEX "UsuarioGrupoAprobacion_grupoId_idx"
  ON "erp"."UsuarioGrupoAprobacion"("grupoId");

CREATE UNIQUE INDEX "NodoEscalaAprobacion_empresaId_modulo_usuarioId_key"
  ON "erp"."NodoEscalaAprobacion"("empresaId", "modulo", "usuarioId");
