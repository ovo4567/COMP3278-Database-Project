export type LocationInfo = {
  country: string | null;
  region: string | null;
  city: string | null;
};

const locationPool: Array<{ country: string; region: string; city: string }> = [
  { country: 'Hong Kong', region: 'Central and Western', city: 'Central' },
  { country: 'Singapore', region: 'Central Region', city: 'Singapore' },
  { country: 'Japan', region: 'Tokyo', city: 'Shibuya' },
  { country: 'South Korea', region: 'Seoul', city: 'Mapo-gu' },
  { country: 'United Kingdom', region: 'England', city: 'London' },
  { country: 'United States', region: 'California', city: 'San Francisco' },
];

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

export const normalizeIp = (ip: string | null | undefined): string | null => {
  if (!ip) return null;
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
};

export const lookupLocation = (rawIp: string | null | undefined): LocationInfo => {
  const ip = normalizeIp(rawIp);
  if (!ip) return { country: null, region: null, city: null };

  if (ip === '::1' || ip === '127.0.0.1') {
    return { country: 'Local', region: 'Development', city: 'Loopback' };
  }

  if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.') || ip.startsWith('172.17.') || ip.startsWith('172.18.') || ip.startsWith('172.19.') || ip.startsWith('172.20.') || ip.startsWith('172.21.') || ip.startsWith('172.22.') || ip.startsWith('172.23.') || ip.startsWith('172.24.') || ip.startsWith('172.25.') || ip.startsWith('172.26.') || ip.startsWith('172.27.') || ip.startsWith('172.28.') || ip.startsWith('172.29.') || ip.startsWith('172.30.') || ip.startsWith('172.31.')) {
    return { country: 'Private Network', region: 'LAN', city: 'Internal' };
  }

  const idx = hashString(ip) % locationPool.length;
  return locationPool[idx] ?? { country: null, region: null, city: null };
};

export const formatLocation = (location: LocationInfo): string | null => {
  const parts = [location.country, location.region, location.city].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return null;
  return parts.join(', ');
};
