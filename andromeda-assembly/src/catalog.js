// All game data: parts, tiers, ranks, upgrades, cosmetics, contracts, crates.

export const BRAND = 'Andromeda Insights';

const def = (cat, list) => {
  const out = {};
  for (const p of list) out[p.id] = { cat, ...p };
  return out;
};

export const MBS = def('mb', [
  { id: 'mb', name: 'Andromeda AX-1', short: 'AX-1 Board', spec: 'ATX motherboard · Wi-Fi 7' },
]);

export const CPUS = def('cpu', [
  { id: 'orion3', name: 'Orion 3', short: 'Orion 3', spec: '4 cores · 3.8 GHz', color: '#38bdf8', rank: 0 },
  { id: 'orion5', name: 'Orion 5', short: 'Orion 5', spec: '6 cores · 4.4 GHz', color: '#34d399', rank: 1 },
  { id: 'orion7', name: 'Orion 7', short: 'Orion 7', spec: '8 cores · 5.0 GHz', color: '#fb923c', rank: 2 },
  { id: 'orion9', name: 'Orion 9', short: 'Orion 9', spec: '16 cores · 5.6 GHz', color: '#f43f5e', rank: 3 },
  { id: 'orionx', name: 'Orion X', short: 'Orion X', spec: '32 cores · workstation', color: '#facc15', rank: 4 },
  { id: 'singularity', name: 'Singularity', short: 'Singularity', spec: '∞ cores · Lighthouse silicon', color: '#f0abfc', rank: 9, legendary: true },
]);

export const COOLERS = def('cooler', [
  { id: 'stock', name: 'Halo Low-Profile', short: 'Halo LP', spec: 'Compact air cooler', kind: 'stock', rank: 0 },
  { id: 'tower', name: 'Comet Tower', short: 'Comet Tower', spec: 'Single-tower air cooler', kind: 'tower', rank: 1 },
  { id: 'aio240', name: 'Nebula 240', short: 'Nebula 240', spec: '240 mm liquid cooler', kind: 'aio', fans: 2, len: 2.4, rank: 2 },
  { id: 'aio360', name: 'Nebula 360', short: 'Nebula 360', spec: '360 mm liquid cooler', kind: 'aio', fans: 3, len: 3.4, rank: 3 },
  { id: 'halo', name: 'Event Halo', short: 'Event Halo', spec: 'Cryo-loop · Lighthouse grade', kind: 'aio', fans: 3, len: 3.4, rank: 9, legendary: true },
]);

export const RAMS = def('ram', [
  { id: 'r16', name: 'Stellar 16 GB', short: '16 GB', spec: '2 × 8 GB DDR5-5600', color: '#a7adb8', rank: 0 },
  { id: 'r32', name: 'Stellar 32 GB', short: '32 GB', spec: '2 × 16 GB DDR5-6000', color: '#23262f', rank: 1 },
  { id: 'r64', name: 'Stellar 64 GB', short: '64 GB', spec: '2 × 32 GB DDR5-6400', color: '#eceef3', rank: 2 },
  { id: 'r128', name: 'Stellar 128 GB', short: '128 GB', spec: '2 × 64 GB DDR5 ECC', color: '#6d4ad6', rank: 3 },
  { id: 'rpulsar', name: 'Pulsar Array', short: 'Pulsar Array', spec: '1 TB resonant memory', color: '#e9d5ff', rank: 9, legendary: true },
]);

export const SSDS = def('ssd', [
  { id: 's512', name: 'Vega 512 GB', short: '512 GB', spec: 'NVMe Gen4 SSD', color: '#60a5fa', rank: 0 },
  { id: 's1', name: 'Vega 1 TB', short: '1 TB', spec: 'NVMe Gen4 SSD', color: '#34d399', rank: 1 },
  { id: 's2', name: 'Vega 2 TB', short: '2 TB', spec: 'NVMe Gen4 SSD', color: '#f472b6', rank: 2 },
  { id: 's4', name: 'Vega 4 TB', short: '4 TB', spec: 'NVMe Gen5 · heatsink', color: '#facc15', heatsink: true, rank: 3 },
  { id: 'squantum', name: 'Quantum Vault', short: 'Q-Vault', spec: 'Entangled storage', color: '#f0abfc', heatsink: true, rank: 9, legendary: true },
]);

