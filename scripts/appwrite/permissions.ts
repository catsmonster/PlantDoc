import { Permission, Role } from 'node-appwrite';
import type { Perm } from '../../appwrite/schema';

/** Maps the schema permission DSL ('read:users', 'read:user:<id>') to SDK strings. */
export function toPermissions(perms: Perm[]): string[] {
  return perms.map((perm) => {
    const [action, role, id] = perm.split(':');
    const roleString =
      role === 'users' ? Role.users() : role === 'user' && id ? Role.user(id) : undefined;
    if (!roleString) throw new Error(`Unsupported permission DSL entry: ${perm}`);
    switch (action) {
      case 'read':
        return Permission.read(roleString);
      case 'create':
        return Permission.create(roleString);
      case 'update':
        return Permission.update(roleString);
      case 'delete':
        return Permission.delete(roleString);
      default:
        throw new Error(`Unsupported permission action: ${perm}`);
    }
  });
}
