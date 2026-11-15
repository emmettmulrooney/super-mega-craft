// Builds the Minecraft Marketplace (Bedrock) add-on submission package for Super MegaCraft (PAID: 1340 Minecoins).
// Output: dist/marketplace/Super MegaCraft/{Content,Store Art,Marketing Art,Store Listing.txt}
//         dist/Super MegaCraft - Marketplace Submission.zip
//         dist/Super MegaCraft.mcaddon (for testing on your own device)
// Usage: node tools/build.js && node tools/make_marketplace.js
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { Img, decode, hex, mix } = require("./lib/png.js");

const ROOT = path.join(__dirname, "..");
const NAME = "Super MegaCraft";
const PRICE = 1340;
const FILE = NAME.replace(/ /g, "");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(DIST, "marketplace", NAME);
const BP = path.join(ROOT, `${NAME} BP`);
const RP = path.join(ROOT, `${NAME} RP`);

fs.rmSync(path.join(DIST, "marketplace"), { recursive: true, force: true });
const bpOut = path.join(OUT, "Content", "behavior_packs", "SuperMegaCraft_BP");
const rpOut = path.join(OUT, "Content", "resource_packs", "SuperMegaCraft_RP");
fs.cpSync(BP, bpOut, { recursive: true });
fs.cpSync(RP, rpOut, { recursive: true });
for (const dir of [bpOut, rpOut]) {
  const mf = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  if (mf.header.name !== "pack.name" || mf.header.description !== "pack.description") throw new Error(`${dir}: manifest must use pack.name / pack.description`);
  if (!fs.readFileSync(path.join(dir, "texts", "en_US.lang"), "utf8").includes("pack.name=")) throw new Error(`${dir}: missing pack.name`);
}

// ---------- art ----------
const tex = (rel) => decode(path.join(RP, "textures", rel));
const T = (n) => tex(`blocks/supermegacraft_${n}.png`);

/** Draw a voxel vehicle (side view) from blueprint-ish columns of textures. */
function drawBlocks(im, cells, x0, y0, s) {
  for (const [cx, cy, t] of cells) im.paste(t, Math.round(x0 + cx * s), Math.round(y0 - (cy + 1) * s), s / 16);
}

