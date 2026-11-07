import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import net from 'node:net';

export function parseCookies(req: IncomingMessage): Map<string, string> {
  const jar = new Map<string, string>();
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const name = part.slice(0, i).trim();
    if (name && !jar.has(name)) {
      try {
        jar.set(name, decodeURIComponent(part.slice(i + 1).trim()));
      } catch { /* malformed value */ }
    }
  }
  return jar;
}

export function serializeCookie(name: string, value: string, options: { maxAgeSeconds: number; secure: boolean }): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${options.maxAgeSeconds}`];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

/** True when the request was made over HTTPS, directly or (per publicOrigin) behind a proxy. */
export function isSecure(req: IncomingMessage, publicOrigin: string | undefined): boolean {
  return publicOrigin ? publicOrigin.startsWith('https:') : !!(req.socket as { encrypted?: boolean }).encrypted;
}

/**
 * CSRF protection for requests that change data: the browser's Origin header must be this app.
 * Compares with publicOrigin when configured, otherwise with the Host the request was sent to.
 */
export function isSameOrigin(req: IncomingMessage, publicOrigin: string | undefined): boolean {
  const sentBy = req.headers.origin;
  if (typeof sentBy !== 'string' || !sentBy) return false;
  try {
    const url = new URL(sentBy);
    return publicOrigin ? url.origin === publicOrigin : url.host === req.headers.host;
  } catch {
    return false;
  }
}

export function timingSafeEqual(a: string, b: string): boolean {
  const x = crypto.createHash('sha256').update(a).digest();
  const y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

/** Matches client addresses against IPs and CIDR ranges (IPv4 and IPv6). */
export function addressMatcher(entries: string[]): (address: string | undefined) => boolean {
  const list = new net.BlockList();
  for (const entry of entries) {
    const [ip, prefix] = entry.split('/');
    const type = net.isIPv6(ip) ? 'ipv6' : 'ipv4';
    if (!net.isIP(ip)) throw new Error(`Invalid configuration: "${entry}" is not an IP address or CIDR range`);
    if (prefix === undefined) list.addAddress(ip, type);
    else list.addSubnet(ip, Number(prefix), type);
  }
  return (address) => {
    if (!address) return false;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
    const ip = mapped ? mapped[1] : address;
    return list.check(ip, net.isIPv6(ip) ? 'ipv6' : 'ipv4');
  };
}
