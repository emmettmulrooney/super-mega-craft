// Mega Table recipes. Pure data; unit-tested. Mega parts come out in big batches because vehicles are huge.
import { HULLS } from "./vehicle.js";

const M = (id) => `minecraft:${id}`;
const N = (id) => `supermegacraft:${id}`;
const DYE = {
  white: "white_dye", grey: "gray_dye", black: "black_dye", red: "red_dye", orange: "orange_dye", yellow: "yellow_dye", blue: "blue_dye", green: "green_dye",
  purple: "purple_dye", pink: "pink_dye", cyan: "cyan_dye", lime: "lime_dye", brown: "brown_dye", light_blue: "light_blue_dye", magenta: "magenta_dye", light_grey: "light_gray_dye",
};
export const HULL_NAME = {
  white: "White", grey: "Grey", black: "Black", red: "Red", orange: "Orange", yellow: "Yellow", blue: "Blue", green: "Green",
  purple: "Purple", pink: "Pink", cyan: "Cyan", lime: "Lime", brown: "Brown", light_blue: "Light Blue", magenta: "Magenta", light_grey: "Light Grey",
};

export const CATEGORIES = ["Hull & Glass", "Engines & Fuel", "Flight Systems", "Pro Systems", "Super Systems", "Tools", "Blueprints"];

export const NAMES = {
  mega_table: "Mega Table", window: "Mega Window", rocket_engine: "Rocket Engine", jet_engine: "Jet Engine", wing: "Wing Panel",
  fuel_tank: "Fuel Tank", cockpit: "Cockpit", vehicle_core: "Vehicle Core", landing_gear: "Landing Gear", parachute_pod: "Parachute Pod",
  mega_light: "Mega Light", fuel_can: "Fuel Can", mega_wand: "Mega Wand", flight_stick: "Flight Stick",
  carbon_hull: "Carbon Fibre Hull", armor_plate: "Armour Plate", afterburner: "Afterburner", vtol_thruster: "VTOL Lift Thruster",
  decoupler: "Stage Decoupler", avionics: "Avionics Computer", missile_pod: "Missile Pod", radar_dish: "Radar Dish",
  neutronium_hull: "Neutronium Hull", titan_thruster: "Titan Thruster", ion_drive: "Ion Drive", repulsor: "Repulsor Lift",
  fusion_reactor: "Fusion Reactor", warp_drive: "Warp Drive", capital_bridge: "Capital Bridge", super_cannon: "Super-Cannon", shield_generator: "Shield Generator",
  ...Object.fromEntries(HULLS.map((c) => [`hull_${c}`, `${HULL_NAME[c]} Mega Hull`])),
};

