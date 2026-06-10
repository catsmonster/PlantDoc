import { describe, expect, it } from 'vitest';
import { ownerPermissions } from '../../src/lib/owner';

describe('ownerPermissions', () => {
  it('grants read/update/delete to the owning user only', () => {
    expect(ownerPermissions('u1')).toEqual([
      'read("user:u1")',
      'update("user:u1")',
      'delete("user:u1")',
    ]);
  });
});
