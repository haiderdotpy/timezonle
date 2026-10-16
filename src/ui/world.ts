// End-state map: a static grayscale coastline picture (public/world-map.jpg,
// rendered from Natural Earth 50m by scripts/render-world-map.py) with a
// lat/lon-accurate SVG grid overlay. The picture is exactly equirectangular
// over +-180/+-90 and the container locks a 2:1 aspect ratio, so grid and
// picture register at every width. Non-interactive: dots only.

const NS = 'http://www.w3.org/2000/svg';
export const WORLD_W = 560;
export const WORLD_H = 280;

/** lon/lat to fractions of the map box (pure; unit-tested). */
export function toFraction(lon: number, lat: number): [number, number] {
  return [(lon + 180) / 360, (90 - lat) / 180];
}

/** URL of the map picture derived from the data base path (pure; tested). */
export function mapImageUrl(dataBase: string): string {
  const root = dataBase.endsWith('data') ? dataBase.slice(0, -4) : `${dataBase}/`;
  return `${root}world-map.jpg`;
}

export interface MapDot {
  lon: number;
  lat: number;
  label: string;
}

export interface WorldModel {
  answer: MapDot;
  /** Wrong guesses only; empty on the loss screen. */
  guesses: MapDot[];
}

function el(tag: string, attrs: Record<string, string> = {}): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e as SVGElement;
}

export function buildMap(model: WorldModel, dataBase: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'worldmap';

  const img = document.createElement('img');
  img.src = mapImageUrl(dataBase);
  img.alt = '';
  img.loading = 'lazy';
  img.width = 1120;
  img.height = 560;
  box.appendChild(img);

  const svg = el('svg', {
    viewBox: `0 0 ${WORLD_W} ${WORLD_H}`,
    class: 'world world-overlay',
    role: 'img',
    'aria-label':
      model.guesses.length > 0
        ? `World map: answer ${model.answer.label}, plus ${model.guesses.length} wrong guesses`
        : `World map: answer ${model.answer.label}`,
    preserveAspectRatio: 'none',
  });

  const line = (x1: number, y1: number, x2: number, y2: number): SVGLineElement => {
    const l = el('line', {
      x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2), class: 'world-grid',
    }) as unknown as SVGLineElement;
    return l;
  };
  const X = (lon: number): number => toFraction(lon, 0)[0] * WORLD_W;
  const Y = (lat: number): number => toFraction(0, lat)[1] * WORLD_H;
  for (let lon = -150; lon <= 150; lon += 30) svg.appendChild(line(X(lon), 0, X(lon), WORLD_H));
  for (let lat = -60; lat <= 60; lat += 30) svg.appendChild(line(0, Y(lat), WORLD_W, Y(lat)));

  const dot = (d: MapDot, cls: string, r: string): SVGCircleElement => {
    const [fx, fy] = toFraction(d.lon, d.lat);
    const c = el('circle', {
      cx: String(fx * WORLD_W), cy: String(fy * WORLD_H), r, class: cls,
    }) as unknown as SVGCircleElement;
    const title = document.createElementNS(NS, 'title');
    title.textContent = d.label;
    c.appendChild(title);
    return c as unknown as SVGCircleElement;
  };
  for (const g of model.guesses) svg.appendChild(dot(g, 'world-guess', '4'));
  svg.appendChild(dot(model.answer, 'world-dot', '6'));

  box.appendChild(svg);
  return box;
}
