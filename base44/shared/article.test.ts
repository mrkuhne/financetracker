import { describe, expect, test } from 'vitest';
import { ARTICLE_MAX_CHARS, fetchArticle, htmlToText, isAllowedArticleUrl } from './article';

describe('article', () => {
  test('host allow-list', () => {
    expect(isAllowedArticleUrl('https://www.cnbc.com/2026/11/06/x.html', ['cnbc.com'])).toBe(true);
    expect(isAllowedArticleUrl('https://evilcnbc.com/x', ['cnbc.com'])).toBe(false);
    expect(isAllowedArticleUrl('https://cnbc.com.evil.io/x', ['cnbc.com'])).toBe(false);
    expect(isAllowedArticleUrl('ftp://cnbc.com/x', ['cnbc.com'])).toBe(false);
    expect(isAllowedArticleUrl('https://169.254.169.254/latest', ['169.254.169.254'])).toBe(false);
    expect(isAllowedArticleUrl('https://[::1]/x', ['::1', '[::1]'])).toBe(false);
    expect(isAllowedArticleUrl('https://localhost/x', ['localhost'])).toBe(false);
    expect(isAllowedArticleUrl('https://user:pw@cnbc.com/x', ['cnbc.com'])).toBe(false);
    expect(isAllowedArticleUrl('https://cnbc.com:8443/x', ['cnbc.com'])).toBe(false);
    expect(isAllowedArticleUrl('https://WWW.CNBC.COM/x', ['cnbc.com'])).toBe(true);
    expect(isAllowedArticleUrl('not a url', ['cnbc.com'])).toBe(false);
  });
  test('redirect to a foreign host is refused', async () => {
    const f = async () => new Response(null, { status: 302, headers: { location: 'https://evil.io/x' } });
    expect(await fetchArticle('https://www.cnbc.com/a', ['cnbc.com'], f as typeof fetch)).toEqual({ ok: false, reason: 'redirect' });
  });
  test('disallowed start url is refused as host', async () => {
    const f = async () => new Response('x');
    expect(await fetchArticle('https://evil.io/a', ['cnbc.com'], f as typeof fetch)).toEqual({ ok: false, reason: 'host' });
  });
  test('more than 3 redirects is refused', async () => {
    const f = async () => new Response(null, { status: 301, headers: { location: 'https://www.cnbc.com/b' } });
    expect((await fetchArticle('https://www.cnbc.com/a', ['cnbc.com'], f as typeof fetch)).ok).toBe(false);
  });
  test('same-host redirect is followed and article text extracted', async () => {
    const body = `<html><nav>menu</nav><article><p>${'Szöveg. '.repeat(120)}</p><script>x()</script></article></html>`;
    let n = 0;
    const f = async () => (n++ === 0 ? new Response(null, { status: 301, headers: { location: '/b' } }) : new Response(body, { status: 200 }));
    const r = await fetchArticle('https://www.cnbc.com/a', ['cnbc.com'], f as typeof fetch);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).not.toContain('menu');
      expect(r.text).not.toContain('x()');
    }
  });
  test('short page is "short"', async () => {
    const f = async () => new Response('<p>Subscribe to read</p>', { status: 200 });
    expect(await fetchArticle('https://www.ft.com/a', ['ft.com'], f as typeof fetch)).toEqual({ ok: false, reason: 'short' });
  });
  test('http error and oversized body and thrown error', async () => {
    const h = async () => new Response('x', { status: 404 });
    expect(await fetchArticle('https://www.ft.com/a', ['ft.com'], h as typeof fetch)).toEqual({ ok: false, reason: 'http' });
    const big = async () => new Response('a'.repeat(2_000_001), { status: 200 });
    expect(await fetchArticle('https://www.ft.com/a', ['ft.com'], big as typeof fetch)).toEqual({ ok: false, reason: 'too_large' });
    const t = async () => {
      throw new Error('boom');
    };
    expect(await fetchArticle('https://www.ft.com/a', ['ft.com'], t as unknown as typeof fetch)).toEqual({ ok: false, reason: 'error' });
  });
  test('htmlToText caps length and decodes entities', () => {
    expect(htmlToText('<p>A &amp; B</p>')).toBe('A & B');
    expect(htmlToText(`<p>${'a'.repeat(20000)}</p>`)).toHaveLength(ARTICLE_MAX_CHARS);
  });
});
