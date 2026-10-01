/** Rol master del sistema (alineado a erp_back ADMIN_ROL_ID). */
export const ADMIN_ROL_ID = 'ROL-1';

export function isAdminRolId(rolId: string | null | undefined): boolean {
  return rolId === ADMIN_ROL_ID;
}

export function isRolMaster(rol: { id: string; esMaster?: boolean } | null | undefined): boolean {
  if (!rol) return false;
  return Boolean(rol.esMaster) || isAdminRolId(rol.id);
}
