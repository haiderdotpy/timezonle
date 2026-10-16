import { loadCities, loadTargets, loadSchedule, type City } from '../data/loaders.js';
import {
  LAUNCH_DATE_MS,
  MAX_GUESSES,
} from '../logic/constants.js';
import { systemClock, type Clock } from '../logic/clock.js';
import {
  getPuzzleNumber,
  puzzleDateStr,
  msUntilNextPuzzle,
  resolveTargetId,
  parsePuzzleOverride,
} from '../logic/schedule.js';
import { getOffsetMinutes, formatOffset } from '../logic/offset.js';
import { getFeedback, feedbackEmoji, type Feedback } from '../logic/feedback.js';
import {
  recordFinishedGame,
  withValidStreak,
  winRate,
} from '../logic/stats.js';
import {
  loadSave,
  persistSave,
  onExternalChange,
  serializeExport,
  parseImport,
  type SaveData,
} from '../storage/store.js';
import { attachAutocomplete } from './autocomplete.js';
import { renderRuler, rulerBounds, type RulerMarker } from './ruler.js';
import { buildMap, type MapDot } from './world.js';

export interface AppOptions {
  clock?: Clock;
  dataBase?: string;
  storage?: Storage | null;
}

/** One emoji per guess for the share text. */
export function shareEmojiFor(fb: Feedback): string {
  if (fb.kind === 'same') {
    // First same-offset miss (N/S only) keeps the yellow square;
    // compass once E/W or extra hints unlock.
    if (!fb.ew && fb.hints.length === 0) return '🟨';
    return '🧭';
  }
  return feedbackEmoji(fb);
}

export function buildShareText(puzzleNumber: number, feedbacks: Feedback[]): string {
  const score = feedbacks.some((f) => f.kind === 'correct') ? String(feedbacks.length) : `X`;
  const lines = [`Timezonle #${puzzleNumber} ${score}/${MAX_GUESSES}`];
  if (feedbacks.length > 0) lines.push(feedbacks.map(shareEmojiFor).join(''));
  return lines.join('\n');
}

export function chipLabel(fb: Feedback): { text: string; win: boolean } {
  if (fb.kind === 'correct') return { text: 'correct', win: true };
  if (fb.kind === 'higher') return { text: 'higher ↑', win: false };
  if (fb.kind === 'lower') return { text: 'lower ↓', win: false };
  const bits = ['same zone', fb.ns === 'same-latitude' ? 'same latitude' : `target ${fb.ns}`];
  if (fb.ew) bits.push(fb.ew === 'same-longitude' ? 'same longitude' : `target ${fb.ew}`);
  return { text: bits.join(' · '), win: false };
}

/** Feedback for every stored guess id, in order, with hint staging. */
export function feedbacksFor(
  guessIds: string[],
  byId: Map<string, City>,
  target: City,
  puzzleDate: string,
): Feedback[] {
  const out: Feedback[] = [];
  let sameMisses = 0;
  for (const id of guessIds) {
    const g = byId.get(id);
    if (!g) continue;
    const fb = getFeedback(g, target, puzzleDate, sameMisses);
    out.push(fb);
    if (fb.kind === 'same') sameMisses += 1;
  }
  return out;
}

/** Map a raw hint sentence to a small labeled pair ("Coastal: yes"). */
export function labelHint(hint: string): [string, string] {
  const t = hint.trim();
  if (/^target is coastal/i.test(t)) return ['Coastal', 'yes'];
  if (/^target is inland/i.test(t)) return ['Coastal', 'no'];
  if (/not a national capital/i.test(t)) return ['Capital', 'no'];
  if (/national capital/i.test(t)) return ['Capital', 'yes'];
  if (/does not observe/i.test(t)) return ['Daylight saving', 'no'];
  if (/observes daylight/i.test(t)) return ['Daylight saving', 'yes'];
  const pop = t.match(/population:\s*(.+)$/i);
  if (pop) return ['Population', pop[1].trim()];
  const fl = t.match(/starts with\s+[“"](.)[”"]?/);
  if (fl) return ['First letter', fl[1].toUpperCase()];
  return ['Hint', t];
}