export const GPUS = def('gpu', [
  { id: 'p60', name: 'Pulsar 60', short: 'Pulsar 60', spec: '8 GB · dual fan', len: 2.2, fans: 2, thick: 0.45, body: '#2b303b', accent: '#2dd4bf', rank: 0 },
  { id: 'p70', name: 'Pulsar 70', short: 'Pulsar 70', spec: '12 GB · dual fan', len: 2.5, fans: 2, thick: 0.5, body: '#353b48', accent: '#38bdf8', rank: 1 },
  { id: 'q80', name: 'Quasar 80', short: 'Quasar 80', spec: '16 GB · triple fan', len: 2.8, fans: 3, thick: 0.6, body: '#17181e', accent: '#a78bfa', rank: 2 },
  { id: 'q90', name: 'Quasar 90', short: 'Quasar 90', spec: '24 GB · triple fan', len: 3.0, fans: 3, thick: 0.7, body: '#101015', accent: '#f0abfc', rank: 3 },
  { id: 'horizon', name: 'Event Horizon', short: 'Horizon', spec: 'Lighthouse array card', len: 3.0, fans: 3, thick: 0.72, body: '#0b0816', accent: '#facc15', rank: 9, legendary: true },
]);

export const PSUS = def('psu', [
  { id: 'w550', name: 'Photon 550 W', short: '550 W', spec: '80+ Bronze', color: '#c8834a', rank: 0 },
  { id: 'w750', name: 'Photon 750 W', short: '750 W', spec: '80+ Gold', color: '#e0b84a', rank: 1 },
  { id: 'w850', name: 'Photon 850 W', short: '850 W', spec: '80+ Gold · modular', color: '#e0b84a', rank: 2 },
  { id: 'w1000', name: 'Photon 1000 W', short: '1000 W', spec: '80+ Platinum', color: '#d9dde4', rank: 3 },
  { id: 'w1200', name: 'Photon 1200 W', short: '1200 W', spec: '80+ Titanium', color: '#8fb3c9', rank: 4 },
  { id: 'zeropoint', name: 'Zero-Point', short: 'Zero-Point', spec: 'Vacuum-energy cell', color: '#f0abfc', rank: 9, legendary: true },
]);

export const PARTS = { ...MBS, ...CPUS, ...COOLERS, ...RAMS, ...SSDS, ...GPUS, ...PSUS };
export const BY_CAT = { mb: MBS, cpu: CPUS, cooler: COOLERS, ram: RAMS, ssd: SSDS, gpu: GPUS, psu: PSUS };

