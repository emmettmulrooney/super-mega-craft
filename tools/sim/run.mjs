// Gameplay simulation: runs the real MegaCraft scripts against tools/sim/mc.mjs.
// Usage: node tools/sim/run.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "../..");
const src = path.join(root, "Super MegaCraft BP/scripts");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "supermegacraft-sim-"));
const mc = pathToFileURL(path.join(here, "mc.mjs")).href;
for (const f of fs.readdirSync(src)) {
  const code = fs.readFileSync(path.join(src, f), "utf8")
    .replace(/from "@minecraft\/server(-ui)?"/g, `from "${mc}"`)
    .replace(/from "\.\/(\w+)\.js"/g, 'from "./$1.mjs"')
    .replace(/import "\.\/(\w+)\.js"/g, 'import "./$1.mjs"');
  fs.writeFileSync(path.join(tmp, f.replace(/\.js$/, ".mjs")), code);
}
const M = await import(mc);
const { BLOCK_STATES, BlockPermutation, ItemStack, FakePlayer, GameMode, fire, step, overworld, formQueue, pick, values, log, explosions, particles, grid } = M;

for (const f of fs.readdirSync(path.join(root, "Super MegaCraft BP/blocks"))) {
  const b = JSON.parse(fs.readFileSync(path.join(root, "Super MegaCraft BP/blocks", f), "utf8"))["minecraft:block"];
  const st = {};
  for (const [k, v] of Object.entries(b.description.states ?? {})) st[k] = Array.isArray(v) ? v[0] : v.values.min;
  if (b.description.traits) st["minecraft:cardinal_direction"] = "north";
  BLOCK_STATES[b.description.identifier] = st;
}
BLOCK_STATES["minecraft:air"] = {};
BLOCK_STATES["minecraft:stone"] = {};

await import(pathToFileURL(path.join(tmp, "main.mjs")).href);
const F = await import(pathToFileURL(path.join(tmp, "flight.mjs")).href);

let passed = 0;
const test = async (name, fn) => { formQueue.length = 0; await step(10); await fn(); passed++; console.log("ok -", name); };
const NS = "supermegacraft";
const at = (x, y, z) => overworld.getBlock({ x, y, z });
const setB = (x, y, z, id, states) => at(x, y, z).setPermutation(BlockPermutation.resolve(id, states));
const interact = (x, y, z, p, itemStack) => {
  const ev = { block: at(x, y, z), player: p, itemStack, isFirstEvent: true, cancel: false };
  fire("before.playerInteractWithBlock", ev);
  return ev;
};
const useItem = (p, id) => fire("after.itemUse", { source: p, itemStack: new ItemStack(id) });
const useOn = (p, id, x, y, z) => fire("before.itemUseOn", { source: p, itemStack: new ItemStack(id), block: at(x, y, z), blockFace: "Up", faceLocation: { x: x + 0.5, y: y + 1, z: z + 0.5 } });
const floor = (x0, x1, z0, z1, y = 63) => { for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) setB(x, y, z, "minecraft:stone"); };
const findAll = (id) => [...grid.entries()].filter(([, p]) => p.type.id === id).map(([k]) => k.split("|")[1].split(",").map(Number));
const lastMsg = () => log.filter((l) => l.startsWith("[to Emmett]")).at(-1) ?? "";
const emmett = new FakePlayer("Emmett");
const sam = new FakePlayer("Sam");
const wait = (t) => step(t);

// ---------------------------------------------------------------------------
await test("Mega Table crafts 32 hull from iron, cobblestone, and dye", async () => {
  floor(-5, 5, -5, 5);
  setB(0, 64, 0, `${NS}:mega_table`);
  emmett.slots[0] = new ItemStack("minecraft:iron_ingot", 4);
  emmett.slots[1] = new ItemStack("minecraft:cobblestone", 16);
  emmett.slots[2] = new ItemStack("minecraft:white_dye", 2);
  formQueue.push(pick("Hull & Glass"), pick("White Mega Hull"), values(2), { canceled: true }, { canceled: true });
  interact(0, 64, 0, emmett);
  await wait(10);
  assert.equal(emmett.count(`${NS}:hull_white`), 64);
  assert.equal(emmett.count("minecraft:iron_ingot"), 0);
});

