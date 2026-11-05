// ============================================================================
//  THE LIGHTHOUSE PROTOCOL — story, characters, transmissions and codex.
//
//  2291. Andromeda Insights' orbital foundry FORGE-7 hangs above Titan, with
//  Saturn filling the window and the Andromeda Galaxy glowing beyond it. Every
//  hand-built PC that leaves the station joins the Lighthouse Network: a
//  volunteer mesh of spare compute. When the station's deep-space array catches
//  a faint, structured signal from M31, every machine you build helps decode it.
// ============================================================================

export const CHARACTERS = {
  orin: { name: 'ORIN', role: 'Forge-7 Foreman AI', color: '#22d3ee', glyph: 'eye' },
  sela: { name: 'Director Sela Okafor', role: 'Station Director', color: '#a78bfa', glyph: 'face' },
  juno: { name: 'Juno Reyes', role: 'Dispatch & Launch', color: '#f59e0b', glyph: 'face2' },
  marrow: { name: 'Dr. Ilya Marrow', role: 'Founder · archived log', color: '#f0abfc', glyph: 'archive' },
  whisper: { name: '— UNKNOWN —', role: 'Source: M31 · 2.5 Mly', color: '#facc15', glyph: 'signal' },
};

export const CHAPTERS = [
  { n: 1, title: 'First Shift', ranks: [1, 2] },
  { n: 2, title: 'The Whisper', ranks: [3, 4] },
  { n: 3, title: 'Static', ranks: [5, 6] },
  { n: 4, title: 'Resonance', ranks: [7, 8] },
  { n: 5, title: 'The Lighthouse', ranks: [9, 10] },
];
export function chapterFor(rank) {
  return CHAPTERS.find((c) => rank >= c.ranks[0] && rank <= c.ranks[1]) || CHAPTERS[CHAPTERS.length - 1];
}

const T = (who, text) => ({ who, text });

// Full transmissions (shown as a cinematic comms panel)
export const TRANSMISSIONS = {
  intro: [
    T('orin', 'Boot sequence complete. Hello, Builder. I am ORIN, foreman intelligence of Forge-7.'),
    T('orin', 'You are standing in the finest hand-build foundry in the Sol system. Please do not lick anything.'),
    T('sela', 'Welcome aboard. Every colony from Mercury to Triton runs on machines built at this bench. Now one of them will be yours.'),
    T('sela', 'Read the work order, build it right, build it fast. ORIN will keep score. He loves keeping score.'),
    T('orin', 'I do not "love" anything. I simply find perfect torque values… deeply satisfying.'),
  ],
  firstShip: [
    T('juno', 'WOO! Did you see that pod go? Juno here — I run dispatch. Your first machine is on its way to the colonies!'),
    T('juno', 'Every box you seal goes out that airlock on a launch pod. Seal them neat and the customers leave the best reviews.'),
    T('orin', 'Your work has been logged. Supply crate attached. Statistically, builders who open crates are 40% happier.'),
  ],
  rank2: [
    T('sela', 'Promotion paperwork is through — congratulations, Builder. Gaming rigs are coming your way.'),
    T('orin', 'Warning: the fabricators have started printing look-alike parts on the pads. Read the order. Every line.'),
  ],
  rank3: [
    T('orin', 'Builder. Something unusual. The deep-space array registered a structured pulse at 21 centimetres.'),
    T('sela', 'Source triangulates to M31 — the Andromeda Galaxy. Two and a half million light-years out. And it repeats.'),
    T('whisper', '·· ··· ·  ·· ··  ···  ·  ·· ··· ·'),
    T('sela', 'It is far too faint to decode with the array alone. But we have something nobody else has.'),
    T('orin', 'The Lighthouse Network. Every Andromeda machine you ship can donate idle cycles. Every build helps us listen.'),
  ],
  rank4: [
    T('juno', 'Custom RGB requests are flooding in. Turns out colonists like their PCs the colour of their home sky.'),
    T('orin', 'Decode progress is now displayed on your HUD. Build well. The quality of each machine improves its contribution.'),
  ],
  rank5: [
    T('sela', 'The fragments are getting cleaner. The first block decoded as prime numbers. Somebody out there counts like we do.'),
    T('orin', 'Market note: Nullcore has launched mass-printed "instant" PCs. Failure rate: 31%. Customers are returning to us.'),
    T('juno', 'A Nullcore unit literally caught fire on Phobos. On Phobos! There is barely any oxygen on Phobos!'),
  ],
  rank6: [
    T('marrow', '[Archive, 2219] If you are hearing this, the array finally heard something. I always believed it would.'),
    T('marrow', 'A machine built with care is a message. Keep building them that way. Someone, somewhere, is listening for it.'),
    T('sela', 'That is our founder. She recorded that seventy years ago. She knew.'),
  ],
  rank7: [
    T('orin', 'Observatories across the system are ordering workstations. Triton, Europa, Luna. All of them heard the Whisper.'),
    T('sela', 'The newest fragment is a diagram. Layered. Interconnected. Builder… I think it is a circuit.'),
  ],
  rank8: [
    T('orin', 'Anomaly. When the Lighthouse Network grew past ten thousand nodes, the signal changed.'),
    T('whisper', '·· ··· ·  RECEIVED  ·· ···'),
    T('sela', 'It is responding. It knows we are listening. We need a transmitter worthy of an answer.'),
  ],
  rank9: [
    T('sela', 'The array engineers have finished the plans. The core needs parts we have never fabricated. Parts from the diagram.'),
    T('orin', 'Fabrication of the Lighthouse components has begun. When you are ready, Keeper, so are we.'),
  ],
  finaleOrder: [
    T('sela', 'This is it. The Lighthouse Core. Singularity silicon, an Event Horizon array, a Zero-Point cell.'),
    T('juno', 'I polished the launch pod. Twice. Okay, four times.'),
    T('orin', 'Builder. Every machine you have shipped led to this bench. Build it perfectly. I believe that you will.'),
  ],
  finale: [
    T('orin', 'The Lighthouse Core is online. Transmitting on the array… now.'),
    T('whisper', 'WE HEARD YOUR HANDS.'),
    T('whisper', 'WE BUILD THE SAME WAY — SLOWLY, CAREFULLY, ONE PIECE AT A TIME.'),
    T('whisper', 'HELLO, NEIGHBOURS.'),
    T('sela', '…Two galaxies. And the first thing they wanted to say was that they build things like we do.'),
    T('orin', 'Lighthouse Keeper. It has been an honour to keep score for you. The orders will keep coming — the whole galaxy wants to talk now.'),
  ],
  sig10: [T('orin', 'Decode at 10%. The signal has rhythm. Not noise. Rhythm.')],
  sig25: [T('sela', '25% decoded. Prime numbers, in order, out to 997. Someone wants us to know they are not an accident.')],
  sig40: [T('orin', '40%. The new block is a repeating geometric unit. I would call it a "brick". Or a component.')],
  sig55: [T('sela', '55%. The structure stacks. Like layers of a circuit board. Like our boards.')],
  sig70: [T('orin', '70%. I have stopped categorising this as "anomalous". I now categorise it as "a letter".')],
  sig85: [T('sela', '85%. The final block will not resolve without a dedicated transmitter. Keep building, Keeper.')],
};