export const CATS = ['mb', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu'];
export const CAT_LABEL = {
  mb: 'Board', cpu: 'Processor', cooler: 'Cooler', ram: 'Memory', ssd: 'Storage', gpu: 'Graphics', psu: 'Power',
};
export const CAT_COLOR = {
  mb: '#94a3b8', cpu: '#fb923c', cooler: '#38bdf8', ram: '#a78bfa', ssd: '#f472b6', gpu: '#34d399', psu: '#facc15',
};

export const CASES = [
  { id: 'nova', name: 'Nova Black', body: '#1a1c24', frame: '#0e0f15', accent: '#2a2d38' },
  { id: 'lumen', name: 'Lumen White', body: '#e6e9f0', frame: '#cdd2dc', accent: '#f5f6f9' },
  { id: 'eclipse', name: 'Eclipse Violet', body: '#2b2342', frame: '#1b1630', accent: '#3a2f5c' },
  { id: 'titan', name: 'Titan Gunmetal', body: '#3a3f4a', frame: '#23262e', accent: '#4b5260' },
  { id: 'lighthouse', name: 'Lighthouse Core', body: '#14101f', frame: '#0a0812', accent: '#facc15', legendary: true },
];

export const TIERS = [
  { id: 'office', name: 'Office', minRank: 1, pay: 90, color: '#38bdf8', bench: 12000,
    cpu: ['orion3', 'orion5'], cooler: ['stock'], ram: ['r16'], ssd: ['s512', 's1'], gpu: [null], psu: ['w550'] },
  { id: 'gaming', name: 'Gaming', minRank: 2, pay: 150, color: '#34d399', bench: 38000,
    cpu: ['orion5', 'orion7'], cooler: ['tower'], ram: ['r32'], ssd: ['s1', 's2'], gpu: ['p60', 'p70'], psu: ['w750'] },
  { id: 'creator', name: 'Creator', minRank: 4, pay: 210, color: '#f472b6', bench: 61000,
    cpu: ['orion7', 'orion9'], cooler: ['aio240', 'tower'], ram: ['r64', 'r32'], ssd: ['s2'], gpu: ['p70', 'q80'], psu: ['w850'] },
  { id: 'enthusiast', name: 'Enthusiast', minRank: 5, pay: 270, color: '#a78bfa', bench: 88000,
    cpu: ['orion9'], cooler: ['aio360', 'aio240'], ram: ['r64'], ssd: ['s2', 's4'], gpu: ['q90'], psu: ['w1000'] },
  { id: 'workstation', name: 'Workstation', minRank: 7, pay: 330, color: '#facc15', bench: 104000,
    cpu: ['orionx'], cooler: ['aio360'], ram: ['r128'], ssd: ['s4'], gpu: ['q80', 'q90'], psu: ['w1200'] },
  { id: 'lighthouse', name: 'Lighthouse Core', minRank: 99, pay: 2500, color: '#f0abfc', bench: 999999, special: true,
    cpu: ['singularity'], cooler: ['halo'], ram: ['rpulsar'], ssd: ['squantum'], gpu: ['horizon'], psu: ['zeropoint'] },
];

export const RANKS = [
  { name: 'Cadet Builder', xp: 0, unlock: 'Office builds' },
  { name: 'Builder', xp: 150, unlock: 'Gaming builds · look-alike parts on the pads' },
  { name: 'Senior Builder', xp: 380, unlock: 'Rush orders · keyboards & mice in the box' },
  { name: 'Technician', xp: 700, unlock: 'Creator builds · custom RGB requests' },
  { name: 'Senior Technician', xp: 1100, unlock: 'Enthusiast builds · more look-alikes' },
  { name: 'Forge Specialist', xp: 1600, unlock: 'Longer shifts · bigger tips' },
  { name: 'Lead Builder', xp: 2200, unlock: 'Workstation builds for observatories' },
  { name: 'Master Builder', xp: 2900, unlock: 'VIP customers' },
  { name: 'Forgemaster', xp: 3700, unlock: 'Top-tier tips · the Array awaits' },
  { name: 'Lighthouse Keeper', xp: 4600, unlock: 'The Lighthouse Core order' },
];

export function rankFor(xp) {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) r = i;
  return r + 1; // 1-based
}

export const UPGRADES = [
  { id: 'optics', name: 'Precision Optics', price: 160, icon: '🎯', desc: 'Visor overlay that makes the PERFECT zone for every placement 60% bigger.' },
  { id: 'driver', name: 'Power Driver', price: 200, icon: '🔩', desc: 'One hold drives every screw on a part, and the torque sweet-spot is wider.' },
  { id: 'pastegun', name: 'Smart Paste Gun', price: 180, icon: '💉', desc: 'Dispenses a perfect pea of thermal paste with a single click.' },
  { id: 'flapper', name: 'Flap Folder', price: 140, icon: '📦', desc: 'Fold all four box flaps with a single click — always counts as a speed fold.' },
  { id: 'labeler', name: 'Auto Labeler', price: 170, icon: '🏷️', desc: 'Labels stamp themselves dead-centre the moment the box is sealed.' },
  { id: 'tapegun', name: 'Tape Gun', price: 230, icon: '🎞️', desc: 'Click the seam once for a laser-straight seal.' },
  { id: 'cablecomb', name: 'Cable Comb', price: 260, icon: '🔌', desc: 'Grab any cable and every ready cable routes itself, perfectly tidy.' },
  { id: 'capacitor', name: 'Overdrive Capacitor', price: 320, icon: '⚡', desc: 'Your Flow window lasts 1.5 seconds longer. Keep the chain alive.' },
  { id: 'espresso', name: 'Espresso Machine', price: 300, icon: '☕', desc: 'Par times are 20% more relaxed. ORIN disapproves of caffeine.' },
  { id: 'gloves', name: 'Magnetic Gloves', price: 480, icon: '🧤', desc: 'Click a part on its pad and it flies straight into its slot.' },
  { id: 'scanner', name: 'Crate Scanner', price: 420, icon: '📡', desc: 'Supply crates roll one rarity tier higher, more often.' },
  { id: 'loyalty', name: 'Loyalty Program', price: 650, icon: '💜', desc: 'Happy colonists pay 15% more for every build.' },
];

