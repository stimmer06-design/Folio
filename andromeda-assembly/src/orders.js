import { TIERS, BY_CAT, PARTS, CASES, RGB_COLORS, FIRST, LAST, CITIES, STREETS, NOTES, rankFor } from './catalog.js';
import { pick, shuffle } from './util.js';

export function dayLength(day) {
  if (day <= 1) return 3;
  if (day <= 3) return 4;
  if (day <= 6) return 5;
  return 6;
}

// Count of player actions for the build, without any upgrades. Used for par time.
export function baseActions(order) {
  let a = 1 + 4 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 2 + 1 + 1; // mb, screws, cpu, lever, cooler, ram, ssd, ssd screw, psu, 2 cables, panel, power
  if (order.parts.gpu) a += 3; // gpu, screw, cable
  a += 1 + 1 + 1 + 4 + 1 + 1 + 1; // pc in box, foam, kit, flaps, tape, label, ship
  a += order.peripherals.length;
  if (order.rgb) a += 1;
  return a;
}

export function generateOrder(save, { tutorial = false } = {}) {
  const rank = rankFor(save.xp);
  const unlocked = TIERS.filter((t) => t.minRank <= rank);
  let tier;
  if (tutorial) tier = TIERS[0];
  else {
    // favour the newest tiers, but keep variety
    const weights = unlocked.map((t, i) => 1 + i * 1.4);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    tier = unlocked[0];
    for (let i = 0; i < unlocked.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        tier = unlocked[i];
        break;
      }
    }
  }
  const parts = {
    mb: 'mb',
    cpu: pick(tier.cpu),
    cooler: pick(tier.cooler),
    ram: pick(tier.ram),
    ssd: pick(tier.ssd),
    gpu: pick(tier.gpu),
    psu: pick(tier.psu),
  };

  const peripherals = [];
  if (!tutorial && rank >= 3) {
    if (Math.random() < 0.4) peripherals.push('keyboard');
    if (Math.random() < 0.4) peripherals.push('mouse');
  }
  let rgb = null;
  if (!tutorial && rank >= 4 && (tier.id === 'enthusiast' || tier.id === 'workstation' || Math.random() < 0.55) && tier.id !== 'office') {
    rgb = pick(RGB_COLORS).id;
  }
  const rush = !tutorial && rank >= 3 && Math.random() < 0.22;
  const vip = !tutorial && rank >= 8 && Math.random() < 0.25;

  // look-alike decoys on the rack
  let nDecoys = tutorial ? 0 : rank <= 1 ? 0 : rank === 2 ? 1 : rank <= 4 ? 2 : 3;
  const decoys = [];
  const cats = shuffle(['cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu'].filter((c) => parts[c]));
  for (const c of cats) {
    if (decoys.length >= nDecoys) break;
    const opts = Object.values(BY_CAT[c]).filter((p) => p.id !== parts[c]);
    if (!opts.length) continue;
    // prefer neighbours in the lineup (they look the most similar)
    const cur = PARTS[parts[c]].rank;
    opts.sort((a, b) => Math.abs(a.rank - cur) - Math.abs(b.rank - cur));
    const near = opts.slice(0, 2);
    decoys.push(pick(near).id);
  }

  const first = pick(FIRST), last = pick(LAST);
  const no = 'A-' + (1001 + (save.stats.orders || 0));
  return {
    no,
    seed: 1 + Math.floor(Math.random() * 99999),
    tier: tier.id,
    tierName: tier.name,
    tierColor: tier.color,
    pay: Math.round(tier.pay * (vip ? 1.4 : 1)),
    customer: `${first} ${last[0]}.`,
    customerFull: `${first} ${last}`,
    address: `${10 + Math.floor(Math.random() * 280)} ${pick(STREETS)}`,
    city: pick(CITIES),
    note: tutorial ? 'Training build — take your time and follow the prompts!' : pick(NOTES[tier.id]),
    caseVariant: tutorial ? CASES[0] : pick(CASES),
    parts,
    decoys,
    peripherals,
    rgb,
    rush,
    vip,
    tutorial,
  };
}
