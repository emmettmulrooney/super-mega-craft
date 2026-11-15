// Pure vehicle maths for MegaCraft: scanning, part stats, flight physics, rotation. Unit-tested (tools/test.mjs).
export const NS = "supermegacraft";

/** mass in "blocks"; thrust lifts that much mass; push drives planes; lift holds planes up; fuel in units. */
export const HULLS = [
  "white", "grey", "black", "red", "orange", "yellow", "blue", "green",
  "purple", "pink", "cyan", "lime", "brown", "light_blue", "magenta", "light_grey",
];
export const PARTS = {
  ...Object.fromEntries(HULLS.map((c) => [`hull_${c}`, { mass: 1 }])),
  carbon_hull: { mass: 0.5 },
  armor_plate: { mass: 2, armor: true },
  window: { mass: 1 },
  rocket_engine: { mass: 4, thrust: 100 },
  jet_engine: { mass: 3, push: 60 },
  afterburner: { mass: 3, push: 40, burner: true },
  vtol_thruster: { mass: 3, hover: 40 },
  wing: { mass: 1, lift: 12 },
  fuel_tank: { mass: 2, fuel: 120 },
  cockpit: { mass: 2, seat: true },
  vehicle_core: { mass: 2, core: true },
  landing_gear: { mass: 1, gear: true },
  parachute_pod: { mass: 1, chute: true },
  mega_light: { mass: 1 },
  decoupler: { mass: 1, decoupler: true },
  avionics: { mass: 2, avionics: true },
  missile_pod: { mass: 2, pod: true },
  radar_dish: { mass: 1, radar: true },
  // ---- Super: gigantic hardware ----
  neutronium_hull: { mass: 1.5, armor: true },
  titan_thruster: { mass: 16, thrust: 600 },
  ion_drive: { mass: 10, push: 400 },
  repulsor: { mass: 8, hover: 400 },
  fusion_reactor: { mass: 12, fuel: 1000, reactor: true },
  warp_drive: { mass: 8, warp: true },
  capital_bridge: { mass: 6, seat: true, avionics: true, radar: true },
  super_cannon: { mass: 12, cannon: true },
  shield_generator: { mass: 6, shield: true },
};
export const MAX_BLOCKS = 16384;
/** Seats a pilot can fly from. */
export const SEATS = new Set([`${NS}:cockpit`, `${NS}:capital_bridge`]);
/** Engines that glow while firing. */
export const ENGINES = new Set(["rocket_engine", "jet_engine", "vtol_thruster", "afterburner", "titan_thruster", "ion_drive", "repulsor"].map((p) => `${NS}:${p}`));
/** Fusion reactors power the whole vehicle: no fuel burn, ever. */
export const unlimited = (v) => !!v.infinite || (v.st?.reactors ?? 0) > 0;
export const WARP_PER_DRIVE = 64, WARP_MAX = 256, WARP_COOLDOWN = 200;
export const warpRange = (s) => (s.warps ? Math.min(WARP_MAX, WARP_PER_DRIVE * s.warps) : 0);
export const CANNON_RANGE = 384, CANNON_POWER = 7;

/** First blocked cell along a straight beam. isFree(x,y,z) -> bool; skip(x,y,z) ignores our own hull. */
export function beamHit(start, dir, range, isFree, skip = () => false) {
  for (let d = 1; d <= range; d++) {
    const x = Math.floor(start.x + dir[0] * d), y = Math.floor(start.y + dir[1] * d), z = Math.floor(start.z + dir[2] * d);
    if (skip(x, y, z)) continue;
    if (!isFree(x, y, z)) return { x, y, z, dist: d };
  }
  return null;
}

