# Andromeda Assembly

A 3D PC-building game for **Andromeda Insights** PCs. It is set in 2291 aboard **Forge-7**, Andromeda Insights' orbital foundry above Titan. You build machines by hand, test them, pack them and launch them to colonies across the Sol system. Every machine you ship helps decode a mysterious signal from the Andromeda Galaxy.

## What ships

`release/AndromedaAssembly.html` is the whole game: **one file, about 1 MB, fully offline**. The 3D engine, models, textures, shaders, sound effects, music and fonts are all inside it. There are no installers, network calls or accounts.

To bundle it with a PC:

1. Copy `release/AndromedaAssembly.html` and `release/Play Andromeda Assembly.cmd` to the image, for example to `C:\Program Files\Andromeda Insights\Andromeda Assembly\`.
2. Put a desktop or Start-menu shortcut to `Play Andromeda Assembly.cmd`. It opens the game in a clean app-style Microsoft Edge window and falls back to the default browser. Double-clicking the HTML file also works.

Progress is saved automatically in the browser's local storage, separately for each Windows user. Graphics quality starts at **Ultra** (ambient occlusion, bloom, film grain, 4K shadows). It steps down automatically within a few seconds if the PC can't keep up, and players can change it in Settings.

## The loop

**Build**
- **Read the work order.** From Rank 2 the holo pads also hold look-alike parts.
- **Precision placement.** Drag parts into the hologram outline. A shrinking reticle shows your alignment. Release inside the gold ring for **PERFECT**.
- **Torque screws.** Hold a screw and release when the needle sweeps into the gold zone.
- **Thermal paste.** Hold on the CPU until the blob fills the target ring. Too little backs off; too much oozes.
- **Cables.** Drag each connector from its grommet to its port.
- **QA and stress test.** Press power: the fans spin up, the RGB lights come on, POST checks the order, and the benchmark score counts up (with tier records). Some customers ask for a specific RGB colour.

**Pack and launch**
- Drop in the PC, foam and accessories (plus an optional thank-you card for a tip).
- **Speed-fold** the flaps.
- Tape the seam in **one straight swipe**. The tape follows your hand, so wobbly runs look wobbly.
- **Stamp** the label when the timing rings meet.
- Hit **SHIP**. The box rolls through the airlock, and a launch pod blasts past Saturn.

**The dopamine layer**
- Every action is judged **PERFECT / GREAT / GOOD / SLOPPY**, with popups, rising-pitch chimes, particles and shockwaves.
- Chaining actions builds **Flow**. At ×5, ×12 and ×20 you hit **Overdrive I, II and III**: the screen-edge glow intensifies, the adaptive music adds layers, and the payout multiplier grows.
- Each build gets a letter grade (**S, A, B, C or D**) that slams onto the screen, plus a payout breakdown, XP, a customer review, and a **supply crate**. Crates come in Common, Rare, Epic and Legendary. They hold credits, XP chips, workshop decor, crate-only lighting themes and lost Codex lore.
- **Three daily contracts** per shift pay credits and bonus crates.
- **Twelve tool upgrades** and seven lighting themes. **Ten collectible decor pieces** appear around the bench.

**Off the clock: walk Forge-7**

After any shipment, or from the end-of-shift screen, choose **Walk the station**. You stand up from the bench and explore the ship in first person (`WASD`, mouse look, `Shift` to sprint, `E` to interact, `Tab` back to the bench). There are five rooms behind sliding doors:
- **Orbital Outfitters**, the shop. The tool upgrades sit on lit pedestals and the lighting themes float as orbs. **PIP**, an over-eager vendor bot, sells them to you.
- **The Observatory.** Director Sela, the signal console, and a working **telescope**. Match the waveform to lock onto Andromeda for a daily boost to the signal decode.
- **The Crew Lounge.** **Pod Runner** is a full arcade game with a high score and a daily credit payout. There's also a jukebox with three soundtrack styles (lo-fi, synthwave, ambient), a trophy wall with 24 achievements, and a display cabinet for your crate collectibles.
- **ORIN's Core.** Talk to the station AI face to face, read the Codex terminal, or rest in the bunk.
- **The Launch Hangar.** Juno and the launch pods. The live **Sol map** shows every colony you've shipped to, and the launch log lists your last shipments.

Each crew member has new lines every chapter, and every room has its own ambient chatter.

## Story: *The Lighthouse Protocol*

There are five chapters across ten ranks: *First Shift*, *The Whisper*, *Static*, *Resonance* and *The Lighthouse*. The story plays out in comms transmissions with voiced-style typewriter text and procedurally drawn portraits. The cast:
- **ORIN**, the station's dry-witted foreman AI
- **Director Sela Okafor**
- **Juno Reyes**, the launch tech
- archived logs from founder **Dr. Ilya Marrow**

The Lighthouse Network gives a **signal decode** meter that rises with every quality build. At the top rank you build the **Lighthouse Core** from legendary parts and hear what Andromeda has to say. After that the game continues as an endless mode. Every story beat unlocks entries in the in-game **Codex**.

Controls: mouse only at the bench (the station walk uses `WASD` and the mouse). `H` shows a hint, `Esc` pauses, `M` mutes, `F` toggles fullscreen, right-drag looks around, and the wheel zooms. The first order is a guided tutorial, and first-time tips introduce each skill mechanic.

## Development

```bash
npm install
npm run build      # → release/AndromedaAssembly.html
npm test           # build + automated playtest (Playwright plays a full order with the mouse) + UI test
node tests/walk.mjs # station walk: rooms, shop, arcade, jukebox, telescope, collisions
npm run test:fast  # playtest that skips the build phase (packing/meta only)
```

Source is in `src/`:

| File | Contents |
|---|---|
| `main.js` | game states, judgement, Flow and Overdrive, scoring, story beats, crates, contracts |
| `assembly.js` | build bench: precision drops, torque, paste, cable dragging, QA, benchmark |
| `packing.js` | dispatch bay: box, foam, speed folds, freehand tape, stamp timing, launch pod |
| `station.js`, `walk.js` | walkable deck (shop, observatory, lounge, AI core, hangar), crew models, first-person controller |
| `arcade.js` | Pod Runner arcade cabinet game |
| `env.js` | Forge-7 set: window onto Saturn and Andromeda, lamps and light shafts, holo pads, airlock |
| `models.js`, `decor.js` | procedural models (parts, case, box, pod, collectible decor) |
| `shaders.js`, `post.js` | sky, planet, hologram and light-shaft shaders; GTAO, bloom and grading pipeline |
| `textures.js` | canvas textures, generated normal maps, logo |
| `audio.js` | synthesized sound effects and the adaptive soundtrack |
| `ui.js`, `template.html` | HUD, work order, comms, results, crates, shop, achievements, telescope, codex |
| `catalog.js`, `story.js`, `meta.js`, `orders.js` | data, lore and progression systems |

Fonts: Rajdhani and Inter, used under the SIL Open Font License and embedded in the build.
