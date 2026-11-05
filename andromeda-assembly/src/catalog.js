// All game data: parts, order tiers, ranks, upgrades, cosmetic themes.

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
]);

export const COOLERS = def('cooler', [
  { id: 'stock', name: 'Halo Low-Profile', short: 'Halo LP', spec: 'Compact air cooler', kind: 'stock', rank: 0 },
  { id: 'tower', name: 'Comet Tower', short: 'Comet Tower', spec: 'Single-tower air cooler', kind: 'tower', rank: 1 },
  { id: 'aio240', name: 'Nebula 240', short: 'Nebula 240', spec: '240 mm liquid cooler', kind: 'aio', fans: 2, len: 2.4, rank: 2 },
  { id: 'aio360', name: 'Nebula 360', short: 'Nebula 360', spec: '360 mm liquid cooler', kind: 'aio', fans: 3, len: 3.4, rank: 3 },
]);

export const RAMS = def('ram', [
  { id: 'r16', name: 'Stellar 16 GB', short: '16 GB', spec: '2 × 8 GB DDR5-5600', color: '#a7adb8', rank: 0 },
  { id: 'r32', name: 'Stellar 32 GB', short: '32 GB', spec: '2 × 16 GB DDR5-6000', color: '#23262f', rank: 1 },
  { id: 'r64', name: 'Stellar 64 GB', short: '64 GB', spec: '2 × 32 GB DDR5-6400', color: '#eceef3', rank: 2 },
  { id: 'r128', name: 'Stellar 128 GB', short: '128 GB', spec: '2 × 64 GB DDR5 ECC', color: '#6d4ad6', rank: 3 },
]);

export const SSDS = def('ssd', [
  { id: 's512', name: 'Vega 512 GB', short: '512 GB', spec: 'NVMe Gen4 SSD', color: '#60a5fa', rank: 0 },
  { id: 's1', name: 'Vega 1 TB', short: '1 TB', spec: 'NVMe Gen4 SSD', color: '#34d399', rank: 1 },
  { id: 's2', name: 'Vega 2 TB', short: '2 TB', spec: 'NVMe Gen4 SSD', color: '#f472b6', rank: 2 },
  { id: 's4', name: 'Vega 4 TB', short: '4 TB', spec: 'NVMe Gen5 · heatsink', color: '#facc15', heatsink: true, rank: 3 },
]);

export const GPUS = def('gpu', [
  { id: 'p60', name: 'Pulsar 60', short: 'Pulsar 60', spec: '8 GB · dual fan', len: 2.2, fans: 2, thick: 0.45, body: '#2b303b', accent: '#2dd4bf', rank: 0 },
  { id: 'p70', name: 'Pulsar 70', short: 'Pulsar 70', spec: '12 GB · dual fan', len: 2.5, fans: 2, thick: 0.5, body: '#353b48', accent: '#38bdf8', rank: 1 },
  { id: 'q80', name: 'Quasar 80', short: 'Quasar 80', spec: '16 GB · triple fan', len: 2.8, fans: 3, thick: 0.6, body: '#17181e', accent: '#a78bfa', rank: 2 },
  { id: 'q90', name: 'Quasar 90', short: 'Quasar 90', spec: '24 GB · triple fan', len: 3.0, fans: 3, thick: 0.7, body: '#101015', accent: '#f0abfc', rank: 3 },
]);

