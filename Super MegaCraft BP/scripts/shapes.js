// Pure geometry for the Mega Wand and Mega Table blueprints. Unit-tested (tools/test.mjs).
// Offsets are [x, y, z] with y up; blueprints point their nose north (-z) before rotation.
import { rotOff, CARD4, stats, NS, PARTS } from "./vehicle.js";

export const SHAPES = [
  ["box", "Solid Box"], ["shell", "Hollow Box"], ["cyl", "Solid Cylinder"], ["tube", "Tube (open ends, for fuselages)"],
  ["sphere", "Hollow Ellipsoid"], ["cone", "Hollow Cone (nose cone)"], ["wing", "Wing (flat, tapered)"],
];
export const MAX_SPAN = 128, MAX_CELLS = 24000;

/** Longest axis of a size vector (ties prefer y, then z). */
export function longAxis(s) {
  // if two sides match and the third differs (e.g. 9×5×9 or 5×30×5), the odd one out is the axis
  if (s[0] === s[2] && s[1] !== s[0]) return 1;
  if (s[0] === s[1] && s[2] !== s[0]) return 2;
  if (s[1] === s[2] && s[0] !== s[1]) return 0;
  return s[1] >= s[0] && s[1] >= s[2] ? 1 : s[2] >= s[0] ? 2 : 0;
}

const inEllipse = (u, v, w, h) => {
  const a = w / 2, b = h / 2, du = u + 0.5 - a, dv = v + 0.5 - b;
  return (du * du) / (a * a) + (dv * dv) / (b * b) <= 1.0001;
};

/**
 * Cells of `kind` filling a box of `size` (all offsets in 0..size-1).
 * `tip` (cone/wing) chooses which end of the long axis is narrow: +1 = high end, -1 = low end.
 */
export function shapeCells(kind, size, tip = 1) {
  const [sx, sy, sz] = size;
  const ax = longAxis(size), [ua, va] = [0, 1, 2].filter((i) => i !== ax);
  const L = size[ax];
  const inside = (p) => {
    if (p[0] < 0 || p[1] < 0 || p[2] < 0 || p[0] >= sx || p[1] >= sy || p[2] >= sz) return false;
    switch (kind) {
      case "box": case "shell": return true;
      case "cyl": case "tube": return inEllipse(p[ua], p[va], size[ua], size[va]);
      case "sphere": {
        let d = 0;
        for (let i = 0; i < 3; i++) { const a = size[i] / 2, t = (p[i] + 0.5 - a) / a; d += t * t; }
        return d <= 1.0001;
      }
      case "cone": {
        const t = tip > 0 ? p[ax] / L : (L - 1 - p[ax]) / L; // 0 at the wide end
        const k = Math.max(0, 1 - t);
        const w = Math.max(1, size[ua] * k), h = Math.max(1, size[va] * k);
        const du = p[ua] + 0.5 - size[ua] / 2, dv = p[va] + 0.5 - size[va] / 2;
        return (du * du) / ((w / 2) ** 2) + (dv * dv) / ((h / 2) ** 2) <= 1.0001;
      }
      case "wing": {
        // flat: thinnest axis is thickness; taper the chord toward the tip of the long axis
        const thin = [0, 1, 2].reduce((m, i) => (size[i] < size[m] ? i : m), 0);
        const chordAx = [0, 1, 2].find((i) => i !== ax && i !== thin) ?? ua;
        const t = tip > 0 ? p[ax] / L : (L - 1 - p[ax]) / L;
        const chord = Math.max(1, Math.round(size[chordAx] * (1 - 0.6 * t)));
        return p[chordAx] < chord;
      }
    }
    return false;
  };
  const hollow = kind === "shell" || kind === "tube" || kind === "sphere" || kind === "cone";
  const nbrs = kind === "tube" ? [ua, va] : [0, 1, 2];
  const out = [];
  for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) {
    const p = [x, y, z];
    if (!inside(p)) continue;
    if (hollow) {
      let edge = false;
      for (const i of nbrs) for (const d of [-1, 1]) { const q = [...p]; q[i] += d; if (!inside(q)) edge = true; }
      if (kind === "tube" && (size[ua] <= 2 || size[va] <= 2)) edge = true;
      if (!edge) continue;
    }
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Blueprints. Each cell: [x, y, z, part, states?]. Parts are MegaCraft block names without namespace.
// ---------------------------------------------------------------------------
const disk = (r) => {
  const out = [];
  for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) if (x * x + z * z <= r * r + r * 0.8) out.push([x, z]);
  return out;
};
const ringOf = (r) => {
  const d = new Set(disk(r).map(([x, z]) => `${x},${z}`));
  return disk(r).filter(([x, z]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !d.has(`${x + a},${z + b}`)));
};