export const THEMES = [
  { id: 'violet', name: 'Andromeda Violet', price: 0, a: '#8b5cf6', b: '#22d3ee' },
  { id: 'amber', name: 'Solar Amber', price: 150, a: '#f59e0b', b: '#f43f5e' },
  { id: 'teal', name: 'Nebula Teal', price: 150, a: '#14b8a6', b: '#a3e635' },
  { id: 'crimson', name: 'Red Giant', price: 200, a: '#ef4444', b: '#f97316' },
  { id: 'ice', name: 'Comet Ice', price: 200, a: '#60a5fa', b: '#e0f2fe' },
  { id: 'supernova', name: 'Supernova', price: -1, a: '#ec4899', b: '#facc15', crate: true },
  { id: 'horizon', name: 'Event Horizon', price: -1, a: '#f8fafc', b: '#a855f7', crate: true },
];

// Collectible workshop decor — dropped by supply crates, displayed around the bench.
export const DECOR = [
  { id: 'bonsai', name: 'Zero-G Bonsai', rarity: 'rare', desc: 'Grows sideways when nobody is looking.' },
  { id: 'duck', name: 'Debug Duck', rarity: 'rare', desc: 'Explain your bug to the duck. The duck understands.' },
  { id: 'mug', name: '"Best Builder" Mug', rarity: 'rare', desc: 'Still warm. Somehow always still warm.' },
  { id: 'lava', name: 'Plasma Lamp', rarity: 'rare', desc: 'Contains actual plasma. Do not lick.' },
  { id: 'globe', name: 'Saturn Globe', rarity: 'epic', desc: 'A desk-sized Saturn, rings and all.' },
  { id: 'astro', name: 'Astronaut Figurine', rarity: 'epic', desc: 'A tiny explorer, forever mid-wave.' },
  { id: 'crt', name: 'Retro CRT', rarity: 'epic', desc: 'Plays the founder\'s favourite screensaver on loop.' },
  { id: 'cat', name: 'Holo-Cat "Byte"', rarity: 'epic', desc: 'A holographic cat. Ignores you, like a real one.' },
  { id: 'trophy', name: 'Golden Wrench', rarity: 'legendary', desc: 'Awarded to builders whose hands never shake.' },
  { id: 'shard', name: 'Signal Shard', rarity: 'legendary', desc: 'A crystal that hums at the frequency of the Whisper.' },
];

export const RARITY = {
  common: { name: 'Common', color: '#94a3b8', glow: '#cbd5e1' },
  rare: { name: 'Rare', color: '#38bdf8', glow: '#7dd3fc' },
  epic: { name: 'Epic', color: '#a855f7', glow: '#d8b4fe' },
  legendary: { name: 'Legendary', color: '#f59e0b', glow: '#fde68a' },
};

export const RGB_COLORS = [
  { id: 'violet', name: 'Violet', hex: '#8b5cf6' },
  { id: 'cyan', name: 'Cyan', hex: '#22d3ee' },
  { id: 'magenta', name: 'Magenta', hex: '#ec4899' },
  { id: 'amber', name: 'Amber', hex: '#f59e0b' },
  { id: 'emerald', name: 'Emerald', hex: '#10b981' },
  { id: 'rainbow', name: 'Rainbow Wave', hex: null },
];

export const PERIPHERALS = {
  keyboard: { id: 'keyboard', name: 'Andromeda K1 Keyboard' },
  mouse: { id: 'mouse', name: 'Andromeda M1 Mouse' },
};

// Judgement tiers used by every skill action
export const JUDGE = {
  perfect: { label: 'PERFECT', score: 1, cls: 'perfect' },
  great: { label: 'GREAT', score: 0.82, cls: 'great' },
  good: { label: 'GOOD', score: 0.62, cls: 'good' },
  sloppy: { label: 'SLOPPY', score: 0.35, cls: 'sloppy' },
};