// Short barks from ORIN & crew during play (non-blocking)
export const BARKS = {
  day: [
    ['orin', 'New shift. Fabricators primed. Coffee machine judged and found wanting.'],
    ['juno', 'Launch pods fuelled and gleaming. Let\'s light up the colonies!'],
    ['orin', 'Reminder: perfect placements make me 3% more cheerful. Unofficially.'],
    ['sela', 'The array is listening. Make every machine count.'],
    ['orin', 'Saturn looks particularly ringed today. Begin.'],
    ['juno', 'Bet I can launch more pods than you can build. Kidding. You build, I launch.'],
  ],
  od1: [['orin', 'Flow detected. Efficiency rising.'], ['juno', 'Ooh, somebody\'s in the zone!']],
  od2: [['orin', 'Overdrive II. Your hands are a blur. I approve.'], ['juno', 'The whole dispatch bay can hear you clicking!']],
  od3: [['orin', 'OVERDRIVE III. I am recording this for training purposes.'], ['sela', 'Is the bench… smoking? Keep going!']],
  qaFail: [['orin', 'QA failure. The part did not match the work order. Reading is a skill, Builder.'], ['orin', 'Incorrect component. I will pretend I did not see that.']],
  gradeS: [['orin', 'S-grade. Logging this one in the hall of fame.'], ['sela', 'That was beautiful work.'], ['juno', 'Customers are going to FRAME that box.']],
  perfectStreak: [['orin', 'Five perfects in a row. Statistically improbable. Personally delightful.']],
  wrong: [['orin', 'That part is not on the order. Check the work order panel.']],
};

