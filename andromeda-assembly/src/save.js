const KEY = 'andromeda-assembly-save-v1';

export function defaultSave() {
  return {
    v: 1,
    started: false,
    money: 0,
    xp: 0,
    day: 1,
    orderInDay: 0,
    dayStats: null,
    upgrades: {},
    themes: { violet: true },
    theme: 'violet',
    careerDone: false,
    stats: { orders: 0, perfect: 0, bestTime: null, earned: 0, stars: 0, qaFails: 0 },
    settings: { master: 0.8, music: 0.45, sfx: 0.85, quality: 'high', hints: true },
  };
}

export function loadSave() {
  const d = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    return {
      ...d,
      ...s,
      stats: { ...d.stats, ...(s.stats || {}) },
      settings: { ...d.settings, ...(s.settings || {}) },
      upgrades: { ...(s.upgrades || {}) },
      themes: { ...d.themes, ...(s.themes || {}) },
    };
  } catch (e) {
    return d;
  }
}

export function writeSave(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    /* storage may be unavailable (private mode) — the game still works */
  }
}

export function wipeSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {}
}
