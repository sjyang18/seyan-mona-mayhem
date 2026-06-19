import type { APIRoute } from 'astro';
import {
  ApiError,
  type ApiErrorPayload,
  getProfileEntry,
  isValidUsername,
} from '../../../lib/github-profile';

export const prerender = false;

const SUCCESS_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';

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

  try {
    const { entry, cacheState } = await getProfileEntry(username);

    if (request.headers.get('if-none-match') === entry.etag) {
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