function put(map, x, y, z, part, states) {
  map.set(`${x},${y},${z}`, [x, y, z, part, states]);
}
const NOSE = { "minecraft:cardinal_direction": "north" };

/** A vertical rocket: engines at y=0, hollow body, cockpit near the top, nose cone, parachutes. */
export function rocket({ r, h, color = "white", stripe = "red", boosters = 0, engine = "rocket_engine", reactor = false }) {
  const m = new Map();
  const ring = ringOf(r), body = h - r - 2;
  for (const [x, z] of disk(r)) put(m, x, 0, z, engine);
  for (let y = 1; y < body; y++) for (const [x, z] of ring) put(m, x, y, z, `hull_${y % 8 === 4 || y % 8 === 5 ? stripe : color}`);
  // centre column: core, fuel, cockpit
  put(m, 0, 1, 0, "vehicle_core");
  const cockY = body - 2;
  for (let y = 2; y < cockY; y++) put(m, 0, y, 0, "fuel_tank");
  if (reactor) put(m, 0, 2, 0, "fusion_reactor");
  put(m, 0, cockY, 0, "cockpit", NOSE);
  for (const [x, z] of ring) if (Math.abs(x) + Math.abs(z) <= r + 1 && (x === 0 || z === 0)) put(m, x, cockY + 1, z, "window");
  // nose cone
  // nose: an open ring over the pilot's head, then solid tapering discs
  for (const [x, z] of ring) put(m, x, body, z, `hull_${color}`);
  for (let k = 1; k <= r; k++) for (const [x, z] of disk(r - k + 1)) put(m, x, body + k, z, `hull_${k === r ? stripe : color}`);
  put(m, 0, body + r + 1, 0, "parachute_pod");
  put(m, 0, body + r + 2, 0, "mega_light");
  // strap-on boosters
  const spots = [[r + 2, 0], [-(r + 2), 0], [0, r + 2], [0, -(r + 2)]].slice(0, boosters);
  for (const [bx, bz] of spots) {
    const bh = Math.round(body * 0.6);
    put(m, bx, 0, bz, engine);
    for (let y = 1; y < bh; y++) put(m, bx, y, bz, y < bh - 1 ? "fuel_tank" : `hull_${stripe}`);
    put(m, bx, bh, bz, `hull_${color}`);
    // strut to the body
    const sx = Math.sign(bx), sz = Math.sign(bz);
    for (let k = 1; k < 2; k++) put(m, bx - sx * k, Math.round(bh / 2), bz - sz * k, `hull_${color}`);
  }
  return [...m.values()];
}

/** A multi-stage rocket: each lower stage is engines + tanks under a ring of Decouplers; the top stage is a full rocket. */
export function staged({ r, stages, upperH, color = "white", stripe = "black" }) {
  const m = new Map();
  const ring = ringOf(r);
  let y0 = 0;
  for (const h of stages) {
    for (const [x, z] of disk(r)) put(m, x, y0, z, "rocket_engine");
    for (let y = 1; y < h; y++) {
      for (const [x, z] of ring) put(m, x, y0 + y, z, `hull_${y % 6 === 3 ? stripe : color}`);
      for (const [x, z] of disk(Math.max(0, r - 2))) put(m, x, y0 + y, z, "fuel_tank");
    }
    for (const [x, z] of disk(r)) put(m, x, y0 + h, z, "decoupler");
    y0 += h + 1;
  }
  for (const [x, y, z, p, s] of rocket({ r, h: upperH, color, stripe })) put(m, x, y + y0, z, p, s);
  return [...m.values()];
}

