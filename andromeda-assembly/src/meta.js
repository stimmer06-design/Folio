// Meta progression: contracts, supply crates, collection, signal decode.
import { CONTRACTS, DECOR, THEMES, RARITY, TIERS, rankFor } from './catalog.js';
import { CODEX } from './story.js';
import { pick, shuffle } from './util.js';

export function rollContracts(save) {
  const rank = rankFor(save.xp);
  const pool = shuffle(CONTRACTS.filter((c) => !c.minRank || rank >= c.minRank));
  return pool.slice(0, 3).map((c, i) => {
    const n = pick(c.n);
    const hard = n >= c.n[c.n.length - 1] || c.id === 'gradeS' || c.id === 'od3';
    return { id: c.id, text: c.text(n), stat: c.stat, n, progress: 0, done: false, reward: { money: 80 + Math.round(n * 6) + (hard ? 120 : 0), crate: hard ? 'epic' : 'rare' } };
  });
}

// returns newly completed contracts
export function bumpStat(save, stat, amount = 1) {
  const done = [];
  for (const c of save.contracts || []) {
    if (c.done || c.stat !== stat) continue;
    c.progress = Math.min(c.n, c.progress + amount);
    if (c.progress >= c.n) {
      c.done = true;
      done.push(c);
    }
  }
  return done;
}

const ORDER = ['common', 'rare', 'epic', 'legendary'];
const WEIGHTS = {
  S: [35, 40, 18, 7], A: [50, 33, 13, 4], B: [62, 28, 8, 2], C: [72, 23, 4, 1], D: [80, 18, 2, 0],
};
export function rollCrate(grade, scanner = false, min = null) {
  const w = WEIGHTS[grade] || WEIGHTS.C;
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  let i = 0;
  for (; i < 4; i++) {
    r -= w[i];
    if (r <= 0) break;
  }
  i = Math.min(3, i);
  if (scanner && Math.random() < 0.35) i = Math.min(3, i + 1);
  if (min) i = Math.max(i, ORDER.indexOf(min));
  return ORDER[i];
}

const money = (a, b) => a + Math.round(Math.random() * (b - a));

export function openCrate(save, rarity) {
  save.collection = save.collection || { decor: {}, codex: {} };
  const ownedDecor = save.collection.decor;
  const lore = CODEX.filter((c) => c.unlock === 'crate' && !save.collection.codex[c.id]);
  const decorOf = (r) => DECOR.filter((d) => d.rarity === r && !ownedDecor[d.id]);
  const crateThemes = THEMES.filter((t) => t.crate && !save.themes[t.id]);
  const roll = Math.random();
  let reward = null;
  const dec = (d) => ({ kind: 'decor', id: d.id, name: d.name, desc: d.desc, rarity: d.rarity });
  if (rarity === 'legendary') {
    const L = decorOf('legendary');
    if (L.length && roll < 0.7) reward = dec(pick(L));
    else if (crateThemes.length && roll < 0.85) {
      const t = pick(crateThemes);
      reward = { kind: 'theme', id: t.id, name: t.name + ' lighting', desc: 'A legendary workshop lighting theme.', rarity };
    } else if (decorOf('epic').length) reward = dec(pick(decorOf('epic')));
  } else if (rarity === 'epic') {
    const E = decorOf('epic');
    if (E.length && roll < 0.45) reward = dec(pick(E));
    else if (crateThemes.length && roll < 0.65) {
      const t = pick(crateThemes);
      reward = { kind: 'theme', id: t.id, name: t.name + ' lighting', desc: 'A rare workshop lighting theme, only found in crates.', rarity };
    } else if (lore.length && roll < 0.8) {
      const c = pick(lore);
      reward = { kind: 'lore', id: c.id, name: c.title, desc: 'Codex entry recovered from the archive.', rarity };
    }
  } else if (rarity === 'rare') {
    const R = decorOf('rare');
    if (R.length && roll < 0.4) reward = dec(pick(R));
    else if (lore.length && roll < 0.65) {
      const c = pick(lore);
      reward = { kind: 'lore', id: c.id, name: c.title, desc: 'Codex entry recovered from the archive.', rarity };
    } else if (roll < 0.8) reward = { kind: 'xpboost', name: 'Double XP chip', desc: 'Your next build earns double XP.', rarity };
  } else if (roll < 0.2) reward = { kind: 'xpboost', name: 'Double XP chip', desc: 'Your next build earns double XP.', rarity };
  if (!reward) {
    const amt = { common: money(40, 90), rare: money(130, 220), epic: money(320, 460), legendary: money(800, 1100) }[rarity];
    reward = { kind: 'money', amount: amt, name: `${amt.toLocaleString('en-US')} credits`, desc: 'Straight into your wallet.', rarity };
  }
  reward.rarity = reward.rarity || rarity;
  // apply
  if (reward.kind === 'money') save.money += reward.amount;
  else if (reward.kind === 'decor') ownedDecor[reward.id] = true;
  else if (reward.kind === 'theme') save.themes[reward.id] = true;
  else if (reward.kind === 'lore') save.collection.codex[reward.id] = true;
  else if (reward.kind === 'xpboost') save.xpBoost = (save.xpBoost || 0) + 1;
  save.stats.crates = (save.stats.crates || 0) + 1;
  return reward;
}

export function signalGain(order, quality) {
  const idx = Math.max(0, TIERS.findIndex((t) => t.id === order.tier));
  return (1.2 + Math.min(4, idx) * 0.3) * (0.6 + 0.8 * quality);
}

export const SIGNAL_MILESTONES = [10, 25, 40, 55, 70, 85];

export function rarityInfo(r) {
  return RARITY[r] || RARITY.common;
}