function keyArt(w, h) {
  const im = new Img(w, h);
  const top = hex("#071030"), mid = hex("#1d4f9c"), bot = hex("#8cc6ff");
  for (let y = 0; y < h; y++) { const t = y / h; const c = t < 0.55 ? mix(top, mid, t / 0.55) : mix(mid, bot, (t - 0.55) / 0.45); for (let x = 0; x < w; x++) im.set(x, y, c); }
  let s = 11;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 120; i++) { const x = rnd() * w, y = rnd() * h * 0.45; im.rect(x, y, Math.max(1, w / 900), Math.max(1, w / 900), hex("#ffffff", 120 + Math.floor(rnd() * 135))); }
  // ground
  const gy = Math.round(h * 0.86);
  im.rect(0, gy, w, h - gy, hex("#3d7a35")).rect(0, gy, w, Math.max(2, h / 120), hex("#5aa64b"));
  const bs = Math.max(8, Math.floor(h / 30 / 2) * 2); // block size in px (multiple of 2 so 16px textures scale cleanly)
  const f = bs / 16;
  const sz = Math.max(1, Math.round(f)) * 16;
  // giant rocket on the right, mid-launch
  const R = [];
  const W = T("hull_white"), K = T("hull_black"), RD = T("hull_red"), WI = T("window"), EN = T("rocket_side_on");
  const rx = 0, rows = 22;
  for (let y = 0; y < rows; y++) for (let x = -2; x <= 2; x++) R.push([x, y, y === 0 ? EN : y % 7 === 3 ? K : x === 0 && y === rows - 4 ? WI : W]);
  for (let k = 0; k < 3; k++) for (let x = -2 + k; x <= 2 - k; x++) R.push([x, rows + k, k === 2 ? RD : W]);
  for (const bx of [-4, 4]) { for (let y = 0; y < 10; y++) R.push([bx, y, y === 0 ? EN : W]); R.push([bx, 10, RD]); }
  const scale = Math.max(1, Math.round(f));
  const rpx = Math.round(w * 0.76), rpy = Math.round(gy - h * 0.18);
  for (const [cx, cy, t] of R) im.paste(t, rpx + cx * sz, rpy - (cy + 1) * sz, scale);
  // exhaust plume + smoke
  for (let i = 0; i < 260; i++) {
    const t = rnd(), x = rpx + (rnd() - 0.5) * sz * 5 * (0.4 + t * 2.2), y = rpy + t * (gy - rpy + h * 0.02);
    const r = sz * (0.3 + t * 1.2) * (0.5 + rnd() * 0.5);
    const c = t < 0.35 ? mix(hex("#fff6b0"), hex("#ff9a1f"), t / 0.35) : mix(hex("#ff7a1a"), hex("#e8e8e8"), Math.min(1, (t - 0.35) * 2.5));
    for (let a = -r; a <= r; a += 2) for (let b = -r; b <= r; b += 2) if (a * a + b * b <= r * r) im.rect(x + a, y + b, 2, 2, [c[0], c[1], c[2], t < 0.35 ? 255 : 200]);
  }
  for (const bx of [-4, 4]) for (let i = 0; i < 40; i++) { const t = rnd(); im.rect(rpx + bx * sz + sz / 2 + (rnd() - 0.5) * sz * 2, rpy + t * sz * 4, sz / 2, sz / 2, mix(hex("#fff6b0"), hex("#ff7a1a"), t)); }
  // jumbo jet on the left, flying
  const J = [];
  const G = T("hull_white"), B = T("hull_blue"), WG = T("wing_edge"), JE = T("jet_side"), CK = T("cockpit_side");
  for (let x = 0; x < 26; x++) for (let y = 0; y < 3; y++) J.push([x, y, x % 6 === 0 && y === 1 ? B : y === 2 && x > 1 && x < 23 && x % 2 ? WI : G]);
  J.push([26, 1, G]); J.push([-1, 1, G]); J.push([0, 2, CK]); J.push([1, 2, CK]);
  for (let y = 3; y < 7; y++) for (let x = 22 - (y - 3); x < 26; x++) J.push([x, y, B]);
  for (let x = 9; x < 16; x++) J.push([x, -1, WG]);
  J.push([10, -2, JE]); J.push([11, -2, JE]); J.push([14, -2, JE]);
  const jpx = Math.round(w * 0.06), jpy = Math.round(h * 0.42);
  const js = Math.max(1, Math.round(f * 0.75));
  for (const [cx, cy, t] of J) im.paste(t, jpx + (25 - cx) * js * 16, jpy - (cy + 1) * js * 16, js);
  for (let i = 0; i < 60; i++) im.rect(jpx + 26 * js * 16 + i * js * 6, jpy - js * 16 * 1.5 + (rnd() - 0.5) * js * 6, js * 5, js * 5, hex("#ffffff", 150 - i * 2));
  // a star dreadnought looming over everything, top left
  {
    const NH = T("neutronium_hull"), WN = T("window"), IO = T("ion_exhaust_on"), CN = T("cannon_side");
    const ds = Math.max(1, Math.round(f * 0.5)), cs = ds * 16;
    const dx0 = Math.round(w * 0.02), dy0 = Math.round(h * 0.2);
    for (let x = 0; x < 46; x++) {
      const hh = Math.max(1, Math.round(x / 4));
      for (let y = 0; y < hh; y++) im.paste(y === Math.floor(hh / 2) && x % 3 === 0 && x > 6 ? WN : NH, dx0 + x * cs, dy0 + (12 - hh + y) * cs, ds);
    }
    for (let y = 2; y < 12; y++) im.paste(IO, dx0 + 46 * cs, dy0 + y * cs, ds);
    for (const x of [20, 28, 36]) im.paste(CN, dx0 + x * cs, dy0 + (12 - Math.round(x / 4) - 1) * cs, ds);
    for (let k = 0; k < 4; k++) for (const dx of [-1, 0, 1]) im.paste(NH, dx0 + (38 + dx) * cs, dy0 + (12 - 10 - 1 - k) * cs, ds);
  }
  // logo: "MEGACRAFT" in blocky letters
  const FONT = {
    M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"], E: ["####", "#...", "###.", "#...", "####"], G: [".###", "#...", "#.##", "#..#", ".###"],
    A: [".##.", "#..#", "####", "#..#", "#..#"], C: [".###", "#...", "#...", "#...", ".###"], R: ["###.", "#..#", "###.", "#.#.", "#..#"],
    F: ["####", "#...", "###.", "#...", "#..."], T: ["#####", "..#..", "..#..", "..#..", "..#.."],
    P: ["###.", "#..#", "###.", "#...", "#..."], S: [".###", "#...", ".##.", "...#", "###."], U: ["#..#", "#..#", "#..#", "#..#", ".##."], O: [".##.", "#..#", "#..#", "#..#", ".##."], " ": ["..", "..", "..", "..", ".."],
  };
  const word = "SUPER MEGACRAFT";
  const px = Math.max(4, Math.floor(w / 140));
  const widths = [...word].map((ch) => FONT[ch][0].length);
  const total = widths.reduce((a, b) => a + b + 1, -1) * px;
  let lx = Math.round(w * 0.34 - total / 2);
  const ly = Math.round(h * 0.62);
  [...word].forEach((ch, i) => {
    const g = FONT[ch];
    const pro = i < 5; // "SUPER"
    g.forEach((row, y) => [...row].forEach((c, x) => {
      if (c !== "#") return;
      im.rect(lx + x * px + px * 0.3, ly + y * px + px * 0.3, px, px, hex("#000000", 140));
      im.rect(lx + x * px, ly + y * px, px, px, pro ? (y < 2 ? hex("#ffffff") : hex("#c79bff")) : y < 2 ? hex("#ffd23a") : hex("#ff9a1f"));
    }));
    lx += (g[0].length + 1) * px;
  });
  // PRO ribbon (gold)
  const rw = Math.round(w * 0.16), rh = Math.round(h * 0.09);
  const rx0 = w - rw - Math.round(w * 0.03), ry0 = Math.round(h * 0.05);
  im.rect(rx0, ry0, rw, rh, hex("#3d1277")).border(rx0, ry0, rw, rh, hex("#c79bff"));
  const PRO = [".##.#.#.##..###.##.", "#...#.#.#.#.#...#.#", ".#..#.#.##..##..##.", "..#.#.#.#...#...#.#", "##...#..#...###.#.#"];
  const pf = Math.max(1, Math.floor(Math.min(rh / 8, (rw * 0.9) / PRO[0].length)));
  const fw = PRO[0].length * pf;
  im.paste(new Img(PRO[0].length, 5).art(0, 0, PRO.map((r) => r.replace(/\./g, " ")), { "#": hex("#ffffff") }), rx0 + Math.round((rw - fw) / 2), Math.round(ry0 + (rh - 5 * pf) / 2), pf);
  return im;
}
void drawBlocks;
const storeArt = path.join(OUT, "Store Art"), mkt = path.join(OUT, "Marketing Art");
keyArt(800, 450).save(path.join(storeArt, `${FILE}_Thumbnail_0.png`));
keyArt(1920, 1080).save(path.join(mkt, `${FILE}_MarketingKeyArt.png`));
fs.copyFileSync(path.join(RP, "pack_icon.png"), path.join(storeArt, `${FILE}_packicon_0.png`));