await test("Survival blueprint is refused without the parts", async () => {
  formQueue.push(pick("Blueprints"), pick("Hopper Rocket"), { canceled: false, selection: 0 }, { canceled: true }, { canceled: true });
  interact(0, 64, 0, emmett);
  await wait(20);
  assert.equal(findAll(`${NS}:rocket_engine`).length, 0);
});

let rocketCockpit;
await test("Creative: Hopper Rocket blueprint builds in front of the table", async () => {
  emmett.mode = GameMode.creative;
  emmett.rot = { x: 0, y: 180 }; // facing north
  formQueue.push(pick("Blueprints"), pick("Hopper Rocket"), { canceled: false, selection: 0 }, { canceled: true }, { canceled: true });
  interact(0, 64, 0, emmett);
  await wait(20);
  const engines = findAll(`${NS}:rocket_engine`);
  assert.equal(engines.length, 5);
  assert.ok(engines.every(([, y, z]) => y === 64 && z < -1)); // north of the table, on the ground
  rocketCockpit = findAll(`${NS}:cockpit`)[0];
  assert.ok(rocketCockpit);
  assert.ok(log.some((l) => l.includes("Hopper Rocket built")));
});

await test("Vehicle Core reports the rocket is ready", async () => {
  const [cx, cy, cz] = findAll(`${NS}:vehicle_core`)[0];
  let body = "";
  formQueue.push((f) => { body = f.b; return { canceled: true }; });
  interact(cx, cy, cz, emmett);
  await wait(4);
  assert.match(body, /Ready to fly/);
  assert.match(body, /Type: §erocket/);
});

let flight;
await test("Rocket: countdown, liftoff, climbs to space, terrain stays put", async () => {
  const stoneBefore = findAll("minecraft:stone").length;
  interact(...rocketCockpit, emmett);
  await wait(2);
  flight = [...F.flights.values()][0];
  assert.ok(flight, "flight started");
  assert.equal(flight.kind, "rocket");
  assert.ok(emmett.titles.some((t) => t.includes("3")));
  await wait(50);
  assert.equal(flight.pos.y, 65, "still on the pad during countdown");
  await wait(20);
  assert.ok(emmett.titles.some((t) => t.includes("LIFTOFF")));
  await wait(40);
  assert.ok(flight.pos.y > 70, `climbing (y=${flight.pos.y})`);
  assert.ok(particles.get("minecraft:basic_flame_particle") > 0);
  assert.ok(Math.abs(emmett.location.y - (flight.pos.y + 1)) < 20, "pilot rides along");
  assert.equal(findAll("minecraft:stone").length, stoneBefore, "launch pad untouched");
  assert.equal(findAll(`${NS}:rocket_engine`).length, 5, "no duplicated or lost engines");
  assert.ok(findAll(`${NS}:rocket_engine`).every(([, y]) => y > 66));
  for (let i = 0; i < 40 && !flight.top; i++) await wait(20);
  assert.ok(flight.top, "reached the top of the world");
  assert.ok(log.some((l) => l.includes("REACHED SPACE")));
  assert.ok(findAll(`${NS}:hull_white`).every(([, y]) => y < 320));
});

await test("Rocket: cut engines, parachute down, touchdown, parks with fuel written back", async () => {
  formQueue.push(pick("Cut Engines"));
  useItem(emmett, `${NS}:flight_stick`);
  await wait(30);
  assert.equal(flight.throttle, 0);
  for (let i = 0; i < 120 && F.flights.size; i++) await wait(20);
  assert.equal(F.flights.size, 0, "flight ended after landing");
  assert.ok(log.some((l) => l.includes("Touchdown")));
  assert.equal(explosions.length, 0, "parachute landing is safe");
  assert.ok(findAll(`${NS}:rocket_engine`).every(([, y]) => y === 64), "back on the pad");
  assert.equal(findAll(`${NS}:rocket_engine`).length, 5);
  for (const [x, y, z] of findAll(`${NS}:fuel_tank`)) assert.equal(at(x, y, z).permutation.getState(`${NS}:used`), 0); // creative: full
  assert.ok(findAll(`${NS}:rocket_engine`).every(([x, y, z]) => at(x, y, z).permutation.getState(`${NS}:lit`) === false));
});