export const GRADES = [
  { id: 'S', min: 0.95, color: '#facc15', name: 'Flawless', mult: 1.35 },
  { id: 'A', min: 0.85, color: '#4ade80', name: 'Excellent', mult: 1.2 },
  { id: 'B', min: 0.72, color: '#38bdf8', name: 'Solid', mult: 1.08 },
  { id: 'C', min: 0.55, color: '#a78bfa', name: 'Passable', mult: 1.0 },
  { id: 'D', min: 0, color: '#f87171', name: 'Rough', mult: 0.9 },
];
export function gradeFor(q, qaFails = 0) {
  for (const g of GRADES) if (q >= g.min && !(g.id === 'S' && qaFails > 0)) return g;
  return GRADES[GRADES.length - 1];
}

export const OVERDRIVE = [
  { tier: 0, at: 0, name: '', mult: 1 },
  { tier: 1, at: 5, name: 'OVERDRIVE I', mult: 1.1, color: '#22d3ee' },
  { tier: 2, at: 12, name: 'OVERDRIVE II', mult: 1.25, color: '#a855f7' },
  { tier: 3, at: 20, name: 'OVERDRIVE III', mult: 1.5, color: '#facc15' },
];

// Daily contracts: each shift rolls three.
export const CONTRACTS = [
  { id: 'perfects', text: (n) => `Land ${n} PERFECT actions`, stat: 'perfect', n: [12, 18, 25] },
  { id: 'screws', text: (n) => `Drive ${n} screws with perfect torque`, stat: 'perfectScrew', n: [6, 10, 14] },
  { id: 'paste', text: (n) => `Apply perfect thermal paste ×${n}`, stat: 'perfectPaste', n: [2, 3] },
  { id: 'cables', text: (n) => `Route ${n} cables perfectly`, stat: 'perfectCable', n: [3, 5, 7] },
  { id: 'tape', text: (n) => `Seal ${n} boxes with a perfect tape run`, stat: 'perfectTape', n: [2, 3] },
  { id: 'stamp', text: (n) => `Stamp ${n} labels dead-centre`, stat: 'perfectStamp', n: [2, 3] },
  { id: 'od2', text: () => 'Reach OVERDRIVE II', stat: 'od2', n: [1] },
  { id: 'od3', text: () => 'Reach OVERDRIVE III', stat: 'od3', n: [1], minRank: 3 },
  { id: 'gradeA', text: (n) => `Ship ${n} builds graded A or better`, stat: 'gradeA', n: [2, 3] },
  { id: 'gradeS', text: () => 'Ship an S-grade build', stat: 'gradeS', n: [1] },
  { id: 'par', text: () => 'Beat par by 20 seconds', stat: 'parBy20', n: [1], minRank: 2 },
  { id: 'card', text: (n) => `Include ${n} thank-you cards`, stat: 'card', n: [2, 3] },
];

export const FIRST = ['Priya', 'Mateo', 'Aiko', 'Jonas', 'Fatima', 'Liam', 'Zara', 'Kofi', 'Elena', 'Ravi', 'Noor', 'Theo', 'Mia', 'Diego', 'Hana', 'Oskar', 'Leila', 'Sam', 'Ines', 'Yusuf', 'Chloe', 'Arjun', 'Freya', 'Tomas', 'Amara', 'Kenji', 'Sofia', 'Malik', 'Ivy', 'Luca'];
export const LAST = ['Nair', 'Okafor', 'Tanaka', 'Berg', 'Haddad', 'Walsh', 'Rossi', 'Mensah', 'Novak', 'Iyer', 'Costa', 'Kim', 'Laurent', 'Silva', 'Moreau', 'Lindqvist', 'Ahmed', 'Park', 'Fischer', 'Duarte', 'Brooks', 'Quinn', 'Sato', 'Kowalski', 'Reyes'];
// Colonies across the Sol system (year 2291)
export const CITIES = ['New Lisbon, Mars', 'Olympus Dome, Mars', 'Ceres Station', 'Vesta Yards', 'Europa Deep Lab', 'Ganymede Ring', 'Titan Haven', 'Callisto Port', 'Luna Tycho', 'Earth · Osaka Arcology', 'Earth · Nairobi Spire', 'Earth · Reykjavík', 'Phobos Relay', 'Enceladus Vents', 'Pallas Outpost', 'Io Foundry', 'Triton Watch', 'Halley Drift'];
export const STREETS = ['Dome 4, Ring B', 'Hab Block 12', 'Dock 9', 'Sector Kappa', 'Spoke 3', 'Corridor 41', 'Greenhouse Row', 'Arcology L88', 'Pier 2', 'Crater Rim 7'];

