# No usar este directorio

El DDL de aprobaciones fase 2 vive en `prisma/migrations/`:

- `20260811160000_nodo_escala_grupo_id`
- `20260811170000_nodo_aprobador_admin_concepto`
- `20260811180000_limpiar_aprobadores_duplicados_nivel`

Cualquier cambio de esquema: `npx prisma migrate dev`, nunca SQL suelto aquí.
