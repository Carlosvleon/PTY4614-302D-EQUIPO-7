-- CreateEnum
CREATE TYPE "GoSocketAceptacionEstado" AS ENUM ('ACEPTADO', 'PENDIENTE', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "GoSocketRechazoOrigen" AS ENUM ('SII', 'COMERCIAL');

-- AlterEnum
ALTER TYPE "AceptacionCompraOrigen" ADD VALUE 'GOSOCKET';

-- DropForeignKey
ALTER TABLE "AdminConcepto" DROP CONSTRAINT "AdminConcepto_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "AdminConcepto" DROP CONSTRAINT "AdminConcepto_usuarioId_fkey";

-- DropForeignKey
ALTER TABLE "NodoAprobador" DROP CONSTRAINT "NodoAprobador_nodoId_fkey";

-- DropForeignKey
ALTER TABLE "NodoAprobador" DROP CONSTRAINT "NodoAprobador_usuarioId_fkey";

-- DropForeignKey
ALTER TABLE "NodoEscalaAprobacion" DROP CONSTRAINT "NodoEscalaAprobacion_escalaAId_fkey";

-- DropIndex
DROP INDEX "Usuario_jefeId_idx";

-- AlterTable
ALTER TABLE "AdminConcepto" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AreaNegocio" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ClienteContacto" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ClienteCuentaBancaria" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ClienteDireccion" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GuiaDespacho" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "IndicadorBc" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Notificacion" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PasoAprobacionDetalle" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProveedorContacto" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProveedorCuentaBancaria" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProveedorDireccion" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RegistroCompra" ADD COLUMN     "aceptadaPorId" TEXT,
ADD COLUMN     "aceptadaPorNombre" TEXT,
ADD COLUMN     "gosocketAuthorityStatus" TEXT,
ADD COLUMN     "gosocketCountryDocumentId" TEXT,
ADD COLUMN     "gosocketEstado" "GoSocketAceptacionEstado",
ADD COLUMN     "gosocketGlobalDocumentId" TEXT,
ADD COLUMN     "gosocketPdfDisponible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gosocketRechazoMotivo" TEXT,
ADD COLUMN     "gosocketRechazoOrigen" "GoSocketRechazoOrigen",
ADD COLUMN     "gosocketRutEmisor" TEXT,
ADD COLUMN     "gosocketSincronizadoAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Pago_proveedorId_idx" ON "Pago"("proveedorId");

-- CreateIndex
CREATE INDEX "RegistroCompra_gosocketGlobalDocumentId_idx" ON "RegistroCompra"("gosocketGlobalDocumentId");

-- AddForeignKey
ALTER TABLE "NodoEscalaAprobacion" ADD CONSTRAINT "NodoEscalaAprobacion_escalaAId_fkey" FOREIGN KEY ("escalaAId") REFERENCES "NodoEscalaAprobacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodoAprobador" ADD CONSTRAINT "NodoAprobador_nodoId_fkey" FOREIGN KEY ("nodoId") REFERENCES "NodoEscalaAprobacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodoAprobador" ADD CONSTRAINT "NodoAprobador_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminConcepto" ADD CONSTRAINT "AdminConcepto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminConcepto" ADD CONSTRAINT "AdminConcepto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