export const PSUS = def('psu', [
  { id: 'w550', name: 'Photon 550 W', short: '550 W', spec: '80+ Bronze', color: '#c8834a', rank: 0 },
  { id: 'w750', name: 'Photon 750 W', short: '750 W', spec: '80+ Gold', color: '#e0b84a', rank: 1 },
  { id: 'w850', name: 'Photon 850 W', short: '850 W', spec: '80+ Gold · modular', color: '#e0b84a', rank: 2 },
  { id: 'w1000', name: 'Photon 1000 W', short: '1000 W', spec: '80+ Platinum', color: '#d9dde4', rank: 3 },
  { id: 'w1200', name: 'Photon 1200 W', short: '1200 W', spec: '80+ Titanium', color: '#8fb3c9', rank: 4 },
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
  { id: 'nova', name: 'Nova Black', body: '#1c1e26', frame: '#101117', accent: '#2a2d38' },
  { id: 'lumen', name: 'Lumen White', body: '#e4e7ee', frame: '#c9ced8', accent: '#f5f6f9' },
  { id: 'eclipse', name: 'Eclipse Violet', body: '#2b2342', frame: '#1b1630', accent: '#3a2f5c' },
];

export const TIERS = [
  {
    id: 'office', name: 'Office', minRank: 1, pay: 90, color: '#38bdf8',
    cpu: ['orion3', 'orion5'], cooler: ['stock'], ram: ['r16'], ssd: ['s512', 's1'], gpu: [null], psu: ['w550'],
  },
  {
    id: 'gaming', name: 'Gaming', minRank: 2, pay: 150, color: '#34d399',
    cpu: ['orion5', 'orion7'], cooler: ['tower'], ram: ['r32'], ssd: ['s1', 's2'], gpu: ['p60', 'p70'], psu: ['w750'],
  },
  {
    id: 'creator', name: 'Creator', minRank: 4, pay: 210, color: '#f472b6',
    cpu: ['orion7', 'orion9'], cooler: ['aio240', 'tower'], ram: ['r64', 'r32'], ssd: ['s2'], gpu: ['p70', 'q80'], psu: ['w850'],
  },
  {
    id: 'enthusiast', name: 'Enthusiast', minRank: 5, pay: 270, color: '#a78bfa',
    cpu: ['orion9'], cooler: ['aio360', 'aio240'], ram: ['r64'], ssd: ['s2', 's4'], gpu: ['q90'], psu: ['w1000'],
  },
  {
    id: 'workstation', name: 'Workstation', minRank: 7, pay: 330, color: '#facc15',
    cpu: ['orionx'], cooler: ['aio360'], ram: ['r128'], ssd: ['s4'], gpu: ['q80', 'q90'], psu: ['w1200'],
  },
];

export const RANKS = [
  { name: 'Trainee', xp: 0, unlock: 'Office builds' },
  { name: 'Apprentice Builder', xp: 120, unlock: 'Gaming builds · look-alike parts on the rack' },
  { name: 'Junior Technician', xp: 300, unlock: 'Rush orders · keyboards & mice in the box' },
  { name: 'Technician', xp: 540, unlock: 'Creator builds · custom RGB requests' },
  { name: 'Senior Technician', xp: 840, unlock: 'Enthusiast builds · more look-alikes' },
  { name: 'Build Specialist', xp: 1200, unlock: 'Longer shifts, bigger tips' },
  { name: 'Lead Builder', xp: 1650, unlock: 'Workstation builds' },
  { name: 'Master Builder', xp: 2200, unlock: 'VIP customers' },
  { name: 'Chief Assembler', xp: 2850, unlock: 'Top-tier tips' },
  { name: 'Galactic Master Builder', xp: 3600, unlock: 'Career complete — the stars are yours' },
];

export function rankFor(xp) {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) r = i;
  return r + 1; // 1-based
}