/** A plane pointing north (-z). Fuselage along z, wings along x. Pro options add afterburners, missiles, radar, avionics, VTOL. */
export function plane({ len, fr, span, chord, jets, color = "white", stripe = "blue", burners = false, pods = 0, radar = false, avionics = false, vtol = false, armor = false }) {
  const m = new Map();
  const ring = ringOf(fr);
  // fuselage tube along z, nose at z=0
  for (let z = 2; z < len; z++) for (const [x, y] of ring) put(m, x, y, z, `hull_${z % 6 === 0 ? stripe : color}`);
  for (const [x, y] of disk(Math.max(0, fr - 1))) put(m, x, y, 1, `hull_${color}`);
  put(m, 0, 0, 0, `hull_${stripe}`);
  for (const [x, y] of disk(fr)) put(m, x, y, len, `hull_${color}`); // tail cap
  // inside: cockpit near the nose with a canopy, then core and fuel
  put(m, 0, 0, 2, "cockpit", NOSE);
  put(m, 0, fr, 2, "window"); put(m, 0, fr, 3, "window");
  if (fr > 1) { put(m, 1, fr - 1, 2, "window"); put(m, -1, fr - 1, 2, "window"); }
  put(m, 0, 0, 4, "vehicle_core");
  for (let z = 5; z < len - 1; z++) put(m, 0, 0, z, "fuel_tank");
  // keel: ties the centre column (cockpit, core, tanks) to the bottom of a wide fuselage
  for (let z = 2; z < len; z++) for (let y = -fr + 1; y < 0; y++) put(m, 0, y, z, `hull_${color}`);
  // main wings at the middle, y=0
  const wz = Math.floor(len * 0.4);
  const half = Math.floor(span / 2);
  const lead = new Map(); // |x| -> leading-edge z of the wing
  for (let x = fr + 1; x <= half; x++) {
    const t = (x - fr - 1) / Math.max(1, half - fr - 1);
    const c = Math.max(1, Math.round(chord * (1 - 0.5 * t)));
    lead.set(x, wz + Math.round(t * 2));
    for (let k = 0; k < c; k++) { put(m, x, 0, lead.get(x) + k, "wing"); put(m, -x, 0, lead.get(x) + k, "wing"); }
  }
  // jets hang under the wings
  let podX = fr + 1;
  for (let i = 0; i < jets; i++) {
    const ax = Math.min(half, fr + 2 + Math.floor(i / 2) * 3);
    const x = ax * (i % 2 ? -1 : 1);
    put(m, x, -1, lead.get(ax), "jet_engine", NOSE);
    if (burners) put(m, x, -1, lead.get(ax) + 1, "afterburner", NOSE);
    podX = Math.max(podX, ax + 2);
  }
  // missile pods hang under the outer wing
  for (let i = 0; i < pods; i++) {
    const ax = Math.min(half, podX + Math.floor(i / 2));
    put(m, ax * (i % 2 ? -1 : 1), -1, lead.get(ax), "missile_pod");
  }
  if (radar) put(m, 0, fr + 1, Math.floor(len * 0.5), "radar_dish");
  if (avionics) put(m, 0, 0, 5, "avionics");
  if (armor) for (const [x, y, z, p] of [...m.values()]) if (p.startsWith("hull_") && y === fr && z > 3) put(m, x, y, z, "armor_plate");
  // tail: fin + stabilisers
  const fh = fr + 3;
  for (let y = fr + 1; y < fh; y++) for (let z = len - 2 - (fh - y) + 1; z <= len; z++) put(m, 0, y, z, `hull_${stripe}`);
  const st = Math.max(2, Math.floor(half / 3));
  for (let x = fr + 1; x <= fr + st; x++) for (const z of [len - 1, len]) { put(m, x, 0, z, "wing"); put(m, -x, 0, z, "wing"); }
  // landing gear
  put(m, 0, -fr - 1, 3, "landing_gear");
  put(m, fr + 1, -1, lead.get(fr + 1) + 1, "landing_gear"); put(m, -fr - 1, -1, lead.get(fr + 1) + 1, "landing_gear");
  if (fr > 1) for (const [x, y, z] of [...m.values()]) if (y === -fr && Math.abs(x) <= 0 && z > 3 && z % 8 === 0) put(m, x, y - 1, z, "landing_gear");
  // keep the pilot's head space clear (open canopy on thin fuselages), windscreen in front
  for (let y = 1; y <= 2; y++) m.delete(`0,${y},2`);
  put(m, 0, 1, 1, "window");
  // VTOL: swap the inner wing panels for lift thrusters until they can hold the craft up
  if (vtol) {
    const wings = [...m.values()].filter((c) => c[3] === "wing" && c[1] === 0).sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]) || a[2] - b[2]);
    const st = () => stats([...m.values()].map((c) => `${NS}:${c[3]}`));
    for (const w of wings) {
      const s = st();
      if (s.hover >= s.mass * 1.15) break;
      put(m, w[0], w[1], w[2], "vtol_thruster");
    }
  }
  // shift so the lowest block is at y=0
  const cells = [...m.values()];
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y, z, p, s]) => [x, y - minY, z, p, s]);
}

