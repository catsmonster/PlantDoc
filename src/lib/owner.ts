import { Permission, Role } from 'appwrite';

/** Owner-only row/file permissions; pairs with the user_id column convention. */
export function ownerPermissions(userId: string): string[] {
  return [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
}