await test("Survival rocket burns fuel; Fuel Can refills a tank", async () => {
  emmett.mode = GameMode.survival;
  interact(...findAll(`${NS}:cockpit`)[0], emmett);
  await wait(2);
  const v = [...F.flights.values()][0];
  assert.ok(v && !v.infinite);
  await wait(60 + 300);
  assert.ok(v.fuel < v.st.fuelCap - 60, `burned ${v.st.fuelCap - v.fuel}`);
  formQueue.push(pick("Cut Engines"));
  useItem(emmett, `${NS}:flight_stick`);
  for (let i = 0; i < 60 && F.flights.size; i++) await wait(20);
  assert.equal(F.flights.size, 0);
  const tanks = findAll(`${NS}:fuel_tank`).map(([x, y, z]) => [x, y, z, at(x, y, z).permutation.getState(`${NS}:used`)]);
  const used = tanks.find((t) => t[3] > 0);
  assert.ok(used, "some tank shows it was used");
  emmett.slots[3] = new ItemStack(`${NS}:fuel_can`, 1);
  interact(used[0], used[1], used[2], emmett, new ItemStack(`${NS}:fuel_can`));
  await wait(2);
  assert.equal(at(used[0], used[1], used[2]).permutation.getState(`${NS}:used`), 0);
  assert.equal(emmett.count(`${NS}:fuel_can`), 0);
});

await test("A rocket that's too heavy refuses to launch", async () => {
  floor(30, 34, -2, 2);
  setB(32, 64, 0, `${NS}:rocket_engine`);
  setB(32, 65, 0, `${NS}:vehicle_core`);
  setB(32, 66, 0, `${NS}:fuel_tank`);
  for (let y = 67; y < 160; y++) setB(32, y, 0, `${NS}:hull_grey`); // mass ~100 > thrust 100 / 1.2
  setB(33, 65, 0, `${NS}:cockpit`);
  interact(33, 65, 0, emmett);
  await wait(2);
  assert.equal(F.flights.size, 0);
  assert.match(lastMsg(), /Too heavy/);
});

// ---------------------------------------------------------------------------
let planeV;
await test("Plane: build a Prop Plane, taxi, throttle up, take off, climb", async () => {
  emmett.mode = GameMode.creative;
  floor(95, 125, -80, 5);
  setB(110, 64, 0, `${NS}:mega_table`);
  emmett.rot = { x: 0, y: 180 };
  formQueue.push(pick("Blueprints"), pick("Prop Plane"), { canceled: false, selection: 0 }, { canceled: true }, { canceled: true });
  interact(110, 64, 0, emmett);
  await wait(20);
  const cp = findAll(`${NS}:cockpit`).find(([x]) => x > 90);
  assert.ok(cp);
  assert.equal(at(...cp).permutation.getState("minecraft:cardinal_direction"), "north");
  const startZ = cp[2];
  interact(...cp, emmett);
  await wait(2);
  planeV = [...F.flights.values()][0];
  assert.equal(planeV.kind, "plane");
  await wait(40);
  assert.ok(planeV.pos.z < startZ - 2, "taxiing north");
  assert.ok(planeV.grounded && planeV.stalled, "too slow to fly at taxi throttle");
  emmett.isJumping = true;
  emmett.rot = { x: -25, y: 180 };
  await wait(40);
  emmett.isJumping = false;
  assert.equal(planeV.throttle, 1);
  const y0 = planeV.pos.y;
  await wait(60);
  assert.ok(!planeV.stalled, `flying (speed ${planeV.speed})`);
  assert.ok(planeV.pos.y > y0 + 5, `climbing (y ${planeV.pos.y})`);
});

await test("Plane: looking east turns the whole plane", async () => {
  emmett.rot = { x: 0, y: -90 };
  await wait(20);
  assert.equal(planeV.heading, 1);
  const cp = findAll(`${NS}:cockpit`).find(([x]) => x > 90);
  assert.equal(at(...cp).permutation.getState("minecraft:cardinal_direction"), "east");
  const jets = findAll(`${NS}:jet_engine`).filter(([x]) => x > 90);
  assert.equal(jets.length, 2);
  assert.ok(jets.every(([x, y, z]) => at(x, y, z).permutation.getState("minecraft:cardinal_direction") === "east"));
  const x0 = planeV.pos.x;
  await wait(20);
  assert.ok(planeV.pos.x > x0 + 5, "flying east");
});

