/**
 * Invidious accepts two credentials on /auth/* endpoints:
 *  - `Authorization: Bearer <token>` where the token is a JSON payload (raw,
 *    or base64/base64url encoded) containing the session id;
 *  - a raw session id sent as `Cookie: SID=<sid>`.
 *
 * A Bearer header that the instance cannot decode makes it fail hard with
 * 403 even when a valid SID cookie is present too — exactly one of them may
 * be sent. Tokens generated via Preferences → Tokens are base64-encoded
 * JSON; SID cookie values are opaque strings.
 */
export function tokenWantsBearer(rawToken: string): boolean {
  const token = rawToken.trim().replace(/^"+|"+$/g, '');
  if (token.startsWith('{')) return true;

  const compact = token.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const padded = compact + '='.repeat((4 - (compact.length % 4)) % 4);
  if (padded.length < 16) return false;

  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes).trim();
    return decoded.startsWith('{') && decoded.includes('"session"');
  } catch {
    return false;
  }
}
