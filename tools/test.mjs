// Unit tests for MegaCraft's pure logic. Usage: node tools/test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "../Super MegaCraft BP/scripts");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "supermegacraft-test-"));
for (const f of ["vehicle.js", "shapes.js", "recipes.js"]) {
  fs.writeFileSync(path.join(tmp, f.replace(".js", ".mjs")), fs.readFileSync(path.join(src, f), "utf8").replace(/from "\.\/(\w+)\.js"/g, 'from "./$1.mjs"'));
}
const imp = (f) => import(pathToFileURL(path.join(tmp, f)).href);
const V = await imp("vehicle.mjs");
const S = await imp("shapes.mjs");
const R = await imp("recipes.mjs");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log("ok -", name); };
const N = (id) => `supermegacraft:${id}`;
const ids = (cells) => cells.map((c) => N(c[3]));

// ---------- scanning ----------
test("scan follows MegaCraft blocks and ignores terrain", () => {
  const w = new Map([["0,0,0", N("vehicle_core")], ["1,0,0", N("hull_white")], ["2,0,0", N("hull_red")], ["0,-1,0", "minecraft:stone"], ["3,0,0", "minecraft:iron_block"], ["0,1,0", N("cockpit")]]);
  const r = V.scan((x, y, z) => w.get(`${x},${y},${z}`), [0, 0, 0]);
  assert.equal(r.cells.length, 4);
  assert.equal(r.overflow, false);
});
test("scan stops at the block limit", () => {
  const r = V.scan(() => N("hull_white"), [0, 0, 0], 50);
  assert.ok(r.cells.length <= 50);
  assert.equal(r.overflow, true);
});
test("diagonal-only blocks are not part of the vehicle", () => {
  const w = new Map([["0,0,0", N("vehicle_core")], ["1,1,0", N("hull_white")]]);
  assert.equal(V.scan((x, y, z) => w.get(`${x},${y},${z}`), [0, 0, 0]).cells.length, 1);
});

// ---------- stats + problems ----------
test("rocket stats and thrust check", () => {
  const s = V.stats([N("vehicle_core"), N("cockpit"), N("fuel_tank"), N("rocket_engine"), ...Array(10).fill(N("hull_white"))]);
  assert.equal(s.kind, "rocket");
  assert.equal(s.mass, 2 + 2 + 2 + 4 + 10);
  assert.equal(s.thrust, 100);
  assert.deepEqual(V.problems(s), []);
  const heavy = V.stats([N("vehicle_core"), N("cockpit"), N("fuel_tank"), N("rocket_engine"), ...Array(80).fill(N("hull_white"))]);
  assert.ok(V.problems(heavy).some((p) => p.includes("Too heavy")));
});
test("plane needs lift and push", () => {
  const base = [N("vehicle_core"), N("cockpit"), N("fuel_tank"), N("jet_engine")];
  const noWings = V.stats([...base, ...Array(4).fill(N("hull_grey"))]);
  assert.equal(noWings.kind, "plane");
  assert.ok(V.problems(noWings).some((p) => p.includes("wing")));
  const ok = V.stats([...base, ...Array(4).fill(N("hull_grey")), N("wing"), N("wing")]);
  assert.deepEqual(V.problems(ok), []);
});
test("missing core / cockpit / fuel / engines are reported", () => {
  const p = V.problems(V.stats([N("hull_white")]));
  assert.equal(p.length, 4);
  assert.ok(V.problems(V.stats([N("vehicle_core"), N("vehicle_core")]))[0].includes("Only one"));
});

