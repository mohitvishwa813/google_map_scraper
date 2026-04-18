import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = path.resolve(__dirname, '..', 'cookies.json');

/**
 * Loads cookies from cookies.json.
 * Converts Netscape/EditThisCookie format to Playwright format if needed.
 */
export async function loadCookies() {
  if (!fs.existsSync(COOKIES_PATH)) return [];

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
  } catch (e) {
    console.error('⚠  Failed to parse cookies.json:', e.message);
    return [];
  }

  if (!Array.isArray(raw)) return [];

  // Normalize to Playwright cookie format
  return raw.map(c => ({
    name: c.name || c.Name,
    value: c.value || c.Value || '',
    domain: normalizeDomain(c.domain || c.Domain || '.instagram.com'),
    path: c.path || c.Path || '/',
    expires: normalizeExpires(c.expirationDate ?? c.expires ?? c.Expires),
    httpOnly: c.httpOnly ?? c.HttpOnly ?? false,
    secure: c.secure ?? c.Secure ?? true,
    sameSite: normalizeSameSite(c.sameSite ?? c.SameSite),
  })).filter(c => c.name && c.value);
}

function normalizeDomain(domain) {
  if (!domain.startsWith('.') && !domain.startsWith('http')) {
    return '.' + domain;
  }
  return domain;
}

function normalizeSameSite(value) {
  if (value == null || value === '') return 'None';
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'strict') return 'Strict';
  if (normalized === 'lax') return 'Lax';
  if (normalized === 'none') return 'None';
  // Common export values (e.g. EditThisCookie / Chrome)
  if (normalized === 'no_restriction') return 'None';
  if (normalized === 'unspecified') return 'Lax';
  // Playwright only accepts Strict|Lax|None; default to None to avoid crashes.
  return 'None';
}

function normalizeExpires(value) {
  if (value == null || value === '') return -1;
  const num = Number(value);
  if (Number.isNaN(num)) return -1;
  // Playwright expects seconds since UNIX epoch.
  return num;
}
