export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1'
).replace(/\/+$/, '');

export function resolveMediaUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const source = value.trim();
  if (/^(data:|blob:)/i.test(source)) return source;

  const apiUrl = new URL(API_BASE_URL, window.location.origin);
  let resolved;
  try {
    resolved = new URL(source, apiUrl.origin);
  } catch {
    return source;
  }

  // Localhost URLs saved by a development API are not reachable from a remote
  // admin browser. Reuse the configured API host while preserving the file path.
  const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(resolved.hostname);
  const configuredIsRemote = !['localhost', '127.0.0.1', '0.0.0.0'].includes(apiUrl.hostname);
  if (isLocalHost && configuredIsRemote) {
    resolved = new URL(`${resolved.pathname}${resolved.search}${resolved.hash}`, apiUrl.origin);
  }

  // PUBLIC_BASE_URL can accidentally include the API version path. Uploaded
  // assets are served from the backend root at /uploads, outside /api/v1.
  const apiPath = apiUrl.pathname.replace(/\/+$/, '');
  if (apiPath && apiPath !== '/' && resolved.pathname.startsWith(`${apiPath}/uploads/`)) {
    resolved.pathname = resolved.pathname.slice(apiPath.length);
  }
  return resolved.href;
}

export class ApiError extends Error {
  constructor(message, status, details = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export async function apiRequest(path, {
  method = 'GET', body, rawBody, contentType = 'application/json', token, query, signal,
} = {}) {
  const url = new URL(`${API_BASE_URL}${path}`);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(rawBody ? (contentType ? { 'Content-Type': contentType } : {}) : body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(signal ? { signal } : {}),
    ...(rawBody ? { body: rawBody } : body ? { body: JSON.stringify(body) } : {}),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(
      response.ok ? 'The API returned an invalid response.' : `Request failed (${response.status}).`,
      response.status,
    );
  }

  if (!response.ok || result.success === false) {
    if (response.status === 401 && token) {
      window.dispatchEvent(new Event('edhyaa:unauthorized'));
    }
    throw new ApiError(
      result.message || `Request failed (${response.status}).`,
      response.status,
      result.errors || result.details || [],
    );
  }

  return result;
}

export function getToken() {
  return window.localStorage.getItem('edhyaa-admin-token');
}

export function saveToken(token) {
  window.localStorage.setItem('edhyaa-admin-token', token);
}

export function clearToken() {
  window.localStorage.removeItem('edhyaa-admin-token');
}

export function decodeToken(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(decodeURIComponent(
      atob(padded)
        .split('')
        .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    ));
  } catch {
    return {};
  }
}

export function normalizePermission(permission) {
  let normalized = String(permission).trim().toLowerCase().replace(/[\s_-]+/g, '.');
  normalized = normalized
    .replace(/sub\.categories/g, 'subcategories')
    .replace(/^(view|create|update|delete)\.(categories|subcategories|products)$/, '$2.$1')
    .replace(/^category\./, 'categories.')
    .replace(/^subcategory\./, 'subcategories.')
    .replace(/^product\./, 'products.');
  return normalized;
}

export function permissionSet(claims = {}) {
  return new Set((claims.permissions || []).map(normalizePermission));
}