// ---------- physics ----------
const flight = (st, extra = {}) => ({ st, kind: st.kind, fuel: st.fuelCap, infinite: false, throttle: 1, vy: 0, speed: 0, heading: 0, ...extra });
test("rocket with enough thrust accelerates up and burns fuel", () => {
  const st = V.stats([N("vehicle_core"), N("cockpit"), N("fuel_tank"), N("rocket_engine"), ...Array(10).fill(N("hull_white"))]);
  const v = flight(st);
  let y = 0;
  for (let i = 0; i < 40; i++) y += V.physics(v, 0.05)[1] * 0.05;
  assert.ok(v.vy > 0 && y > 0);
  assert.ok(v.fuel < st.fuelCap);
  for (let i = 0; i < 2000; i++) V.physics(v, 0.05);
  assert.equal(v.vy, V.ROCKET_MAX);
});
test("rocket with no fuel falls; parachutes cap the fall speed", () => {
  const st = V.stats([N("vehicle_core"), N("cockpit"), N("fuel_tank"), N("rocket_engine")]);
  const v = flight(st, { fuel: 0 });
  for (let i = 0; i < 400; i++) V.physics(v, 0.05);
  assert.equal(v.vy, -V.TERMINAL);
  const st2 = V.stats([N("vehicle_core"), N("cockpit"), N("fuel_tank"), N("rocket_engine"), N("parachute_pod")]);
  const v2 = flight(st2, { fuel: 0 });
  for (let i = 0; i < 400; i++) V.physics(v2, 0.05);
  assert.equal(v2.vy, -V.CHUTE_FALL);
});
test("plane speeds up, stalls when slow, climbs when looking up", () => {
  const st = V.stats([N("vehicle_core"), N("cockpit"), N("fuel_tank"), N("jet_engine"), N("jet_engine"), ...Array(4).fill(N("wing"))]);
  const v = flight(st, { heading: 1 });
  let out;
  for (let i = 0; i < 200; i++) out = V.physics(v, 0.05, { lookY: 0.5 });
  assert.ok(v.speed > V.STALL);
  assert.equal(v.stalled, false);
  assert.ok(out[0] > 0 && out[1] > 0 && out[2] === 0); // east and up
  v.throttle = 0;
  for (let i = 0; i < 400; i++) out = V.physics(v, 0.05);
  assert.equal(v.stalled, true);
  assert.equal(out[1], -V.SINK);
});
test("speed cap: small craft get full speed, giants are limited but still fly", () => {
  assert.equal(V.speedCap(100, V.ROCKET_MAX), V.ROCKET_MAX);
  assert.equal(V.speedCap(1563, V.ROCKET_MAX), 10);
  assert.ok(V.speedCap(1000, V.PLANE_MAX) > V.STALL);
});
test("creative (infinite) never runs out of fuel", () => {
  const st = V.stats([N("vehicle_core"), N("cockpit"), N("fuel_tank"), N("rocket_engine")]);
  const v = flight(st, { infinite: true, fuel: 0 });
  for (let i = 0; i < 100; i++) V.physics(v, 0.05);
  assert.ok(v.vy > 0);
});
test("crash thresholds: gear and parachutes help", () => {
  const plain = V.stats([N("jet_engine")]), gear = V.stats([N("jet_engine"), N("landing_gear")]);
  assert.equal(V.isCrash(12, plain), true);
  assert.equal(V.isCrash(12, gear), false);
  const chute = V.stats([N("rocket_engine"), N("parachute_pod")]);
  assert.equal(V.isCrash(5, chute), false);
  assert.equal(V.isCrash(20, chute), true);
});
test("takeWhole splits movement into whole blocks", () => {
  const acc = [1.7, -2.2, 0.4];
  assert.deepEqual(V.takeWhole(acc), [1, -2, 0]);
  assert.ok(Math.abs(acc[0] - 0.7) < 1e-9 && Math.abs(acc[1] + 0.2) < 1e-9);
});

