-- Usuario: nombre de usuario / login corto, distinto del nombre completo (feedback Trello 28/07 - Roles y permisos)
ALTER TABLE "erp"."Usuario" ADD COLUMN IF NOT EXISTS "username" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_username_key" ON "erp"."Usuario"("username");
