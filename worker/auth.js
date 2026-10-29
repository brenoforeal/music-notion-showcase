// Admin login: /login, /logout, and isAdmin() used by every admin route.
import { escHtml, simplePage } from './html.js';

export async function handleAuth(request, env, url, corsHeaders) {
  if (url.pathname === '/login' && request.method === 'GET') {
    return new Response(renderLoginPage(safeNext(url.searchParams.get('next')), ''), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  if (url.pathname === '/login' && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const password = form ? String(form.get('password') || '') : '';
    const next = safeNext(form ? form.get('next') : null);
    if (!env.PUBLISH_SECRET || !safeEqual(password, env.PUBLISH_SECRET)) {
      return new Response(renderLoginPage(next, 'Wrong password.'), {
        status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    return new Response(null, {
      status: 303,
      headers: { 'Location': next, 'Set-Cookie': await makeSessionCookie(env) }
    });
  }

  if (url.pathname === '/logout') {
    return new Response(null, {
      status: 303,
      headers: { 'Location': '/login', 'Set-Cookie': clearSessionCookie() }
    });
  }
  return null;
}

// After logging in, the browser holds a cookie "expiry.signature". The
// signature is an HMAC of the expiry made with PUBLISH_SECRET, so it can't be
// forged without the secret, and changing the secret logs every browser out.

const SESSION_COOKIE = 'admin_session';
const SESSION_DAYS = 30;

async function hmac(env, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(env.PUBLISH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Compares in constant time, so response timing doesn't reveal how much matched.
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function makeSessionCookie(env) {
  const expires = Date.now() + SESSION_DAYS * 86400000;
  const value = expires + '.' + await hmac(env, 'admin:' + expires);
  return `${SESSION_COOKIE}=${value}; Max-Age=${SESSION_DAYS * 86400}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

// True if the request has a valid login cookie, or an
// "Authorization: Bearer <PUBLISH_SECRET>" header (for scripts).
export async function isAdmin(request, env) {
  if (!env.PUBLISH_SECRET) return false;
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ') && safeEqual(auth.slice(7), env.PUBLISH_SECRET)) return true;
  const cookie = getCookie(request, SESSION_COOKIE);
  if (!cookie) return false;
  const [expires, sig] = cookie.split('.');
  if (!expires || !sig || !(Number(expires) > Date.now())) return false;
  return safeEqual(sig, await hmac(env, 'admin:' + expires));
}

// Only allow redirects back to a path on this site (blocks "//evil.com" tricks).
function safeNext(next) {
  next = String(next || '');
  return next.startsWith('/') && !next.startsWith('//') ? next : '/lyric-admin';
}

export function redirectToLogin(url) {
  return new Response(null, {
    status: 303,
    headers: { 'Location': '/login?next=' + encodeURIComponent(url.pathname) }
  });
}

function renderLoginPage(next, error) {
  return simplePage('Admin login', `
<form method="POST" action="/login" class="card" style="max-width:320px;margin:40px auto">
  <div class="head">Admin login</div>
  <input type="hidden" name="next" value="${escHtml(next)}">
  <input type="password" name="password" placeholder="Password" autofocus required autocomplete="current-password"
    style="width:100%;padding:8px;border-radius:7px;border:1px solid var(--line);background:var(--bg);color:var(--txt)">
  ${error ? `<div style="color:#ff6b6b;margin-top:8px">${escHtml(error)}</div>` : ''}
  <button type="submit" style="margin-top:10px;padding:7px 14px;border-radius:7px;border:1px solid var(--accent);background:var(--accent);color:#0f1115;font-weight:600;cursor:pointer">Log in</button>
</form>`);
}
