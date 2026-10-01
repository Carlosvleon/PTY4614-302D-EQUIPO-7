export function userHasPermission(perms: string[], required: string): boolean {
  if (perms.includes(required)) return true;
  const [resource, action] = required.split(':');
  if (action === 'read' && perms.includes(`${resource}:write`)) return true;
  return perms.includes(`${resource}:*`);
}