export const NOTES = {
  office: ['Need it for the hydroponics ledger. Lettuce waits for no one.', 'Grandma on Luna wants to video call the whole family.', 'Replacing a terminal from 2240. Be gentle with me.', 'For my bakery\'s books — first bakery on Ceres!', 'Spreadsheets, calls, zero drama.'],
  gaming: ['First gaming rig for my daughter! She\'s been saving since the solar flare.', 'Long haul to Jupiter — need something for the 9-month trip.', 'Late-night raids with the dome crew.', 'I stream from the Europa ice station. Make it pretty.', 'The new open-world sim drops next cycle!'],
  creator: ['Editing footage of the Martian dust storms.', 'Composing the first opera written on Titan.', 'Building a 3D portfolio for the Ganymede art academy.', 'Our podcast covers belt-mining gossip. It\'s a lot of gossip.'],
  enthusiast: ['Go big or go home. Home is a hab module, so: go big.', 'Benchmarks or it didn\'t happen.', 'Sim-racing rig for the Olympus league finals.', 'Max settings. All of them. In zero-g.'],
  workstation: ['Listening post on Triton — we need to process array data.', 'Rendering the planetarium show for the Luna museum.', 'Machine-learning crop models for Mars terraforming.', 'Our observatory keeps hearing… something. Need more compute.'],
  lighthouse: ['This is it. Build it like the galaxy is listening — because it is.'],
};

export const REVIEWS = {
  S: ['Opened the box and actually teared up. Flawless.', 'Cable management so clean I framed a photo of it.', 'Benchmarks off the charts. Who built this? Give them a raise.', 'Perfect. Ten stars. The crate smelled like starlight.'],
  A: ['Gorgeous build, booted first try. Love the card!', 'Runs cool and quiet even in the dome heatwave.', 'Fast shipping all the way to the belt. Impressed.'],
  B: ['Solid machine. Does exactly what I need.', 'Works great. Tape was a little wonky, but who cares!', 'Good build, arrived safely past the asteroid fields.'],
  C: ['It works. Box looked like it fought a meteor.', 'Took a bit to get set up but it runs fine.'],
  D: ['It boots… eventually. I\'ve seen tidier hab modules.', 'Arrived. Functional. ORIN would not be proud.'],
};

// ---------------------------------------------------------------- station / exploration
export const ROOM_IDS = ['bay', 'corridor', 'shop', 'observatory', 'lounge', 'core', 'hangar'];

// which body on the hangar's Sol map each colony belongs to
export const COLONY_BODY = {
  'New Lisbon, Mars': 'mars', 'Olympus Dome, Mars': 'mars', 'Phobos Relay': 'mars',
  'Ceres Station': 'belt', 'Vesta Yards': 'belt', 'Pallas Outpost': 'belt',
  'Europa Deep Lab': 'jupiter', 'Ganymede Ring': 'jupiter', 'Callisto Port': 'jupiter', 'Io Foundry': 'jupiter',
  'Titan Haven': 'saturn', 'Enceladus Vents': 'saturn', 'Forge-7 · Titan orbit': 'saturn',
  'Luna Tycho': 'earth', 'Earth · Osaka Arcology': 'earth', 'Earth · Nairobi Spire': 'earth', 'Earth · Reykjavík': 'earth',
  'Triton Watch': 'neptune', 'Halley Drift': 'neptune',
};
export const BODIES = [
  { id: 'mercury', name: 'Mercury', color: '#a8a29e' }, { id: 'venus', name: 'Venus', color: '#fcd34d' },
  { id: 'earth', name: 'Earth & Luna', color: '#60a5fa' }, { id: 'mars', name: 'Mars & Phobos', color: '#f87171' },
  { id: 'belt', name: 'Asteroid Belt', color: '#94a3b8' }, { id: 'jupiter', name: 'Jovian moons', color: '#fdba74' },
  { id: 'saturn', name: 'Saturn system', color: '#fde68a' }, { id: 'neptune', name: 'Outer system', color: '#818cf8' },
];

