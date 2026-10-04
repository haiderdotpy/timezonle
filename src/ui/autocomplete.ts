import { buildIndex, searchCities, displayName, type City } from '../data/loaders.js';

export interface AutocompleteController {
  destroy(): void;
  clear(): void;
}

/**
 * Wire an input + listbox suggestion dropdown.
 * Keyboard: Enter submits, ArrowUp/Down navigate, Escape closes.
 */
export function attachAutocomplete(
  input: HTMLInputElement,
  list: HTMLUListElement,
  cities: City[],
  onPick: (city: City) => void,
): AutocompleteController {
  const index = buildIndex(cities);
  let items: City[] = [];
  let active = -1;

  function render(): void {
    list.innerHTML = '';
    if (items.length === 0) {
      list.hidden = true;
      return;
    }
    list.hidden = false;
    items.forEach((c, i) => {
      const li = document.createElement('li');
      li.id = `sugg-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === active));
      li.textContent = displayName(c, index.nameCounts);
      li.addEventListener('mousedown', (e) => {
        // mousedown fires before blur; pick immediately.
        e.preventDefault();
        onPick(c);
      });
      list.appendChild(li);
    });
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute(
      'aria-activedescendant',
      active >= 0 ? `sugg-${active}` : '',
    );
  }

  function update(): void {
    items = searchCities(index, input.value, 8);
    active = items.length > 0 ? 0 : -1;
    render();
  }

  function clear(): void {
    items = [];
    active = -1;
    list.innerHTML = '';
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  const onInput = (): void => update();
  const onBlur = (): void => {
    // Delay so click/mousedown on a suggestion still lands.
    window.setTimeout(clear, 120);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown' && items.length > 0) {
      e.preventDefault();
      active = (active + 1) % items.length;
      render();
    } else if (e.key === 'ArrowUp' && items.length > 0) {
      e.preventDefault();
      active = (active - 1 + items.length) % items.length;
      render();
    } else if (e.key === 'Escape') {
      clear();
    } else if (e.key === 'Enter') {
      if (active >= 0 && items[active]) {
        e.preventDefault();
        onPick(items[active]);
      }
    }
  };

  input.addEventListener('input', onInput);
  input.addEventListener('blur', onBlur);
  input.addEventListener('keydown', onKey);

  return {
    destroy() {
      input.removeEventListener('input', onInput);
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('keydown', onKey);
    },
    clear,
  };
}