await test("Plane: flying into a wall at speed is a crash", async () => {
  const x = planeV.pos.x + planeV.box.hi[0] + 12;
  for (let y = planeV.pos.y - 15; y < planeV.pos.y + 15; y++) for (let z = planeV.pos.z - 30; z < planeV.pos.z + 30; z++) setB(x, y, z, "minecraft:stone");
  for (let i = 0; i < 20 && F.flights.size; i++) await wait(5);
  assert.equal(F.flights.size, 0);
  assert.ok(explosions.length > 0);
  assert.ok(log.some((l) => l.includes("CRASH")));
});

// ---------------------------------------------------------------------------
await test("Passengers can board and the pilot can bail out", async () => {
  floor(200, 204, -2, 2);
  setB(202, 64, 0, `${NS}:rocket_engine`); setB(201, 64, 0, `${NS}:rocket_engine`);
  setB(202, 65, 0, `${NS}:vehicle_core`);
  setB(202, 66, 0, `${NS}:fuel_tank`);
  setB(203, 65, 0, `${NS}:cockpit`);
  setB(201, 65, 0, `${NS}:cockpit`);
  interact(203, 65, 0, emmett);
  await wait(2);
  const v = [...F.flights.values()][0];
  sam.location = { x: 201.5, y: 66, z: 0.5 };
  interact(201, 65, 0, sam);
  await wait(2);
  assert.equal(v.riders.size, 2);
  await wait(100);
  assert.ok(Math.abs(sam.location.y - emmett.location.y) < 1.01, "passenger rides along");
  formQueue.push(pick("Bail Out"));
  useItem(emmett, `${NS}:flight_stick`);
  await wait(4);
  assert.ok(!v.riders.has(emmett.id));
  assert.ok(emmett.effects.has("slow_falling"));
  for (let i = 0; i < 60 && F.flights.size; i++) await wait(20);
  assert.equal(F.flights.size, 0, "unpiloted rocket comes back down");
});

await test("Saturn Mega Rocket: board through a window, launch, cheap block updates", async () => {
  emmett.mode = GameMode.creative;
  floor(480, 540, -60, 5);
  setB(510, 64, 0, `${NS}:mega_table`);
  emmett.rot = { x: 0, y: 180 };
  formQueue.push(pick("Blueprints"), pick("Saturn"), { canceled: false, selection: 0 }, { canceled: true }, { canceled: true });
  interact(510, 64, 0, emmett);
  await wait(30);
  const win = findAll(`${NS}:window`).filter(([x]) => x > 470)[0];
  assert.ok(win);
  interact(...win, emmett);
  await wait(2);
  const v = [...F.flights.values()][0];
  assert.ok(v, lastMsg());
  assert.ok(v.st.blocks > 1400, `${v.st.blocks} blocks`);
  await wait(80);
  const before = M.writes, y0 = v.pos.y;
  await wait(40);
  const moved = v.pos.y - y0;
  assert.ok(moved >= 3, `moved ${moved}`);
  const perMove = (M.writes - before) / moved;
  assert.ok(perMove < v.st.blocks * 0.4, `${perMove.toFixed(0)} writes per block moved (of ${v.st.blocks})`);
  console.log(`   Saturn: ${v.st.blocks} blocks, ~${perMove.toFixed(0)} block writes per move`);
  formQueue.push(pick("Cut Engines"));
  useItem(emmett, `${NS}:flight_stick`);
  for (let i = 0; i < 80 && F.flights.size; i++) await wait(20);
  assert.equal(F.flights.size, 0);
});

