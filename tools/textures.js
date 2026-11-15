// Procedural pixel art for MegaCraft (16x16 blocks/items, 128x128 pack icon).
const path = require("path");
const { Img, hex, mix } = require("./lib/png.js");

const C = {
  k: hex("#101216"), d: hex("#2a2f36"), g: hex("#4b535e"), m: hex("#7f8994"), l: hex("#bcc4cc"), w: hex("#eef1f4"),
  r: hex("#a3160f"), R: hex("#ff4a2a"), o: hex("#ff9a1f"), y: hex("#ffd23a"), Y: hex("#fff6b0"),
  b: hex("#1f5fc4"), B: hex("#8fd3ff"), c: hex("#2a9ad6"), e: hex("#2c8a3c"), E: hex("#58e07a"),
  n: hex("#5a3b22"), N: hex("#8a5f3a"),
};
const HULL = {
  white: hex("#e9ecef"), grey: hex("#8e969e"), black: hex("#2b2f35"), red: hex("#c8302a"),
  orange: hex("#ec7a1c"), yellow: hex("#f0c419"), blue: hex("#2b63c9"), green: hex("#3f9b45"),
  purple: hex("#7b3fb8"), pink: hex("#f08cb8"), cyan: hex("#1c9fa8"), lime: hex("#86d33a"),
  brown: hex("#7a5232"), light_blue: hex("#6ab8f0"), magenta: hex("#c447b8"), light_grey: hex("#c2c7cc"),
};
const HULL_COLORS = Object.keys(HULL);
const ART = (rows) => rows.map((r) => r.replace(/\./g, " "));

const TERRAIN = [];
const ITEM_TEX = [];

/** Riveted plate: the base of most textures. */
function plate(col, seed) {
  const dark = mix(col, C.k, 0.28), lite = mix(col, C.w, 0.25);
  const im = new Img(16, 16).rect(0, 0, 16, 16, col);
  im.rect(0, 0, 16, 1, lite).rect(0, 0, 1, 16, lite).rect(0, 15, 16, 1, dark).rect(15, 0, 1, 16, dark);
  im.rect(0, 7, 16, 1, dark).rect(0, 8, 16, 1, lite);
  for (const [x, y] of [[2, 2], [13, 2], [2, 5], [13, 5], [2, 10], [13, 10], [2, 13], [13, 13]]) { im.set(x, y, dark); im.set(x + 1, y + 1, lite); }
  return im.noise(3, seed);
}