export const CODEX = [
  { id: 'forge7', cat: 'Station', title: 'Forge-7', unlock: 'intro',
    text: 'Andromeda Insights\' orbital foundry, parked in high orbit above Titan since 2268. Crew of 140 humans, one foreman AI, and an uncountable number of tiny screws. Every machine is hand-assembled at a builder bench and launched to the colonies by pod.' },
  { id: 'orin', cat: 'People', title: 'ORIN', unlock: 'intro',
    text: 'Operations & Reliability INtelligence. Forge-7\'s foreman AI. Tracks every torque value on the station. Claims not to have feelings; has a documented fondness for perfectly routed cables.' },
  { id: 'sela', cat: 'People', title: 'Director Sela Okafor', unlock: 'intro',
    text: 'Station director, former belt-mining engineer. Believes a good machine should outlive its owner\'s grandchildren. Keeps a photo of the founder on her desk.' },
  { id: 'juno', cat: 'People', title: 'Juno Reyes', unlock: 'firstShip',
    text: 'Dispatch & launch tech. Has named every launch pod on the station. The favourite is "Big Kevin". Big Kevin is the same size as every other pod.' },
  { id: 'company', cat: 'Station', title: 'Andromeda Insights', unlock: 'firstShip',
    text: 'Founded in 2207 by Dr. Ilya Marrow, who saw the Andromeda Galaxy through a backyard telescope at age nine and decided machines should be built "like letters to someone far away". Hand-built computers for every colony in the Sol system.' },
  { id: 'lighthouse', cat: 'Signal', title: 'The Lighthouse Network', unlock: 'rank3',
    text: 'An opt-in mesh of Andromeda Insights machines donating idle compute to Forge-7\'s deep-space array. Originally built to map the cosmic microwave background. Now it listens to something else.' },
  { id: 'whisper', cat: 'Signal', title: 'The Whisper', unlock: 'rank3',
    text: 'A structured 21 cm pulse from the direction of M31, first registered by the Forge-7 array in 2291. It repeats every 47 minutes. It is far too regular to be natural.' },
  { id: 'nullcore', cat: 'Station', title: 'Nullcore Systems', unlock: 'rank5',
    text: 'Rival manufacturer of fully automated, mass-printed PCs. Cheap, fast, and prone to "thermal events". Their slogan, "Why build when you can print?", is not aging well.' },
  { id: 'marrow', cat: 'Archive', title: 'Marrow\'s Log, 2219', unlock: 'rank6',
    text: '"Engineers keep asking why we don\'t automate the benches. Because a machine built by careful hands carries something of the builder. Call it superstition. I call it a signal."' },
  { id: 'circuit', cat: 'Signal', title: 'Fragment: The Diagram', unlock: 'rank7',
    text: 'Decoded block 7 resolves into a layered, branching structure. Array engineers note an uncanny resemblance to a multilayer printed circuit board — with traces arranged for repairability, not cost.' },
  { id: 'response', cat: 'Signal', title: 'Fragment: Received', unlock: 'rank8',
    text: 'After the Lighthouse Network passed 10,000 nodes, the Whisper\'s structure changed for the first time in its observed history. The new block contains a single repeated word-equivalent. The linguists translate it as "received".' },
  { id: 'core', cat: 'Signal', title: 'The Lighthouse Core', unlock: 'rank9',
    text: 'A transmitter-compute hybrid built from the decoded diagram. Requires components never before fabricated: Singularity silicon, Event Horizon array card, Pulsar Array memory, Zero-Point power cell.' },
  { id: 'hello', cat: 'Signal', title: 'Fragment: Hello', unlock: 'finale',
    text: '"WE HEARD YOUR HANDS. WE BUILD THE SAME WAY — SLOWLY, CAREFULLY, ONE PIECE AT A TIME. HELLO, NEIGHBOURS." Received 2291, Forge-7 deep-space array. Reply sent by the Lighthouse Core.' },
  // crate-only lore drops
  { id: 'log1', cat: 'Archive', title: 'Marrow\'s Log #1', unlock: 'crate',
    text: '"Day one of the company. Three benches, one telescope, too much coffee. Built our first machine for a librarian on Luna. She sent back a photo of it next to the window, Earth rising behind. I cried. Don\'t tell anyone."' },
  { id: 'log2', cat: 'Archive', title: 'Marrow\'s Log #2', unlock: 'crate',
    text: '"Someone asked why every box ships with a thank-you card. Because somebody waited for this machine. The least we can do is say we thought about them while we built it."' },
  { id: 'log3', cat: 'Archive', title: 'Marrow\'s Log #3', unlock: 'crate',
    text: '"The array picked up nothing again tonight. That\'s alright. Listening is not wasted time. Listening is how you\'re ready when someone finally speaks."' },
  { id: 'log4', cat: 'Archive', title: 'Marrow\'s Log #4', unlock: 'crate',
    text: '"I\'ve asked the engineers to design an AI foreman. Requirements: patient, precise, secretly sentimental. They said the last one was impossible. I said try anyway."' },
  { id: 'pods', cat: 'Station', title: 'Launch Pods', unlock: 'crate',
    text: 'Reusable courier capsules fired from Forge-7\'s dispatch airlock on a magnetic rail, then boosted by small ion thrusters. Average delivery time to the Martian colonies: 19 days. Pods return empty, smelling faintly of the colonies they visited.' },
];