// ---------- geometry ----------
test("headingFromYaw matches Bedrock yaw", () => {
  assert.equal(V.headingFromYaw(0), 2); // south
  assert.equal(V.headingFromYaw(90), 3); // west
  assert.equal(V.headingFromYaw(180), 0); // north
  assert.equal(V.headingFromYaw(-180), 0);
  assert.equal(V.headingFromYaw(-90), 1); // east
  assert.equal(V.headingFromYaw(-100), 1);
});
test("rotOff turns clockwise: north -> east -> south -> west", () => {
  const n = [0, 0, -1];
  assert.deepEqual(V.rotOff(n, 1), [1, 0, 0]);
  assert.deepEqual(V.rotOff(n, 2), [0, 0, 1]);
  assert.deepEqual(V.rotOff(n, 3), [-1, 0, 0]);
  assert.deepEqual(V.rotOff(n, -1), [-1, 0, 0]);
  assert.deepEqual(V.rotOff([3, 5, 2], 4), [3, 5, 2]);
});
test("rotStates turns cardinal_direction the same way", () => {
  assert.equal(V.rotStates({ "minecraft:cardinal_direction": "north" }, 1)["minecraft:cardinal_direction"], "east");
  assert.equal(V.rotStates({ "minecraft:cardinal_direction": "west" }, 1)["minecraft:cardinal_direction"], "north");
  assert.equal(V.rotStates({ "minecraft:cardinal_direction": "north" }, -1)["minecraft:cardinal_direction"], "west");
  assert.equal(V.rotStates({ "supermegacraft:lit": true }, 1)["supermegacraft:lit"], true);
});
test("frontCells finds the leading face", () => {
  const offs = [[0, 0, 0], [0, 1, 0], [1, 0, 0]];
  const set = new Set(offs.map(V.okey));
  assert.deepEqual(V.frontCells(offs, set, 1, 1).map(V.okey).sort(), ["0,1,0", "1,0,0"]);
  assert.deepEqual(V.frontCells(offs, set, 0, -1).map(V.okey).sort(), ["0,0,0", "0,1,0"]);
});
test("fuel is spread back over tanks", () => {
  assert.deepEqual(V.tankStates(120 * 2, 3), [0, 0, 4]);
  assert.deepEqual(V.tankStates(100, 2), [0, 4]);
  assert.deepEqual(V.tankStates(1, 1), [3]);
  assert.deepEqual(V.tankStates(Infinity, 2), [0, 0]);
  assert.deepEqual(V.tankStates(0, 2), [4, 4]);
});

// ---------- shapes ----------
test("box/shell counts", () => {
  assert.equal(S.shapeCells("box", [3, 4, 5]).length, 60);
  assert.equal(S.shapeCells("shell", [3, 3, 3]).length, 26);
  assert.equal(S.shapeCells("shell", [5, 5, 5]).length, 125 - 27);
});
test("tube is hollow along its long axis, open at the ends", () => {
  const t = S.shapeCells("tube", [7, 20, 7]);
  const layer = t.filter((p) => p[1] === 10);
  assert.ok(layer.length > 8 && layer.length < 30);
  assert.ok(!t.some((p) => p[0] === 3 && p[2] === 3)); // centre is open the whole way
  assert.equal(t.filter((p) => p[1] === 0).length, layer.length);
});
test("cylinder layers are filled discs", () => {
  const c = S.shapeCells("cyl", [9, 5, 9]);
  assert.ok(c.some((p) => p[0] === 4 && p[2] === 4));
  assert.ok(!c.some((p) => p[0] === 0 && p[2] === 0)); // corners cut off
});
test("cone narrows toward the tip", () => {
  const c = S.shapeCells("cone", [9, 12, 9], 1);
  const at = (y) => c.filter((p) => p[1] === y).length;
  assert.ok(at(0) > at(6) && at(6) >= at(11) && at(11) >= 1);
  const d = S.shapeCells("cone", [9, 12, 9], -1);
  assert.ok(d.filter((p) => p[1] === 11).length > d.filter((p) => p[1] === 0).length);
});
test("wing tapers along the span", () => {
  const w = S.shapeCells("wing", [20, 1, 6], 1);
  const at = (x) => w.filter((p) => p[0] === x).length;
  assert.equal(at(0), 6);
  assert.ok(at(19) < at(0));
});
test("sphere is a hollow shell", () => {
  const s = S.shapeCells("sphere", [11, 11, 11]);
  assert.ok(!s.some((p) => p[0] === 5 && p[1] === 5 && p[2] === 5));
  assert.ok(s.some((p) => p[0] === 5 && p[1] === 0 && p[2] === 5));
});
test("longAxis", () => {
  assert.equal(S.longAxis([3, 10, 3]), 1);
  assert.equal(S.longAxis([30, 1, 6]), 0);
  assert.equal(S.longAxis([3, 3, 9]), 2);
  assert.equal(S.longAxis([9, 5, 9]), 1);
  assert.equal(S.longAxis([6, 9, 4]), 1);
});