function makeTextures(RP, BP) {
  const T = (n) => { TERRAIN.includes(n) || TERRAIN.push(n); return path.join(RP, "textures", "blocks", `supermegacraft_${n}.png`); };
  const I = (n) => { ITEM_TEX.includes(n) || ITEM_TEX.push(n); return path.join(RP, "textures", "items", `supermegacraft_${n}.png`); };

  // --- Mega Table: a steel workbench with a blueprint on top ---
  {
    const top = new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k);
    top.rect(2, 2, 12, 12, hex("#1d4f8f")).border(2, 2, 12, 12, C.B);
    top.art(4, 3, ART([".....#..", "....###.", "....###.", "....###.", "...#####", "....###.", "...##.##", "...#...#"]), { "#": C.w }); // rocket sketch
    top.rect(3, 12, 4, 1, C.B);
    top.noise(3, 1).save(T("table_top"));
    const side = plate(C.m, 2);
    side.rect(4, 9, 8, 5, C.d).border(4, 9, 8, 5, C.k); side.rect(6, 11, 4, 1, C.y);
    side.rect(0, 0, 16, 3, C.g).rect(0, 3, 16, 1, C.k);
    side.save(T("table_side"));
    new Img(16, 16).rect(0, 0, 16, 16, C.d).border(0, 0, 16, 16, C.k).noise(3, 3).save(T("table_bottom"));
  }

  // --- Hulls ---
  HULL_COLORS.forEach((c, i) => plate(HULL[c], 10 + i).save(T(`hull_${c}`)));

  // --- Window ---
  {
    const im = new Img(16, 16).rect(0, 0, 16, 16, C.m).border(0, 0, 16, 16, C.d);
    im.rect(2, 2, 12, 12, hex("#9fd8ff", 110));
    im.rect(3, 3, 2, 5, hex("#ffffff", 200)); im.rect(5, 3, 1, 2, hex("#ffffff", 160));
    im.save(T("window"));
  }
  // --- Mega light ---
  new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k).rect(2, 2, 12, 12, C.y).rect(4, 4, 8, 8, C.Y).rect(6, 6, 4, 4, C.w).save(T("mega_light"));

  // --- Vehicle core ---
  {
    const side = plate(C.d, 20);
    side.rect(4, 3, 8, 10, C.k).border(4, 3, 8, 10, C.c);
    side.rect(6, 5, 4, 6, hex("#0d2a3a")); side.set(7, 6, C.E); side.set(8, 7, C.E); side.set(7, 8, C.R); side.set(8, 9, C.B);
    side.save(T("core_side"));
    const top = plate(C.d, 21);
    top.rect(5, 5, 6, 6, C.c).rect(6, 6, 4, 4, C.B).rect(7, 7, 2, 2, C.w);
    top.save(T("core_top"));
  }

  // --- Rocket engine ---
  for (const on of [false, true]) {
    const side = plate(C.l, 30);
    side.rect(0, 10, 16, 6, C.g); for (let x = 1; x < 16; x += 3) side.rect(x, 11, 1, 4, C.d);
    if (on) side.rect(0, 15, 16, 1, C.o);
    side.save(T(on ? "rocket_side_on" : "rocket_side"));
    const noz = new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k);
    noz.rect(2, 2, 12, 12, C.d).rect(4, 4, 8, 8, on ? C.o : C.k).rect(6, 6, 4, 4, on ? C.Y : hex("#050505"));
    noz.noise(2, 31).save(T(on ? "rocket_nozzle_on" : "rocket_nozzle"));
  }
  plate(C.l, 32).rect(6, 6, 4, 4, C.g).save(T("rocket_top"));

  // --- Jet engine ---
  {
    const intake = new Img(16, 16).rect(0, 0, 16, 16, C.m).border(0, 0, 16, 16, C.d);
    intake.rect(2, 2, 12, 12, C.k);
    for (let a = 0; a < 8; a++) { const t = (a / 8) * Math.PI * 2; for (let r = 1; r < 6; r++) intake.set(8 + Math.cos(t + r * 0.25) * r, 8 + Math.sin(t + r * 0.25) * r, C.l); }
    intake.rect(7, 7, 2, 2, C.w);
    intake.save(T("jet_intake"));
    for (const on of [false, true]) {
      const ex = new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k);
      ex.rect(3, 3, 10, 10, C.d).rect(5, 5, 6, 6, on ? C.o : C.k).rect(7, 7, 2, 2, on ? C.Y : C.k);
      ex.noise(2, 41).save(T(on ? "jet_exhaust_on" : "jet_exhaust"));
    }
    const side = plate(C.m, 42);
    side.rect(0, 3, 16, 1, C.d).rect(0, 12, 16, 1, C.d).rect(11, 4, 1, 8, C.r);
    side.save(T("jet_side"));
  }

  // --- Wing panel ---
  {
    const top = new Img(16, 16).rect(0, 0, 16, 16, C.l);
    for (let x = 0; x < 16; x += 4) top.rect(x, 0, 1, 16, C.m);
    top.rect(0, 0, 16, 1, C.w).rect(0, 15, 16, 1, C.m);
    top.noise(2, 50).save(T("wing_top"));
    new Img(16, 16).rect(0, 0, 16, 16, C.m).rect(0, 0, 16, 1, C.l).noise(2, 51).save(T("wing_bottom"));
    new Img(16, 16).rect(0, 0, 16, 16, C.l).rect(0, 7, 16, 2, C.m).rect(0, 0, 16, 1, C.w).rect(0, 15, 16, 1, C.d).noise(2, 52).save(T("wing_edge"));
  }

  // --- Cockpit ---
  {
    const front = new Img(16, 16).rect(0, 0, 16, 16, C.l).border(0, 0, 16, 16, C.m);
    front.rect(1, 1, 14, 8, C.k).rect(2, 2, 12, 6, hex("#5fb4ff")).rect(3, 3, 3, 2, C.w).rect(7, 2, 1, 6, C.k);
    front.rect(2, 10, 12, 5, C.d); front.set(4, 12, C.E); front.set(6, 12, C.R); front.set(8, 12, C.y); front.rect(10, 11, 3, 3, C.c);
    front.save(T("cockpit_front"));
    const side = new Img(16, 16).rect(0, 0, 16, 16, C.l).border(0, 0, 16, 16, C.m).rect(3, 2, 10, 6, hex("#5fb4ff")).border(3, 2, 10, 6, C.k);
    side.rect(4, 3, 2, 2, C.w).rect(2, 11, 12, 2, C.r);
    side.save(T("cockpit_side"));
    plate(C.l, 61).save(T("cockpit_back"));
    const top = new Img(16, 16).rect(0, 0, 16, 16, C.l).border(0, 0, 16, 16, C.m);
    top.rect(3, 3, 10, 10, hex("#7a2b20")).rect(4, 4, 8, 8, hex("#a23b2a")).rect(5, 10, 6, 2, C.k); // seat
    top.save(T("cockpit_top"));
    plate(C.g, 63).save(T("cockpit_bottom"));
  }

  // --- Fuel tank: gauge with 4 bars ---
  for (let used = 0; used <= 4; used++) {
    const im = plate(hex("#d9dde1"), 70);
    im.rect(0, 2, 16, 2, C.r).rect(0, 12, 16, 2, C.r);
    im.rect(5, 4, 6, 8, C.k);
    for (let b = 0; b < 4; b++) im.rect(6, 10 - b * 2, 4, 1, b < 4 - used ? (4 - used <= 1 ? C.R : C.E) : C.d);
    im.save(T(`tank_${used}`));
  }
  plate(hex("#d9dde1"), 71).rect(5, 5, 6, 6, C.g).rect(6, 6, 4, 4, C.y).save(T("tank_top"));

  // --- Landing gear ---
  {
    const side = new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k);
    side.rect(7, 0, 2, 9, C.l).rect(3, 8, 10, 8, C.k).rect(5, 10, 6, 4, C.d).rect(7, 11, 2, 2, C.m);
    side.save(T("gear_side"));
    plate(C.g, 81).save(T("gear_top"));
    new Img(16, 16).rect(0, 0, 16, 16, C.k).rect(3, 2, 10, 12, hex("#1b1b1b")).rect(3, 7, 10, 2, C.d).save(T("gear_bottom"));
  }
  // --- Parachute pod ---
  {
    const side = plate(C.o, 90);
    side.rect(3, 3, 10, 10, C.w).art(4, 4, ART(["..####..", ".######.", "########", "#.#..#.#", "..#..#..", "...##...", "...##...", "........"]), { "#": C.r });
    side.save(T("chute_side"));
    plate(C.o, 91).rect(6, 6, 4, 4, C.w).save(T("chute_top"));
  }

  // ================= Pro parts =================
  {
    // carbon fibre: woven dark weave
    const im = new Img(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) im.set(x, y, ((x >> 1) + (y >> 1)) % 2 ? hex("#1a1d22") : hex("#30353d"));
    im.rect(0, 0, 16, 1, hex("#4a515b")).rect(0, 15, 16, 1, C.k).save(T("carbon_hull"));
    // armour: heavy plate with big bolts and hazard stripe
    const ar = plate(hex("#5a6068"), 100);
    ar.border(1, 1, 14, 14, C.k);
    for (const [x, y] of [[3, 3], [11, 3], [3, 11], [11, 11]]) ar.rect(x, y, 2, 2, C.l).set(x, y, C.w);
    for (let i = 0; i < 16; i += 4) ar.rect(i, 7, 2, 2, C.y).rect(i + 2, 7, 2, 2, C.k);
    ar.save(T("armor_plate"));
    // decoupler: yellow/black separation ring with bolts
    const ds = plate(C.g, 101);
    for (let x = 0; x < 16; x++) ds.rect(x, 6, 1, 4, ((x >> 1) % 2) ? C.y : C.k);
    ds.rect(0, 5, 16, 1, C.k).rect(0, 10, 16, 1, C.k);
    ds.save(T("decoupler_side"));
    plate(C.g, 102).rect(3, 3, 10, 10, C.y).rect(5, 5, 6, 6, C.k).rect(7, 7, 2, 2, C.R).save(T("decoupler_top"));
    // avionics: rack of screens and LEDs
    const av = new Img(16, 16).rect(0, 0, 16, 16, C.d).border(0, 0, 16, 16, C.k);
    av.rect(2, 2, 12, 5, hex("#06263a")).border(2, 2, 12, 5, C.c);
    for (let x = 3; x < 13; x++) av.set(x, 5 - Math.round(Math.sin(x) * 1.2), C.E);
    for (let i = 0; i < 5; i++) av.set(3 + i * 2, 10, [C.E, C.R, C.y, C.B, C.E][i]);
    av.rect(2, 12, 12, 2, C.g);
    av.save(T("avionics_side"));
    plate(C.d, 103).rect(4, 4, 8, 8, C.c).rect(6, 6, 4, 4, C.B).save(T("avionics_top"));
    // missile pod: tubes with red warheads
    const pf = new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k);
    for (const [x, y] of [[2, 2], [9, 2], [2, 9], [9, 9]]) pf.rect(x, y, 5, 5, C.k).rect(x + 1, y + 1, 3, 3, C.r).set(x + 2, y + 2, C.R);
    pf.save(T("pod_front"));
    const ps = plate(hex("#6b7178"), 104);
    ps.rect(0, 4, 16, 2, C.r).rect(0, 10, 16, 2, C.r);
    ps.save(T("pod_side"));
    // radar dish
    const rt = new Img(16, 16).rect(0, 0, 16, 16, C.g);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 7.5) rt.set(x, y, d < 1.5 ? C.R : mix(C.w, C.l, d / 7.5)); }
    rt.save(T("radar_top"));
    plate(C.m, 105).rect(7, 0, 2, 16, C.d).rect(3, 4, 10, 2, C.l).save(T("radar_side"));
    plate(C.d, 106).save(T("radar_bottom"));
    // VTOL lift thruster: fan grille on top, nozzle below
    const vt = new Img(16, 16).rect(0, 0, 16, 16, C.m).border(0, 0, 16, 16, C.d).rect(2, 2, 12, 12, C.k);
    for (let a = 0; a < 6; a++) { const t = (a / 6) * Math.PI * 2; for (let r = 1; r < 6; r++) vt.set(8 + Math.cos(t + r * 0.3) * r, 8 + Math.sin(t + r * 0.3) * r, C.l); }
    vt.save(T("vtol_top"));
    plate(C.m, 107).rect(0, 12, 16, 4, C.g).rect(2, 13, 12, 2, C.e).save(T("vtol_side"));
    for (const on of [false, true]) new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k).rect(3, 3, 10, 10, C.d).rect(5, 5, 6, 6, on ? C.B : C.k).rect(7, 7, 2, 2, on ? C.w : C.k).save(T(on ? "vtol_nozzle_on" : "vtol_nozzle"));
    // afterburner
    new Img(16, 16).rect(0, 0, 16, 16, C.d).border(0, 0, 16, 16, C.k).rect(4, 4, 8, 8, C.g).save(T("burner_front"));
    const bs = plate(hex("#4a4038"), 108);
    for (let x = 0; x < 16; x += 2) bs.rect(x, 3, 1, 10, hex("#2a2420"));
    bs.rect(0, 13, 16, 1, C.o);
    bs.save(T("burner_side"));
    for (const on of [false, true]) {
      const ex = new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k);
      for (let r = 6; r > 0; r--) ex.rect(8 - r, 8 - r, r * 2, r * 2, on ? mix(C.Y, C.R, r / 6) : mix(C.k, C.d, r / 6));
      if (on) ex.rect(6, 6, 4, 4, hex("#b8e8ff"));
      ex.save(T(on ? "burner_exhaust_on" : "burner_exhaust"));
    }
  }

  // ================= Super parts =================
  {
    const V = hex("#7b3fd6"), Vl = hex("#c79bff"), Vd = hex("#2a0f55"), P = hex("#ff4fd8");
    // neutronium: near-black plating with violet seams
    const nh = new Img(16, 16).rect(0, 0, 16, 16, hex("#1b1d24"));
    nh.rect(0, 0, 16, 1, hex("#3a3e4a")).rect(0, 15, 16, 1, C.k).rect(0, 7, 16, 1, Vd).rect(7, 0, 1, 7, Vd).rect(3, 8, 1, 8, Vd).rect(11, 8, 1, 8, Vd);
    for (const [x, y] of [[2, 2], [12, 2], [6, 11], [14, 12]]) nh.set(x, y, Vl);
    nh.noise(3, 200).save(T("neutronium_hull"));
    // fusion reactor: plasma torus in a steel housing
    const rs = plate(C.d, 201);
    rs.rect(2, 2, 12, 12, C.k);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 5.5 && d > 2) rs.set(x, y, mix(C.Y, P, Math.abs(d - 3.8) / 1.8)); }
    rs.rect(7, 7, 2, 2, C.w).save(T("reactor_side"));
    plate(C.d, 202).rect(3, 3, 10, 10, Vd).rect(5, 5, 6, 6, P).rect(7, 7, 2, 2, C.Y).save(T("reactor_top"));
    // warp drive: swirling violet vortex
    const ws = new Img(16, 16).rect(0, 0, 16, 16, Vd).border(0, 0, 16, 16, C.k);
    for (let a = 0; a < 3; a++) for (let r = 0; r < 7; r += 0.25) { const t = r * 0.9 + (a * Math.PI * 2) / 3; ws.set(Math.round(7.5 + Math.cos(t) * r), Math.round(7.5 + Math.sin(t) * r), mix(C.w, V, r / 7)); }
    ws.save(T("warp_side"));
    plate(C.g, 203).rect(4, 4, 8, 8, Vd).rect(6, 6, 4, 4, Vl).save(T("warp_top"));
    // shield generator: hexagonal cyan emitter
    const sh = plate(C.g, 204);
    sh.rect(3, 3, 10, 10, hex("#06303a"));
    for (const [x, y] of [[5, 4], [9, 4], [3, 7], [7, 7], [11, 7], [5, 10], [9, 10]]) sh.rect(x, y, 2, 2, C.B);
    sh.save(T("shield_side"));
    plate(C.g, 205).rect(4, 4, 8, 8, C.c).rect(6, 6, 4, 4, C.B).rect(7, 7, 2, 2, C.w).save(T("shield_top"));
    // super-cannon: heavy turret with a glowing barrel mouth on top
    const cs = plate(hex("#3a3f48"), 206);
    cs.rect(0, 3, 16, 2, C.r).rect(0, 11, 16, 2, C.r).rect(6, 0, 4, 16, C.k).rect(7, 0, 2, 16, C.d);
    cs.save(T("cannon_side"));
    const ct = new Img(16, 16).rect(0, 0, 16, 16, hex("#3a3f48")).border(0, 0, 16, 16, C.k);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 6) ct.set(x, y, d < 2 ? C.R : d < 3 ? C.r : d < 4.5 ? C.k : C.d); }
    ct.save(T("cannon_top"));
    plate(C.d, 207).save(T("cannon_bottom"));
    // capital bridge: wide command viewport, consoles
    const bf = new Img(16, 16).rect(0, 0, 16, 16, C.d).border(0, 0, 16, 16, C.k);
    bf.rect(1, 2, 14, 6, hex("#5fb4ff")).rect(1, 2, 14, 1, C.k).rect(5, 2, 1, 6, C.k).rect(10, 2, 1, 6, C.k).rect(2, 3, 2, 2, C.w);
    for (let i = 0; i < 6; i++) bf.set(2 + i * 2, 11, [C.E, C.R, C.y, C.B, P, C.E][i]);
    bf.rect(2, 13, 12, 1, Vl).save(T("bridge_front"));
    const bsd = plate(C.d, 208); bsd.rect(2, 4, 12, 3, hex("#5fb4ff")).rect(0, 11, 16, 2, V); bsd.save(T("bridge_side"));
    const btp = new Img(16, 16).rect(0, 0, 16, 16, C.d).border(0, 0, 16, 16, C.k);
    btp.rect(4, 4, 8, 8, hex("#4a1d7a")).rect(5, 5, 6, 6, hex("#6b2fa8")).rect(6, 10, 4, 2, C.k).save(T("bridge_top"));
    plate(C.d, 209).save(T("bridge_bottom"));
    // titan thruster: massive bell nozzle
    for (const on of [false, true]) {
      const tsd = plate(hex("#9aa3ad"), 210);
      tsd.rect(0, 9, 16, 7, C.d); for (let x = 0; x < 16; x += 2) tsd.rect(x, 10, 1, 5, C.k);
      tsd.rect(0, 2, 16, 2, V);
      if (on) tsd.rect(0, 14, 16, 2, C.o);
      tsd.save(T(on ? "titan_side_on" : "titan_side"));
      const tn = new Img(16, 16).rect(0, 0, 16, 16, C.d).border(0, 0, 16, 16, C.k);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 7) tn.set(x, y, on ? mix(C.w, C.o, d / 7) : mix(hex("#050505"), C.g, d / 7)); }
      tn.save(T(on ? "titan_nozzle_on" : "titan_nozzle"));
    }
    plate(hex("#9aa3ad"), 211).rect(4, 4, 8, 8, V).rect(6, 6, 4, 4, Vl).save(T("titan_top"));
    // ion drive: blue grid emitter
    new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k).rect(4, 4, 8, 8, C.d).rect(6, 6, 4, 4, C.k).save(T("ion_front"));
    const isd = plate(hex("#5b6470"), 212); isd.rect(0, 6, 16, 4, C.c).rect(0, 7, 16, 2, C.B); isd.save(T("ion_side"));
    for (const on of [false, true]) {
      const ie = new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k);
      for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) ie.set(x, y, (x + y) % 3 ? (on ? C.B : C.d) : on ? C.w : C.k);
      ie.save(T(on ? "ion_exhaust_on" : "ion_exhaust"));
    }
    // repulsor lift: glowing anti-gravity pad underneath
    plate(C.m, 213).rect(0, 12, 16, 4, Vd).rect(2, 13, 12, 2, V).save(T("repulsor_side"));
    plate(C.m, 214).rect(5, 5, 6, 6, C.g).save(T("repulsor_top"));
    for (const on of [false, true]) {
      const rp = new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 6.5) rp.set(x, y, on ? mix(C.w, C.B, Math.abs(Math.sin(d * 1.4))) : mix(C.k, C.d, (Math.round(d) % 2) * 0.8)); }
      rp.save(T(on ? "repulsor_pad_on" : "repulsor_pad"));
    }
  }

  // --- Items ---
  const items = {
    fuel_can: [
      "................", ".....kkkk.......", ".....kyyk.......", "...kkkkkkkkk....", "..krrrrrrrrrk...", "..krRRRRRRRrk...",
      "..krRkkkkkRrk...", "..krRkyyykRrk...", "..krRkyyykRrk...", "..krRkkkkkRrk...", "..krRRRRRRRrk...", "..krrrrrrrrrk...",
      "..krrrrrrrrrk...", "...kkkkkkkkk....", "................", "................",
    ],
    mega_wand: [
      "................", "...........yY...", "..........yYYy..", "...........yY.y.", "..........kk....", ".........kNk....",
      "........kNk.....", ".......kNk......", "......kNk.......", ".....kNk........", "....kNk.........", "...kNk..........",
      "..kNk...........", "..kk............", "................", "................",
    ],
    flight_stick: [
      "................", "......kkkk......", ".....kRRRRk.....", ".....kRkkRk.....", ".....kRRRRk.....", "......kddk......",
      "......kddk......", "......kddk......", "......kddk......", ".......dd.......", "....kkkkkkkk....", "...kddddddddk...",
      "...kdmmEEmmdk...", "...kddddddddk...", "....kkkkkkkk....", "................",
    ],
  };
  for (const [id, rows] of Object.entries(items)) new Img(16, 16).art(0, 0, ART(rows), C).save(I(id));

  // --- Pack icon: a giant rocket lifting off past a plane ---
  {
    const im = new Img(32, 32);
    for (let y = 0; y < 32; y++) { const c = mix(hex("#0b1640"), hex("#3f86d8"), y / 32); for (let x = 0; x < 32; x++) im.set(x, y, c); }
    for (const [x, y] of [[3, 3], [26, 5], [9, 8], [29, 13], [5, 15]]) im.set(x, y, C.w);
    // rocket
    im.art(11, 1, ART([
      ".....rr.....", "....rwwr....", "...rwwwwr...", "...wwwwww...", "...wwBBww...", "...wwBBww...", "...wwwwww...", "...rrrrrr...",
      "...wwwwww...", "...wwwwww...", "...kkkkkk...", "...wwwwww...", "..rwwwwwwr..", ".rrwwwwwwrr.", ".rr.gggg.rr.", "....gggg....",
      "....oooo....", "...oYYYYo...", "...oYwwYo...", "..ooYYYYoo..", "...ooYYoo...", "....oooo....",
    ]), { r: C.r, w: C.w, B: C.c, k: C.k, g: C.g, o: C.o, Y: C.Y });
    // smoke clouds
    for (const [x, y, r] of [[8, 29, 4], [16, 30, 5], [24, 29, 4], [3, 31, 3], [29, 31, 3]]) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (a * a + b * b <= r * r) im.set(x + a, y + b, mix(C.l, C.w, ((a + b + 8) % 3) / 3));
    // plane
    im.art(22, 17, ART(["...m.....", "..mmm....", "mmlllllll", "..mmm....", "...m....."]), { m: C.g, l: C.l });
    // capital ship looming behind
    for (let x = 0; x < 11; x++) for (let y = 0; y <= Math.floor(x / 3); y++) im.set(31 - x, 9 + y, hex("#3a3e4a"));
    for (let x = 1; x < 10; x += 3) im.set(31 - x, 9, hex("#c79bff"));
    // violet SUPER badge
    im.rect(0, 0, 21, 7, hex("#2a0f55"));
    im.art(1, 1, ART([".##.#.#.##..###.##.", "#...#.#.#.#.#...#.#", ".#..#.#.##..##..##.", "..#.#.#.#...#...#.#", "##...#..#...###.#.#"]), { "#": hex("#e9d4ff") });
    const big = im.scaled(4);
    big.save(path.join(RP, "pack_icon.png"));
    big.save(path.join(BP, "pack_icon.png"));
  }
}

module.exports = { makeTextures, TERRAIN, ITEM_TEX, HULL_COLORS };