await test("Mega Wand fills a giant tube", async () => {
  emmett.mode = GameMode.survival;
  emmett.slots.fill(undefined);
  for (let i = 0; i < 10; i++) emmett.slots[i] = new ItemStack(`${NS}:hull_red`, 64);
  useOn(emmett, `${NS}:mega_wand`, 300, 64, 0);
  await wait(8);
  useOn(emmett, `${NS}:mega_wand`, 306, 83, 6);
  await wait(8);
  formQueue.push(values(3, 0, true));
  useItem(emmett, `${NS}:mega_wand`);
  await wait(10);
  const red = findAll(`${NS}:hull_red`).filter(([x]) => x >= 300);
  assert.ok(red.length > 100, `${red.length} blocks`);
  assert.ok(!red.some(([x, , z]) => x === 303 && z === 3), "hollow centre");
  assert.equal(emmett.count(`${NS}:hull_red`), 640 - red.length);
  assert.equal(red.filter(([, y]) => y === 64).length, red.filter(([, y]) => y === 74).length, "open-ended tube: same ring every layer");
});

// ---------------------------------------------------------------------------
// Pro
// ---------------------------------------------------------------------------
const buildBp = async (x0, name) => {
  emmett.mode = GameMode.creative;
  floor(x0 - 30, x0 + 30, -70, 5);
  setB(x0, 64, 0, `${NS}:mega_table`);
  emmett.rot = { x: 0, y: 180 };
  formQueue.push(pick("Blueprints"), pick(name), { canceled: false, selection: 0 }, { canceled: true }, { canceled: true });
  interact(x0, 64, 0, emmett);
  await wait(30);
};
const inX = (id, lo, hi) => findAll(id).filter(([x]) => x >= lo && x <= hi);

await test("Pro: Falcon Two-Stage launches, stages, booster falls back, upper stage keeps climbing", async () => {
  await buildBp(700, "Falcon");
  const cp = inX(`${NS}:cockpit`, 670, 730)[0];
  interact(...cp, emmett);
  await wait(2);
  const v = [...F.flights.values()][0];
  assert.ok(v, lastMsg());
  const enginesBefore = inX(`${NS}:rocket_engine`, 670, 730).length;
  await wait(100);
  assert.ok(v.pos.y > 70);
  formQueue.push(pick("Stage Now"));
  useItem(emmett, `${NS}:flight_stick`);
  await wait(4);
  assert.ok(log.some((l) => l.includes("STAGE SEPARATION")));
  const debris = [...F.flights.values()].find((f) => f.kind === "debris");
  assert.ok(debris, "booster is falling as its own body");
  assert.ok(v.st.rockets < enginesBefore);
  assert.equal(v.st.decouplers, 0);
  const y0 = v.pos.y;
  for (let i = 0; i < 40 && F.flights.has(debris.id); i++) await wait(10);
  assert.ok(!F.flights.has(debris.id), "booster landed");
  assert.ok(v.pos.y > y0, `upper stage still climbing (${y0} -> ${v.pos.y})`);
  assert.equal(inX(`${NS}:rocket_engine`, 670, 730).length, enginesBefore, "no engines lost or duplicated");
  assert.ok(inX(`${NS}:decoupler`, 670, 730).every(([, y]) => y < v.pos.y), "spent decoupler ring stayed with the booster");
  formQueue.push(pick("Cut Engines"));
  useItem(emmett, `${NS}:flight_stick`);
  for (let i = 0; i < 120 && F.flights.size; i++) await wait(20);
  assert.equal(F.flights.size, 0);
});

await test("Pro: auto-staging drops the booster on its own when its fuel is spent (survival)", async () => {
  await buildBp(900, "Falcon");
  emmett.mode = GameMode.survival;
  const cp = inX(`${NS}:cockpit`, 870, 930)[0];
  interact(...cp, emmett);
  await wait(2);
  const v = [...F.flights.values()][0];
  formQueue.push(pick("Auto-Staging"));
  useItem(emmett, `${NS}:flight_stick`);
  await wait(4);
  assert.equal(v.autoStage, true);
  for (let i = 0; i < 120 && v.st.decouplers; i++) await wait(10);
  assert.equal(v.st.decouplers, 0, "staged automatically");
  assert.ok(v.fuel > 0, "upper stage still has fuel");
  formQueue.push(pick("Cut Engines"));
  useItem(emmett, `${NS}:flight_stick`);
  for (let i = 0; i < 150 && F.flights.size; i++) await wait(20);
  assert.equal(F.flights.size, 0);
  emmett.mode = GameMode.creative;
});

