// ---------- Auth helper ----------
// Load this WITHOUT `defer` in <head> so protected pages redirect before they render.
// Add `data-require-auth` to the <script> tag to protect the whole page, and
// `data-requires-auth` to any link that should send logged-out users to the login page.
//
// NOTE: this is only a UX guard. The API must still reject requests without a valid token.

const Auth = (() => {
  // Change this to wherever the TaskShare API runs.
  // TaskShare.Api's "https" launch profile.
  const API_BASE_URL = 'https://localhost:7129/api';
  const TOKEN_KEY = 'taskshare_token';
  const USER_KEY = 'taskshare_user';

  // Resolve site paths from this file's location, so it works from / and /pages/.
  const script = document.currentScript;
  const siteRoot = new URL('../../', script.src);
  const loginUrl = new URL('pages/login.html', siteRoot);

  const read = (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const write = (key, value) => {
    try {
      value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    } catch {}
  };

  // Decodes a JWT's payload (claims). Returns null if the token isn't a JWT.
  const tokenClaims = (token) => {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        [...atob(base64)].map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  // Reads the `exp` claim from a JWT. Returns null if the token isn't a JWT.
  const tokenExpiry = (token) => {
    const exp = tokenClaims(token)?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  };

  const getToken = () => {
    const token = read(TOKEN_KEY);
    if (!token) return null;
    const exp = tokenExpiry(token);
    if (exp && exp <= Date.now()) {
      logout(false);
      return null;
    }
    return token;
  };

  const isLoggedIn = () => getToken() !== null;

  const getUser = () => {
    try { return JSON.parse(read(USER_KEY)); } catch { return null; }
  };

  // Sends the user to the login page, remembering where they wanted to go.
  const redirectToLogin = (target = location.href) => {
    const url = new URL(loginUrl);
    url.searchParams.set('redirect', target);
    location.replace(url);
  };

  // Only allow redirects back into this site (prevents open redirects via ?redirect=).
  const safeRedirect = (target) => {
    try {
      const url = new URL(target, location.href);
      if (url.protocol === siteRoot.protocol && url.host === siteRoot.host &&
          url.pathname.startsWith(siteRoot.pathname) && url.pathname !== loginUrl.pathname) {
        return url.href;
      }
    } catch {}
    return new URL('index.html', siteRoot).href;
  };

  // POSTs JSON to the API. Throws a friendly error if the server can't be reached.
  const postJson = async (path, body) => {
    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('Could not reach the server. Please try again later.');
    }
  };

  // Turns an API error response into a readable message.
  // Handles the API's Error / ValidationError shape ({ description, errors: [...] })
  // and ASP.NET ProblemDetails ({ title, errors: { field: [...] } }).
  const errorMessage = async (res, fallback) => {
    let body;
    try { body = await res.json(); } catch { return fallback; }
    if (!body || typeof body !== 'object') return fallback;

    if (Array.isArray(body.errors) && body.errors.length) {
      return body.errors.map((e) => e.description || e.code).filter(Boolean).join(' ') || fallback;
    }
    if (body.errors && typeof body.errors === 'object') {
      return Object.values(body.errors).flat().join(' ') || fallback;
    }
    return (body.description || body.detail || body.title || fallback)
      .replace(/^Registration failed:\s*/, '');
  };

  // POST /auth/login → { accessToken, refreshToken, expiresAt }.
  // The response has no user details, so they're read from the token's claims.
  const login = async (email, password) => {
    const res = await postJson('/auth/login', { email, password });

    if (res.status === 400 || res.status === 401) throw new Error('Invalid email or password.');
    if (!res.ok) throw new Error('Something went wrong. Please try again.');

    const data = await res.json();
    const token = data.accessToken ?? data.token;
    if (!token) throw new Error('The server did not return a token.');

    const claims = tokenClaims(token) ?? {};
    write(TOKEN_KEY, token);
    write(USER_KEY, JSON.stringify({ id: claims.sub, username: claims.name, email: claims.email ?? email }));
    return data;
  };

  // POST /auth/register → 201 with the new user's id.
  // 400 = validation failed, 409/422 = account can't be created (e.g. email in use, weak password).
  const register = async (username, email, password) => {
    const res = await postJson('/auth/register', { userName: username, email, password });

    if (res.ok) return res.json().catch(() => null);
    if (res.status >= 500) throw new Error('Something went wrong. Please try again.');
    throw new Error(await errorMessage(res, 'Could not create your account.'));
  };

  const logout = (redirect = true) => {
    write(TOKEN_KEY, null);
    write(USER_KEY, null);
    if (redirect) location.href = new URL('index.html', siteRoot).href;
  };

  // fetch() wrapper for API calls: adds the token and sends the user to login on 401.
  const apiFetch = async (path, options = {}) => {
    const token = getToken();
    if (!token) {
      redirectToLogin();
      throw new Error('Not logged in');
    }
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.status === 401) {
      logout(false);
      redirectToLogin();
      throw new Error('Session expired');
    }
    return res;
  };

  // Protect the whole page.
  if (script.hasAttribute('data-require-auth') && !isLoggedIn()) {
    redirectToLogin();
  }

  // Intercept clicks on protected links (works for links added later too).
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-requires-auth]');
    if (!link || isLoggedIn()) return;
    e.preventDefault();
    redirectToLogin(link.href);
  });

  return { API_BASE_URL, getToken, getUser, isLoggedIn, login, register, logout, apiFetch, redirectToLogin, safeRedirect };
})();