/** Where a warp jump lands: the full range if it's clear, otherwise shorter and shorter hops. fits(pos) -> bool. */
export function warpTarget(pos, dir, range, fits, minHop = 16) {
  for (let r = range; r >= minHop; r = Math.floor(r * 0.75)) {
    const t = { x: pos.x + dir[0] * r, y: pos.y + dir[1] * r, z: pos.z + dir[2] * r };
    if (fits(t)) return { pos: t, dist: r };
  }
  return null;
}
/** Ticks between super-cannon shots: more cannons, faster recharge. */
export const cannonCooldown = (s) => Math.max(20, Math.round(100 / Math.max(1, s.cannons)));
export const TANK_LEVELS = 4, PER_LEVEL = 30; // a full tank = 120 fuel
export const USED = `${NS}:used`; // fuel tank state: 0 = full, 4 = empty

/** Only MegaCraft parts are structural, so a vehicle never grabs terrain, houses, or launch pads. */
export function partOf(id) {
  if (!id || !id.startsWith(`${NS}:`)) return null;
  return PARTS[id.slice(NS.length + 1)] ?? null;
}

/** Spread `fuel` back over n tanks (rounding up per tank). Returns the `used` state for each. */
export function tankStates(fuel, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = Math.max(0, Math.min(TANK_LEVELS * PER_LEVEL, fuel));
    fuel -= f;
    out.push(TANK_LEVELS - Math.ceil(f / PER_LEVEL));
  }
  return out;
}

const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** Flood-fill vehicle parts from `start` (the core). getType(x,y,z) -> typeId | undefined. */
export function scan(getType, start, max = MAX_BLOCKS) {
  const k = (x, y, z) => `${x},${y},${z}`;
  const seen = new Set([k(...start)]);
  const cells = [];
  const stack = [[...start, getType(...start)]];
  let overflow = false;
  while (stack.length) {
    const [x, y, z, id] = stack.pop();
    cells.push([x, y, z, id]);
    for (const [dx, dy, dz] of D6) {
      const n = [x + dx, y + dy, z + dz];
      const kk = k(...n);
      if (seen.has(kk)) continue;
      seen.add(kk);
      const nid = getType(...n);
      if (!partOf(nid)) continue;
      if (cells.length + stack.length >= max) { overflow = true; continue; }
      stack.push([...n, nid]);
    }
  }
  return { cells, overflow };
}

export function stats(ids) {
  const s = {
    blocks: 0, mass: 0, thrust: 0, push: 0, lift: 0, hover: 0, fuelCap: 0, seats: 0, cores: 0, gear: 0, chutes: 0,
    rockets: 0, jets: 0, burners: 0, vtols: 0, wings: 0, armor: 0, decouplers: 0, avionics: 0, pods: 0, radar: 0,
    reactors: 0, warps: 0, cannons: 0, shields: 0, titans: 0,
  };
  for (const id of ids) {
    const p = partOf(id);
    if (!p) continue;
    s.blocks++;
    s.mass += p.mass;
    if (p.thrust) { s.thrust += p.thrust; s.rockets++; }
    if (p.push) { s.push += p.push; if (p.burner) s.burners++; else s.jets++; }
    if (p.hover) { s.hover += p.hover; s.vtols++; }
    if (p.lift) { s.lift += p.lift; s.wings++; }
    s.fuelCap += p.fuel ?? 0;
    if (p.seat) s.seats++;
    if (p.core) s.cores++;
    if (p.gear) s.gear++;
    if (p.chute) s.chutes++;
    if (p.armor) s.armor++;
    if (p.decoupler) s.decouplers++;
    if (p.avionics) s.avionics++;
    if (p.pod) s.pods++;
    if (p.radar) s.radar++;
    if (p.reactor) s.reactors++;
    if (p.warp) s.warps++;
    if (p.cannon) s.cannons++;
    if (p.shield) s.shields++;
    if (p.thrust >= 600) s.titans++;
  }
  s.kind = s.rockets ? "rocket" : s.jets || s.burners || s.vtols ? "plane" : "none";
  return s;
}

/** VTOL thrusters strong enough to hold the whole craft up without wings. */
export const canHover = (s) => s.vtols > 0 && s.hover >= s.mass;

export const ROCKET_TWR = 1.2; // thrust must beat weight by 20%
export const PLANE_PUSH = 0.25;