// ---------- blueprints ----------
for (const bp of S.BLUEPRINTS) {
  test(`blueprint ${bp.name} is flyable, connected, and sane`, () => {
    const cells = bp.build();
    const keys = new Set(cells.map((c) => `${c[0]},${c[1]},${c[2]}`));
    assert.equal(keys.size, cells.length, "no duplicate cells");
    for (const c of cells) assert.ok(V.PARTS[c[3]], `unknown part ${c[3]}`);
    const st = V.stats(ids(cells));
    assert.deepEqual(V.problems(st), [], `${bp.name}: ${V.problems(st).join("; ")}`);
    assert.ok(st.blocks <= V.MAX_BLOCKS);
    assert.equal(Math.min(...cells.map((c) => c[1])), 0);
    // everything connects to the core
    const core = cells.find((c) => c[3] === "vehicle_core");
    const map = new Map(cells.map((c) => [`${c[0]},${c[1]},${c[2]}`, N(c[3])]));
    const scanned = V.scan((x, y, z) => map.get(`${x},${y},${z}`), [core[0], core[1], core[2]]);
    assert.equal(scanned.cells.length, cells.length, `${bp.name}: ${cells.length - scanned.cells.length} loose blocks`);
    // the pilot's head space above the cockpit is open
    const cp = cells.find((c) => c[3] === "cockpit" || c[3] === "capital_bridge");
    assert.ok(!keys.has(`${cp[0]},${cp[1] + 1},${cp[2]}`), `${bp.name}: cockpit is roofed over`);
  });
}
test("rockets are tall, planes are long", () => {
  const titan = S.BLUEPRINTS.find((b) => b.id === "saturn").build();
  assert.ok(Math.max(...titan.map((c) => c[1])) >= 50);
  const jumbo = S.BLUEPRINTS.find((b) => b.id === "jumbo").build();
  const xs = jumbo.map((c) => c[0]), zs = jumbo.map((c) => c[2]);
  assert.ok(Math.max(...zs) - Math.min(...zs) >= 38);
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 40);
});
test("orient rotates cells and facing", () => {
  const cells = [[0, 0, -1, "cockpit", { "minecraft:cardinal_direction": "north" }], [1, 0, 0, "hull_white"]];
  const o = S.orient(cells, "east");
  assert.deepEqual(o[0].slice(0, 3), [1, 0, 0]);
  assert.equal(o[0][4]["minecraft:cardinal_direction"], "east");
  assert.equal(S.bill(o).get("cockpit"), 1);
});

// ---------- recipes ----------
test("every recipe makes a real part and every part has a recipe", () => {
  const made = new Set(R.RECIPES.map((r) => r.out[0]));
  for (const p of Object.keys(V.PARTS)) assert.ok(made.has(N(p)), `no recipe for ${p}`);
  for (const r of R.RECIPES) { assert.ok(R.CATEGORIES.includes(r.cat)); assert.ok(R.NAMES[r.id]); assert.ok(r.in.every(([id]) => id.startsWith("minecraft:"))); }
});
test("maxCrafts", () => {
  const r = R.RECIPES.find((x) => x.id === "rocket_engine");
  assert.equal(R.maxCrafts(r, new Map([["minecraft:iron_ingot", 17], ["minecraft:blast_furnace", 3], ["minecraft:gunpowder", 8]])), 2);
  assert.equal(R.maxCrafts(r, new Map()), 0);
});

