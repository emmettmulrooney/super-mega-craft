// Flight engine: turns a structure of MegaCraft blocks into a flying vehicle.
// Vehicles stay real blocks. Each tick we work out the physics, check the leading face for obstacles,
// and shift the whole structure by whole blocks, rewriting only the cells whose block changes.
import { world, system, BlockPermutation, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import {
  NS, scan, stats, problems, physics, isCrash, crashPower, takeWhole, rotOff, rotStates, okey, frontCells, bbox,
  headingFromYaw, CARD4, HEADINGS, tankStates, TANK_LEVELS, PER_LEVEL, USED, STALL as STALL_SPEED,
  stageSplit, holdThrottle, radarContacts, radarRange, canHover, MAX_BLOCKS, debrisPhysics,
  SEATS, ENGINES, unlimited, warpRange, warpTarget, beamHit, cannonCooldown, CANNON_RANGE, CANNON_POWER, WARP_COOLDOWN,
} from "./vehicle.js";
import { show, sound, isCreative, giveItem, countItem, particle } from "./util.js";

const COCKPIT = `${NS}:cockpit`, TANK = `${NS}:fuel_tank`, ROCKET = `${NS}:rocket_engine`, JET = `${NS}:jet_engine`;
const BURNER = `${NS}:afterburner`, VTOL = `${NS}:vtol_thruster`, POD = `${NS}:missile_pod`;
const STICK = `${NS}:flight_stick`;
const TITAN = `${NS}:titan_thruster`, ION = `${NS}:ion_drive`, REPULSOR = `${NS}:repulsor`, CANNON = `${NS}:super_cannon`;
const LIT = `${NS}:lit`;
const DT = 0.05;
const REPLACEABLE = new Set([
  "minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern", "minecraft:large_fern", "minecraft:deadbush", "minecraft:snow_layer",
  "minecraft:fire", "minecraft:soul_fire", "minecraft:vine", "minecraft:seagrass", "minecraft:kelp", "minecraft:dandelion", "minecraft:poppy",
  "minecraft:red_flower", "minecraft:yellow_flower", "minecraft:sweet_berry_bush", "minecraft:glow_lichen", "minecraft:structure_void",
]);

/** @type {Map<string, any>} vehicle id -> flight */
export const flights = new Map();
let nextId = 1;
const permKey = (p) => `${p.type.id}${JSON.stringify(p.getAllStates())}`;
const posKey = (x, y, z) => `${x},${y},${z}`;
const add = (a, o) => ({ x: a.x + o[0], y: a.y + o[1], z: a.z + o[2] });

function free(dim, l) {
  let b;
  try {
    b = dim.getBlock(l);
  } catch {
    return false;
  }
  if (!b) return false; // unloaded chunk: treat as a wall
  return b.isAir || b.isLiquid || REPLACEABLE.has(b.typeId);
}

const maxY = (dim) => {
  try {
    return dim.heightRange.max;
  } catch {
    return dim.id.endsWith("nether") ? 128 : dim.id.endsWith("the_end") ? 256 : 320;
  }
};
const minY = (dim) => {
  try {
    return dim.heightRange.min;
  } catch {
    return dim.id.endsWith("overworld") ? -64 : 0;
  }
};

/** Which flight (if any) owns the block at loc? */
export function flightAt(dim, loc) {
  for (const v of flights.values()) {
    if (v.dim.id !== dim.id) continue;
    const i = v.index.get(posKey(loc.x - v.pos.x, loc.y - v.pos.y, loc.z - v.pos.z));
    if (i !== undefined) return [v, i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------
/** Scan the vehicle that contains `loc`. Returns { cells (world coords), st, probs, overflow }. */
export function survey(dim, loc) {
  const get = (x, y, z) => {
    try {
      return dim.getBlock({ x, y, z })?.typeId;
    } catch {
      return undefined;
    }
  };
  const { cells, overflow } = scan(get, [loc.x, loc.y, loc.z]);
  const st = stats(cells.map((c) => c[3]));
  let fuel = 0;
  for (const [x, y, z, id] of cells) if (id === TANK) fuel += (TANK_LEVELS - (dim.getBlock({ x, y, z }).permutation.getState(USED) ?? 0)) * PER_LEVEL;
  fuel += st.reactors * 1000; // fusion reactors are always charged
  const probs = problems(st);
  if (overflow) probs.unshift(`Too big: vehicles can be up to ${MAX_BLOCKS} blocks.`);
  if (st.kind === "rocket" && st.push) probs.push("Use rocket-style engines (Rocket Engines, Titan Thrusters) or plane-style engines (Jet Engines, Ion Drives), not both.");
  return { cells, st, fuel, probs };
}

export function takeOff(p, dim, cockpitLoc) {
  const s = survey(dim, cockpitLoc);
  if (s.probs.length) return { ok: false, probs: s.probs };
  const infinite = isCreative(p);
  if (!infinite && s.fuel <= 0) return { ok: false, probs: ["The fuel tanks are empty. Use Fuel Cans on them."] };
  const core = s.cells.find((c) => c[3] === `${NS}:vehicle_core`);
  const pos = { x: core[0], y: core[1], z: core[2] };
  const cells = s.cells.map(([x, y, z]) => {
    const perm = dim.getBlock({ x, y, z }).permutation;
    return { o: [x - pos.x, y - pos.y, z - pos.z], perm, k: permKey(perm) };
  });
  const cockpit = cells.find((c) => c.o[0] === cockpitLoc.x - pos.x && c.o[1] === cockpitLoc.y - pos.y && c.o[2] === cockpitLoc.z - pos.z);
  const face = cockpit.perm.getState("minecraft:cardinal_direction") ?? "north";
  const v = {
    id: nextId++, dim, pos, cells, index: null, st: s.st, kind: s.st.kind, fuel: s.fuel, infinite,
    throttle: 0, vy: 0, speed: 0, heading: Math.max(0, CARD4.indexOf(face)), acc: [0, 0, 0], stalled: false,
    pilot: p.id, riders: new Map([[p.id, cells.indexOf(cockpit)]]), countdown: s.st.kind === "rocket" ? 60 : 0,
    grounded: true, turnWait: 0, lit: false, sneakT: new Map(), ticks: 0, top: false, peak: pos.y, launchY: pos.y,
  };
  reindex(v);
  flights.set(v.id, v);
  if (!countItem(p, STICK)) giveItem(p, new ItemStack(STICK, 1));
  if (v.kind === "rocket") {
    p.sendMessage(`§6[Super MegaCraft]§r Rocket armed: §f${s.st.blocks}§r blocks, thrust §f${s.st.thrust}§r vs mass §f${s.st.mass}§r.${s.st.reactors ? " §dFusion power online." : ""} Launching in 3...`);
    p.onScreenDisplay.setTitle?.("§c3", { fadeInDuration: 0, stayDuration: 20, fadeOutDuration: 0, subtitle: "§7Jump = more throttle, Sneak = less" });
  } else {
    v.throttle = 0.3; // taxi speed: below crash speed and below take-off speed
    if (s.st.blocks > 2000) p.sendMessage(`§6[Super MegaCraft]§r §d§lCAPITAL SHIP ONLINE.§r §f${s.st.blocks}§r blocks, mass §f${Math.round(s.st.mass)}§r${s.st.reactors ? ", fusion power" : ""}${s.st.warps ? `, warp range ${warpRange(s.st)}` : ""}${s.st.cannons ? `, ${s.st.cannons} super-cannons` : ""}${s.st.shields ? `, shields` : ""}.`);
    p.sendMessage(`§6[Super MegaCraft]§r ${s.st.blocks}-block plane taxiing. §7Jump = more throttle (take off above ${STALL_SPEED} speed), Sneak = less. Look up/down to climb/dive, look left/right to turn. Flight Stick = panel.`);
  }
  return { ok: true, v };
}

function reindex(v) {
  v.index = new Map(v.cells.map((c, i) => [okey(c.o), i]));
  v.box = bbox(v.cells.map((c) => c.o));
}

// ---------------------------------------------------------------------------
// Moving blocks
// ---------------------------------------------------------------------------
function rewrite(v, next, nextPos) {
  // old world positions -> perm key, new world positions -> cell
  const old = new Map();
  for (const c of v.cells) old.set(posKey(v.pos.x + c.o[0], v.pos.y + c.o[1], v.pos.z + c.o[2]), c.k);
  const neu = new Map();
  for (const c of next) neu.set(posKey(nextPos.x + c.o[0], nextPos.y + c.o[1], nextPos.z + c.o[2]), c);
  const air = BlockPermutation.resolve("minecraft:air");
  let writes = 0;
  for (const [k, c] of neu) {
    if (old.get(k) === c.k) continue;
    const [x, y, z] = k.split(",").map(Number);
    try {
      v.dim.getBlock({ x, y, z })?.setPermutation(c.perm);
      writes++;
    } catch {}
  }
  for (const k of old.keys()) {
    if (neu.has(k)) continue;
    const [x, y, z] = k.split(",").map(Number);
    try {
      v.dim.getBlock({ x, y, z })?.setPermutation(air);
      writes++;
    } catch {}
  }
  v.cells = next;
  v.pos = nextPos;
  reindex(v);
  return writes;
}

/** Try to move by whole-block vector mv. Returns false if the vehicle crashed. */
function move(v, mv, vel) {
  const offs = v.cells.map((c) => c.o);
  const set = new Set(offs.map(okey));
  const shift = [0, 0, 0];
  let landed = false;
  for (const axis of [1, 0, 2]) {
    const sign = Math.sign(mv[axis]);
    if (!sign) continue;
    const front = frontCells(offs, set, axis, sign);
    for (let n = 0; n < Math.abs(mv[axis]); n++) {
      const step = [...shift];
      step[axis] += sign;
      let blocked = false;
      if (axis === 1 && sign > 0 && v.pos.y + v.box.hi[1] + step[1] >= maxY(v.dim)) {
        blocked = true;
        if (!v.top) {
          v.top = true;
          tell(v, "§b§lYOU REACHED SPACE!§r §7The edge of the sky. Throttle down to come back.");
          ridersDo(v, (p) => sound(p, "random.levelup", 0.8, 1));
        }
      } else if (axis === 1 && sign < 0 && v.pos.y + v.box.lo[1] + step[1] < minY(v.dim)) blocked = true;
      else for (const o of front) {
        const q = [o[0] + step[0], o[1] + step[1], o[2] + step[2]];
        if (set.has(okey(q))) continue; // our own block: it moves with us
        if (!free(v.dim, { x: v.pos.x + q[0], y: v.pos.y + q[1], z: v.pos.z + q[2] })) { blocked = true; break; }
      }
      if (blocked) {
        const impact = Math.abs(vel[axis]);
        if (!v.top && isCrash(impact, v.st)) return crash(v, impact), false;
        if (axis === 1) { v.vy = 0; v.acc[1] = 0; if (sign < 0) landed = true; }
        else { v.speed = 0; v.acc[0] = v.acc[2] = 0; }
        break;
      }
      shift[axis] += sign;
    }
  }
  if (shift[1] !== 0) v.grounded = false;
  if (shift[1] < 0) v.top = false;
  if (landed) v.grounded = true;
  if (shift.some(Boolean)) rewrite(v, v.cells, { x: v.pos.x + shift[0], y: v.pos.y + shift[1], z: v.pos.z + shift[2] });
  return true;
}

/** Rotate the vehicle t quarter turns (clockwise from above) around the core, if there's room. */
function turn(v, t) {
  const next = v.cells.map((c) => {
    const st = rotStates(c.perm.getAllStates(), t);
    let perm = c.perm;
    try {
      perm = BlockPermutation.resolve(c.perm.type.id, st);
    } catch {}
    return { o: rotOff(c.o, t), perm, k: permKey(perm) };
  });
  for (const c of next) {
    if (v.index.has(okey(c.o))) continue;
    if (!free(v.dim, add(v.pos, c.o))) return false;
  }
  const seats = new Map([...v.riders].map(([id, i]) => [id, i]));
  rewrite(v, next, v.pos);
  v.riders = seats; // cell order is preserved, so seat indices still match
  v.heading = (v.heading + t + 4) % 4;
  return true;
}

function setLit(v, on, burn = false) {
  burn = on && burn;
  if (v.lit === on && v.burnLit === burn) return;
  v.lit = on;
  v.burnLit = burn;
  for (const c of v.cells) {
    const id = c.perm.type.id;
    if (!ENGINES.has(id)) continue;
    const want = id === BURNER ? burn : on;
    if (c.perm.getState(LIT) === want) continue;
    try {
      c.perm = c.perm.withState(LIT, want);
      c.k = permKey(c.perm);
      v.dim.getBlock(add(v.pos, c.o))?.setPermutation(c.perm);
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Pro: staging
// ---------------------------------------------------------------------------
/** Drop the lowest stage (everything below the lowest Decoupler). Returns true if a stage separated. */
export function stage(v) {
  const split = stageSplit(v.cells);
  if (!split) return false;
  const tanksBefore = v.cells.filter((c) => c.perm.type.id === TANK).length;
  const keepCells = split.keep.map((i) => v.cells[i]);
  const dropCells = split.drop.map((i) => v.cells[i]);
  const remap = new Map(split.keep.map((old, neu) => [old, neu]));
  for (const [id, seat] of [...v.riders]) {
    if (remap.has(seat)) v.riders.set(id, remap.get(seat));
    else {
      const p = playerById(id);
      if (p) eject(v, p, true);
    }
  }
  // the lower stage's tanks are burned first, so the upper stage keeps whatever still fits in its own tanks
  const tanksAfter = keepCells.filter((c) => c.perm.type.id === TANK).length;
  void tanksBefore;
  if (!unlimited(v)) v.fuel = Math.min(v.fuel, tanksAfter * TANK_LEVELS * PER_LEVEL);
  // the spent stage shuts down and falls on its own
  for (const c of dropCells) {
    const id = c.perm.type.id;
    if (ENGINES.has(id) && c.perm.getState(LIT)) {
      try {
        c.perm = c.perm.withState(LIT, false);
        c.k = permKey(c.perm);
        v.dim.getBlock(add(v.pos, c.o))?.setPermutation(c.perm);
      } catch {}
    }
  }
  const debris = {
    id: nextId++, dim: v.dim, pos: { ...v.pos }, cells: dropCells, index: null, st: stats(dropCells.map((c) => c.perm.type.id)), kind: "debris",
    fuel: 0, infinite: false, throttle: 0, vy: Math.min(v.vy, 0) - 3, speed: 0, heading: v.heading, acc: [0, 0, 0], stalled: false,
    pilot: null, riders: new Map(), countdown: 0, grounded: false, turnWait: 0, lit: false, sneakT: new Map(), ticks: 0, top: false, peak: v.pos.y, launchY: v.pos.y,
  };
  reindex(debris);
  flights.set(debris.id, debris);
  v.cells = keepCells;
  reindex(v);
  v.st = stats(v.cells.map((c) => c.perm.type.id));
  v.vy += 2; // separation kick
  v.lit = !v.lit; // force engines to refresh
  tell(v, `§e§lSTAGE SEPARATION!§r §7Dropped ${dropCells.length} blocks. ${v.st.rockets ? `Next stage: thrust ${v.st.thrust} vs mass ${v.st.mass}.` : "No engines left: parachutes ready."}`);
  ridersDo(v, (p) => sound(p, "random.explode", 1.4, 0.6));
  for (const c of dropCells.slice(0, 6)) particle(v.dim, "minecraft:huge_explosion_emitter", { x: v.pos.x + c.o[0] + 0.5, y: v.pos.y + c.o[1] + 1, z: v.pos.z + c.o[2] + 0.5 });
  return true;
}

// ---------------------------------------------------------------------------
// Pro: missiles (scripted projectiles fired from Missile Pods)
// ---------------------------------------------------------------------------
export const missiles = [];
const AMMO_PER_POD = 4, MISSILE_SPEED = 2.2, MISSILE_LIFE = 120;
export function fireMissile(v, p) {
  const pods = v.cells.filter((c) => c.perm.type.id === POD);
  if (!pods.length) return p?.onScreenDisplay.setActionBar("§7No Missile Pods on this vehicle."), false;
  v.ammo ??= pods.length * AMMO_PER_POD;
  if (v.ammo <= 0) return p?.onScreenDisplay.setActionBar("§cOut of missiles. Land to rearm."), false;
  v.ammo--;
  const pod = pods[v.ammo % pods.length];
  const [fx, fz] = v.kind === "plane" ? HEADINGS[v.heading] : [0, 0];
  const dir = v.kind === "plane" ? [fx, 0, fz] : [0, 1, 0];
  const lock = contacts(v)[0];
  const at = add(v.pos, pod.o);
  const start = { x: at.x + 0.5 + dir[0] * 2, y: at.y + 0.5 + dir[1] * 2 - (v.kind === "plane" ? 1 : 0), z: at.z + 0.5 + dir[2] * 2 };
  const speed = MISSILE_SPEED + Math.max(v.speed, Math.abs(v.vy)) / 20; // launched from a moving vehicle
  missiles.push({ dim: v.dim, pos: start, vel: dir.map((d) => d * speed), speed, target: lock?.entity ?? null, life: MISSILE_LIFE, owner: v.id });
  tell(v, `§cMissile away!§r ${lock ? `§7Locked on §f${lock.name}§7 ${Math.round(lock.dist)}m ${lock.bearing}.` : "§7No lock: firing straight ahead."} §8(${v.ammo} left)`);
  ridersDo(v, (q) => sound(q, "mob.blaze.shoot", 1.6, 1));
  return true;
}
function tickMissiles() {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.life--;
    // gentle homing toward the locked target
    if (m.target) {
      try {
        if (!m.target.isValid()) m.target = null;
        else {
          const t = m.target.location, d = [t.x - m.pos.x, t.y + 0.8 - m.pos.y, t.z - m.pos.z], n = Math.hypot(...d) || 1;
          m.vel = m.vel.map((v, k) => v * 0.8 + (d[k] / n) * m.speed * 0.2);
          const s = Math.hypot(...m.vel) || 1;
          m.vel = m.vel.map((v) => (v / s) * m.speed);
        }
      } catch { m.target = null; }
    }
    let boom = m.life <= 0;
    const sub = Math.ceil(m.speed / 0.9); // sub-steps under a block so missiles can't tunnel through walls
    for (let k = 0; k < sub && !boom; k++) {
      m.pos = { x: m.pos.x + m.vel[0] / sub, y: m.pos.y + m.vel[1] / sub, z: m.pos.z + m.vel[2] / sub };
      const fl = { x: Math.floor(m.pos.x), y: Math.floor(m.pos.y), z: Math.floor(m.pos.z) };
      const own = flightAt(m.dim, fl);
      if (own && own[0].id === m.owner) continue;
      if (!free(m.dim, fl)) boom = true;
      try {
        if (!boom && m.dim.getEntities({ location: m.pos, maxDistance: 1.8, excludeTypes: ["minecraft:item", "minecraft:xp_orb"] }).some((e) => !isRiderOf(e, m.owner))) boom = true;
      } catch {}
    }
    particle(m.dim, "minecraft:basic_flame_particle", m.pos);
    particle(m.dim, "minecraft:basic_smoke_particle", m.pos);
    if (boom) {
      missiles.splice(i, 1);
      try { m.dim.createExplosion(m.pos, 3, { breaksBlocks: true, causesFire: false }); } catch {}
    }
  }
}
const isRiderOf = (e, vid) => !!flights.get(vid)?.riders.has(e.id);

// ---------------------------------------------------------------------------
// Pro: radar
// ---------------------------------------------------------------------------
export function contacts(v) {
  const range = radarRange(v.st);
  if (!range) return [];
  const c = { x: v.pos.x + 0.5, y: v.pos.y + 0.5, z: v.pos.z + 0.5 };
  const list = [];
  try {
    for (const e of v.dim.getEntities({ location: c, maxDistance: range, excludeTypes: ["minecraft:item", "minecraft:xp_orb", "minecraft:arrow"] })) {
      if (v.riders.has(e.id)) continue;
      const name = e.typeId === "minecraft:player" ? e.name : e.nameTag || e.typeId.replace(/^\w+:/, "").replace(/_/g, " ");
      list.push({ name, x: e.location.x, y: e.location.y, z: e.location.z, entity: e });
    }
  } catch {}
  for (const o of flights.values()) {
    if (o.id === v.id || o.dim.id !== v.dim.id || o.kind === "debris") continue;
    list.push({ name: `${o.st.blocks}-block ${o.kind}`, x: o.pos.x, y: o.pos.y, z: o.pos.z, entity: null });
  }
  return radarContacts(c, list, range);
}

// ---------------------------------------------------------------------------
// Super: warp drive + super-cannon
// ---------------------------------------------------------------------------
/** Unit vector of where a player is looking, from their rotation (Bedrock yaw 0 = south, pitch -90 = up). */
export function lookDir(p) {
  const r = p.getRotation();
  const yaw = (r.y * Math.PI) / 180, pitch = (r.x * Math.PI) / 180;
  return [-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}

/** Jump the whole vehicle up to warpRange blocks the way it's heading (planes) or straight up/ahead (rockets). */
export function warp(v, p) {
  if (!v.st.warps) return false;
  if (v.ticks < (v.warpReady ?? 0)) return p?.onScreenDisplay.setActionBar("§7Warp drive still charging."), false;
  const h = v.kind === "rocket" ? headingFromYaw(p ? p.getRotation().y : 180) : v.heading;
  const [fx, fz] = HEADINGS[h];
  const dir = [fx, 0, fz];
  const own = new Set(v.cells.map((c) => posKey(v.pos.x + c.o[0], v.pos.y + c.o[1], v.pos.z + c.o[2])));
  const top = maxY(v.dim), bottom = minY(v.dim);
  const fits = (t) => {
    if (t.y + v.box.hi[1] >= top || t.y + v.box.lo[1] < bottom) return false;
    for (const c of v.cells) {
      const l = add(t, c.o);
      if (own.has(posKey(l.x, l.y, l.z))) continue;
      if (!free(v.dim, l)) return false;
    }
    return true;
  };
  const dest = warpTarget(v.pos, dir, warpRange(v.st), fits);
  if (!dest) return p?.onScreenDisplay.setActionBar("§cWarp blocked: no clear space ahead (or that area isn't loaded)."), false;
  for (let i = 0; i < 8; i++) particle(v.dim, "minecraft:portal_reverse_particle", add(v.pos, v.cells[(i * 997) % v.cells.length].o));
  rewrite(v, v.cells, dest.pos);
  v.acc = [0, 0, 0];
  v.grounded = false;
  v.warpReady = v.ticks + WARP_COOLDOWN;
  for (const [id, seat] of v.riders) {
    try { playerById(id)?.teleport(seatLoc(v, seat), { dimension: v.dim, keepVelocity: false }); } catch {}
  }
  tell(v, `§d§lWARP!§r §7Jumped ${dest.dist} blocks ${CARD4[h]}. Drive recharging (${WARP_COOLDOWN / 20}s).`);
  ridersDo(v, (q) => sound(q, "mob.endermen.portal", 0.5, 1));
  return dest;
}

/** Fire every super-cannon on the ship along the pilot's line of sight; the beam detonates on the first thing it hits. */
export function fireCannon(v, p) {
  const cannons = v.cells.filter((c) => c.perm.type.id === CANNON);
  if (!cannons.length) return false;
  if (v.ticks < (v.cannonReady ?? 0)) return p?.onScreenDisplay.setActionBar("§7Super-cannon recharging."), false;
  v.cannonReady = v.ticks + cannonCooldown(v.st);
  const dir = p ? lookDir(p) : (() => { const [fx, fz] = HEADINGS[v.heading]; return [fx, 0, fz]; })();
  const skip = (x, y, z) => v.index.has(okey([x - v.pos.x, y - v.pos.y, z - v.pos.z]));
  const hits = [];
  for (const c of cannons.slice(0, 4)) {
    const at = add(v.pos, c.o);
    const start = { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 };
    const hit = beamHit(start, dir, CANNON_RANGE, (x, y, z) => free(v.dim, { x, y, z }), skip);
    for (let d = 2; d < (hit?.dist ?? CANNON_RANGE); d += 6) particle(v.dim, "minecraft:dragon_breath_trail", { x: start.x + dir[0] * d, y: start.y + dir[1] * d, z: start.z + dir[2] * d });
    if (hit) {
      hits.push(hit);
      try { v.dim.createExplosion({ x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 }, CANNON_POWER, { breaksBlocks: true, causesFire: true }); } catch {}
      particle(v.dim, "minecraft:huge_explosion_emitter", { x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 });
    }
  }
  ridersDo(v, (q) => sound(q, "mob.wither.shoot", 0.4, 1));
  tell(v, hits.length ? `§c§lSUPER-CANNON!§r §7Impact at ${hits[0].dist} blocks.` : `§cSuper-cannon fired§r §7(nothing within ${CANNON_RANGE} blocks).`);
  return hits;
}

function crash(v, impact) {
  const dim = v.dim;
  const pts = [];
  const lead = v.cells.filter((_, i) => i % Math.max(1, Math.floor(v.cells.length / 4)) === 0).slice(0, 4);
  for (const c of lead) pts.push(add(v.pos, c.o));
  tell(v, `§c§lCRASH!§r §7You hit at ${impact.toFixed(1)} blocks/s.`);
  const riders = [...v.riders.keys()];
  end(v, false);
  const power = crashPower(v.st);
  for (const id of riders) {
    const p = world.getAllPlayers().find((q) => q.id === id);
    p?.addEffect("resistance", 100, { amplifier: 255, showParticles: false });
  }
  for (const l of pts) {
    try {
      dim.createExplosion({ x: l.x + 0.5, y: l.y + 0.5, z: l.z + 0.5 }, power, { breaksBlocks: true, causesFire: v.fuel > 0 });
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Riders
// ---------------------------------------------------------------------------
const playerById = (id) => world.getAllPlayers().find((p) => p.id === id);
function ridersDo(v, fn) {
  for (const id of v.riders.keys()) {
    const p = playerById(id);
    if (p) fn(p);
  }
}
function tell(v, msg) {
  ridersDo(v, (p) => p.sendMessage(`§6[Super MegaCraft]§r ${msg}`));
}
const seatLoc = (v, i) => {
  const o = v.cells[i]?.o ?? [0, 0, 0];
  return { x: v.pos.x + o[0] + 0.5, y: v.pos.y + o[1] + 1, z: v.pos.z + o[2] + 0.5 }; // sitting on the cockpit
};

export function seatPassenger(p, v, cellIndex) {
  for (const [id, i] of v.riders) if (i === cellIndex && id !== p.id) return false;
  v.riders.set(p.id, cellIndex);
  p.sendMessage("§6[Super MegaCraft]§r You're a passenger. §7Hold Sneak to get out.");
  return true;
}

function eject(v, p, bail) {
  v.riders.delete(p.id);
  if (v.pilot === p.id) v.pilot = null;
  const { lo, hi } = v.box;
  const s = seatLoc(v, 0);
  const x = v.pos.x + hi[0] + 2, z = Math.floor(s.z);
  let y = Math.floor(p.location.y);
  if (!bail) for (let k = 0; k < 64 && free(v.dim, { x, y: y - 1, z }); k++) y--;
  try {
    p.teleport({ x: x + 0.5, y, z: z + 0.5 }, { dimension: v.dim });
  } catch {}
  p.addEffect("slow_falling", bail ? 600 : 60, { showParticles: false });
  p.removeEffect("resistance");
  if (bail) p.sendMessage("§6[Super MegaCraft]§r §eBailed out!§r §7Your parachute (Slow Falling) lasts 30 seconds.");
}

/** Vehicle comes to rest: write fuel back to tanks, shut the engines down, forget it. */
function end(v, writeBack = true) {
  flights.delete(v.id);
  if (!writeBack) return;
  setLit(v, false);
  const tanks = v.cells.filter((c) => c.perm.type.id === TANK);
  const used = tankStates(v.infinite ? Infinity : v.fuel, tanks.length);
  tanks.forEach((c, i) => {
    try {
      c.perm = c.perm.withState(USED, used[i]);
      v.dim.getBlock(add(v.pos, c.o))?.setPermutation(c.perm);
    } catch {}
  });
  ridersDo(v, (p) => {
    p.removeEffect("resistance");
    p.onScreenDisplay.setActionBar("§7Engines off. Vehicle parked.");
  });
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------
function inputs(v) {
  for (const [id, seat] of [...v.riders]) {
    const p = playerById(id);
    if (!p || !p.isValid() || p.dimension.id !== v.dim.id) {
      v.riders.delete(id);
      if (v.pilot === id) v.pilot = null;
      continue;
    }
    const sl = seatLoc(v, seat);
    const d = Math.hypot(p.location.x - sl.x, p.location.y - sl.y, p.location.z - sl.z);
    if (d > 6 && v.ticks > 2) { // they teleported/died/were knocked away
      v.riders.delete(id);
      if (v.pilot === id) v.pilot = null;
      p.removeEffect("resistance");
      continue;
    }
    if (v.ticks % 20 === 0) p.addEffect("resistance", 40, { amplifier: 255, showParticles: false });
    const sneak = !!p.isSneaking;
    const st = (v.sneakT.get(id) ?? 0);
    v.sneakT.set(id, sneak ? st + 1 : 0);
    if (id === v.pilot) {
      if (p.isJumping && v.countdown <= 0) v.throttle = Math.min(1, v.throttle + 0.04);
      if (sneak) v.throttle = Math.max(0, v.throttle - 0.04);
      if (v.kind === "plane") {
        const r = p.getRotation();
        v.look = -r.x / 45;
        const want = headingFromYaw(r.y);
        if (want !== v.heading) {
          v.turnWait++;
          if (v.turnWait > 8) {
            const diff = (want - v.heading + 4) % 4;
            if (!turn(v, diff === 3 ? -1 : 1)) p.onScreenDisplay.setActionBar("§cNo room to turn here.");
            v.turnWait = 0;
          }
        } else v.turnWait = 0;
      }
    }
    // hold sneak to get out: passengers any time on the ground, pilots once throttle is 0
    const atRest = v.grounded && Math.abs(v.speed) < 1 && Math.abs(v.vy) < 1;
    if (sneak && st > 25 && atRest && (id !== v.pilot || v.throttle === 0)) eject(v, p, false);
    else if (sneak && st > 25 && !atRest && id !== v.pilot) p.onScreenDisplay.setActionBar("§7Wait for the landing, or use a Flight Stick → Bail Out.");
  }
}

function effects(v) {
  if (!v.lit || v.ticks % 2) return;
  if (v.burnLit) for (const c of v.cells.filter((q) => q.perm.type.id === BURNER).slice(0, 6)) {
    const [fx, fz] = HEADINGS[v.heading];
    particle(v.dim, "minecraft:basic_flame_particle", { x: v.pos.x + c.o[0] + 0.5 - fx * 1.2, y: v.pos.y + c.o[1] + 0.5, z: v.pos.z + c.o[2] + 0.5 - fz * 1.2 });
  }
  for (const c of v.cells.filter((q) => q.perm.type.id === VTOL).slice(0, 6)) particle(v.dim, "minecraft:basic_smoke_particle", { x: v.pos.x + c.o[0] + 0.5, y: v.pos.y + c.o[1] - 0.6, z: v.pos.z + c.o[2] + 0.5 });
  for (const c of v.cells.filter((q) => q.perm.type.id === REPULSOR).slice(0, 8)) particle(v.dim, "minecraft:blue_flame_particle", { x: v.pos.x + c.o[0] + 0.5, y: v.pos.y + c.o[1] - 0.6, z: v.pos.z + c.o[2] + 0.5 });
  const want = v.kind === "rocket" ? [ROCKET, TITAN] : [JET, ION];
  const engines = v.cells.filter((c) => want.includes(c.perm.type.id));
  const step = Math.max(1, Math.floor(engines.length / 10));
  for (let i = 0; i < engines.length; i += step) {
    const o = engines[i].o;
    if (v.kind === "rocket") {
      if (v.index.has(okey([o[0], o[1] - 1, o[2]]))) continue;
      const l = { x: v.pos.x + o[0] + 0.5, y: v.pos.y + o[1] - 0.6, z: v.pos.z + o[2] + 0.5 };
      particle(v.dim, "minecraft:basic_flame_particle", l);
      particle(v.dim, "minecraft:mobflame_single", { ...l, y: l.y - 0.6 });
      if (v.ticks % 4 === 0) particle(v.dim, "minecraft:large_explosion", { ...l, y: l.y - 1.5 });
      if (v.grounded || v.pos.y - v.launchY < 8) particle(v.dim, "minecraft:huge_explosion_emitter", { ...l, y: l.y - 2 });
    } else {
      const [fx, fz] = HEADINGS[v.heading];
      particle(v.dim, "minecraft:basic_smoke_particle", { x: v.pos.x + o[0] + 0.5 - fx, y: v.pos.y + o[1] + 0.5, z: v.pos.z + o[2] + 0.5 - fz });
    }
  }
  if (v.ticks % 10 === 0) ridersDo(v, (p) => sound(p, v.kind === "rocket" ? "mob.blaze.shoot" : "mob.ghast.fireball", v.kind === "rocket" ? 0.5 : 1.4, 0.5));
}

function hud(v) {
  if (v.ticks % 4) return;
  const alt = v.pos.y, fuelPct = v.st.reactors ? "§dFUSION" : v.infinite ? "∞" : `${Math.round((v.fuel / Math.max(1, v.st.fuelCap)) * 100)}%`;
  const bar = (t) => "§a" + "|".repeat(Math.round(t * 10)) + "§8" + "|".repeat(10 - Math.round(t * 10));
  let line = v.kind === "rocket"
    ? `§6ALT §f${alt}  §6V §f${v.vy >= 0 ? "+" : ""}${v.vy.toFixed(1)}  §6THR ${bar(v.throttle)}  §6FUEL §f${fuelPct}${v.top ? "  §b§lSPACE" : ""}`
    : `§6ALT §f${alt}  §6SPD §f${v.speed.toFixed(1)}  §6HDG §f${CARD4[v.heading].toUpperCase()}  §6THR ${bar(v.throttle)}  §6FUEL §f${fuelPct}${v.stalled && !v.grounded ? "  §c§lSTALL" : ""}`;
  if (v.boosting) line += "  §c§lBOOST";
  if (v.hold !== undefined) line += `  §bAP ${v.hold}`;
  if (v.st.warps) line += v.ticks < (v.warpReady ?? 0) ? `  §8WARP ${Math.ceil(((v.warpReady ?? 0) - v.ticks) / 20)}s` : "  §dWARP";
  if (v.st.cannons) line += v.ticks < (v.cannonReady ?? 0) ? "  §8CANNON" : "  §cCANNON";
  if (v.st.radar && v.ticks % 20 === 0) v.radarTop = contacts(v)[0];
  if (v.radarTop) line += `\n§aRADAR §f${v.radarTop.name} §7${Math.round(v.radarTop.dist)}m ${v.radarTop.bearing}`;
  ridersDo(v, (p) => p.onScreenDisplay.setActionBar(line));
}

function tickDebris(v) {
  v.ticks++;
  const vel = debrisPhysics(v, DT);
  v.acc[1] += vel[1] * DT;
  const mv = takeWhole(v.acc);
  if (mv.some(Boolean) && !move(v, mv, vel)) return;
  if (v.grounded || v.ticks > 20 * 120) flights.delete(v.id);
}

/** Lower-stage fuel is burned first: stage when only the upper stage's tanks have fuel left. */
function autoStage(v) {
  if (!v.autoStage || v.kind !== "rocket" || v.countdown > 0 || v.grounded || v.infinite) return;
  if (v.stageCap === undefined) {
    const split = stageSplit(v.cells);
    v.stageCap = split ? split.keep.filter((i) => v.cells[i].perm.type.id === TANK).length * TANK_LEVELS * PER_LEVEL : null;
  }
  if (v.stageCap !== null && v.fuel <= v.stageCap) {
    stage(v);
    v.stageCap = undefined;
  }
}

function tickFlight(v) {
  if (v.kind === "debris") return tickDebris(v);
  v.ticks++;
  inputs(v);
  if (!flights.has(v.id)) return;
  autoStage(v);
  if (v.hold !== undefined && v.kind === "rocket" && v.countdown <= 0) v.throttle = holdThrottle(v, v.hold, v.pos.y);
  if (v.countdown > 0) {
    v.countdown--;
    if (v.countdown % 20 === 0) {
      const n = v.countdown / 20;
      ridersDo(v, (p) => {
        sound(p, n ? "note.pling" : "random.explode", n ? 1 : 0.6, 1);
        p.onScreenDisplay.setTitle?.(n ? `§c${n}` : "§6§lLIFTOFF!", { fadeInDuration: 0, stayDuration: 20, fadeOutDuration: 5 });
      });
      if (!n) v.throttle = 1;
    }
  }
  setLit(v, v.throttle > 0 && (v.fuel > 0 || unlimited(v)), !!v.boosting);
  if (v.fuel <= 0 && !unlimited(v) && v.throttle > 0 && !v.outOfFuel) {
    v.outOfFuel = true;
    tell(v, v.st.chutes ? "§eOut of fuel! Parachutes deployed." : "§cOut of fuel!");
  }
  const vel = physics(v, DT, v.kind === "plane" && v.hold !== undefined ? { holdY: v.hold, y: v.pos.y } : { lookY: v.look ?? 0 });
  for (let i = 0; i < 3; i++) v.acc[i] += vel[i] * DT;
  const mv = takeWhole(v.acc);
  if (mv.some(Boolean) && !move(v, mv, vel)) return;
  v.peak = Math.max(v.peak, v.pos.y);
  for (const [id, seat] of v.riders) {
    const p = playerById(id);
    try {
      p?.teleport(seatLoc(v, seat), { dimension: v.dim, keepVelocity: false });
    } catch {}
  }
  effects(v);
  hud(v);
  // Parked: on the ground, engines off, nobody flying it.
  const thrusting = v.throttle > 0 && (v.fuel > 0 || unlimited(v));
  if (!v.grounded) v.flew = true;
  const resting = v.grounded && !thrusting && Math.abs(v.speed) < 0.5 && v.countdown <= 0;
  if (resting && (!v.pilot || v.riders.size === 0 || ((v.kind === "rocket" || canHover(v.st)) && v.flew && v.throttle === 0))) {
    if (v.flew) tell(v, `§aTouchdown!§r §7Peak altitude ${v.peak}.`);
    end(v);
  }
  else if (!v.pilot && v.throttle > 0 && v.kind === "plane") v.throttle = Math.max(0, v.throttle - 0.01); // nobody flying: engines spool down
  else if (!v.pilot && v.kind === "rocket") v.throttle = 0;
}

system.runInterval(() => {
  if (missiles.length) tickMissiles();
  for (const v of [...flights.values()]) {
    try {
      tickFlight(v);
    } catch (e) {
      console.warn(`[Super MegaCraft] flight ${v.id}: ${e}`);
      flights.delete(v.id);
    }
  }
}, 1);

// Breaking a block of a flying vehicle removes it from the vehicle (so it isn't rebuilt next move).
world.afterEvents.playerBreakBlock.subscribe(({ block }) => {
  const hit = flightAt(block.dimension, block.location);
  if (!hit) return;
  const [v, i] = hit;
  const seats = [...v.riders];
  v.cells.splice(i, 1);
  v.riders = new Map(seats.filter(([, s]) => s !== i).map(([id, s]) => [id, s > i ? s - 1 : s]));
  reindex(v);
  v.st = stats(v.cells.map((c) => c.perm.type.id));
});

// ---------------------------------------------------------------------------
// Flight Stick panel
// ---------------------------------------------------------------------------
export const riding = (p) => [...flights.values()].find((v) => v.riders.has(p.id));

function radarReport(v, p) {
  const list = contacts(v).slice(0, 8);
  const range = radarRange(v.st);
  p.sendMessage(`§a[Radar]§r range ${range}m: ${list.length ? "" : "§7nothing in range"}`);
  for (const c of list) p.sendMessage(`  §f${c.name} §7${Math.round(c.dist)}m ${c.bearing}, alt ${Math.round(c.y)}`);
}

export async function flightPanel(p) {
  const v = riding(p);
  if (!v) return p.onScreenDisplay.setActionBar("§7Sit in a Cockpit and take off first.");
  const pilot = v.pilot === p.id;
  const s = v.st;
  const opts = [];
  if (pilot) {
    for (const t of [1, 0.75, 0.5, 0.25]) opts.push([`Throttle ${t * 100}%`, () => { v.throttle = t; delete v.hold; if (v.countdown > 0) v.countdown = 0; }]);
    opts.push(["§cCut Engines", () => { v.throttle = 0; delete v.hold; }]);
    if (s.decouplers && v.kind === "rocket") {
      opts.push(["§6Stage Now (drop lower stage)", () => { if (!stage(v)) p.onScreenDisplay.setActionBar("§7No stage left to drop."); }]);
      opts.push([`Auto-Staging: ${v.autoStage ? "§aON" : "§7off"}`, () => { v.autoStage = !v.autoStage; v.stageCap = undefined; }]);
    }
    if (s.burners) opts.push([`Afterburner: ${v.boost ? "§cON" : "§7off"}`, () => (v.boost = !v.boost)]);
    if (s.avionics) {
      if (v.hold === undefined) {
        opts.push([`§bAutopilot: hold altitude ${v.pos.y}`, () => (v.hold = v.pos.y)]);
        if (v.kind === "rocket") opts.push(["§bAutopilot: hold orbit (top of the sky)", () => (v.hold = maxY(v.dim) - v.box.hi[1] - 4)]);
      } else opts.push(["§bAutopilot off", () => delete v.hold]);
    }
    if (s.warps) opts.push([v.ticks < (v.warpReady ?? 0) ? `§8Warp drive charging (${Math.ceil((v.warpReady - v.ticks) / 20)}s)` : `§d§lWARP JUMP§r §d(${warpRange(s)} blocks ahead)`, () => warp(v, p)]);
    if (s.cannons) opts.push([`§c§lFIRE SUPER-CANNON§r §8(where you look)`, () => fireCannon(v, p)]);
    if (s.pods) opts.push([`§cFire Missile §8(${v.ammo ?? s.pods * AMMO_PER_POD} left)`, () => fireMissile(v, p)]);
  }
  if (s.radar) opts.push(["§aRadar Scan", () => radarReport(v, p)]);
  opts.push(["§eBail Out (parachute)", () => eject(v, p, true)]);
  const body = [
    `§l${v.kind === "rocket" ? "Rocket" : canHover(s) ? "VTOL" : "Plane"}§r  ${s.blocks} blocks, mass ${s.mass}`,
    v.kind === "rocket" ? `Thrust ${s.thrust} (${(s.thrust / s.mass).toFixed(2)}× weight)` : `Push ${s.push}, lift ${s.lift}${s.vtols ? `, hover ${s.hover}` : ""}`,
    `Altitude ${v.pos.y} (peak ${v.peak}), fuel ${s.reactors ? "§dfusion (unlimited)§r" : v.infinite ? "unlimited" : `${Math.round(v.fuel)}/${s.fuelCap}`}`,
    s.armor ? `Armour ${s.armor}` : "",
    s.shields ? `§bShields ${s.shields}§r (absorb ${Math.min(30, s.shields * 10)} blocks/s of impact)` : "",
    s.warps ? `§dWarp drives ${s.warps}§r: jump ${warpRange(s)} blocks` : "",
    s.cannons ? `§cSuper-cannons ${s.cannons}§r: range ${CANNON_RANGE}, recharge ${(cannonCooldown(s) / 20).toFixed(1)}s` : "",
    pilot ? "§7Jump = throttle up, Sneak = throttle down. Hold Sneak on the ground with engines off to get out." : "§7You're a passenger.",
  ].filter(Boolean).join("\n");
  const f = new ActionFormData().title("§lFlight Panel").body(body);
  for (const [l] of opts) f.button(l);
  const r = await show(f, p);
  if (r.canceled || !flights.has(v.id)) return;
  opts[r.selection][1]();
}