export const MUSIC_STYLES = [
  { id: 'lofi', name: 'Orbit Lo-fi' },
  { id: 'synth', name: 'Synthwave Drive' },
  { id: 'ambient', name: 'Nebula Ambient' },
];

export const ACHIEVEMENTS = [
  { id: 'first', name: 'First Light', desc: 'Ship your first machine.', check: (s) => s.stats.orders >= 1 },
  { id: 'b10', name: 'Getting the Hang of It', desc: 'Ship 10 machines.', check: (s) => s.stats.orders >= 10 },
  { id: 'b50', name: 'Assembly Line', desc: 'Ship 50 machines.', check: (s) => s.stats.orders >= 50 },
  { id: 'b100', name: 'Centurion', desc: 'Ship 100 machines.', check: (s) => s.stats.orders >= 100 },
  { id: 's1', name: 'Flawless', desc: 'Earn an S grade.', check: (s) => (s.stats.sGrades || 0) >= 1 },
  { id: 's10', name: 'Perfectionist', desc: 'Earn 10 S grades.', check: (s) => (s.stats.sGrades || 0) >= 10 },
  { id: 'p100', name: 'Steady Hands', desc: 'Land 100 PERFECT actions.', check: (s) => (s.stats.perfects || 0) >= 100 },
  { id: 'p1000', name: 'Surgeon', desc: 'Land 1,000 PERFECT actions.', check: (s) => (s.stats.perfects || 0) >= 1000 },
  { id: 'od3', name: 'Redline', desc: 'Reach OVERDRIVE III.', check: (s) => !!s.flags.od3 },
  { id: 'legend', name: 'Jackpot', desc: 'Open a legendary supply crate.', check: (s) => !!s.flags.legendary },
  { id: 'tools', name: 'Fully Kitted', desc: 'Own every tool upgrade.', check: (s) => UPGRADES.every((u) => s.upgrades[u.id]) },
  { id: 'decor', name: 'Collector', desc: 'Collect every decor piece.', check: (s) => DECOR.every((d) => s.collection && s.collection.decor[d.id]) },
  { id: 'themes', name: 'Interior Designer', desc: 'Own every lighting theme.', check: (s) => THEMES.every((t) => s.themes[t.id]) },
  { id: 'speed', name: 'Speed Demon', desc: 'Beat par by 60 seconds.', check: (s) => !!s.flags.speed },
  { id: 'bench', name: 'Benchmark Breaker', desc: 'Score 100,000 on a stress test.', check: (s) => Object.values(s.records || {}).some((v) => v >= 100000) },
  { id: 'sig50', name: 'Halfway There', desc: 'Decode 50% of the Whisper.', check: (s) => (s.signal || 0) >= 50 },
  { id: 'finale', name: 'Lighthouse Keeper', desc: 'Answer the Whisper.', check: (s) => !!s.finaleDone },
  { id: 'arcade', name: 'High Score', desc: 'Score 5,000 in Pod Runner.', check: (s) => (s.arcadeHigh || 0) >= 5000 },
  { id: 'scope', name: 'First Contact', desc: 'Lock the signal in the observatory telescope.', check: (s) => !!s.flags.scope },
  { id: 'explorer', name: 'Stretch Your Legs', desc: 'Visit every room on the deck.', check: (s) => ROOM_IDS.every((r) => s.visited && s.visited[r]) },
  { id: 'social', name: 'Crew Member', desc: 'Talk to everyone aboard.', check: (s) => ['orin', 'sela', 'juno', 'pip'].every((w) => s.talked && s.talked[w]) },
  { id: 'rich', name: 'Credit Baron', desc: 'Earn 25,000 credits in total.', check: (s) => s.stats.earned >= 25000 },
  { id: 'rush', name: 'Rush Hour', desc: 'Complete 5 rush orders.', check: (s) => (s.stats.rush || 0) >= 5 },
  { id: 'dj', name: 'Station DJ', desc: 'Change the station music on the jukebox.', check: (s) => !!s.flags.dj },
];