// ---------- generated pack ----------
test("generated blocks exist for every part and stay under the permutation budget", () => {
  const dir = path.join(here, "../Super MegaCraft BP/blocks");
  const files = new Set(fs.readdirSync(dir).map((f) => f.replace(".json", "")));
  for (const p of Object.keys(V.PARTS)) assert.ok(files.has(p), `missing block ${p}`);
  let perms = 0;
  for (const f of files) {
    const b = JSON.parse(fs.readFileSync(path.join(dir, `${f}.json`), "utf8"))["minecraft:block"];
    let n = 1;
    for (const v of Object.values(b.description.states ?? {})) n *= Array.isArray(v) ? v.length : v.values.max - v.values.min + 1;
    if (b.description.traits) n *= 4;
    perms += n;
  }
  assert.ok(perms < 300, `${perms} permutations`);
});

// ---------- Pro ----------
const asCells = (cells) => cells.map((c) => ({ o: [c[0], c[1], c[2]], id: N(c[3]) }));
for (const id of ["falcon", "apollo"]) test(`Pro staging: ${id} drops its bottom stage and the rest still flies`, () => {
  let cells = asCells(S.BLUEPRINTS.find((b) => b.id === id).build());
  const stages = id === "apollo" ? 2 : 1;
  for (let k = 0; k < stages; k++) {
    const split = V.stageSplit(cells);
    assert.ok(split, `stage ${k + 1} splits`);
    const keep = split.keep.map((i) => cells[i]);
    const drop = split.drop.map((i) => cells[i]);
    assert.ok(drop.some((c) => c.id === N("rocket_engine")), "spent engines drop");
    assert.ok(keep.some((c) => c.id === N("vehicle_core")) && keep.some((c) => c.id === N("cockpit")));
    assert.ok(Math.max(...drop.map((c) => c.o[1])) < Math.min(...keep.map((c) => c.o[1])), "only the part below the ring drops");
    const st = V.stats(keep.map((c) => c.id));
    assert.deepEqual(V.problems(st), [], `upper stage ${k + 1}: ${V.problems(st).join("; ")}`);
    cells = keep;
  }
  assert.equal(V.stageSplit(cells), null, "no stages left");
});
test("Pro: a rocket without decouplers has no stages", () => {
  assert.equal(V.stageSplit(asCells(S.BLUEPRINTS.find((b) => b.id === "titan").build())), null);
});
test("Pro VTOL: Harrier hovers, climbs straight up from a standstill, needs no runway", () => {
  const st = V.stats(ids(S.BLUEPRINTS.find((b) => b.id === "harrier").build()));
  assert.ok(V.canHover(st), `hover ${st.hover} vs mass ${st.mass}`);
  const v = flight(st, { throttle: 0.5 });
  const out = V.physics(v, 0.05, { lookY: 0.6 });
  assert.equal(v.stalled, false);
  assert.ok(out[1] > 0, "climbs at zero airspeed");
  const v2 = flight(st, { throttle: 0.5 });
  V.physics(v2, 0.05, { lookY: 0 });
  assert.equal(v2.vy, 0, "level hover");
  assert.equal(V.isCrash(13, st), false);
});
test("Pro afterburner: raises top speed and burns more fuel only while boosting", () => {
  const st = V.stats(ids(S.BLUEPRINTS.find((b) => b.id === "raptor").build()));
  assert.ok(st.burners > 0);
  assert.ok(V.planeTop(st, true) > V.planeTop(st, false));
  const a = flight(st), b = flight(st, { boost: true });
  for (let i = 0; i < 400; i++) { V.physics(a, 0.05); V.physics(b, 0.05); }
  assert.ok(b.speed > a.speed + 5, `boost ${b.speed} vs ${a.speed}`);
  assert.ok(st.fuelCap - b.fuel > st.fuelCap - a.fuel);
  assert.equal(b.boosting, true);
});
test("Pro: afterburners alone are not an engine", () => {
  const p = V.problems(V.stats([N("vehicle_core"), N("cockpit"), N("fuel_tank"), N("afterburner"), ...Array(10).fill(N("wing"))]));
  assert.ok(p.some((x) => x.includes("Afterburners boost Jet Engines")));
});
test("Pro autopilot: rocket hold-throttle converges on the target altitude", () => {
  const st = V.stats(ids(S.BLUEPRINTS.find((b) => b.id === "titan").build()));
  const v = flight(st, { infinite: true });
  let y = 100;
  for (let i = 0; i < 20 * 60; i++) {
    v.throttle = V.holdThrottle(v, 150, y);
    y += V.physics(v, 0.05)[1] * 0.05;
  }
  assert.ok(Math.abs(y - 150) < 2, `settled at ${y.toFixed(1)}`);
  assert.ok(Math.abs(v.vy) < 1);
});
test("Pro autopilot: planes level off at the held altitude", () => {
  const st = V.stats(ids(S.BLUEPRINTS.find((b) => b.id === "jet").build()));
  const v = flight(st, { speed: 20 });
  let y = 80;
  for (let i = 0; i < 20 * 30; i++) y += V.physics(v, 0.05, { holdY: 120, y })[1] * 0.05;
  assert.ok(Math.abs(y - 120) < 2, `at ${y.toFixed(1)}`);
});
test("Pro armour raises the crash threshold", () => {
  const plain = V.stats([N("jet_engine")]), armored = V.stats([N("jet_engine"), ...Array(10).fill(N("armor_plate"))]);
  assert.equal(V.isCrash(14, plain), true);
  assert.equal(V.isCrash(14, armored), false);
  assert.equal(V.stats([N("carbon_hull"), N("carbon_hull")]).mass, 1);
});
test("Pro radar: contacts, range, bearing", () => {
  assert.equal(V.radarRange(V.stats([N("jet_engine")])), 0);
  assert.equal(V.radarRange(V.stats([N("radar_dish")])), 64);
  assert.equal(V.radarRange(V.stats([N("radar_dish"), N("radar_dish")])), 96);
  const me = { x: 0, y: 64, z: 0 };
  const c = V.radarContacts(me, [{ name: "far", x: 0, y: 64, z: -200 }, { name: "Sam", x: 10, y: 64, z: 0 }, { name: "Zombie", x: 0, y: 64, z: -20 }], 64);
  assert.deepEqual(c.map((x) => x.name), ["Sam", "Zombie"]);
  assert.equal(c[0].bearing, "E");
  assert.equal(c[1].bearing, "N");
  assert.equal(V.bearing(me, { x: -5, z: 5 }), "SW");
});
test("Super: 16 hull colours and a 16384-block limit", () => {
  assert.equal(V.HULLS.length, 16);
  assert.equal(V.MAX_BLOCKS, 16384);
});

