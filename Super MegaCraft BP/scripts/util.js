import { system, GameMode, BlockTypes } from "@minecraft/server";

export async function show(form, p) {
  for (let i = 0; i < 20; i++) {
    const r = await form.show(p);
    if (r.cancelationReason !== "UserBusy") return r;
    await system.waitTicks(5);
  }
  return { canceled: true };
}

export const isCreative = (p) => {
  try {
    return p.getGameMode() === GameMode.creative;
  } catch {
    return false;
  }
};

export function sound(p, id, pitch = 1, volume = 0.8) {
  try {
    p.playSound(id, { pitch, volume });
  } catch {}
}

export const container = (p) => p.getComponent("minecraft:inventory")?.container;

export function countItem(p, id) {
  const inv = container(p);
  if (!inv) return 0;
  let n = 0;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it?.typeId === id) n += it.amount;
  }
  return n;
}

/** Remove `amount` of item `id`. Returns false (and removes nothing) if the player doesn't have enough. */
export function takeItem(p, id, amount) {
  if (countItem(p, id) < amount) return false;
  const inv = container(p);
  for (let i = 0; i < inv.size && amount > 0; i++) {
    const it = inv.getItem(i);
    if (it?.typeId !== id) continue;
    const use = Math.min(amount, it.amount);
    amount -= use;
    if (use === it.amount) inv.setItem(i, undefined);
    else {
      it.amount -= use;
      inv.setItem(i, it);
    }
  }
  return true;
}

export function giveItem(p, stack) {
  const inv = container(p);
  const left = inv?.addItem(stack);
  if (left) p.dimension.spawnItem(left, p.location);
}

/** Simple per-player cooldown so held-use events don't fire 20 times a second. */
const last = new Map();
export function cooldown(p, tag, ticks) {
  const k = `${p.id}|${tag}`;
  const t = last.get(k) ?? -1e9;
  if (system.currentTick - t < ticks) return false;
  last.set(k, system.currentTick);
  return true;
}

/** Is this item a placeable block? (Then clicks on our blocks should build, not open menus.) */
export function isBlockItem(id) {
  if (!id) return false;
  try {
    return !!BlockTypes.get(id);
  } catch {
    return false;
  }
}

export function particle(dim, id, loc) {
  try {
    dim.spawnParticle(id, loc);
  } catch {}
}

export const pretty = (id) => id.replace(/^\w+:/, "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

/** Place [loc, perm] pairs a few hundred per tick so giant builds don't freeze the game. */
export function placeBatched(dim, list, perTick = 400, done) {
  let i = 0;
  const run = () => {
    const end = Math.min(list.length, i + perTick);
    for (; i < end; i++) {
      try {
        dim.getBlock(list[i][0])?.setPermutation(list[i][1]);
      } catch {}
    }
    if (i < list.length) system.runTimeout(run, 1);
    else done?.();
  };
  run();
}