// ---------------------------------------------------------------------------
// Super: gigantic capital ships. Hulls are a thick (26-neighbour) skin around a solid, so every
// hull block touches the next face-to-face and the whole ship scans as one vehicle.
// ---------------------------------------------------------------------------
const N26 = [];
for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) N26.push([a, b, c]);
function skin(inside, lo, hi) {
  const out = [];
  for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
    if (!inside(x, y, z)) continue;
    if (N26.some(([a, b, c]) => !inside(x + a, y + b, z + c))) out.push([x, y, z]);
  }
  return out;
}

/**
 * A capital starship pointing north (-z). `shape` is "wedge" (star destroyer), "slab" (carrier deck),
 * or "orb" (battle station). It hovers on Repulsors, cruises on Ion Drives, never runs out of fuel
 * (Fusion Reactors), jumps with Warp Drives, and fires Super-Cannons from its dorsal spine.
 */
export function capital({ shape = "wedge", len, half, height, color = "grey", stripe = "black", ions = 8, reactors = 2, warps = 2, cannons = 4, shields = 2, deck = false }) {
  let inside;
  if (shape === "wedge") {
    inside = (x, y, z) => {
      if (z < 0 || z >= len || y < 0) return false;
      const t = z / Math.max(1, len - 1);
      const hw = 2 + (half - 2) * Math.min(1, t * 1.5), hh = 3 + (height - 3) * Math.min(1, t * 1.3);
      return Math.abs(x) <= hw && y < hh - Math.abs(x) * (height / (half * 3)); // sloped flanks
    };
  } else if (shape === "slab") {
    inside = (x, y, z) => z >= 0 && z < len && y >= 0 && y < height && Math.abs(x) <= (z < 8 ? half - (8 - z) : half);
  } else {
    const r = half;
    inside = (x, y, z) => { const dy = y - r, dz = z - r; return x * x + dy * dy + dz * dz <= r * r + r * 0.6; };
  }
  const lo = [-half - 1, -1, -1], hi = [half + 1, Math.max(height, half * 2) + 1, Math.max(len, half * 2) + 1];
  const m = new Map();
  for (const [x, y, z] of skin(inside, lo, hi)) put(m, x, y, z, z % 12 === 6 ? `hull_${stripe}` : Math.abs(x) % 10 === 5 ? `hull_${color}` : "neutronium_hull");
  const cells = () => [...m.values()];
  const minY = Math.min(...cells().map((c) => c[1]));
  const isBottom = (c) => !inside(c[0], c[1] - 1, c[2]);
  const isTop = (c) => !inside(c[0], c[1] + 1, c[2]);
  const isRear = (c) => !inside(c[0], c[1], c[2] + 1) && inside(c[0], c[1], c[2] - 1);
  const isFront = (c) => !inside(c[0], c[1], c[2] - 1);
  // windows: rows of lit portholes along both flanks
  for (const c of cells()) if (!isTop(c) && !isBottom(c) && Math.abs(c[0]) >= 2 && c[1] === Math.round(height / 2) && c[2] % 3 === 0) put(m, c[0], c[1], c[2], "window");
  // ion drives across the stern, from the middle outward
  const stern = cells().filter((c) => isRear(c) && !isTop(c) && !isBottom(c)).sort((a, b) => Math.hypot(a[0], a[1] - height / 2) - Math.hypot(b[0], b[1] - height / 2));
  for (const c of stern.slice(0, ions)) put(m, c[0], c[1], c[2], "ion_drive", NOSE);
  // keel systems: core, reactors, warp drives, shield generators on the bottom centre line
  const keel = cells().filter((c) => isBottom(c) && c[1] === minY).sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]) || Math.abs(a[2] - len / 2) - Math.abs(b[2] - len / 2));
  const sys = ["vehicle_core", ...Array(reactors).fill("fusion_reactor"), ...Array(warps).fill("warp_drive"), ...Array(shields).fill("shield_generator")];
  sys.forEach((p, i) => put(m, keel[i][0], keel[i][1], keel[i][2], p));
  // dorsal spine: super-cannons along the top centre line, from the bow back
  const spine = cells().filter((c) => isTop(c) && Math.abs(c[0]) <= 1 && c[3] !== "window").sort((a, b) => a[2] - b[2] || Math.abs(a[0]) - Math.abs(b[0]));
  const used = new Set();
  for (const c of spine) {
    if (used.size >= cannons) break;
    if ([...used].some((z) => Math.abs(z - c[2]) < 4) || isFront(c)) continue;
    used.add(c[2]);
    put(m, c[0], c[1], c[2], "super_cannon");
  }
  // flight deck (carriers): a glowing landing strip down the middle of the top
  if (deck) for (const c of cells()) if (isTop(c) && c[0] === 0 && c[2] % 4 === 0 && c[3].includes("hull")) put(m, c[0], c[1], c[2], "mega_light");
  // command tower and Capital Bridge, 4/5 of the way back, with open sky above the helm
  const tz = Math.round(len * (shape === "orb" ? 0.5 : 0.78));
  const tx = shape === "slab" ? Math.floor(half * 0.6) : 0;
  let top = -Infinity;
  for (const c of cells()) if (c[0] === tx && c[2] === tz) top = Math.max(top, c[1]);
  for (let k = 1; k <= 3; k++) for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) put(m, tx + dx, top + k, tz + dz, k === 3 && dz < 0 ? "window" : `hull_${color}`);
  for (let k = 1; k <= 3; k++) m.delete(`${tx},${top + k},${tz}`);
  put(m, tx, top + 1, tz, "hull_" + stripe);
  put(m, tx, top + 2, tz, "capital_bridge", NOSE);
  put(m, tx + 1, top + 3, tz, "radar_dish"); put(m, tx - 1, top + 3, tz, "mega_light");
  // repulsors under the keel until they hold the whole ship up with 20% to spare
  let mass = 0, hover = 0;
  for (const c of m.values()) { mass += PARTS[c[3]].mass; hover += PARTS[c[3]].hover ?? 0; }
  const pads = [...m.values()].filter((c) => isBottom(c) && c[3].includes("hull") && (c[0] + c[2]) % 3 === 0).sort((a, b) => (a[2] % 6) - (b[2] % 6) || Math.abs(a[0]) - Math.abs(b[0]));
  for (const c of pads) {
    if (hover >= mass * 1.2) break;
    mass += PARTS.repulsor.mass - PARTS[c[3]].mass;
    hover += PARTS.repulsor.hover;
    put(m, c[0], c[1], c[2], "repulsor");
  }
  return [...m.values()].map(([x, y, z, p, s]) => [x, y - minY, z, p, s]);
}