export const RECIPES = [
  ...HULLS.map((c) => ({
    id: `hull_${c}`, cat: "Hull & Glass", out: [N(`hull_${c}`), 32], in: [[M("iron_ingot"), 2], [M("cobblestone"), 8], [M(DYE[c]), 1]],
    desc: "Riveted structural plating. Vehicles are built from it: rocket bodies, fuselages, tails, nose cones.",
  })),
  { id: "window", cat: "Hull & Glass", out: [N("window"), 16], in: [[M("glass"), 8], [M("iron_ingot"), 1]], desc: "Framed porthole glass. Counts as part of the vehicle." },
  { id: "mega_light", cat: "Hull & Glass", out: [N("mega_light"), 4], in: [[M("glowstone_dust"), 4], [M("iron_ingot"), 2]], desc: "A bright navigation beacon. Counts as part of the vehicle." },

  { id: "rocket_engine", cat: "Engines & Fuel", out: [N("rocket_engine"), 4], in: [[M("iron_ingot"), 8], [M("blast_furnace"), 1], [M("gunpowder"), 4]], desc: "Thrust 100 straight up. A rocket needs more thrust than 1.2× its mass to lift off. Put them at the bottom." },
  { id: "jet_engine", cat: "Engines & Fuel", out: [N("jet_engine"), 2], in: [[M("iron_ingot"), 6], [M("copper_ingot"), 4], [M("furnace"), 1]], desc: "Push 60 forward. Any vehicle with jet engines (and no rocket engines) flies like a plane." },
  { id: "fuel_tank", cat: "Engines & Fuel", out: [N("fuel_tank"), 4], in: [[M("iron_ingot"), 4], [M("coal"), 4]], desc: "120 fuel each. Every engine burns 1 fuel per second at full throttle. Comes full." },
  { id: "fuel_can", cat: "Engines & Fuel", out: [N("fuel_can"), 2], in: [[M("coal"), 4], [M("gunpowder"), 1], [M("iron_ingot"), 1]], desc: "Use on a Fuel Tank to refill it." },

  { id: "vehicle_core", cat: "Flight Systems", out: [N("vehicle_core"), 1], in: [[M("iron_ingot"), 4], [M("redstone"), 4], [M("compass"), 1]], desc: "The brain. Every vehicle needs exactly one. Every MegaCraft block touching it (and touching those) becomes the vehicle." },
  { id: "cockpit", cat: "Flight Systems", out: [N("cockpit"), 1], in: [[M("iron_ingot"), 4], [M("glass"), 2], [M("redstone"), 2]], desc: "A pilot seat. Use it to fly. Extra cockpits are passenger seats. Leave the space above it open for your head." },
  { id: "wing", cat: "Flight Systems", out: [N("wing"), 16], in: [[M("iron_ingot"), 4], [M("copper_ingot"), 2]], desc: "Lift 12 each. A plane needs total lift at least equal to its mass." },
  { id: "landing_gear", cat: "Flight Systems", out: [N("landing_gear"), 4], in: [[M("iron_ingot"), 3], [M("leather"), 2]], desc: "Wheels and struts. Planes with landing gear survive much harder landings." },
  { id: "parachute_pod", cat: "Flight Systems", out: [N("parachute_pod"), 1], in: [[M("white_wool"), 6], [M("string"), 4]], desc: "Rockets with a parachute fall at only 5 blocks per second and splash down safely." },

  { id: "carbon_hull", cat: "Hull & Glass", out: [N("carbon_hull"), 32], in: [[M("coal"), 8], [M("string"), 4], [M("iron_ingot"), 1]], desc: "Half the mass of normal hull. Lighter rockets climb faster." },
  { id: "armor_plate", cat: "Hull & Glass", out: [N("armor_plate"), 16], in: [[M("iron_block"), 1], [M("obsidian"), 2]], desc: "Heavy blast-resistant plating. Every 2 plates let the vehicle survive 1 block/s harder hits." },
  { id: "afterburner", cat: "Pro Systems", out: [N("afterburner"), 2], in: [[M("iron_ingot"), 6], [M("blaze_powder"), 2], [M("copper_ingot"), 2]], desc: "Put behind Jet Engines. Turn on Afterburner in the Flight Stick panel for top speed 44, burning 3x fuel." },
  { id: "vtol_thruster", cat: "Pro Systems", out: [N("vtol_thruster"), 2], in: [[M("iron_ingot"), 6], [M("piston"), 2], [M("redstone"), 2]], desc: "Hover 40 each. When total hover beats the mass, the craft can hover, take off straight up, and land anywhere." },
  { id: "decoupler", cat: "Pro Systems", out: [N("decoupler"), 4], in: [[M("iron_ingot"), 2], [M("tnt"), 1]], desc: "Splits a rocket into stages. Everything below the lowest Decoupler ring falls away when you stage." },
  { id: "avionics", cat: "Pro Systems", out: [N("avionics"), 1], in: [[M("redstone"), 8], [M("comparator"), 2], [M("compass"), 1]], desc: "Flight computer: altitude-hold autopilot for planes, and hover or orbit hold for rockets." },
  { id: "missile_pod", cat: "Pro Systems", out: [N("missile_pod"), 2], in: [[M("iron_ingot"), 4], [M("tnt"), 2], [M("fire_charge"), 2]], desc: "4 missiles each, fired from the Flight Stick. With a Radar Dish they home in on the nearest contact." },
  { id: "radar_dish", cat: "Pro Systems", out: [N("radar_dish"), 1], in: [[M("iron_ingot"), 4], [M("redstone"), 4], [M("ender_pearl"), 1]], desc: "Shows the nearest players, mobs, and vehicles on your HUD. 64m range, +32m per extra dish." },

  { id: "neutronium_hull", cat: "Super Systems", out: [N("neutronium_hull"), 64], in: [[M("iron_block"), 1], [M("obsidian"), 4], [M("cobblestone"), 16]], desc: "Capital-ship plating, made 64 at a time. Armoured like an Armour Plate but nearly as light as hull." },
  { id: "titan_thruster", cat: "Super Systems", out: [N("titan_thruster"), 4], in: [[M("iron_block"), 4], [M("blast_furnace"), 2], [M("blaze_rod"), 2]], desc: "Thrust 600: six Rocket Engines in one block. For super-heavy launchers." },
  { id: "ion_drive", cat: "Super Systems", out: [N("ion_drive"), 2], in: [[M("iron_block"), 2], [M("copper_block"), 2], [M("ender_pearl"), 1]], desc: "Push 400 forward, plane-style. Drives capital starships." },
  { id: "repulsor", cat: "Super Systems", out: [N("repulsor"), 4], in: [[M("iron_block"), 2], [M("piston"), 4], [M("phantom_membrane"), 1]], desc: "Hover 400: ten VTOL Thrusters in one. Enough of them lift a whole starship off the ground." },
  { id: "fusion_reactor", cat: "Super Systems", out: [N("fusion_reactor"), 1], in: [[M("nether_star"), 1], [M("iron_block"), 4], [M("redstone_block"), 4]], desc: "One reactor anywhere on the vehicle and it never burns fuel again. Counts as a 1000-unit tank." },
  { id: "warp_drive", cat: "Super Systems", out: [N("warp_drive"), 1], in: [[M("ender_eye"), 4], [M("diamond_block"), 1], [M("end_crystal"), 1]], desc: "Flight Stick → Warp Jump: the whole vehicle teleports 64 blocks ahead per drive (max 256). 10 s recharge." },
  { id: "capital_bridge", cat: "Super Systems", out: [N("capital_bridge"), 1], in: [[M("iron_block"), 2], [M("glass"), 8], [M("comparator"), 4], [M("compass"), 1]], desc: "A command helm: pilot seat with built-in autopilot and radar. Fly capital ships from here." },
  { id: "super_cannon", cat: "Super Systems", out: [N("super_cannon"), 1], in: [[M("tnt"), 16], [M("iron_block"), 4], [M("end_crystal"), 1]], desc: "Flight Stick → Fire Super-Cannon: a beam along your line of sight, 384 blocks, with a massive blast where it lands." },
  { id: "shield_generator", cat: "Super Systems", out: [N("shield_generator"), 1], in: [[M("diamond"), 4], [M("obsidian"), 8], [M("amethyst_shard"), 8]], desc: "Force field: each generator lets the vehicle shrug off 10 blocks/s harder impacts (up to 30)." },

  { id: "mega_wand", cat: "Tools", out: [N("mega_wand"), 1], in: [[M("stick"), 1], [M("gold_ingot"), 2], [M("redstone"), 1]], desc: "Mark two corners, then fill the space with a giant box, cylinder, tube, cone, ellipsoid, or wing in one go." },
  { id: "flight_stick", cat: "Tools", out: [N("flight_stick"), 1], in: [[M("stick"), 1], [M("redstone"), 1]], desc: "Opens the flight panel while you're flying. You get one free when you take off." },
];

/** How many times can this recipe be made from `have` (Map id -> count)? */
export function maxCrafts(recipe, have) {
  let n = Infinity;
  for (const [id, amt] of recipe.in) n = Math.min(n, Math.floor((have.get(id) ?? 0) / amt));
  return n === Infinity ? 0 : n;
}
