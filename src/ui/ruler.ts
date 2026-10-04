// Offset ruler: horizontal SVG strip spanning UTC-12 to UTC+14.
// Ticks every hour, labels every 3h (thinned to 6h on narrow screens),
// special accent ticks for fractional offsets in use. Guess markers sit at
// their offsets; ruled-out regions are greyed so the remaining interval
// stands out. Same-offset markers pulse.

export type MarkerKind = 'higher' | 'lower' | 'same' | 'correct';

export interface RulerMarker {
  offsetMin: number;
  kind: MarkerKind;
}

export interface RulerModel {
  markers: RulerMarker[];
  /** Minutes east of UTC; null while a side is still open. */
  loMin: number | null;
  hiMin: number | null;
  /** Exact known offset (same-zone or correct guess). */
  exactMin: number | null;
}

export const RULER_MIN = -12 * 60;
export const RULER_MAX = 14 * 60;

const NS = 'http://www.w3.org/2000/svg';
const W = 1000;
// Geometry in viewBox units. The SVG scales to container width, so type is
// sized to stay legible at 360px (scale ≈ 0.36 → 27 units ≈ 10px).
const BAND_TOP = 8;
const BAND_H = 44;
const AXIS_Y = BAND_TOP + BAND_H; // 52
const LABEL_Y = 84;
const FRAC_LABEL_Y = 90;
const H = 96;

function x(min: number): number {
  return ((min - RULER_MIN) / (RULER_MAX - RULER_MIN)) * W;
}

function el(tag: string, attrs: Record<string, string> = {}): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e as SVGElement;
}

export function formatRulerLabel(min: number): string {
  if (min === 0) return 'UTC±0';
  const sign = min > 0 ? '+' : '−';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, '0')}`;
}

function fmtShort(min: number): string {
  const sign = min > 0 ? '+' : min < 0 ? '−' : '';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${sign}${h}` : `${sign}${h}:${String(m).padStart(2, '0')}`;
}

/**
 * Render the ruler into `box` (a figure.ruler). `fractional` holds the
 * non-hour offsets in use on this puzzle date. Label density adapts to the
 * box width so the strip works at 360px.
 */
export function renderRuler(box: HTMLElement, model: RulerModel, fractional: number[]): void {
  box.innerHTML = '';
  const widthPx = Math.max(280, box.clientWidth || 360);
  const labelStep = widthPx < 420 ? 360 : 180;
  const showFracLabels = widthPx >= 520;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': rulerSummary(model),
  });

  // Remaining-interval band + ruled-out overlays.
  const lo = model.exactMin ?? model.loMin ?? RULER_MIN;
  const hi = model.exactMin ?? model.hiMin ?? RULER_MAX;
  svg.appendChild(el('rect', {
    class: 'band-kept', x: String(x(lo)), y: String(BAND_TOP),
    width: String(Math.max(0, x(hi) - x(lo))), height: String(BAND_H),
    rx: '4',
  }));
  if (x(lo) > 0) {
    svg.appendChild(el('rect', {
      class: 'band-out', x: '0', y: String(BAND_TOP),
      width: String(x(lo)), height: String(BAND_H), rx: '4',
    }));
  }
  if (x(hi) < W) {
    svg.appendChild(el('rect', {
      class: 'band-out', x: String(x(hi)), y: String(BAND_TOP),
      width: String(W - x(hi)), height: String(BAND_H), rx: '4',
    }));
  }

  // Baseline.
  svg.appendChild(el('line', {
    class: 'base-line', x1: '0', y1: String(AXIS_Y), x2: String(W), y2: String(AXIS_Y),
  }));

  // Hourly ticks + hour labels.
  for (let m = RULER_MIN; m <= RULER_MAX; m += 60) {
    const major = ((m / 60) % 3 + 3) % 3 === 0;
    const labeled = m % labelStep === 0;
    svg.appendChild(el('line', {
      class: 'tick', x1: String(x(m)), y1: String(AXIS_Y - (major ? 14 : 7)),
      x2: String(x(m)), y2: String(AXIS_Y),
    }));
    if (labeled) {
      const anchor = m === RULER_MIN ? 'start' : m === RULER_MAX ? 'end' : 'middle';
      const t = el('text', {
        class: 'tick-label', x: String(x(m)), y: String(LABEL_Y), 'text-anchor': anchor,
      });
      t.textContent = fmtShort(m);
      svg.appendChild(t);
    }
  }

  // Fractional-offset special ticks.
  for (const f of fractional) {
    if (f <= RULER_MIN || f >= RULER_MAX) continue;
    svg.appendChild(el('line', {
      class: 'frac-tick', x1: String(x(f)), y1: String(AXIS_Y),
      x2: String(x(f)), y2: String(AXIS_Y + 12),
    }));
    if (showFracLabels) {
      const t = el('text', {
        class: 'frac-label', x: String(x(f)), y: String(FRAC_LABEL_Y), 'text-anchor': 'middle',
      });
      t.textContent = fmtShort(f);
      svg.appendChild(t);
    }
  }

  // Exact-offset line once a same-zone/correct guess pins it.
  if (model.exactMin != null) {
    svg.appendChild(el('line', {
      class: 'exact-line', x1: String(x(model.exactMin)), y1: String(BAND_TOP),
      x2: String(x(model.exactMin)), y2: String(AXIS_Y + 4),
    }));
  }

  // Guess markers, stacked in lanes when sharing an offset.
  const lanes = new Map<number, number>();
  model.markers.forEach((mk) => {
    const lane = lanes.get(mk.offsetMin) ?? 0;
    lanes.set(mk.offsetMin, lane + 1);
    const g = el('g', {
      class: `marker marker-${mk.kind}${mk.kind === 'same' ? ' marker-pulse' : ''}`,
    });
    const cy = BAND_TOP + 14 + Math.min(lane, 1) * 20;
    const cx = x(mk.offsetMin) + (lane <= 1 ? 0 : (lane - 1) * 26);
    const c = el('circle', { cx: String(cx), cy: String(cy), r: '11' });
    const title = el('title', {});
    title.textContent = `${formatRulerLabel(mk.offsetMin)} — ${mk.kind}`;
    g.appendChild(c);
    g.appendChild(title);
    svg.appendChild(g);
  });

  box.appendChild(svg);
  const cap = document.createElement('figcaption');
  cap.textContent = rulerSummary(model);
  box.appendChild(cap);
}

/** Remaining interval for a set of markers (pure, no DOM). */
export function rulerBounds(markers: RulerMarker[]): { lo: number | null; hi: number | null; exact: number | null } {
  let lo: number | null = null;
  let hi: number | null = null;
  let exact: number | null = null;
  for (const m of markers) {
    if (m.kind === 'higher') lo = lo == null ? m.offsetMin : Math.max(lo, m.offsetMin);
    else if (m.kind === 'lower') hi = hi == null ? m.offsetMin : Math.min(hi, m.offsetMin);
    else exact = m.offsetMin;
  }
  return { lo, hi, exact };
}

function rulerSummary(model: RulerModel): string {
  if (model.exactMin != null) return `Target offset pinned at ${formatRulerLabel(model.exactMin)}.`;
  const lo = model.loMin == null ? 'UTC−12' : `above ${formatRulerLabel(model.loMin)}`;
  const hi = model.hiMin == null ? 'UTC+14' : `below ${formatRulerLabel(model.hiMin)}`;
  return model.markers.length === 0
    ? 'No guesses yet. Offsets from UTC−12 to UTC+14.'
    : `Target offset is ${lo} and ${hi}.`;
}