await test("Pro: Harrier VTOL lifts straight off the pad and hovers", async () => {
  await buildBp(1100, "Harrier");
  const cp = inX(`${NS}:cockpit`, 1070, 1130)[0];
  const z0 = cp[2];
  interact(...cp, emmett);
  await wait(2);
  const v = [...F.flights.values()][0];
  assert.ok(v, lastMsg());
  formQueue.push(pick("Throttle 25%"));
  useItem(emmett, `${NS}:flight_stick`);
  emmett.rot = { x: -40, y: 180 };
  const y0 = v.pos.y;
  await wait(60);
  assert.ok(v.pos.y > y0 + 4, `climbed vertically (${y0} -> ${v.pos.y})`);
  assert.ok(!v.stalled);
  emmett.rot = { x: 0, y: 180 };
  await wait(10);
  const y1 = v.pos.y;
  await wait(40);
  assert.ok(Math.abs(v.pos.y - y1) <= 1, "level hover");
  assert.ok(Math.abs(z0 - (v.pos.z + 0)) < 40);
  assert.ok(inX(`${NS}:vtol_thruster`, 1070, 1130).some(([x, y, z]) => at(x, y, z).permutation.getState(`${NS}:lit`)));
  // autopilot altitude hold
  formQueue.push(pick("Autopilot: hold"));
  useItem(emmett, `${NS}:flight_stick`);
  await wait(4);
  assert.equal(v.hold, v.pos.y);
  emmett.rot = { x: -40, y: 180 };
  await wait(40);
  assert.ok(Math.abs(v.pos.y - v.hold) <= 1, "autopilot ignores the stick and holds height");
  formQueue.push(pick("Cut Engines"));
  useItem(emmett, `${NS}:flight_stick`);
  emmett.rot = { x: 0, y: 180 };
  for (let i = 0; i < 60 && F.flights.size; i++) await wait(20);
  assert.equal(F.flights.size, 0);
});

await test("Pro: Raptor afterburner boosts speed and fires missiles that explode on impact", async () => {
  await buildBp(1300, "Raptor");
  const cp = inX(`${NS}:cockpit`, 1270, 1330)[0];
  interact(...cp, emmett);
  await wait(2);
  const v = [...F.flights.values()][0];
  emmett.isJumping = true;
  emmett.rot = { x: -25, y: 180 };
  await wait(60);
  emmett.isJumping = false;
  emmett.rot = { x: 0, y: 180 };
  await wait(60);
  const s0 = v.speed;
  formQueue.push(pick("Afterburner"));
  useItem(emmett, `${NS}:flight_stick`);
  await wait(60);
  assert.ok(v.speed > s0 + 4, `boosted ${s0.toFixed(1)} -> ${v.speed.toFixed(1)}`);
  assert.ok(inX(`${NS}:afterburner`, 1200, 1400).some(([x, y, z]) => at(x, y, z).permutation.getState(`${NS}:lit`)));
  const boomsBefore = explosions.length;
  // wall far ahead
  const wz = v.pos.z + v.box.lo[2] - 60;
  for (let x = v.pos.x - 15; x <= v.pos.x + 15; x++) for (let y = v.pos.y - 8; y < v.pos.y + 8; y++) setB(x, y, wz, "minecraft:stone");
  formQueue.push(pick("Fire Missile"));
  useItem(emmett, `${NS}:flight_stick`);
  await wait(4);
  assert.ok(log.some((l) => l.includes("Missile away")));
  for (let i = 0; i < 40 && explosions.length === boomsBefore; i++) await wait(2);
  assert.ok(explosions.length > boomsBefore, "missile exploded");
  assert.ok(F.flights.has(v.id), "the jet that fired it is fine");
  assert.equal(v.ammo, 15);
  formQueue.push(pick("Bail Out"));
  useItem(emmett, `${NS}:flight_stick`);
  for (let i = 0; i < 60 && F.flights.size; i++) await wait(20);
});

