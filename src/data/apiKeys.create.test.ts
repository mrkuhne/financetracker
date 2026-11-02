import { describe, it, expect, vi } from 'vitest';

const calls: string[] = [];
const rows = [
  { id: 'old1', revoked: false },
  { id: 'old2', revoked: true },
];
vi.mock('@/data/client', () => ({
  base44: {
    auth: { me: async () => ({ id: 'u1' }) },
    entities: {
      ApiKey: {
        create: async (d: Record<string, unknown>) => {
          calls.push('create');
          const row = { ...d, id: 'new' };
          rows.unshift(row as never);
          return row;
        },
        list: async () => {
          calls.push('list');
          return rows;
        },
        update: async (id: string, d: Record<string, unknown>) => {
          calls.push(`update:${id}:${String(d.revoked)}`);
        },
      },
    },
  },
}));

describe('createApiKey', () => {
  it('creates the new key first, then revokes only the other live keys', async () => {
    const { createApiKey } = await import('@/data/apiKeys');
    const { key, row } = await createApiKey('Phone');
    expect(row.id).toBe('new');
    expect(key).toMatch(/^ft_/);
    expect(calls).toEqual(['create', 'list', 'update:old1:true']);
  });
});
