const BASE_URL = import.meta.env.VITE_API_URL || '/api';
const TOKEN_STORAGE_KEY = 'gawa_admin_token';
const REFRESH_TOKEN_KEY = 'gawa_admin_refresh_token';

function getStored(key) {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function persist(key, value) {
  try {
    if (typeof window === 'undefined') return;
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {}
}

let token = getStored(TOKEN_STORAGE_KEY);
let refreshToken = getStored(REFRESH_TOKEN_KEY);

export function setToken(t) {
  token = t;
  persist(TOKEN_STORAGE_KEY, t);
}

export function getToken() {
  return token;
}

export function setRefreshToken(t) {
  refreshToken = t;
  persist(REFRESH_TOKEN_KEY, t);
}

export function getRefreshToken() {
  return getStored(REFRESH_TOKEN_KEY) || refreshToken;
}

let refreshPromise = null;

async function tryRefreshToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const rt = getRefreshToken();
    if (!rt) throw new Error('No refresh token');

    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      clearAuthSession();
      throw { status: res.status, ...data };
    }

    const result = data?.data ?? data;
    const newToken = result.token;
    const newRefresh = result.refreshToken;

    if (newToken) {
      setToken(newToken);
      if (newRefresh) setRefreshToken(newRefresh);
      return newToken;
    }

    clearAuthSession();
    throw new Error('Refresh returned no token');
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function clearAuthSession() {
  token = null;
  refreshToken = null;
  persist(TOKEN_STORAGE_KEY, null);
  persist(REFRESH_TOKEN_KEY, null);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('auth:expired'));
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 || res.status === 403) {
    const retried = await tryRefreshToken().catch(() => null);
    if (retried) {
      headers.Authorization = `Bearer ${retried}`;
      const retryRes = await fetch(url, { ...options, headers });
      const retryData = await retryRes.json().catch(() => ({}));
      if (retryRes.ok) return retryData;
      if (retryRes.status === 401 || retryRes.status === 403) {
        clearAuthSession();
      }
      throw { status: retryRes.status, ...retryData };
    }
    clearAuthSession();
    throw { status: res.status };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw { status: res.status, ...data };
  }
  return data;
}

export function get(path) {
  return request(path);
}

export function post(path, body) {
  return request(path, { method: 'POST', body: JSON.stringify(body) });
}

function sendFile(path, formData, authToken, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}${path}`);
    if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new Error('Network error while uploading the file'));
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        data = {};
      }
      resolve({ status: xhr.status, data });
    };
    xhr.send(formData);
  });
}

export async function postFile(path, formData, onProgress) {
  let response = await sendFile(path, formData, token, onProgress);
  if (response.status === 401 || response.status === 403) {
    const refreshed = await tryRefreshToken().catch(() => null);
    if (!refreshed) {
      clearAuthSession();
      throw { status: response.status, ...response.data };
    }
    response = await sendFile(path, formData, refreshed, onProgress);
    if (response.status === 401 || response.status === 403) clearAuthSession();
  }
  if (response.status < 200 || response.status >= 300) {
    throw { status: response.status, ...response.data };
  }
  return response.data;
}

export function patch(path, body) {
  return request(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export function put(path, body) {
  return request(path, { method: 'PUT', body: JSON.stringify(body) });
}

export function del(path, body) {
  return request(path, { method: 'DELETE', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