await test("Super: Star Dreadnought builds, lifts off on repulsors, warps, and fires its super-cannon", async () => {
  emmett.mode = GameMode.creative;
  const x0 = 3000;
  setB(x0, 64, 0, `${NS}:mega_table`);
  setB(x0, 63, 0, "minecraft:stone");
  emmett.rot = { x: 0, y: 180 };
  formQueue.push(pick("Blueprints"), pick("Star Dreadnought"), { canceled: false, selection: 0 }, { canceled: true }, { canceled: true });
  interact(x0, 64, 0, emmett);
  await wait(80);
  const bridge = inX(`${NS}:capital_bridge`, x0 - 40, x0 + 40);
  assert.equal(bridge.length, 1, lastMsg());
  assert.ok(inX(`${NS}:neutronium_hull`, x0 - 40, x0 + 40).length > 10000, "over 10,000 neutronium plates");
  assert.ok(log.some((l) => l.includes("Star Dreadnought built")));
  interact(...bridge[0], emmett);
  await wait(2);
  const v = [...F.flights.values()][0];
  assert.ok(v, lastMsg());
  assert.ok(v.st.blocks > 15000);
  assert.ok(log.some((l) => l.includes("CAPITAL SHIP ONLINE")));
  const y0 = v.pos.y;
  emmett.isJumping = true;
  emmett.rot = { x: -40, y: 180 };
  await wait(80);
  emmett.isJumping = false;
  assert.ok(v.pos.y > y0 + 3, `lifted off (${y0} -> ${v.pos.y})`);
  assert.ok(inX(`${NS}:repulsor`, x0 - 40, x0 + 40).some(([x, y, z]) => at(x, y, z).permutation.getState(`${NS}:lit`)), "repulsors glow");
  emmett.rot = { x: 0, y: 180 };
  // warp jump north
  const z0 = v.pos.z;
  formQueue.push(pick("WARP JUMP"));
  useItem(emmett, `${NS}:flight_stick`);
  await wait(4);
  assert.ok(log.some((l) => l.includes("WARP!")), lastMsg());
  assert.ok(z0 - v.pos.z >= 200, `warped ${z0 - v.pos.z} blocks`);
  assert.ok(Math.abs(emmett.location.z - (v.pos.z + v.cells[v.riders.get(emmett.id)].o[2] + 0.5)) < 1, "pilot came along");
  formQueue.push(pick("Warp drive charging"));
  useItem(emmett, `${NS}:flight_stick`);
  await wait(4);
  // super-cannon at a wall ahead
  const wz = v.pos.z + v.box.lo[2] - 80;
  for (let x = v.pos.x - 6; x <= v.pos.x + 6; x++) for (let y = v.pos.y; y < v.pos.y + 40; y++) setB(x, y, wz, "minecraft:stone");
  const boomsBefore = explosions.length;
  formQueue.push(pick("FIRE SUPER-CANNON"));
  useItem(emmett, `${NS}:flight_stick`);
  await wait(4);
  assert.ok(explosions.length > boomsBefore, lastMsg());
  assert.ok(explosions.slice(boomsBefore).every((e) => e.power === 7));
  assert.ok(explosions.slice(boomsBefore).some((e) => Math.floor(e.l.z) === wz), "beam stopped at the wall");
  assert.ok(F.flights.has(v.id), "ship is fine");
  assert.equal(Math.round(v.fuel), Math.round(v.fuel), "fusion");
  formQueue.push(pick("Bail Out"));
  useItem(emmett, `${NS}:flight_stick`);
  for (let i = 0; i < 80 && F.flights.size; i++) await wait(20);
});

await test("Super: survival Colossus rocket never runs out of fuel (fusion reactor)", async () => {
  await buildBp(4000, "Colossus");
  emmett.mode = GameMode.survival;
  const cp = inX(`${NS}:cockpit`, 3970, 4030)[0];
  interact(...cp, emmett);
  await wait(2);
  const v = [...F.flights.values()][0];
  assert.ok(v, lastMsg());
  assert.ok(log.some((l) => l.includes("Fusion power online")));
  const f0 = v.fuel;
  await wait(120);
  assert.ok(v.pos.y > 70, `climbed to ${v.pos.y}`);
  assert.equal(v.fuel, f0, "no fuel burned");
  formQueue.push(pick("Bail Out"));
  useItem(emmett, `${NS}:flight_stick`);
  for (let i = 0; i < 80 && F.flights.size; i++) await wait(20);
  F.flights.clear();
});

console.log(`\n${passed} simulation tests passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);
