# Andromeda Assembly

A 3D PC-building and packing game for **Andromeda Insights** PCs. You take work orders, build each PC from a parts rack, run QA, pack it and ship it, then spend your pay on workshop upgrades.

## What ships

`release/AndromedaAssembly.html` is the whole game: **one file, about 700 KB, fully offline**. The 3D engine, models, textures, sound effects and music are all generated at runtime. There are no other files, installers, network calls or accounts.

To bundle it with a PC:

1. Copy `release/AndromedaAssembly.html` to the image, for example `C:\Program Files\Andromeda Insights\Andromeda Assembly\`.
2. Put a desktop or Start-menu shortcut to that file. It opens in the default browser (Edge, Chrome or Firefox).
3. Optional: point the shortcut at `release/Play Andromeda Assembly.cmd` instead. It opens the game in a clean app-style Microsoft Edge window and falls back to the default browser.

Progress is saved automatically in the browser's local storage, separately for each Windows user.

## The game loop

1. **Work order**: a ticket lists the customer's exact parts. From Rank 2, the rack also holds look-alike parts, so players have to read it.
2. **Build**: drag parts into their glowing outlines (or click to pick up and click to drop). Then click screws, the CPU socket lever and the power-cable ports. Close the glass panel.
3. **QA**: press the power button. Fans spin up, the RGB lights come on, and a POST screen checks every part against the ticket. A wrong part means opening the case and swapping it. Some customers ask for a specific RGB colour.
4. **Pack**: put the PC in the box, then the foam and the accessories (plus an optional thank-you card for a tip). Fold the flaps, drag tape along the seam, apply the label and hit **SHIP**.
5. **Payout**: base pay plus bonuses for beating par time, Flow combos and passing QA first time, then stars and XP.
6. **Progress**: a shift is 3 to 6 orders. There are 10 ranks; each one unlocks harder builds, rush orders, peripherals and RGB requests. Money buys 8 tool upgrades (a power screwdriver, a tape gun, magnetic gloves and so on) and 5 workshop lighting themes. Reaching **Galactic Master Builder** shows a certificate and credits. After that the game continues as an endless mode.

Controls: mouse only. `H` shows a hint, `Esc` pauses, `M` mutes, `F` toggles fullscreen, right-drag looks around, and the wheel zooms. The first order is a guided tutorial.

Graphics quality (High, Medium or Low) is detected automatically and can be changed in Settings.

## Development

```bash
npm install
npm run build      # → release/AndromedaAssembly.html
npm test           # build + automated playtest (Playwright drives the mouse through real orders)
```

Source is in `src/`:

| File | Contents |
|---|---|
| `main.js` | renderer, camera, game states, scoring, progression |
| `assembly.js` | build bench: drag and snap, screws, cables, QA test |
| `packing.js` | packing station: box, foam, flaps, tape, label, shipping |
| `models.js` | procedural 3D models (case, parts, box, workshop) |
| `textures.js` | canvas-drawn textures and the Andromeda logo |
| `audio.js` | synthesized sound effects and the generative lo-fi soundtrack |
| `ui.js`, `template.html` | HUD, ticket and menus |
| `catalog.js`, `orders.js` | parts, tiers, ranks, upgrades and order generation |
