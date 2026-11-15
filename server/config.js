import { isIP } from 'node:net';

export class ConfigurationError extends Error {}
const required = (env, key) => {
  const value = env[key]?.trim();
  if (!value) throw new ConfigurationError('Missing server configuration');
  return value;
};
export const validEmail = value => {
  if (typeof value !== 'string' || value.length > 254 || /[^\x21-\x7e]/.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return local.length > 0 && local.length <= 64 && !local.startsWith('.') && !local.endsWith('.') &&
    !local.includes('..') && /^[A-Za-z0-9.!#$%&'*+/=?^_\x60{|}~-]+$/.test(local) &&
    domain.includes('.') && domain.length <= 253 && domain.split('.').every(label =>
      label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
};
export function getConfig(env = process.env) {
  let site;
  try { site = new URL(required(env, 'SITE_URL')); }
  catch { throw new ConfigurationError('Invalid site URL'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname);
  if (site.username || site.password || site.search || site.hash || site.pathname !== '/' ||
      (site.protocol !== 'https:' && !(local && site.protocol === 'http:' && !env.VERCEL))) {
    throw new ConfigurationError('Invalid site URL');
  }
  const privacyEmail = required(env, 'PRIVACY_EMAIL');
  if (!validEmail(privacyEmail)) throw new ConfigurationError('Invalid privacy email');
  const rateSecret = required(env, 'RATE_LIMIT_SECRET');
  const unsubscribeSecret = required(env, 'UNSUBSCRIBE_SECRET');
  if (rateSecret.length < 32 || unsubscribeSecret.length < 32 || rateSecret === unsubscribeSecret) {
    throw new ConfigurationError('Invalid secrets');
  }
  return { siteUrl: site.origin, privacyEmail, rateSecret, unsubscribeSecret,
    emailEnabled: env.EMAIL_ENABLED === 'true', launchEnabled: env.LAUNCH_ENABLED === 'true' };
}
export function getEmailConfig(env = process.env) {
  const config = getConfig(env);
  if (!config.emailEnabled) throw new ConfigurationError('Email disabled');
  const apiKey = required(env, 'RESEND_API_KEY');
  const from = required(env, 'EMAIL_FROM');
  const address = from.match(/<([^<>]+)>$/)?.[1] || from;
  if (/\r|\n/.test(from) || !validEmail(address)) throw new ConfigurationError('Invalid sender');
  return { ...config, apiKey, from };
}
export function clientAddress(request, env = process.env) {
  // A borda da Vercel sobrescreve x-forwarded-for. Não confiar fora dela.
  if (env.VERCEL === '1') {
    const ip = request.headers.get('x-forwarded-for')?.trim();
    if (!ip || !isIP(ip)) throw new ConfigurationError('Trusted address unavailable');
    return ip;
  }
  if (env.NODE_ENV === 'production') throw new ConfigurationError('Configure a trusted ingress');
  return 'local-development';
}
