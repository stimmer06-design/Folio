const KEY = 'andromeda-assembly-save-v2';

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
    finaleDone: false,
    signal: 0,
    seen: {},
    collection: { decor: {}, codex: {} },
    records: {},
    contracts: [],
    xpBoost: 0,
    flags: {},
    visited: {},
    talked: {},
    talkIdx: {},
    shipments: {},
    history: [],
    achievements: {},
    arcadeHigh: 0,
    musicStyle: 'lofi',
    stats: { orders: 0, perfect: 0, perfects: 0, bestTime: null, earned: 0, stars: 0, qaFails: 0, crates: 0, sGrades: 0 },
    settings: { master: 0.8, music: 0.5, sfx: 0.85, quality: 'ultra', hints: true, shake: true },
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
      seen: { ...(s.seen || {}) },
      records: { ...(s.records || {}) },
      flags: { ...(s.flags || {}) },
      visited: { ...(s.visited || {}) },
      talked: { ...(s.talked || {}) },
      talkIdx: { ...(s.talkIdx || {}) },
      shipments: { ...(s.shipments || {}) },
      achievements: { ...(s.achievements || {}) },
      history: Array.isArray(s.history) ? s.history : [],
      collection: { decor: { ...((s.collection || {}).decor || {}) }, codex: { ...((s.collection || {}).codex || {}) } },
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