export function compassFor(fb: Extract<Feedback, { kind: 'same' }>): { text: string; label: string } {
  const parts: string[] = [];
  const words: string[] = [];
  if (fb.ns === 'north') { parts.push('N'); words.push('north'); }
  else if (fb.ns === 'south') { parts.push('S'); words.push('south'); }
  else { parts.push('='); words.push('the same latitude'); }
  if (fb.ew === 'east') { parts.push('E'); words.push('east'); }
  else if (fb.ew === 'west') { parts.push('W'); words.push('west'); }
  else if (fb.ew) { parts.push('='); words.push('the same longitude'); }
  return { text: parts.join(' '), label: `Target is ${words.join(' and ')} of this guess` };
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

export async function startApp(root: HTMLElement, opts: AppOptions = {}): Promise<() => void> {
  const clock: Clock = opts.clock ?? systemClock;
  const dataBase = opts.dataBase ?? 'data';
  const storage = opts.storage === undefined ? safeLocalStorage() : opts.storage;

  const [cities, targetIds, schedule] = await Promise.all([
    loadCities(dataBase),
    loadTargets(dataBase),
    loadSchedule(dataBase),
  ]);
  const byId = new Map(cities.map((c) => [c.id, c]));

  let { save, ephemeral } = loadSave(storage);
  let todayNumber = getPuzzleNumber(clock(), LAUNCH_DATE_MS);
  const override = parsePuzzleOverride(window.location.search, todayNumber);
  let puzzleNumber = override?.puzzleNumber ?? todayNumber;
  const isArchivePlay = override?.isOverride ?? false;

  // ---- DOM skeleton ----
  root.innerHTML = '';
  const header = el('header', 'top');
  const titleWrap = el('div', '');
  const h1 = document.createElement('h1');
  h1.textContent = 'Timezonle';
  const sub = el('div', 'puzzle-no');
  titleWrap.append(h1, sub);
  header.append(titleWrap);

  const menuWrap = el('div', 'menu-wrap');
  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.textContent = '☰ Menu';
  menuBtn.setAttribute('aria-haspopup', 'dialog');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuWrap.appendChild(menuBtn);
  header.append(menuWrap);

  const notice = el('div', 'notice');
  const rulerBox = document.createElement('figure');
  rulerBox.className = 'ruler';

  const form = document.createElement('form');
  form.className = 'guess-form';
  form.setAttribute('aria-label', 'Make a guess');
  const row = el('div', 'guess-row');
  const label = document.createElement('label');
  label.className = 'sr-only';
  label.textContent = 'Guess a city';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Guess a city…';
  input.autocomplete = 'off';
  input.autofocus = true;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', 'suggestions');
  input.setAttribute('aria-autocomplete', 'list');
  label.setAttribute('for', 'guess-input');
  input.id = 'guess-input';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'primary';
  submit.textContent = 'Guess';
  row.append(input, submit);
  const sugg = document.createElement('ul');
  sugg.id = 'suggestions';
  sugg.className = 'suggestions';
  sugg.setAttribute('role', 'listbox');
  sugg.hidden = true;
  form.append(label, row, sugg);
  const err = el('div', 'notice');
  err.hidden = true;
  err.setAttribute('role', 'alert');

  const guessesOl = document.createElement('ol');
  guessesOl.className = 'guesses';
  guessesOl.setAttribute('aria-live', 'polite');
  guessesOl.setAttribute('aria-label', 'Your guesses');
  const hintsBox = el('section', 'hints');
  const endBox = el('section', 'endstate');
  const countdown = el('div', 'countdown js-countdown');
  countdown.setAttribute('aria-live', 'polite');
  const footer = document.createElement('footer');
  footer.textContent =
    'City data © GeoNames (CC BY 4.0). Map © Natural Earth. ' +
    'Offsets computed in your browser from IANA time zones.';
  const modalRoot = el('div', '');

  root.append(header, notice, rulerBox, form, err, guessesOl, hintsBox, endBox, countdown, footer, modalRoot);

  if (ephemeral) {
    notice.textContent = 'Local storage is unavailable — stats won’t persist on this device.';
  } else {
    notice.hidden = true;
  }

  const fracCache = new Map<string, number[]>();
  let rulerModel: { markers: RulerMarker[]; loMin: number | null; hiMin: number | null; exactMin: number | null } = {
    markers: [], loMin: null, hiMin: null, exactMin: null,
  };
  let lastRulerFrac: number[] = [];
  let lastCount = 0;
  let lastPuzzle = -1;

  function fractionalFor(date: string): number[] {
    const hit = fracCache.get(date);
    if (hit) return hit;
    const set = new Set<number>();
    for (const c of cities) {
      try {
        const off = getOffsetMinutes(c.tz, date);
        if (off % 60 !== 0) set.add(off);
      } catch { /* unresolvable zone: skip */ }
    }
    const list = [...set].sort((a, b) => a - b);
    fracCache.set(date, list);
    return list;
  }

  function drawRuler(): void {
    renderRuler(rulerBox, rulerModel, lastRulerFrac);
  }

  let resizeT = 0;
  const onResize = (): void => {
    window.clearTimeout(resizeT);
    resizeT = window.setTimeout(drawRuler, 150);
  };
  window.addEventListener('resize', onResize);

  function persist(): void {
    const ok = persistSave(storage, save);
    if (!ok && !ephemeral) {
      ephemeral = true;
      notice.hidden = false;
      notice.textContent = 'Local storage is unavailable — stats won’t persist on this device.';
    }
  }

  function targetFor(n: number): City | null {
    const id = resolveTargetId(
      { salt: schedule.salt, seed: schedule.seed, hashes: schedule.hashes },
      n,
      targetIds,
    );
    return id ? (byId.get(id) ?? null) : null;
  }

  function puzzleDate(n: number): string {
    return puzzleDateStr(n, LAUNCH_DATE_MS);
  }

  function currentGame(): { guesses: string[]; status: 'playing' | 'won' | 'lost' } {
    const g = save.games[puzzleNumber];
    if (g) return g;
    const fresh = { guesses: [], status: 'playing' as const };
    save.games[puzzleNumber] = fresh;
    return fresh;
  }

  function render(): void {
    closeMenu();
    const target = targetFor(puzzleNumber);
    const date = puzzleDate(puzzleNumber);
    sub.textContent = `Puzzle #${puzzleNumber}${isArchivePlay ? ' (archive)' : ''} · ${date}`;
    if (!target) {
      endBox.textContent = 'Could not resolve today’s puzzle. Please try again later.';
      return;
    }
    const game = currentGame();
    const fbs = feedbacksFor(game.guesses, byId, target, date);

    // Ruler model from guess offsets + feedback kinds.
    const markers: RulerMarker[] = [];
    game.guesses.forEach((id, i) => {
      const c = byId.get(id);
      const fb = fbs[i];
      if (!c || !fb) return;
      markers.push({ offsetMin: getOffsetMinutes(c.tz, date), kind: fb.kind });
    });
    const b = rulerBounds(markers);
    rulerModel = { markers, loMin: b.lo, hiMin: b.hi, exactMin: b.exact };
    lastRulerFrac = fractionalFor(date);
    drawRuler();

    // Guess list: always MAX_GUESSES rows.
    guessesOl.innerHTML = '';
    const freshIndex =
      puzzleNumber === lastPuzzle && game.guesses.length > lastCount ? game.guesses.length - 1 : -1;
    for (let i = 0; i < MAX_GUESSES; i++) {
      const li = document.createElement('li');
      if (i >= game.guesses.length) {
        li.className = 'guess empty';
        li.textContent = `Guess ${i + 1}`;
      } else {
        li.className = 'guess' + (i === freshIndex ? ' enter' : '');
        const c = byId.get(game.guesses[i]);
        const name = document.createElement('span');
        name.className = 'guess-name';
        name.textContent = c ? c.name : game.guesses[i];
        if (c) {
          const off = document.createElement('span');
          off.className = 'guess-offset';
          off.textContent = formatOffset(getOffsetMinutes(c.tz, date));
          name.appendChild(off);
        }
        const chips = document.createElement('span');
        chips.className = 'guess-chips';
        const fb = fbs[i];
        if (fb) {
          const chip = document.createElement('span');
          if (fb.kind === 'correct') { chip.className = 'chip correct'; chip.textContent = 'Correct'; }
          else if (fb.kind === 'higher') { chip.className = 'chip higher'; chip.textContent = '↑ Higher'; }
          else if (fb.kind === 'lower') { chip.className = 'chip lower'; chip.textContent = '↓ Lower'; }
          else { chip.className = 'chip same'; chip.textContent = 'Same zone'; }
          chips.appendChild(chip);
          if (fb.kind === 'same') {
            const comp = compassFor(fb);
            const cc = document.createElement('span');
            cc.className = 'chip compass';
            cc.textContent = comp.text;
            cc.setAttribute('aria-label', comp.label);
            cc.title = comp.label;
            chips.appendChild(cc);
          }
        }
        li.append(name, chips);
      }
      guessesOl.appendChild(li);
    }
    lastPuzzle = puzzleNumber;
    lastCount = game.guesses.length;

    // Hints: render only when something is unlocked.
    hintsBox.innerHTML = '';
    const seen = new Map<string, string>();
    for (const fb of fbs) {
      if (fb.kind !== 'same') continue;
      for (const h of fb.hints) {
        const [k, v] = labelHint(h);
        if (!seen.has(k)) seen.set(k, v);
      }
    }
    if (seen.size > 0) {
      const h = document.createElement('h2');
      h.textContent = 'Hints';
      const dl = document.createElement('dl');
      for (const [k, v] of seen) {
        const wrap = document.createElement('div');
        wrap.className = 'hint-row';
        const dt = document.createElement('dt');
        dt.textContent = `${k}:`;
        const dd = document.createElement('dd');
        dd.textContent = v;
        wrap.append(dt, dd);
        dl.appendChild(wrap);
      }
      hintsBox.append(h, dl);
    }

    // End state: result card once finished.
    endBox.innerHTML = '';
    const finished = game.status !== 'playing';
    form.style.display = finished ? 'none' : '';
    if (finished) {
      const won = game.status === 'won';
      const wrong: City[] = won
        ? game.guesses.map((id) => byId.get(id)).filter((c): c is City => !!c && c.id !== target.id)
        : [];
      endBox.appendChild(resultCard(target, date, won ? 'won' : 'lost', game.guesses.length, fbs, wrong));
      countdown.hidden = true;
    } else {
      countdown.hidden = false;
    }
    tickCountdown();
  }

  function resultCard(
    target: City,
    date: string,
    status: 'won' | 'lost',
    guessCount: number,
    fbs: Feedback[],
    wrong: City[],
  ): HTMLElement {
    const card = el('div', 'result-card');
    const h = document.createElement('h2');
    h.textContent = target.name;
    const place = [target.admin1, target.country].filter(Boolean).join(', ');
    const sub2 = el('p', 'result-sub');
    sub2.textContent = `${place} · ${formatOffset(getOffsetMinutes(target.tz, date))}`;
    const outcome = el('p', 'result-outcome');
    outcome.textContent =
      status === 'won'
        ? `You got it in ${guessCount} ${guessCount === 1 ? 'guess' : 'guesses'}!`
        : `Out of guesses — the answer was ${target.name}.`;
    card.append(h, sub2);
    const dots: MapDot[] = wrong.map((c) => ({ lon: c.lon, lat: c.lat, label: c.name }));
    card.appendChild(
      buildMap(
        {
          answer: { lon: target.lon, lat: target.lat, label: target.name },
          guesses: dots,
        },
        dataBase,
      ),
    );
    const legend = el('div', 'map-legend');
    const aDot = document.createElement('span');
    aDot.className = 'lg-dot lg-answer';
    legend.append(aDot, ' answer');
    if (dots.length > 0) {
      const gDot = document.createElement('span');
      gDot.className = 'lg-dot lg-guess';
      legend.append(', ', gDot, ' your guesses');
    }
    card.appendChild(legend);
    card.appendChild(outcome);

    const actions = el('div', 'result-actions');
    const copy = document.createElement('button');
    copy.className = 'primary';
    copy.textContent = 'Copy result';
    const note = el('span', 'copied-note');
    note.setAttribute('aria-live', 'polite');
    let revertT = 0;
    copy.addEventListener('click', async () => {
      const text = buildShareText(puzzleNumber, fbs);
      try {
        await navigator.clipboard.writeText(text);
      } catch { /* clipboard unavailable: still confirm with the text selected fallback */ }
      copy.textContent = 'Copied ✓';
      note.textContent = 'Result copied to clipboard.';
      window.clearTimeout(revertT);
      revertT = window.setTimeout(() => {
        copy.textContent = 'Copy result';
        note.textContent = '';
      }, 2500);
    });
    actions.append(copy, note);
    card.appendChild(actions);
    const cd = el('p', 'result-countdown js-countdown');
    card.appendChild(cd);
    card.appendChild(statsSection(guessCount, status === 'won'));
    return card;
  }

  function statsSection(lastCount: number, won: boolean): HTMLElement {
    const stats = withValidStreak(save.stats, todayNumber);
    const wrap = document.createElement('div');
    wrap.className = 'stats-block';
    const nums = document.createElement('div');
    nums.className = 'stats-numbers';
    const cells: Array<[string, string]> = [
      [String(stats.played), 'Played'],
      [`${winRate(stats)}%`, 'Win %'],
      [String(stats.streak), 'Streak'],
      [String(stats.maxStreak), 'Best'],
    ];
    for (const [num, lbl] of cells) {
      const cell = document.createElement('div');
      const n = document.createElement('div');
      n.className = 'num';
      n.textContent = num;
      const l = document.createElement('div');
      l.className = 'lbl';
      l.textContent = lbl;
      cell.append(n, l);
      nums.appendChild(cell);
    }
    wrap.appendChild(nums);
    const dist = document.createElement('div');
    dist.className = 'dist';
    dist.setAttribute('role', 'img');
    dist.setAttribute('aria-label', `Guess distribution: ${stats.distribution.join(', ')}`);
    const max = Math.max(1, ...stats.distribution);
    const current = won ? Math.min(Math.max(lastCount, 1), MAX_GUESSES) - 1 : MAX_GUESSES;
    stats.distribution.forEach((n, i) => {
      const r = document.createElement('div');
      r.className = 'dist-row' + (i === current && (won || n > 0) && stats.played > 0 ? ' current' : '');
      const lab = document.createElement('span');
      lab.className = 'dist-label';
      lab.textContent = i < MAX_GUESSES ? String(i + 1) : '✕';
      const track = document.createElement('span');
      track.className = 'track';
      const fill = document.createElement('span');
      fill.className = 'fill';
      fill.style.display = 'block';
      fill.style.width = `${Math.max(n > 0 ? 8 : 0, (n / max) * 100)}%`;
      track.appendChild(fill);
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = String(n);
      r.append(lab, track, count);
      dist.appendChild(r);
    });
    wrap.appendChild(dist);
    return wrap;
  }

  // ---- menu: popover on desktop, bottom sheet on mobile ----
  let menuOpen = false;
  let lastFocus: HTMLElement | null = null;

  function closeMenu(): void {
    if (!menuOpen) return;
    menuOpen = false;
    menuBtn.setAttribute('aria-expanded', 'false');
    menuWrap.querySelectorAll('.menu-backdrop, .menu-sheet').forEach((n) => n.remove());
    lastFocus?.focus?.();
  }

  function openMenu(): void {
    if (menuOpen) { closeMenu(); return; }
    menuOpen = true;
    lastFocus = document.activeElement as HTMLElement | null;
    menuBtn.setAttribute('aria-expanded', 'true');
    const back = el('div', 'menu-backdrop');
    const sheet = el('div', 'menu-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Game menu');
    const items: Array<[string, () => void]> = [
      ['📊 Statistics', () => showModal('Statistics', statsSection(0, false))],
      ['❓ How to play', showHowTo],
      ['🗂 Archive', showArchive],
      ['⬇ Export stats', doExport],
      ['⬆ Import stats', doImport],
    ];
    for (const [text, fn] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', () => { closeMenu(); fn(); });
      sheet.appendChild(b);
    }
    back.addEventListener('click', closeMenu);
    menuWrap.append(back, sheet);
    sheet.querySelector('button')?.focus();
  }

  menuBtn.addEventListener('click', openMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen) closeMenu();
  });

  function showModal(title: string, body: HTMLElement): void {
    modalRoot.innerHTML = '';
    const back = el('div', 'modal-backdrop');
    const m = el('div', 'modal');
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-label', title);
    const h = document.createElement('h2');
    h.textContent = title;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    m.append(h, body, close);
    back.appendChild(m);
    modalRoot.appendChild(back);
    close.focus();
    const dismiss = (): void => {
      modalRoot.innerHTML = '';
      menuBtn.focus();
    };
    close.addEventListener('click', dismiss);
    back.addEventListener('click', (e) => {
      if (e.target === back) dismiss();
    });
  }

  function showHowTo(): void {
    const body = document.createElement('div');
    body.innerHTML =
      '<p>Guess the hidden city in up to 8 tries. After each guess:</p>' +
      '<ul><li><b>Higher</b> — the target’s UTC offset is greater (further east).</li>' +
      '<li><b>Lower</b> — the target’s UTC offset is smaller (further west).</li>' +
      '<li><b>Same zone</b> — same offset. The 1st such miss reveals north/south, ' +
      'the 2nd adds east/west, then one extra hint per miss (coastal, capital, DST, population, first letter).</li></ul>' +
      '<p>The ruler above the guesses tracks the offsets still in play. A new puzzle appears at UTC midnight.</p>';
    showModal('How to play', body);
  }

  function showArchive(): void {
    const body = document.createElement('div');
    const ul = document.createElement('ul');
    ul.className = 'archive-list';
    for (let n = todayNumber; n >= 1; n--) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `?puzzle=${n}`;
      const g = save.games[n];
      a.textContent = `#${n} · ${puzzleDateStr(n, LAUNCH_DATE_MS)}${g ? ` · ${g.status} (${g.guesses.length})` : ''}`;
      li.appendChild(a);
      ul.appendChild(li);
      if (ul.children.length >= 60) break; // keep the list short
    }
    body.appendChild(ul);
    showModal('Archive', body);
  }

  function doExport(): void {
    const blob = new Blob([serializeExport(save)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'timezonle-stats.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function doImport(): void {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json';
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        save = parseImport(await f.text());
        persist();
        render();
      } catch {
        err.hidden = false;
        err.textContent = 'Could not import that file (invalid JSON).';
      }
    });
    inp.click();
  }

  // ---- guessing ----
  let picked: City | null = null;
  const ac = attachAutocomplete(input, sugg, cities, (c) => {
    picked = c;
    input.value = c.name;
    ac.clear();
    form.requestSubmit();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.hidden = true;
    const target = targetFor(puzzleNumber);
    if (!target) return;
    const game = currentGame();
    if (game.status !== 'playing') return;
    const q = input.value.trim();
    const match =
      picked && picked.name.toLowerCase() === q.toLowerCase()
        ? picked
        : cities.find((c) => c.name.toLowerCase() === q.toLowerCase()) ??
          cities.find((c) => c.asciiName.toLowerCase() === q.toLowerCase());
    if (!match) {
      err.hidden = false;
      err.textContent = 'City not found — pick a suggestion from the list.';
      return;
    }
    if (game.guesses.includes(match.id)) {
      err.hidden = false;
      err.textContent = 'You already guessed that city.';
      return;
    }
    game.guesses.push(match.id);
    picked = null;
    input.value = '';
    if (match.id === target.id) {
      game.status = 'won';
      save.stats = recordFinishedGame(save.stats, puzzleNumber, true, game.guesses.length);
    } else if (game.guesses.length >= MAX_GUESSES) {
      game.status = 'lost';
      save.stats = recordFinishedGame(save.stats, puzzleNumber, false, game.guesses.length);
    }
    persist();
    render();
    input.focus();
  });

  // ---- countdown + day rollover ----
  function tickCountdown(): void {
    const ms = msUntilNextPuzzle(clock);
    const text = `Next puzzle in ${fmtCountdown(ms)} (UTC midnight).`;
    root.querySelectorAll('.js-countdown').forEach((n) => {
      n.textContent = text;
    });
  }

  function recheckDay(): void {
    const n = getPuzzleNumber(clock(), LAUNCH_DATE_MS);
    if (n !== todayNumber) {
      todayNumber = n;
      if (!isArchivePlay) puzzleNumber = n;
      render();
    }
    // Keep streak display honest even without a new game.
    save.stats = withValidStreak(save.stats, todayNumber);
  }

  const countdownTimer = window.setInterval(tickCountdown, 1000);
  const dayTimer = window.setInterval(recheckDay, 30_000);
  const onVis = (): void => {
    if (!document.hidden) recheckDay();
  };
  document.addEventListener('visibilitychange', onVis);

  // ---- cross-tab sync ----
  const unsubscribe = onExternalChange((incoming: SaveData) => {
    save = incoming;
    render();
  });

  render();
  if (currentGame().status === 'playing') input.focus();

  // Keep timers alive for the app lifetime; the returned stop function
  // is for HMR/tests.
  return () => {
    window.clearInterval(countdownTimer);
    window.clearInterval(dayTimer);
    window.clearTimeout(resizeT);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    unsubscribe();
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
