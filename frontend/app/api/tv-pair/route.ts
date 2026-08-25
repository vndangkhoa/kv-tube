import { NextRequest, NextResponse } from 'next/server';

/**
 * TV device pairing.
 *
 * The Android TV app cannot comfortably type a long Invidious token with a
 * remote. Instead the TV shows a short 6-character code and polls this
 * endpoint; the user types that code once in Web → Settings → "Pair Android
 * TV", which pushes this server's instance URL + token to the TV.
 *
 *   POST { action: "create" }                        → { code, expiresIn }
 *   GET  ?code=XXXXXX                                → { status: waiting | linked | consumed | expired, ... }
 *   POST { action: "link", code, instanceUrl, token } → { ok: true }
 */

interface PairEntry {
  instanceUrl?: string;
  token?: string;
  createdAt: number;
  expiresAt: number;
  linked: boolean;
  consumed: boolean;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 lookalikes
const CODE_LENGTH = 6;
const TTL_MS = 15 * 60 * 1000;

// Survive dev-mode module reloads via globalThis (same pattern as avatarCache).
const globalStore = globalThis as unknown as { __kvTvPairStore?: Map<string, PairEntry> };
const store: Map<string, PairEntry> = globalStore.__kvTvPairStore ?? new Map();
globalStore.__kvTvPairStore = store;

function cleanup() {
  const now = Date.now();
  for (const [code, entry] of store) {
    if (now > entry.expiresAt + TTL_MS / 2) store.delete(code);
  }
}

function generateCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function normalizeCode(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-invidious-token',
};

function jsonResponse(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: CORS_HEADERS,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(req: NextRequest) {
  cleanup();
  const code = normalizeCode(req.nextUrl.searchParams.get('code'));
  if (!code) return jsonResponse({ error: 'Missing code' }, { status: 400 });

  const entry = store.get(code);
  if (!entry) return jsonResponse({ status: 'waiting' });
  if (Date.now() > entry.expiresAt) {
    store.delete(code);
    return jsonResponse({ status: 'expired' });
  }
  if (entry.consumed) return jsonResponse({ status: 'consumed' });
  if (!entry.linked) return jsonResponse({ status: 'waiting' });

  // Hand the credentials over exactly once, then mark consumed so they do not
  // linger on the server.
  entry.consumed = true;
  return jsonResponse({
    status: 'linked',
    instanceUrl: entry.instanceUrl || '',
    token: entry.token || '',
  });
}

export async function POST(req: NextRequest) {
  cleanup();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action;

  if (action === 'create') {
    // Avoid code collisions (unlikely but cheap to guard).
    let code = generateCode();
    while (store.has(code)) code = generateCode();
    store.set(code, {
      createdAt: Date.now(),
      expiresAt: Date.now() + TTL_MS,
      linked: false,
      consumed: false,
    });
    return jsonResponse({ code, expiresIn: TTL_MS / 1000 });
  }

  if (action === 'link') {
    const code = normalizeCode(body.code);
    const instanceUrl = typeof body.instanceUrl === 'string' ? body.instanceUrl.trim() : '';
    const token = typeof body.token === 'string' ? body.token.trim() : '';

    if (!instanceUrl && !token) {
      return jsonResponse({ error: 'Nothing to send — set up your instance or token first' }, { status: 400 });
    }
    const entry = store.get(code);
    if (!entry) {
      return jsonResponse({ error: 'Unknown code — check the code shown on your TV' }, { status: 404 });
    }
    if (entry.consumed) {
      return jsonResponse({ error: 'Code already used — generate a new one on the TV' }, { status: 409 });
    }
    if (Date.now() > entry.expiresAt) {
      store.delete(code);
      return jsonResponse({ error: 'Code expired — press Close on the TV and start again' }, { status: 410 });
    }

    entry.instanceUrl = instanceUrl.replace(/\/$/, '');
    entry.token = token;
    entry.linked = true;
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'Unknown action' }, { status: 400 });
}
