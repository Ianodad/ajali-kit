// Shared response envelope for every AI route, per SPEC section 8.1:
// "Returns { ok: true, data } or { ok: false, error: { code, message, retryable } }".

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function apiOk<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}

export function apiError(code: string, message: string, retryable: boolean): ApiResult<never> {
  return { ok: false, error: { code, message, retryable } };
}
