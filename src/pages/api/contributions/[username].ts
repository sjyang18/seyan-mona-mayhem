import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';

export const prerender = false;

const USERNAME_PATTERN = /^(?!-)(?!.*--)[A-Za-z0-9-]{1,39}$/;
const UPSTREAM_TIMEOUT_MS = 8_000;
const FRESH_TTL_MS = 15 * 60 * 1000;
const STALE_WINDOW_MS = 60 * 60 * 1000;
const SUCCESS_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';

type ApiErrorPayload = {
  error: {
    code: string;
    message: string;
    details?: Record<string, string | number>;
  };
};

type SuccessPayload = {
  username: string;
  normalizedUsername: string;
  source: 'github.contribs';
  sourceUrl: string;
  fetchedAt: string;
  data: unknown;
};

type CacheEntry = {
  payload: SuccessPayload;
  etag: string;
  fetchedAtMs: number;
};

class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, string | number>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, string | number>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const cache = new Map<string, CacheEntry>();
const inFlightFetches = new Map<string, Promise<CacheEntry>>();

const normalizeUsername = (username: string): string => username.trim().toLowerCase();

const isValidUsername = (username: string): boolean => {
  if (!USERNAME_PATTERN.test(username)) {
    return false;
  }

  return !username.endsWith('-');
};

const etagFor = (payload: SuccessPayload): string => {
  const hash = createHash('sha1').update(JSON.stringify(payload)).digest('hex');
  return `W/"${hash}"`;
};

const jsonHeaders = (cacheControl: string, etag?: string): HeadersInit => ({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': cacheControl,
  ...(etag ? { ETag: etag } : {}),
});

const buildErrorResponse = (status: number, payload: ApiErrorPayload): Response => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders('no-store'),
  });
};

const buildSuccessResponse = (
  entry: CacheEntry,
  requestHeaders: Headers,
  cacheState: 'MISS' | 'HIT' | 'STALE',
): Response => {
  if (requestHeaders.get('if-none-match') === entry.etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ...jsonHeaders(SUCCESS_CACHE_CONTROL, entry.etag),
        'X-Cache': cacheState,
      },
    });
  }

  return new Response(JSON.stringify(entry.payload), {
    status: 200,
    headers: {
      ...jsonHeaders(SUCCESS_CACHE_CONTROL, entry.etag),
      'X-Cache': cacheState,
    },
  });
};

const fetchFromUpstream = async (username: string, normalizedUsername: string): Promise<CacheEntry> => {
  const sourceUrl = `https://github.com/${encodeURIComponent(username)}.contribs`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamResponse = await fetch(sourceUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'mona-mayhem-contrib-proxy',
      },
      signal: controller.signal,
    });

    if (upstreamResponse.status === 404) {
      throw new ApiError(404, 'user_not_found', 'GitHub user was not found.', {
        username,
      });
    }

    if (upstreamResponse.status === 429) {
      throw new ApiError(429, 'upstream_rate_limited', 'Upstream rate limit reached.', {
        username,
      });
    }

    if (upstreamResponse.status >= 500) {
      throw new ApiError(502, 'bad_gateway', 'GitHub upstream returned an error.', {
        upstreamStatus: upstreamResponse.status,
      });
    }

    if (!upstreamResponse.ok) {
      throw new ApiError(502, 'upstream_error', 'GitHub upstream request failed.', {
        upstreamStatus: upstreamResponse.status,
      });
    }

    let data: unknown;

    try {
      data = await upstreamResponse.json();
    } catch {
      throw new ApiError(
        502,
        'invalid_upstream_response',
        'GitHub upstream response was not valid JSON.',
      );
    }

    const payload: SuccessPayload = {
      username,
      normalizedUsername,
      source: 'github.contribs',
      sourceUrl,
      fetchedAt: new Date().toISOString(),
      data,
    };

    return {
      payload,
      etag: etagFor(payload),
      fetchedAtMs: Date.now(),
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(504, 'gateway_timeout', 'Timed out while contacting GitHub upstream.');
    }

    throw new ApiError(502, 'bad_gateway', 'Failed to contact GitHub upstream.');
  } finally {
    clearTimeout(timeout);
  }
};

const refreshCache = (username: string, normalizedUsername: string): Promise<CacheEntry> => {
  const existing = inFlightFetches.get(normalizedUsername);
  if (existing) {
    return existing;
  }

  const request = fetchFromUpstream(username, normalizedUsername)
    .then((entry) => {
      cache.set(normalizedUsername, entry);
      return entry;
    })
    .finally(() => {
      inFlightFetches.delete(normalizedUsername);
    });

  inFlightFetches.set(normalizedUsername, request);
  return request;
};

export const GET: APIRoute = async ({ params, request }) => {
  const username = params.username?.trim();

  if (!username) {
    return buildErrorResponse(400, {
      error: {
        code: 'missing_username',
        message: 'A GitHub username is required.',
      },
    });
  }

  if (!isValidUsername(username)) {
    return buildErrorResponse(400, {
      error: {
        code: 'invalid_username',
        message: 'The username format is invalid.',
        details: {
          maxLength: 39,
        },
      },
    });
  }

  const normalizedUsername = normalizeUsername(username);
  const cached = cache.get(normalizedUsername);
  const now = Date.now();

  if (cached) {
    const age = now - cached.fetchedAtMs;
    if (age <= FRESH_TTL_MS) {
      return buildSuccessResponse(cached, request.headers, 'HIT');
    }

    if (age <= FRESH_TTL_MS + STALE_WINDOW_MS) {
      // Serve stale while issuing a best-effort background refresh.
      void refreshCache(username, normalizedUsername).catch(() => {
        // Stale response is already served; background refresh errors are ignored.
      });
      return buildSuccessResponse(cached, request.headers, 'STALE');
    }
  }

  try {
    const fresh = await refreshCache(username, normalizedUsername);
    return buildSuccessResponse(fresh, request.headers, 'MISS');
  } catch (error) {
    if (error instanceof ApiError) {
      return buildErrorResponse(error.status, {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }

    return buildErrorResponse(500, {
      error: {
        code: 'internal_error',
        message: 'Unexpected server error.',
      },
    });
  }
};
