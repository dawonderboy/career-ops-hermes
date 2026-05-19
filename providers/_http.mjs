const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeBody(body) {
  if (body == null) return undefined;
  if (typeof body === 'string' || body instanceof Buffer) return body;
  return JSON.stringify(body);
}

async function request(url, {
  method = 'GET',
  headers = {},
  body,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
  responseType = 'json',
} = {}) {
  let lastErr = null;
  const normalizedBody = normalizeBody(body);

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: method.toUpperCase(),
        signal: controller.signal,
        headers: {
          'User-Agent': 'Career-Ops/1.0',
          ...(normalizedBody && !('Content-Type' in headers) ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: normalizedBody,
      });

      if (!res.ok) {
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
        const message = `HTTP ${res.status}`;
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          const delay = Number.isFinite(retryAfterMs)
            ? retryAfterMs
            : BASE_DELAY_MS * (2 ** (attempt - 1));
          await sleep(delay);
          continue;
        }
        throw new Error(message);
      }

      if (responseType === 'text') {
        return await res.text();
      }
      if (responseType === 'buffer') {
        return Buffer.from(await res.arrayBuffer());
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      const isRetryable = err?.name === 'AbortError' || /429|5\d\d|aborted/i.test(err?.message || '');
      if (isRetryable && attempt < retries) {
        await sleep(BASE_DELAY_MS * (2 ** (attempt - 1)));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr || new Error('request failed');
}

export function makeHttpCtx() {
  return {
    fetchJson: (url, headers = {}, options = {}) => request(url, { ...options, headers, responseType: 'json' }),
    fetchText: (url, headers = {}, options = {}) => request(url, { ...options, headers, responseType: 'text' }),
    fetchBuffer: (url, headers = {}, options = {}) => request(url, { ...options, headers, responseType: 'buffer' }),
    sleep,
  };
}
