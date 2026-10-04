export interface City {
  id: string;
  name: string;
  asciiName: string;
  country: string;
  admin1: string;
  tz: string;
  lat: number;
  lon: number;
  pop: number;
  isCapital: boolean;
  coastal: boolean | null;
}

export const CITIES_HEADER = [
  'id', 'name', 'asciiName', 'country', 'admin1', 'tz', 'lat', 'lon', 'pop', 'isCapital', 'coastal',
] as const;

type Row = [string, string, string, string, string, string, number, number, number, number, number | null];

export interface CitiesFile {
  header: string[];
  rows: Row[];
}

export function parseCitiesFile(data: CitiesFile): City[] {
  const idx = new Map<string, number>();
  data.header.forEach((h, i) => idx.set(h, i));
  const need = [...CITIES_HEADER];
  for (const h of need) {
    if (!idx.has(h)) throw new Error(`cities.json missing header column: ${h}`);
  }
  return data.rows.map((r) => ({
    id: String(r[idx.get('id')!]),
    name: String(r[idx.get('name')!]),
    asciiName: String(r[idx.get('asciiName')!] ?? ''),
    country: String(r[idx.get('country')!] ?? ''),
    admin1: String(r[idx.get('admin1')!] ?? ''),
    tz: String(r[idx.get('tz')!]),
    lat: Number(r[idx.get('lat')!]),
    lon: Number(r[idx.get('lon')!]),
    pop: Number(r[idx.get('pop')!]),
    isCapital: Number(r[idx.get('isCapital')!]) === 1,
    coastal: r[idx.get('coastal')!] == null ? null : Number(r[idx.get('coastal')!]) === 1,
  }));
}

export interface TargetsFile {
  ids: string[];
}

export interface ScheduleFile {
  salt: string;
  seed: number;
  launchDate: string;
  hashes: string[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return (await res.json()) as T;
}

export async function loadCities(base = './data'): Promise<City[]> {
  return parseCitiesFile(await fetchJson<CitiesFile>(`${base}/cities.json`));
}

export async function loadTargets(base = './data'): Promise<string[]> {
  const t = await fetchJson<TargetsFile>(`${base}/targets.json`);
  return t.ids;
}

export async function loadSchedule(base = './data'): Promise<ScheduleFile> {
  return fetchJson<ScheduleFile>(`${base}/schedule.json`);
}

/** Normalize accents + lowercase for search. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export interface SearchIndex {
  cities: City[];
  byId: Map<string, City>;
  nameCounts: Map<string, number>;
}

export function buildIndex(cities: City[]): SearchIndex {
  const byId = new Map(cities.map((c) => [c.id, c]));
  const nameCounts = new Map<string, number>();
  for (const c of cities) {
    const k = normalize(c.name);
    nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1);
  }
  return { cities, byId, nameCounts };
}

/**
 * Prefix-match autocomplete over an in-memory index, ranked by population.
 * Shows "City, Admin1, Country" disambiguation when names collide.
 */
export function searchCities(index: SearchIndex, query: string, limit = 8): City[] {
  const q = normalize(query);
  if (!q) return [];
  const starts: City[] = [];
  const contains: City[] = [];
  for (const c of index.cities) {
    const n = normalize(c.name);
    const a = normalize(c.asciiName || '');
    if (n.startsWith(q) || a.startsWith(q)) starts.push(c);
    else if (n.includes(q) || a.includes(q)) contains.push(c);
  }
  const byPop = (x: City, y: City): number => y.pop - x.pop;
  starts.sort(byPop);
  contains.sort(byPop);
  return [...starts, ...contains].slice(0, limit);
}

export function displayName(c: City, nameCounts: Map<string, number>): string {
  const collides = (nameCounts.get(normalize(c.name)) ?? 0) > 1;
  const parts = [c.name];
  if (collides || c.admin1) parts.push(c.admin1);
  if (c.country) parts.push(c.country);
  return parts.filter(Boolean).join(', ');
}