// ---------- Super: gigantic ----------
const bpOf = (id) => S.BLUEPRINTS.find((b) => b.id === id).build();
test("Super: capital blueprints are gigantic", () => {
  const size = (c) => [0, 1, 2].map((i) => Math.max(...c.map((q) => q[i])) - Math.min(...c.map((q) => q[i])) + 1);
  assert.ok(size(bpOf("colossus"))[1] >= 120, "Colossus is 120+ tall");
  assert.ok(size(bpOf("dreadnought"))[2] >= 130, "Dreadnought is 130+ long");
  assert.ok(size(bpOf("carrier"))[2] >= 150, "Carrier is 150+ long");
  assert.ok(size(bpOf("station"))[1] >= 50, "Battle Station is 50+ tall");
  for (const id of ["dreadnought", "carrier", "station"]) assert.ok(bpOf(id).length > 10000, `${id} is over 10,000 blocks`);
});
test("Super: starships hover on repulsors and fly from a Capital Bridge", () => {
  for (const id of ["dreadnought", "carrier", "station"]) {
    const st = V.stats(ids(bpOf(id)));
    assert.equal(st.kind, "plane");
    assert.ok(V.canHover(st), `${id}: hover ${st.hover} vs mass ${st.mass}`);
    assert.ok(st.reactors && st.warps && st.cannons && st.shields, id);
    assert.ok(bpOf(id).some((c) => c[3] === "capital_bridge"));
    const v = flight(st, { throttle: 0.5 });
    V.physics(v, 0.05, { lookY: 0.6 });
    assert.ok(v.vy > 0, `${id} climbs straight up`);
  }
});
test("Super: Titan Thrusters lift the Colossus; fusion reactors never burn fuel", () => {
  const st = V.stats(ids(bpOf("colossus")));
  assert.ok(st.titans > 100 && st.thrust >= st.mass * V.ROCKET_TWR);
  const v = flight(st, { throttle: 1 });
  const f0 = v.fuel;
  for (let i = 0; i < 200; i++) V.physics(v, 0.05);
  assert.equal(v.fuel, f0, "fusion power: no fuel burned");
  assert.ok(v.vy > 0);
  const plain = flight(V.stats(ids(bpOf("titan"))), { throttle: 1 });
  const p0 = plain.fuel;
  for (let i = 0; i < 20; i++) V.physics(plain, 0.05);
  assert.ok(plain.fuel < p0, "no reactor: burns fuel");
});
test("Super: shield generators absorb huge impacts", () => {
  const bare = V.stats([N("ion_drive")]), shielded = V.stats([N("ion_drive"), N("shield_generator"), N("shield_generator")]);
  assert.equal(V.isCrash(25, bare), true);
  assert.equal(V.isCrash(25, shielded), false);
  assert.equal(V.isCrash(60, V.stats([N("ion_drive"), ...Array(9).fill(N("shield_generator"))])), true, "shields cap at 30");
});
test("Super: warp range and landing spot", () => {
  assert.equal(V.warpRange(V.stats([N("ion_drive")])), 0);
  assert.equal(V.warpRange(V.stats([N("warp_drive")])), 64);
  assert.equal(V.warpRange(V.stats(Array(9).fill(N("warp_drive")))), 256);
  const t = V.warpTarget({ x: 0, y: 100, z: 0 }, [0, 0, -1], 128, () => true);
  assert.deepEqual(t, { pos: { x: 0, y: 100, z: -128 }, dist: 128 });
  const short = V.warpTarget({ x: 0, y: 100, z: 0 }, [0, 0, -1], 128, (p) => p.z > -100);
  assert.ok(short && short.dist < 100 && short.dist >= 16, "hops short of an obstacle");
  assert.equal(V.warpTarget({ x: 0, y: 0, z: 0 }, [1, 0, 0], 128, () => false), null);
});
test("Super: super-cannon beam skips its own hull and stops at the first wall", () => {
  const wall = (x, y, z) => z !== -50;
  const own = (x, y, z) => z > -3;
  const h = V.beamHit({ x: 0.5, y: 0.5, z: 0.5 }, [0, 0, -1], V.CANNON_RANGE, (x, y, z) => wall(x, y, z) && !own(x, y, z) || own(x, y, z), own);
  assert.equal(h.z, -50);
  assert.equal(V.beamHit({ x: 0, y: 0, z: 0 }, [1, 0, 0], 10, () => true), null);
  assert.ok(V.cannonCooldown(V.stats(Array(8).fill(N("super_cannon")))) < V.cannonCooldown(V.stats([N("super_cannon")])));
});
test("Super: capital ships move at a stately, lag-safe 3 blocks/s", () => {
  assert.equal(V.speedCap(16000, V.PLANE_MAX), V.GIANT_SPEED);
  const v = flight(V.stats(ids(bpOf("dreadnought"))), { throttle: 1 });
  for (let i = 0; i < 200; i++) V.physics(v, 0.05, { lookY: 0.6 });
  assert.ok(v.vy > 0 && v.vy <= V.GIANT_SPEED && v.speed <= V.GIANT_SPEED, `vy ${v.vy} speed ${v.speed}`);
});

console.log(`\n${passed} tests passed`);
fs.rmSync(tmp, { recursive: true, force: true });
