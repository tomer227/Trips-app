import { describe, expect, it, vi } from 'vitest';
import { parseAuthLinkError, takeAuthLinkError } from './authLink';

describe('auth link errors', () => {
  it('recognises expired and failed links in the query or the hash', () => {
    expect(parseAuthLinkError('', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toBe('expired');
    expect(parseAuthLinkError('?error=access_denied&error_code=otp_expired', '')).toBe('expired');
    expect(parseAuthLinkError('?error=server_error&error_description=Database+error', '#/account')).toBe('failed');
  });

  it('ignores normal addresses, including a successful sign-in code', () => {
    expect(parseAuthLinkError('?code=abc', '')).toBeNull();
    expect(parseAuthLinkError('', '#/map/meetup-error')).toBeNull();
    expect(parseAuthLinkError('', '#/country/peru')).toBeNull();
  });

  it('cleans the address and lands on the account page', () => {
    const replaceState = vi.fn();
    expect(takeAuthLinkError({ search: '', hash: '#error=access_denied&error_code=otp_expired', pathname: '/app/' }, { replaceState })).toBe('expired');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/app/#/account');
    replaceState.mockClear();
    expect(takeAuthLinkError({ search: '?code=x', hash: '', pathname: '/' }, { replaceState })).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