export function problems(s) {
  const out = [];
  if (s.cores !== 1) out.push(s.cores ? "Only one Vehicle Core per vehicle." : "No Vehicle Core.");
  if (!s.seats) out.push("Add a Cockpit (or Capital Bridge) so someone can fly it.");
  if (!s.fuelCap) out.push("Add at least one Fuel Tank (or a Fusion Reactor).");
  if (s.kind === "none") out.push("Add Rocket Engines or Titan Thrusters (rocket), or Jet Engines or Ion Drives (plane / starship).");
  if (s.kind === "rocket" && s.thrust < s.mass * ROCKET_TWR) out.push(`Too heavy to lift off: thrust ${s.thrust}, needs ${Math.ceil(s.mass * ROCKET_TWR)}. Add Rocket Engines or remove blocks.`);
  if (s.burners && !s.jets && !s.vtols) out.push("Afterburners boost Jet Engines: add at least one Jet Engine.");
  if (s.kind === "rocket" && (s.burners || s.vtols)) out.push("Rockets can't use Afterburners, VTOL Thrusters, or Repulsors.");
  if (s.kind === "plane" && !canHover(s) && s.lift < s.mass) out.push(`Not enough wing: lift ${s.lift}, needs ${Math.ceil(s.mass)}. Add Wings (or VTOL Thrusters with hover ${Math.ceil(s.mass)}).`);
  if (s.kind === "plane" && !canHover(s) && s.push < s.mass * PLANE_PUSH) out.push(`Engines too weak: push ${s.push}, needs ${Math.ceil(s.mass * PLANE_PUSH)}. Add Jet Engines.`);
  return out;
}

// ---------------------------------------------------------------------------
// Flight physics (blocks, seconds)
// ---------------------------------------------------------------------------
export const G = 10;
export const ROCKET_MAX = 30, TERMINAL = 40, CHUTE_FALL = 5;
export const PLANE_MAX = 28, STALL = 9, SINK = 4, BURN = 1;
export const HEADINGS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
export const CARD4 = ["north", "east", "south", "west"];

/** Bedrock yaw: 0 = south, 90 = west, ±180 = north, -90 = east. Returns heading index (N=0,E=1,S=2,W=3). */
export function headingFromYaw(yaw) {
  const i = Math.round((((yaw % 360) + 360) % 360) / 90) % 4;
  return [2, 3, 0, 1][i];
}

/** Top speed for a vehicle of this many blocks, so huge builds don't flood the world with block updates. */
// Capital ships (over 6000 blocks) crawl at a stately 3 blocks/s: every move rewrites thousands of blocks.
export const GIANT = 6000, GIANT_SPEED = 3;
export const speedCap = (blocks, max) => (blocks > GIANT ? GIANT_SPEED : Math.max(10, Math.min(max, 15000 / Math.max(1, blocks))));

