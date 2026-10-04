// Minimal equirectangular world graticule with a dot at the city's lat/lon.
// No external data, no map library: meridians/parallels only.

const NS = 'http://www.w3.org/2000/svg';

export function buildGraticule(lat: number, lon: number, cityName: string): SVGSVGElement {
  const W = 560;
  const H = 280;
  const svg = document.createElementNS(NS, 'svg') as unknown as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'world');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `World location of ${cityName}`);

  const X = (lo: number): number => ((lo + 180) / 360) * W;
  const Y = (la: number): number => ((90 - la) / 180) * H;

  const line = (x1: number, y1: number, x2: number, y2: number): SVGLineElement => {
    const l = document.createElementNS(NS, 'line') as unknown as SVGLineElement;
    l.setAttribute('x1', String(x1));
    l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2));
    l.setAttribute('y2', String(y2));
    l.setAttribute('class', 'world-grat');
    return l;
  };

  for (let lo = -180; lo <= 180; lo += 30) svg.appendChild(line(X(lo), 0, X(lo), H));
  for (let la = -60; la <= 60; la += 30) svg.appendChild(line(0, Y(la), W, Y(la)));

  const dot = document.createElementNS(NS, 'circle') as unknown as SVGCircleElement;
  dot.setAttribute('cx', String(X(lon)));
  dot.setAttribute('cy', String(Y(lat)));
  dot.setAttribute('r', '7');
  dot.setAttribute('class', 'world-dot');
  const title = document.createElementNS(NS, 'title');
  title.textContent = cityName;
  dot.appendChild(title);
  svg.appendChild(dot);
  return svg as unknown as SVGSVGElement;
}