export const UPGRADES = [
  { id: 'driver', name: 'Power Screwdriver', price: 180, icon: '🔩', desc: 'One click drives every screw on a part — with a very satisfying whirr.' },
  { id: 'flapper', name: 'Flap Folder', price: 140, icon: '📦', desc: 'Fold all four box flaps with a single click.' },
  { id: 'labeler', name: 'Auto Labeler', price: 160, icon: '🏷️', desc: 'Shipping labels stick themselves on as soon as the box is taped.' },
  { id: 'tapegun', name: 'Tape Gun', price: 220, icon: '🎞️', desc: 'Click the seam once and the tape gun seals the whole box.' },
  { id: 'cablecomb', name: 'Cable Comb', price: 260, icon: '🔌', desc: 'Plug in every ready power cable with one click.' },
  { id: 'espresso', name: 'Espresso Machine', price: 300, icon: '☕', desc: 'Par times are 20% more relaxed. Stay caffeinated, builder.' },
  { id: 'gloves', name: 'Magnetic Gloves', price: 480, icon: '🧤', desc: 'Click a part on the rack and it flies straight into its slot.' },
  { id: 'loyalty', name: 'Loyalty Program', price: 650, icon: '💜', desc: 'Happy customers pay 15% more for every build.' },
];

export const THEMES = [
  { id: 'violet', name: 'Andromeda Violet', price: 0, a: '#8b5cf6', b: '#22d3ee' },
  { id: 'amber', name: 'Solar Amber', price: 150, a: '#f59e0b', b: '#f43f5e' },
  { id: 'teal', name: 'Nebula Teal', price: 150, a: '#14b8a6', b: '#a3e635' },
  { id: 'crimson', name: 'Red Giant', price: 200, a: '#ef4444', b: '#f97316' },
  { id: 'ice', name: 'Comet Ice', price: 200, a: '#60a5fa', b: '#e0f2fe' },
];

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

export const FIRST = ['Priya', 'Mateo', 'Aiko', 'Jonas', 'Fatima', 'Liam', 'Zara', 'Kofi', 'Elena', 'Ravi', 'Noor', 'Theo', 'Mia', 'Diego', 'Hana', 'Oskar', 'Leila', 'Sam', 'Ines', 'Yusuf', 'Chloe', 'Arjun', 'Freya', 'Tomas', 'Amara', 'Kenji', 'Sofia', 'Malik', 'Ivy', 'Luca'];
export const LAST = ['Nair', 'Okafor', 'Tanaka', 'Berg', 'Haddad', 'Walsh', 'Rossi', 'Mensah', 'Novak', 'Iyer', 'Costa', 'Kim', 'Laurent', 'Silva', 'Moreau', 'Lindqvist', 'Ahmed', 'Park', 'Fischer', 'Duarte', 'Brooks', 'Quinn', 'Sato', 'Kowalski', 'Reyes'];
export const CITIES = ['Lisbon', 'Osaka', 'Austin', 'Nairobi', 'Oslo', 'Melbourne', 'Toronto', 'Seoul', 'Lyon', 'Cape Town', 'Denver', 'Kraków', 'Dublin', 'Mumbai', 'Montréal', 'Reykjavík', 'Porto', 'Auckland', 'Helsinki', 'Vancouver'];
export const STREETS = ['Nebula Way', 'Orbit Lane', 'Comet Road', 'Starlight Ave', 'Galaxy Court', 'Meteor St', 'Aurora Blvd', 'Halley Row', 'Quasar Close', 'Vega Terrace'];

export const NOTES = {
  office: ['Spreadsheets, video calls and zero drama, please.', 'For my home office — quiet is king.', 'Replacing a PC from 2012. Be gentle with me.', 'Grandma wants to video call the whole family.', 'Need it for my bakery\'s books and recipes.'],
  gaming: ['First gaming PC for my daughter!', 'Late-night raids with the squad.', 'Saving up for this since summer. So excited!', 'I stream on weekends — make it pretty.', 'Ready for the new open-world release!'],
  creator: ['4K video edits for my travel channel.', 'Photo retouching and a bit of music production.', 'Building a 3D portfolio for art school.', 'Podcast studio upgrade!'],
  enthusiast: ['Go big or go home.', 'Benchmarks or it didn\'t happen.', 'Sim racing rig centerpiece.', 'Max settings. All of them.'],
  workstation: ['Simulating galaxies for our observatory.', 'Rendering an animated short film.', 'Machine-learning research lab.', 'Architectural visualisation studio.'],
};
