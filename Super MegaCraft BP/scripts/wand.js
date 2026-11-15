// Mega Wand: mark two corners, then fill the box between them with a giant shape.
import { world, system, BlockPermutation } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { SHAPES, MAX_SPAN, MAX_CELLS, shapeCells, longAxis } from "./shapes.js";
import { HULLS } from "./vehicle.js";
import { NAMES } from "./recipes.js";
import { show, isCreative, sound, countItem, takeItem, placeBatched } from "./util.js";

const NS = "supermegacraft";
export const WAND = `${NS}:mega_wand`;
const MATS = [...HULLS.map((c) => `hull_${c}`), "window", "wing", "fuel_tank", "mega_light"];
const corners = new Map(); // player id -> { a, b, dim, next }

export function markCorner(p, block) {
  const c = corners.get(p.id) ?? { next: 0 };
  if (c.dim && c.dim !== block.dimension.id) { c.a = c.b = undefined; c.next = 0; }
  c.dim = block.dimension.id;
  const l = { x: block.x, y: block.y, z: block.z };
  if (c.next === 0) c.a = l; else c.b = l;
  c.next = 1 - c.next;
  corners.set(p.id, c);
  const which = c.next === 1 ? "A" : "B";
  sound(p, "random.orb", which === "A" ? 1 : 1.4);
  const size = c.a && c.b ? sizeOf(c) : null;
  p.onScreenDisplay.setActionBar(`§eCorner ${which}§r set at ${l.x}, ${l.y}, ${l.z}${size ? `  §7box ${size.join(" × ")}. Use the wand in the air to fill it.` : "  §7Now tap the opposite corner."}`);
}

const sizeOf = (c) => ["x", "y", "z"].map((k) => Math.abs(c.a[k] - c.b[k]) + 1);

export async function fillMenu(p) {
  const c = corners.get(p.id);
  if (!c?.a || !c?.b) return p.onScreenDisplay.setActionBar("§7Tap two blocks with the Mega Wand to mark the corners of a giant shape.");
  const size = sizeOf(c);
  if (size.some((s) => s > MAX_SPAN)) return p.onScreenDisplay.setActionBar(`§cToo big: max ${MAX_SPAN} blocks along each side (you have ${size.join(" × ")}).`);
  const free = isCreative(p);
  const mats = free ? MATS : MATS.filter((m) => countItem(p, `${NS}:${m}`) > 0);
  if (!mats.length) return p.onScreenDisplay.setActionBar("§cYou need some Mega Hull (or windows, wings...) in your inventory. Make it at the Mega Table.");
  const ax = "XYZ"[longAxis(size)];
  const r = await show(new ModalFormData().title("Mega Wand")
    .dropdown(`Box ${size.join(" × ")}. Long axis: ${ax}.\n\nShape`, SHAPES.map(([, n]) => n), 0)
    .dropdown("Material", mats.map((m) => `${NAMES[m]}${free ? "" : ` (have ${countItem(p, `${NS}:${m}`)})`}`), 0)
    .toggle(`Cone/wing tip at the high ${ax} end (off = low end)`, true), p);
  if (r.canceled) return;
  const [si, mi, tipHigh] = r.formValues;
  const kind = SHAPES[si][0], mat = `${NS}:${mats[mi]}`;
  const lo = { x: Math.min(c.a.x, c.b.x), y: Math.min(c.a.y, c.b.y), z: Math.min(c.a.z, c.b.z) };
  const dim = world.getDimension(c.dim);
  const cells = shapeCells(kind, size, tipHigh ? 1 : -1)
    .map(([x, y, z]) => ({ x: lo.x + x, y: lo.y + y, z: lo.z + z }))
    .filter((l) => {
      try {
        const b = dim.getBlock(l);
        return b && (b.isAir || b.isLiquid);
      } catch {
        return false;
      }
    });
  if (!cells.length) return p.onScreenDisplay.setActionBar("§7Nothing to fill: that space is already full.");
  if (cells.length > MAX_CELLS) return p.onScreenDisplay.setActionBar(`§cThat's ${cells.length} blocks. The wand can place up to ${MAX_CELLS} at once.`);
  if (!free && !takeItem(p, mat, cells.length)) return p.onScreenDisplay.setActionBar(`§cYou need ${cells.length} × ${NAMES[mats[mi]]} (have ${countItem(p, mat)}).`);
  const perm = BlockPermutation.resolve(mat);
  sound(p, "random.anvil_use", 1.2);
  placeBatched(dim, cells.map((l) => [l, perm]), 400, () => {
    p.onScreenDisplay.setActionBar(`§aPlaced ${cells.length} blocks of ${NAMES[mats[mi]]}.`);
    sound(p, "random.levelup", 1.6);
  });
}

world.afterEvents.playerLeave.subscribe(({ playerId }) => system.run(() => corners.delete(playerId)));
