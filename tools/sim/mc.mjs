// Minimal fake of @minecraft/server + @minecraft/server-ui with a real block grid, enough to run MegaCraft in Node.
export const GameMode = { survival: "survival", creative: "creative" };

const handlers = {};
const sig = (name) => ({ subscribe(fn) { (handlers[name] ??= []).push(fn); return fn; }, unsubscribe() {} });
export const fire = (name, ev) => (handlers[name] ?? []).forEach((f) => f(ev));

const props = new Map();
const tasks = [];
let tick = 0;
export const system = {
  get currentTick() { return tick; },
  runInterval(fn, n = 1) { tasks.push({ fn, n, next: tick + n, repeat: true }); return tasks.length; },
  runTimeout(fn, n = 1) { tasks.push({ fn, n, next: tick + n, repeat: false }); return tasks.length; },
  run(fn) { return this.runTimeout(fn, 0); },
  waitTicks(n) { return new Promise((r) => this.runTimeout(r, n)); },
};
export async function step(ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    tick++;
    for (const t of [...tasks]) {
      if (t.next > tick) continue;
      t.fn();
      if (t.repeat) t.next = tick + t.n;
      else tasks.splice(tasks.indexOf(t), 1);
    }
    await new Promise((r) => setImmediate(r));
  }
}

// ---------- block types / permutations ----------
export const BLOCK_STATES = {}; // typeId -> default states
export const BlockTypes = { get: (id) => (id in BLOCK_STATES || /^minecraft:(stone|dirt|cobblestone|oak_planks|iron_block)$/.test(id) ? { id } : undefined) };
export class BlockPermutation {
  constructor(id, states) { this.type = { id }; this.states = states; }
  static resolve(id, states = {}) {
    const def = BLOCK_STATES[id] ?? {};
    for (const k of Object.keys(states)) if (id.startsWith("supermegacraft:") && !(k in def)) throw new Error(`${id} has no state ${k}`);
    return new BlockPermutation(id, { ...def, ...states });
  }
  getState(k) { return this.states[k]; }
  getAllStates() { return { ...this.states }; }
  withState(k, v) {
    if (!(k in this.states)) throw new Error(`${this.type.id} has no state ${k}`);
    return new BlockPermutation(this.type.id, { ...this.states, [k]: v });
  }
}

export const grid = new Map();
export let writes = 0;
const gk = (d, l) => `${d}|${Math.floor(l.x)},${Math.floor(l.y)},${Math.floor(l.z)}`;
class Block {
  constructor(dim, l) { this.dimension = dim; this.x = Math.floor(l.x); this.y = Math.floor(l.y); this.z = Math.floor(l.z); this.location = { x: this.x, y: this.y, z: this.z }; }
  get permutation() { return grid.get(gk(this.dimension.id, this)) ?? BlockPermutation.resolve("minecraft:air"); }
  get typeId() { return this.permutation.type.id; }
  get isAir() { return this.typeId === "minecraft:air"; }
  get isLiquid() { return this.typeId === "minecraft:water"; }
  setPermutation(p) { writes++; if (p.type.id === "minecraft:air") grid.delete(gk(this.dimension.id, this)); else grid.set(gk(this.dimension.id, this), p); }
}

export const log = [];
export const explosions = [];
export const particles = new Map();
class Dim {
  constructor(id) { this.id = id; this.heightRange = { min: -64, max: 320 }; }
  getBlock(l) { return new Block(this, l); }
  getEntities() { return []; }
  spawnItem(it) { log.push(`[drop] ${it.amount}x ${it.typeId}`); }
  spawnParticle(id) { particles.set(id, (particles.get(id) ?? 0) + 1); }
  createExplosion(l, power) { explosions.push({ l, power }); }
  playSound() {}
}
const dims = { "minecraft:overworld": new Dim("minecraft:overworld") };
export const overworld = dims["minecraft:overworld"];

export class ItemStack {
  constructor(typeId, amount = 1) { this.typeId = typeId; this.amount = amount; }
}