// ---------- listing ----------
fs.writeFileSync(path.join(OUT, "Store Listing.txt"), `Title: ${NAME}
Type: Add-On (Bedrock)
Price: ${PRICE} Minecoins
Tier: Ultra-premium (top of the MegaCraft line: includes everything in MegaCraft and MegaCraft Pro; works standalone)
Min engine version: 1.21.50
Experimental toggles required: none (stable Script API: @minecraft/server 1.16.0, @minecraft/server-ui 1.3.0)
Multiplayer: yes

Short description:
Insanely gigantic engineering. Fly 16,384-block capital starships with fusion reactors, warp drives, super-cannons, and shields, launch 120-block super-heavy rockets, plus every MegaCraft Pro system.

Long description:
Super MegaCraft is MegaCraft at a scale that shouldn't be possible. Capital starships the size of a village. Rockets taller than a mountain. Build them, power them up, and fly them.

GIGANTIC: CAPITAL STARSHIPS
- Vehicles up to 16,384 blocks: four times MegaCraft Pro, eight times MegaCraft.
- Repulsor Lifts (hover 400 each) let a whole starship lift straight off the ground. Ion Drives (push 400) cruise it across the world.
- The Capital Bridge: a command helm with built-in autopilot and radar.
- Fusion Reactors: one on board and the ship never burns fuel again.
- Warp Drives: jump the entire ship up to 256 blocks in an instant, crew and all.
- Super-Cannons: a 384-block beam fired along your line of sight, with a massive blast where it lands.
- Shield Generators: a force field that shrugs off huge impacts. Neutronium Hull: armoured capital-ship plating, 64 at a time.
- Titan Thrusters: thrust 600 each, six Rocket Engines in one block.

GIGANTIC BLUEPRINTS (each builds in seconds)
- Star Dreadnought: a 136-block wedge-shaped warship, over 15,000 blocks, with 6 super-cannons and 4 warp drives.
- Planetary Carrier: a 150-block flying aircraft carrier with a lit flight deck and an offset command island.
- Orbital Battle Station: a 53-block sphere with an 8-cannon battery.
- Colossus Super-Heavy: a 120-block-tall rocket on 133 Titan Thrusters with a fusion core.
- The Mega Wand now fills shapes up to 128 blocks on a side (24,000 blocks at once).

EVERYTHING FROM MEGACRAFT PRO

AND EVERYTHING FROM MEGACRAFT
- The Mega Table, 32-at-a-time hull plating, Rocket and Jet Engines, Wing Panels, Fuel Tanks, Cockpits, Landing Gear, Parachutes.
- Real thrust-to-weight, lift, stall, fuel, crashes, passengers, the Mega Wand shape filler, and every free blueprint.

MULTI-STAGE ROCKETS
- Stage Decouplers split a rocket into stages. Stage on command, or turn on Auto-Staging and the spent booster drops away the moment its fuel runs out.
- Dropped stages tumble back to the ground as real blocks while your upper stage keeps climbing.
- New blueprints: Falcon Two-Stage and the 70-block Apollo Three-Stage moon rocket.

FIGHTERS, GUNSHIPS, AND JUMP JETS
- Afterburners: flip them on for top speed 44 (and 3x the fuel burn), with roaring flames out the back.
- VTOL Lift Thrusters: hover, take off straight up, and land anywhere. No runway needed.
- Missile Pods: 4 missiles each, fired from the Flight Stick. With radar they home in on the nearest contact.
- Armour Plates: blast-resistant plating that lets your vehicle survive much harder hits.
- New blueprints: Raptor Stealth Fighter, Harrier VTOL, and the giant Sky Fortress Gunship.

AVIONICS AND RADAR
- The Avionics Computer is an autopilot: hold altitude in a plane, or hover and hold orbit at the top of the sky in a rocket.
- Radar Dishes show the nearest players, mobs, and other vehicles on your HUD, with distance and compass bearing. More dishes, more range.

BIGGER AND BETTER BUILDS
- 16 hull colours, plus Carbon Fibre Hull at half the mass.
- 15 blueprints that build a complete vehicle in seconds.

Everything is craftable in Survival and in the Creative inventory. The Mega Table needs iron, an iron block, a crafting table, and a diamond.

Keywords: starship, capital ship, warp drive, fusion, super-cannon, shields, gigantic, dreadnought, carrier, battle station, rocket, multi-stage, staging, plane, jet, fighter, VTOL, missile, radar, autopilot, space, flying, vehicle, giant, mega, pro, premium, engineering
`);

// ---------- zips ----------
const zip = path.join(DIST, `${NAME} - Marketplace Submission.zip`);
fs.rmSync(zip, { force: true });
execSync(`cd "${path.dirname(OUT)}" && zip -qrX "${zip}" "${NAME}" -x "*.DS_Store"`);
const addon = path.join(DIST, `${NAME}.mcaddon`);
fs.rmSync(addon, { force: true });
execSync(`cd "${ROOT}" && zip -qrX "${addon}" "${NAME} BP" "${NAME} RP" -x "*.DS_Store"`);
console.log("Marketplace package:", OUT, "\nZip:", zip, "\nTest add-on:", addon);
