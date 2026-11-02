import { base44 } from '@/data/client';
import { pick } from '@/data/records';

export interface ApiKeyRow {
  id: string;
  name: string;
  last4: string;
  revoked: boolean;
  last_used_at: string | null;
  created_date?: string;
}

const KEYS = ['name', 'last4', 'revoked', 'last_used_at'];
const toRow = (r: Record<string, unknown>): ApiKeyRow => ({
  ...pick<ApiKeyRow>(r, KEYS, ['last_used_at']),
  revoked: !!r.revoked,
  created_date: r.created_date as string | undefined,
});

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generateApiKey(): Promise<{ key: string; hash: string; last4: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const key = `ft_${b64}`;
  return { key, hash: await sha256Hex(key), last4: key.slice(-4) };
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  return (await base44.entities.ApiKey.list('-created_date')).map(toRow);
}

export async function revokeApiKey(id: string): Promise<void> {
  await base44.entities.ApiKey.update(id, { revoked: true });
}

export async function createApiKey(name: string): Promise<{ key: string; row: ApiKeyRow }> {
  const me = await base44.auth.me();
  const { key, hash, last4 } = await generateApiKey();
  const created = await base44.entities.ApiKey.create({
    name,
    key_hash: hash,
    last4,
    owner_id: me.id,
    revoked: false,
  });
  // Revoke the others only after the new key exists, so a failed create never leaves the user keyless.
  const existing = await base44.entities.ApiKey.list('-created_date');
  for (const k of existing) if (!k.revoked && k.id !== created.id) await revokeApiKey(k.id as string);
  return { key, row: toRow(created) };
}
