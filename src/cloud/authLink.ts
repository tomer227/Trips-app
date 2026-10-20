/**
 * A sign-up confirmation or password-reset link that failed (usually expired or already used)
 * brings the user back with the error in the address, in the query or after "#". The hash router
 * would read that as an unknown page and show Home with no explanation, so it is caught here.
 */
export type AuthLinkError = 'expired' | 'failed';

export function parseAuthLinkError(search: string, hash: string): AuthLinkError | null {
  for (const part of [search.replace(/^\?/, ''), hash.replace(/^#\/?/, '')]) {
    if (!/(^|&)(error|error_code)=/.test(part)) continue;
    const params = new URLSearchParams(part);
    const code = params.get('error_code') ?? '';
    const text = params.get('error_description') ?? '';
    return code === 'otp_expired' || /expired|invalid/i.test(text) ? 'expired' : 'failed';
  }
  return null;
}

/** Reads the error once and leaves a clean address on the account page. */
export function takeAuthLinkError(loc: Pick<Location, 'search' | 'hash' | 'pathname'> = location, history: Pick<History, 'replaceState'> = window.history): AuthLinkError | null {
  const error = parseAuthLinkError(loc.search, loc.hash);
  if (error) history.replaceState(null, '', `${loc.pathname}#/account`);
  return error;
}