const players = [];
export const world = {
  beforeEvents: new Proxy({}, { get: (_, k) => sig(`before.${String(k)}`) }),
  afterEvents: new Proxy({}, { get: (_, k) => sig(`after.${String(k)}`) }),
  getDynamicProperty: (k) => props.get(k),
  setDynamicProperty: (k, v) => (v === undefined ? props.delete(k) : props.set(k, v)),
  getAllPlayers: () => players.filter((p) => p.valid),
  getDimension: (id) => dims[id],
};

export class FakePlayer {
  constructor(name) {
    this.id = `id-${name}`; this.name = name; this.typeId = "minecraft:player";
    this.location = { x: 0.5, y: 64, z: 0.5 }; this.dimension = overworld; this.rot = { x: 0, y: 180 };
    this.valid = true; this.mode = GameMode.survival; this.selectedSlotIndex = 0; this.isSneaking = false; this.isJumping = false;
    this.slots = new Array(36).fill(undefined); this.bar = []; this.titles = []; this.props = new Map(); this.effects = new Set();
    const self = this;
    this.onScreenDisplay = { setActionBar: (t) => self.bar.push(t), setTitle: (t) => self.titles.push(t) };
    players.push(this);
  }
  isValid() { return this.valid; }
  getGameMode() { return this.mode; }
  getRotation() { return this.rot; }
  teleport(l) { this.location = { ...l }; }
  sendMessage(m) { log.push(`[to ${this.name}] ${m}`); }
  playSound() {}
  addEffect(e) { this.effects.add(e); }
  removeEffect(e) { this.effects.delete(e); }
  getDynamicProperty(k) { return this.props.get(k); }
  setDynamicProperty(k, v) { this.props.set(k, v); }
  getComponent(id) {
    if (id !== "minecraft:inventory") return undefined;
    const s = this.slots;
    return { container: {
      size: s.length,
      getItem: (i) => s[i],
      setItem: (i, it) => { s[i] = it; },
      addItem: (it) => {
        for (let i = 0; i < s.length; i++) if (s[i]?.typeId === it.typeId && s[i].amount + it.amount <= 64) { s[i].amount += it.amount; return undefined; }
        const i = s.findIndex((x) => !x);
        if (i < 0) return it;
        s[i] = it;
        return undefined;
      },
    } };
  }
  count(id) { return this.slots.reduce((n, x) => n + (x?.typeId === id ? x.amount : 0), 0); }
}

// ---------- server-ui: scripted responses ----------
export const formQueue = [];
export const formsShown = [];
const respond = (form) => {
  formsShown.push(form);
  const next = formQueue.shift();
  if (!next) return Promise.resolve({ canceled: true });
  return Promise.resolve(typeof next === "function" ? next(form) : next);
};
class Form {
  constructor() { this.parts = []; }
  title(t) { this.t = t; return this; }
  body(b) { this.b = b; return this; }
  button(x) { this.parts.push(["button", x]); return this; }
  button1(x) { this.parts.push(["button", x]); return this; }
  button2(x) { this.parts.push(["button", x]); return this; }
  dropdown(l, o) { this.parts.push(["dropdown", l, o]); return this; }
  slider(l) { this.parts.push(["slider", l]); return this; }
  toggle(l) { this.parts.push(["toggle", l]); return this; }
  textField(l) { this.parts.push(["text", l]); return this; }
  show() { return respond(this); }
}
export class ActionFormData extends Form {}
export class ModalFormData extends Form {}
export class MessageFormData extends Form {}
export const pick = (label) => (form) => {
  const i = form.parts.filter((p) => p[0] === "button").findIndex((p) => p[1].replace(/§./g, "").includes(label));
  if (i < 0) throw new Error(`No button "${label}" in ${form.t}: ${form.parts.map((p) => p[1]).join(" | ")}`);
  return { canceled: false, selection: i };
};
export const values = (...formValues) => ({ canceled: false, formValues });