/** Advance one physics step. Mutates v (vy, speed, fuel). Returns world velocity [vx, vy, vz] in blocks/s. */
export function physics(v, dt, input = {}) {
  const s = v.st;
  const free = unlimited(v);
  const th = v.fuel > 0 || free ? v.throttle : 0;
  if (v.kind === "rocket") {
    const a = th > 0 ? G * ((s.thrust * th) / s.mass - 1) : -G;
    v.vy += a * dt;
    v.vy = Math.max(-(s.chutes ? CHUTE_FALL : TERMINAL), Math.min(speedCap(s.blocks, ROCKET_MAX), v.vy));
    if (!free) v.fuel = Math.max(0, v.fuel - s.rockets * th * dt * BURN);
    v.stalled = false;
    return [0, v.vy, 0];
  }
  // Afterburners only light when boost is on; they raise the top speed and burn fuel 3x as fast.
  const boost = !!v.boost && s.burners > 0 && th > 0;
  const top = planeTop(s, boost);
  const target = top * th;
  const rate = (target > v.speed ? (boost ? 8 : 5) : 3) * dt;
  v.speed += Math.sign(target - v.speed) * Math.min(Math.abs(target - v.speed), rate);
  if (!free) v.fuel = Math.max(0, v.fuel - (s.jets + s.vtols + (boost ? s.burners * 3 : 0)) * th * dt * BURN);
  const hover = canHover(s) && th > 0;
  v.stalled = !hover && (v.speed < STALL || s.lift < s.mass);
  let climb = Math.max(-0.6, Math.min(0.6, input.lookY ?? 0));
  if (input.holdY !== undefined && input.y !== undefined) climb = Math.max(-0.6, Math.min(0.6, (input.holdY - input.y) / 10)); // autopilot
  if (hover) v.vy = climb * Math.max(v.speed, HOVER_CLIMB / 0.6) * (climb > 0 ? Math.min(1, th * 2) : 1);
  else v.vy = v.stalled ? -(s.chutes ? Math.min(SINK, CHUTE_FALL) : SINK) : climb * v.speed;
  if (s.blocks > GIANT) v.vy = Math.max(-GIANT_SPEED, Math.min(GIANT_SPEED, v.vy));
  v.boosting = boost;
  const [fx, fz] = HEADINGS[v.heading];
  return [fx * v.speed, v.vy, fz * v.speed];
}
export const BOOST_MAX = 44, HOVER_CLIMB = 6;

/** Full-throttle top speed of a plane (afterburners only count while boosting). */
export function planeTop(s, boost = false) {
  const push = s.push - (boost ? 0 : s.burners * PARTS.afterburner.push);
  const max = boost ? BOOST_MAX : PLANE_MAX;
  return push > 0 ? Math.min(speedCap(s.blocks, max), 6 + (max - 6) * Math.min(1, push / (s.mass * 0.6))) : 0;
}

/** Rocket autopilot: throttle that holds a target altitude (hover, or "orbit" at the edge of space). */
export function holdThrottle(v, targetY, y) {
  const s = v.st;
  const hoverTh = s.mass / Math.max(1, s.thrust); // thrust exactly cancels gravity
  const err = targetY - y;
  const want = Math.max(-8, Math.min(8, err / 2)); // desired vertical speed
  return Math.max(0, Math.min(1, hoverTh + (want - v.vy) * 0.05));
}

/** Is hitting something at `impact` blocks/s a crash? */
export function isCrash(impact, s) {
  // armour plating soaks up impacts; shield generators wrap the hull in a force field
  const armor = Math.min(10, s.armor * 0.5) + Math.min(30, (s.shields ?? 0) * 10);
  if (s.chutes && s.kind === "rocket") return impact > CHUTE_FALL + 1 + armor;
  if (canHover(s)) return impact > 14 + armor; // VTOLs settle gently
  return impact > (s.gear ? 16 : 11) + armor;
}
export const crashPower = (s) => Math.min(8, 2 + s.blocks / 150);

// ---------------------------------------------------------------------------
// Staging: a Decoupler splits a rocket into the stage below it and the stage above it.
// ---------------------------------------------------------------------------
/**
 * Split cells [{o, id}] at the lowest decoupler. Returns { keep, drop } index arrays, or null if there's nothing to drop.
 * `keep` is everything connected to the core without passing through that decoupler; the decoupler itself drops.
 */
export function stageSplit(cells) {
  const idOf = (c) => c.id ?? c.perm?.type?.id;
  const decs = cells.map((c, i) => [c, i]).filter(([c]) => idOf(c) === `${NS}:decoupler`);
  if (!decs.length) return null;
  const core = cells.findIndex((c) => idOf(c) === `${NS}:vehicle_core`);
  if (core < 0) return null;
  const idx = new Map(cells.map((c, i) => [okey(c.o), i]));
  // every decoupler on the lowest decoupler level fires together (interstage rings, paired booster struts)
  const levels = [...new Set(decs.map(([c]) => c.o[1]))].sort((a, b) => a - b);
  for (const y of levels) {
    const fired = new Set(decs.filter(([c]) => c.o[1] === y).map(([, i]) => i));
    if (fired.has(core)) continue;
    const seen = new Set([core]);
    const stack = [core];
    while (stack.length) {
      const i = stack.pop();
      const o = cells[i].o;
      for (const [dx, dy, dz] of D6) {
        const j = idx.get(okey([o[0] + dx, o[1] + dy, o[2] + dz]));
        if (j === undefined || fired.has(j) || seen.has(j)) continue;
        seen.add(j);
        stack.push(j);
      }
    }
    const drop = cells.map((_, i) => i).filter((i) => !seen.has(i));
    if (drop.length > fired.size) return { keep: [...seen].sort((a, b) => a - b), drop, level: y };
  }
  return null;
}

