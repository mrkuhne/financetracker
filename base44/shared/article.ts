// Guarded article fetch for the AI news analysis. No imports on purpose (Base44 bundles each shared file on its own).
// SSRF protection: only allow-listed hosts, redirects followed manually with a host re-check on every hop.

export const ARTICLE_MAX_CHARS = 12000;
export const ARTICLE_MIN_CHARS = 600;
const MAX_HOPS = 3;
const MAX_BODY_CHARS = 2_000_000;
const HOP_TIMEOUT_MS = 10_000;

export type ArticleResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'host' | 'redirect' | 'http' | 'too_large' | 'short' | 'error' };

export function isAllowedArticleUrl(url: string, hosts: string[]): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.startsWith('[') || host.includes(':')) return false;
  if (/^\d+(\.\d+){0,3}$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return false;
  return hosts.some((h) => {
    const allowed = h.toLowerCase();
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return NAMED[e] ?? m;
  });
}

const DROP_TAGS = ['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'form'];

export function htmlToText(html: string): string {
  let h = html;
  for (const t of DROP_TAGS) h = h.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?</${t}\\s*>`, 'gi'), ' ');
  const articles = [...h.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)].map((m) => m[1]);
  if (articles.length) h = articles.join(' ');
  const text = decodeEntities(h.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return text.slice(0, ARTICLE_MAX_CHARS);
}

async function readCappedText(res: Response, max = MAX_BODY_CHARS): Promise<{ ok: true; text: string } | { ok: false }> {
  const len = Number(res.headers.get('content-length'));
  if (Number.isFinite(len) && len > max * 4) {
    await res.body?.cancel().catch(() => {});
    return { ok: false };
  }
  if (!res.body) {
    const text = await res.text();
    return text.length > max ? { ok: false } : { ok: true, text };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.length > max) {
      await reader.cancel().catch(() => {});
      return { ok: false };
    }
  }
  text += decoder.decode();
  return text.length > max ? { ok: false } : { ok: true, text };
}

export async function fetchArticle(url: string, hosts: string[], fetchImpl: typeof fetch): Promise<ArticleResult> {
  try {
    if (!isAllowedArticleUrl(url, hosts)) return { ok: false, reason: 'host' };
    let current = url;
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const res = await fetchImpl(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
        headers: { accept: 'text/html,application/xhtml+xml' },
      });
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel().catch(() => {});
        const loc = res.headers.get('location');
        if (!loc || hop === MAX_HOPS) return { ok: false, reason: 'redirect' };
        let next: string;
        try {
          next = new URL(loc, current).toString();
        } catch {
          return { ok: false, reason: 'redirect' };
        }
        if (!isAllowedArticleUrl(next, hosts)) return { ok: false, reason: 'redirect' };
        current = next;
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return { ok: false, reason: 'http' };
      }
      const body = await readCappedText(res);
      if (!body.ok) return { ok: false, reason: 'too_large' };
      const text = htmlToText(body.text);
      return text.length < ARTICLE_MIN_CHARS ? { ok: false, reason: 'short' } : { ok: true, text };
    }
    return { ok: false, reason: 'redirect' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
