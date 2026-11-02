import { describe, it, expect } from 'vitest';
import { generateApiKey, sha256Hex } from '@/data/apiKeys';

describe('apiKeys', () => {
  it('sha256Hex matches the shared vector', async () => {
    expect(await sha256Hex('ft_test_key')).toBe('c55775582807cd18d29c1ca2ebddf6985219452099c6c03f1f9d623e6be6a1de');
  });
  it('generateApiKey: ft_ prefix, 43 base64url chars, hash and last4 consistent', async () => {
    const { key, hash, last4 } = await generateApiKey();
    expect(key).toMatch(/^ft_[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(await sha256Hex(key));
    expect(last4).toBe(key.slice(-4));
  });
  it('two keys differ', async () => {
    expect((await generateApiKey()).key).not.toBe((await generateApiKey()).key);
  });
});