/** Free fall for a spent stage. Returns world velocity. */
export function debrisPhysics(v, dt) {
  v.vy = Math.max(-(v.st.chutes ? CHUTE_FALL : TERMINAL), v.vy - G * dt);
  return [0, v.vy, 0];
}

// ---------------------------------------------------------------------------
// Radar
// ---------------------------------------------------------------------------
/** Contacts within range, sorted nearest first. me = {x,y,z}; others = [{name, x, y, z}]. */
export function radarContacts(me, others, range) {
  return others
    .map((o) => ({ ...o, dist: Math.hypot(o.x - me.x, o.y - me.y, o.z - me.z) }))
    .filter((o) => o.dist <= range && o.dist > 0.5)
    .sort((a, b) => a.dist - b.dist)
    .map((o) => ({ ...o, bearing: bearing(me, o) }));
}
/** Compass bearing from a to b: N, NE, E, ... */
export function bearing(a, b) {
  const ang = (Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI; // 0 = north, 90 = east
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((ang % 360) + 360) % 360 / 45) % 8];
}
export const radarRange = (s) => (s.radar ? 64 + 32 * Math.min(6, s.radar - 1) : 0);

/** Split accumulated movement into whole blocks. Mutates acc. */
export function takeWhole(acc) {
  const mv = acc.map((a) => Math.trunc(a));
  for (let i = 0; i < 3; i++) acc[i] -= mv[i];
  return mv;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
/** Rotate an offset clockwise (seen from above) by t quarter turns around the origin. */
export function rotOff([x, y, z], t) {
  t = ((t % 4) + 4) % 4;
  for (let i = 0; i < t; i++) [x, z] = [-z, x];
  return [x + 0, y, z + 0];
}

/** Rotate direction block states clockwise by t quarter turns. */
export function rotStates(st, t) {
  t = ((t % 4) + 4) % 4;
  if (!t) return st;
  const o = { ...st };
  const turn = (d) => CARD4[(CARD4.indexOf(d) + t) % 4];
  for (const k of ["minecraft:cardinal_direction", "minecraft:facing_direction"]) if (CARD4.includes(o[k])) o[k] = turn(o[k]);
  if (typeof o.facing_direction === "number" && o.facing_direction >= 2) {
    const m = { 2: "north", 3: "south", 4: "west", 5: "east" }, r = { north: 2, south: 3, west: 4, east: 5 };
    o.facing_direction = r[turn(m[o.facing_direction])];
  }
  if (typeof o.direction === "number") o.direction = (o.direction + t) % 4; // 0 S, 1 W, 2 N, 3 E (clockwise)
  if (typeof o.weirdo_direction === "number") {
    const m = ["east", "west", "south", "north"];
    o.weirdo_direction = m.indexOf(turn(m[o.weirdo_direction]));
  }
  return o;
}

export const okey = (o) => `${o[0]},${o[1]},${o[2]}`;

/** Offsets on the leading face when moving along `axis` (0,1,2) in direction `sign`. */
export function frontCells(offsets, set, axis, sign) {
  return offsets.filter((o) => {
    const n = [...o];
    n[axis] += sign;
    return !set.has(okey(n));
  });
}

export function bbox(offsets) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const o of offsets) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], o[i]); hi[i] = Math.max(hi[i], o[i]); }
  return { lo, hi };
}