/** Cache blueprint builds: capital ships are tens of thousands of cells. */
const memo = (fn) => { let c; return () => (c ??= fn()); };

export const BLUEPRINTS = [
  { id: "hopper", name: "Hopper Rocket", desc: "A small test rocket, 14 blocks tall.", build: () => rocket({ r: 1, h: 14 }) },
  { id: "titan", name: "Titan Rocket", desc: "A big orbital rocket, 34 blocks tall, with 2 boosters.", build: () => rocket({ r: 2, h: 34, boosters: 2, stripe: "black" }) },
  { id: "saturn", name: "Saturn Mega Rocket", desc: "A colossal moon rocket, 56 blocks tall, with 4 boosters.", build: () => rocket({ r: 4, h: 56, boosters: 4, color: "white", stripe: "black" }) },
  { id: "prop", name: "Prop Plane", desc: "A small plane, 12 long with a 15 block wingspan.", build: () => plane({ len: 12, fr: 1, span: 15, chord: 3, jets: 2, stripe: "red" }) },
  { id: "jet", name: "Fighter Jet", desc: "A fast grey jet, 18 long.", build: () => plane({ len: 18, fr: 1, span: 17, chord: 5, jets: 4, color: "grey", stripe: "black" }) },
  { id: "jumbo", name: "Jumbo Jet", desc: "A giant airliner, 40 long with a 45 block wingspan.", build: () => plane({ len: 40, fr: 3, span: 45, chord: 6, jets: 8, stripe: "blue" }) },
  // ---- Pro blueprints ----
  { id: "falcon", name: "§6PRO§r Falcon Two-Stage", desc: "A two-stage orbital rocket. The booster drops away when its fuel is spent (Flight Stick → Auto-Staging or Stage Now).", build: () => staged({ r: 2, stages: [16], upperH: 20, stripe: "black" }) },
  { id: "apollo", name: "§6PRO§r Apollo Three-Stage", desc: "A 70-block, three-stage moon rocket with two Decoupler rings.", build: () => staged({ r: 3, stages: [18, 14], upperH: 30, stripe: "black" }) },
  { id: "raptor", name: "§6PRO§r Raptor Stealth Fighter", desc: "Black stealth fighter with afterburners, 4 missile pods, radar, and an autopilot computer.", build: () => plane({ len: 20, fr: 1, span: 19, chord: 5, jets: 4, color: "black", stripe: "grey", burners: true, pods: 4, radar: true, avionics: true }) },
  { id: "harrier", name: "§6PRO§r Harrier VTOL", desc: "Vertical take-off jump jet: lift thrusters let it hover, climb straight up, and land anywhere.", build: () => plane({ len: 14, fr: 1, span: 13, chord: 3, jets: 2, color: "grey", stripe: "green", vtol: true, avionics: true }) },
  { id: "gunship", name: "§6PRO§r Sky Fortress Gunship", desc: "A huge armoured bomber: armour plating, 8 missile pods, radar, autopilot, and afterburners.", build: () => plane({ len: 34, fr: 2, span: 37, chord: 6, jets: 8, color: "grey", stripe: "black", burners: true, pods: 8, radar: true, avionics: true, armor: true }) },
  // ---- Super blueprints: gigantic ----
  { id: "colossus", name: "§dSUPER§r Colossus Super-Heavy", desc: "A 120-block-tall super-heavy launcher on Titan Thrusters with a fusion core. The biggest rocket ever built in Minecraft.", build: memo(() => rocket({ r: 6, h: 120, boosters: 4, color: "white", stripe: "black", engine: "titan_thruster", reactor: true })) },
  { id: "dreadnought", name: "§dSUPER§r Star Dreadnought", desc: "A 136-block wedge-shaped capital warship. Hovers on repulsors, fusion powered, warp drives, 6 super-cannons, shields.", build: memo(() => capital({ shape: "wedge", len: 136, half: 29, height: 19, ions: 16, reactors: 3, warps: 4, cannons: 6, shields: 3 })) },
  { id: "carrier", name: "§dSUPER§r Planetary Carrier", desc: "A 150-block flying aircraft carrier with a lit flight deck, an offset command island, and room to land your fighters on top.", build: memo(() => capital({ shape: "slab", len: 150, half: 20, height: 9, color: "light_grey", stripe: "blue", ions: 12, reactors: 2, warps: 2, cannons: 2, shields: 2, deck: true })) },
  { id: "station", name: "§dSUPER§r Orbital Battle Station", desc: "A moon-sized 53-block sphere with a planet-cracking super-cannon battery. It hovers, it warps, and it does not run out of fuel.", build: memo(() => capital({ shape: "orb", len: 53, half: 26, height: 53, color: "grey", stripe: "black", ions: 10, reactors: 4, warps: 4, cannons: 8, shields: 4 })) },
];

/** Rotate blueprint cells to face `dir` (north/east/south/west) and count the parts needed. */
export function orient(cells, dir) {
  const t = Math.max(0, CARD4.indexOf(dir));
  return cells.map(([x, y, z, p, s]) => {
    const [rx, ry, rz] = rotOff([x, y, z], t);
    const st = s ? { "minecraft:cardinal_direction": CARD4[(CARD4.indexOf(s["minecraft:cardinal_direction"]) + t) % 4] } : undefined;
    return [rx, ry, rz, p, st];
  });
}
export function bill(cells) {
  const n = new Map();
  for (const c of cells) n.set(c[3], (n.get(c[3]) ?? 0) + 1);
  return n;
}
