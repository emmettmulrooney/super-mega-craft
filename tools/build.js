// Generates every data file for MegaCraft (blocks, items, recipes, lang, manifests). No dependencies.
// Textures come from tools/textures.js. Scripts in "Super MegaCraft BP/scripts" are hand-written.
// Usage: node tools/build.js
const fs = require("fs");
const path = require("path");
const { makeTextures, TERRAIN, ITEM_TEX, HULL_COLORS } = require("./textures.js");

const ROOT = path.join(__dirname, "..");
const NAME = "Super MegaCraft";
const BP = path.join(ROOT, `${NAME} BP`);
const RP = path.join(ROOT, `${NAME} RP`);
const NS = "supermegacraft";
const ENGINE = [1, 21, 50];
const UUID = {
  bpHeader: "1728ed06-5431-4d55-89a3-977156c210d2",
  bpData: "3767eab9-3f99-4b66-8eaf-fbf4dfef943c",
  bpScript: "22a30e97-811c-4e4d-8dde-57890b45838d",
  rpHeader: "7dc70386-ce7a-4826-8499-73d00b891c34",
  rpRes: "72ac1525-a4a9-4bac-ab12-24310bae6318",
};

const write = (file, obj) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) + "\n");
};
for (const d of ["blocks", "items", "recipes", "texts"]) fs.rmSync(path.join(BP, d), { recursive: true, force: true });
for (const d of ["textures", "texts"]) fs.rmSync(path.join(RP, d), { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Manifests
// ---------------------------------------------------------------------------
write(path.join(BP, "manifest.json"), {
  format_version: 2,
  header: { name: "pack.name", description: "pack.description", uuid: UUID.bpHeader, version: [1, 0, 0], min_engine_version: ENGINE },
  modules: [
    { type: "data", uuid: UUID.bpData, version: [1, 0, 0] },
    { type: "script", language: "javascript", uuid: UUID.bpScript, entry: "scripts/main.js", version: [1, 0, 0] },
  ],
  dependencies: [
    { uuid: UUID.rpHeader, version: [1, 0, 0] },
    { module_name: "@minecraft/server", version: "1.16.0" },
    { module_name: "@minecraft/server-ui", version: "1.3.0" },
  ],
  metadata: { authors: ["Emmett"] },
});
write(path.join(RP, "manifest.json"), {
  format_version: 2,
  header: { name: "pack.name", description: "pack.description", uuid: UUID.rpHeader, version: [1, 0, 0], min_engine_version: ENGINE },
  modules: [{ type: "resources", uuid: UUID.rpRes, version: [1, 0, 0] }],
  dependencies: [{ uuid: UUID.bpHeader, version: [1, 0, 0] }],
  metadata: { authors: ["Emmett"] },
});

// ---------------------------------------------------------------------------
// Blocks (all full cubes, so they tile into giant smooth vehicles)
// ---------------------------------------------------------------------------
const CARD = "minecraft:cardinal_direction";
const DIRS = ["north", "east", "south", "west"];
const facing = { traits: { "minecraft:placement_direction": { enabled_states: [CARD], y_rotation_offset: 0 } } };
const mats = (m, method = "opaque") => Object.fromEntries(Object.entries(typeof m === "string" ? { "*": m } : m).map(([k, t]) => [k, { texture: `${NS}_${t}`, render_method: method }]));
const OPP = { north: "south", south: "north", east: "west", west: "east" };
/** Material map for a block whose front ("north" in art) faces `dir`. */
const turned = (dir, front, back, side, up, down) => ({ "*": side, [dir]: front, [OPP[dir]]: back ?? side, up: up ?? side, down: down ?? up ?? side });
const BLOCKS = [];
const lit = { [`${NS}:lit`]: [false, true] };
function block(id, name, comps, desc = {}, permutations = [], sound = "metal") {
  BLOCKS.push([id, name, sound]);
  write(path.join(BP, "blocks", `${id}.json`), {
    format_version: "1.21.40",
    "minecraft:block": {
      description: { identifier: `${NS}:${id}`, menu_category: { category: "construction" }, ...desc },
      components: {
        "minecraft:display_name": `tile.${NS}:${id}.name`,
        "minecraft:destructible_by_mining": { seconds_to_destroy: 0.8 },
        "minecraft:destructible_by_explosion": { explosion_resistance: 8 },
        ...comps,
      },
      ...(permutations.length ? { permutations } : {}),
    },
  });
}

block("mega_table", "Mega Table", {
  "minecraft:material_instances": mats({ "*": "table_side", up: "table_top", down: "table_bottom" }),
  "minecraft:destructible_by_mining": { seconds_to_destroy: 2.5 },
  "minecraft:map_color": "#5d6b78",
});
const HULL_NAME = {
  white: "White", grey: "Grey", black: "Black", red: "Red", orange: "Orange", yellow: "Yellow", blue: "Blue", green: "Green",
  purple: "Purple", pink: "Pink", cyan: "Cyan", lime: "Lime", brown: "Brown", light_blue: "Light Blue", magenta: "Magenta", light_grey: "Light Grey",
};
for (const c of HULL_COLORS) block(`hull_${c}`, `${HULL_NAME[c]} Mega Hull`, { "minecraft:material_instances": mats(`hull_${c}`), "minecraft:map_color": "#d0d4d8" });
// ---- Pro parts ----
block("carbon_hull", "Carbon Fibre Hull", { "minecraft:material_instances": mats("carbon_hull") });
block("armor_plate", "Armour Plate", { "minecraft:material_instances": mats("armor_plate"), "minecraft:destructible_by_explosion": { explosion_resistance: 30 }, "minecraft:destructible_by_mining": { seconds_to_destroy: 2 } });
block("decoupler", "Stage Decoupler", { "minecraft:material_instances": mats({ "*": "decoupler_side", up: "decoupler_top", down: "decoupler_top" }) });
block("avionics", "Avionics Computer", { "minecraft:material_instances": mats({ "*": "avionics_side", up: "avionics_top", down: "avionics_top" }), "minecraft:light_emission": 5 });
block("missile_pod", "Missile Pod", { "minecraft:material_instances": mats({ "*": "pod_side", north: "pod_front", south: "pod_front" }) });
block("radar_dish", "Radar Dish", { "minecraft:material_instances": mats({ "*": "radar_side", up: "radar_top", down: "radar_bottom" }), "minecraft:light_emission": 3 });
block("vtol_thruster", "VTOL Lift Thruster", {
  "minecraft:material_instances": mats({ "*": "vtol_side", up: "vtol_top", down: "vtol_nozzle" }),
}, { states: lit }, [{
  condition: `q.block_state('${NS}:lit')`,
  components: { "minecraft:material_instances": mats({ "*": "vtol_side", up: "vtol_top", down: "vtol_nozzle_on" }), "minecraft:light_emission": 12 },
}]);
// ---- Super parts ----
block("neutronium_hull", "Neutronium Hull", { "minecraft:material_instances": mats("neutronium_hull"), "minecraft:destructible_by_explosion": { explosion_resistance: 30 } });
block("fusion_reactor", "Fusion Reactor", { "minecraft:material_instances": mats({ "*": "reactor_side", up: "reactor_top", down: "reactor_top" }), "minecraft:light_emission": 15 });
block("warp_drive", "Warp Drive", { "minecraft:material_instances": mats({ "*": "warp_side", up: "warp_top", down: "warp_top" }), "minecraft:light_emission": 10 });
block("shield_generator", "Shield Generator", { "minecraft:material_instances": mats({ "*": "shield_side", up: "shield_top", down: "shield_top" }), "minecraft:light_emission": 8 });
block("super_cannon", "Super-Cannon", { "minecraft:material_instances": mats({ "*": "cannon_side", up: "cannon_top", down: "cannon_bottom" }), "minecraft:destructible_by_explosion": { explosion_resistance: 30 } });
block("titan_thruster", "Titan Thruster", {
  "minecraft:material_instances": mats({ "*": "titan_side", up: "titan_top", down: "titan_nozzle" }),
}, { states: lit }, [{
  condition: `q.block_state('${NS}:lit')`,
  components: { "minecraft:material_instances": mats({ "*": "titan_side_on", up: "titan_top", down: "titan_nozzle_on" }), "minecraft:light_emission": 15 },
}]);
block("repulsor", "Repulsor Lift", {
  "minecraft:material_instances": mats({ "*": "repulsor_side", up: "repulsor_top", down: "repulsor_pad" }),
}, { states: lit }, [{
  condition: `q.block_state('${NS}:lit')`,
  components: { "minecraft:material_instances": mats({ "*": "repulsor_side", up: "repulsor_top", down: "repulsor_pad_on" }), "minecraft:light_emission": 12 },
}]);
block("window", "Mega Window", { "minecraft:material_instances": mats("window", "blend"), "minecraft:light_dampening": 0 }, {}, [], "glass");
block("mega_light", "Mega Light", { "minecraft:material_instances": mats("mega_light"), "minecraft:light_emission": 15 }, {}, [], "glass");
block("vehicle_core", "Vehicle Core", { "minecraft:material_instances": mats({ "*": "core_side", up: "core_top", down: "core_top" }), "minecraft:light_emission": 4 });
block("wing", "Wing Panel", { "minecraft:material_instances": mats({ "*": "wing_edge", up: "wing_top", down: "wing_bottom" }) });
block("landing_gear", "Landing Gear", { "minecraft:material_instances": mats({ "*": "gear_side", up: "gear_top", down: "gear_bottom" }) });
block("parachute_pod", "Parachute Pod", { "minecraft:material_instances": mats({ "*": "chute_side", up: "chute_top", down: "chute_top" }) }, {}, [], "cloth");

// Rocket engine: nozzle at the bottom; glows and shows flame while firing.
block("rocket_engine", "Rocket Engine", {
  "minecraft:material_instances": mats({ "*": "rocket_side", up: "rocket_top", down: "rocket_nozzle" }),
}, { states: lit }, [{
  condition: `q.block_state('${NS}:lit')`,
  components: { "minecraft:material_instances": mats({ "*": "rocket_side_on", up: "rocket_top", down: "rocket_nozzle_on" }), "minecraft:light_emission": 15 },
}]);

// Jet engine and cockpit: face the way the player looks when placing them.
{
  const perms = [];
  for (const dir of DIRS) for (const on of [false, true]) perms.push({
    condition: `q.block_state('${CARD}') == '${dir}' && ${on ? "" : "!"}q.block_state('${NS}:lit')`,
    components: { "minecraft:material_instances": mats(turned(dir, "jet_intake", on ? "jet_exhaust_on" : "jet_exhaust", "jet_side")), ...(on ? { "minecraft:light_emission": 10 } : {}) },
  });
  block("jet_engine", "Jet Engine", { "minecraft:material_instances": mats(turned("north", "jet_intake", "jet_exhaust", "jet_side")) }, { ...facing, states: lit }, perms);
  const ab = [];
  for (const dir of DIRS) for (const on of [false, true]) ab.push({
    condition: `q.block_state('${CARD}') == '${dir}' && ${on ? "" : "!"}q.block_state('${NS}:lit')`,
    components: { "minecraft:material_instances": mats(turned(dir, "burner_front", on ? "burner_exhaust_on" : "burner_exhaust", "burner_side")), ...(on ? { "minecraft:light_emission": 15 } : {}) },
  });
  const ion = [];
  for (const dir of DIRS) for (const on of [false, true]) ion.push({
    condition: `q.block_state('${CARD}') == '${dir}' && ${on ? "" : "!"}q.block_state('${NS}:lit')`,
    components: { "minecraft:material_instances": mats(turned(dir, "ion_front", on ? "ion_exhaust_on" : "ion_exhaust", "ion_side")), ...(on ? { "minecraft:light_emission": 14 } : {}) },
  });
  block("ion_drive", "Ion Drive", { "minecraft:material_instances": mats(turned("north", "ion_front", "ion_exhaust", "ion_side")) }, { ...facing, states: lit }, ion);
  block("afterburner", "Afterburner", { "minecraft:material_instances": mats(turned("north", "burner_front", "burner_exhaust", "burner_side")) }, { ...facing, states: lit }, ab);
}
block("cockpit", "Cockpit", { "minecraft:material_instances": mats(turned("north", "cockpit_front", "cockpit_back", "cockpit_side", "cockpit_top", "cockpit_bottom")) }, facing,
  DIRS.map((dir) => ({ condition: `q.block_state('${CARD}') == '${dir}'`, components: { "minecraft:material_instances": mats(turned(dir, "cockpit_front", "cockpit_back", "cockpit_side", "cockpit_top", "cockpit_bottom")) } })));

block("capital_bridge", "Capital Bridge", { "minecraft:material_instances": mats(turned("north", "bridge_front", "bridge_side", "bridge_side", "bridge_top", "bridge_bottom")), "minecraft:light_emission": 6 }, facing,
  DIRS.map((dir) => ({ condition: `q.block_state('${CARD}') == '${dir}'`, components: { "minecraft:material_instances": mats(turned(dir, "bridge_front", "bridge_side", "bridge_side", "bridge_top", "bridge_bottom")) } })));

// Fuel tank: gauge shows 4..0 bars left (`used` 0 = full).
block("fuel_tank", "Fuel Tank", { "minecraft:material_instances": mats({ "*": "tank_0", up: "tank_top", down: "tank_top" }) }, { states: { [`${NS}:used`]: { values: { min: 0, max: 4 } } } },
  [0, 1, 2, 3, 4].map((u) => ({ condition: `q.block_state('${NS}:used') == ${u}`, components: { "minecraft:material_instances": mats({ "*": `tank_${u}`, up: "tank_top", down: "tank_top" }) } })));

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
const ITEMS = [
  ["fuel_can", "Fuel Can", 16, "items"],
  ["mega_wand", "Mega Wand", 1, "equipment"],
  ["flight_stick", "Flight Stick", 1, "equipment"],
];
for (const [id, , stack, cat] of ITEMS) {
  write(path.join(BP, "items", `${id}.json`), {
    format_version: "1.21.40",
    "minecraft:item": {
      description: { identifier: `${NS}:${id}`, menu_category: { category: cat } },
      components: { "minecraft:display_name": { value: `item.${NS}:${id}` }, "minecraft:icon": `${NS}_${id}`, "minecraft:max_stack_size": stack },
    },
  });
}

// Vanilla recipe: only the Mega Table. Everything else is made AT the Mega Table (scripts/recipes.js).
write(path.join(BP, "recipes", "mega_table.json"), {
  format_version: "1.20.10",
  "minecraft:recipe_shaped": {
    description: { identifier: `${NS}:mega_table` },
    tags: ["crafting_table"],
    pattern: ["IBI", "ICI", "IDI"],
    key: { I: { item: "minecraft:iron_ingot" }, B: { item: "minecraft:iron_block" }, C: { item: "minecraft:crafting_table" }, D: { item: "minecraft:diamond" } },
    unlock: [{ item: "minecraft:iron_ingot" }],
    result: { item: `${NS}:mega_table`, count: 1 },
  },
});

// ---------------------------------------------------------------------------
// Resource pack atlases + texts
// ---------------------------------------------------------------------------
makeTextures(RP, BP);
write(path.join(RP, "textures", "terrain_texture.json"), {
  resource_pack_name: NAME, texture_name: "atlas.terrain", padding: 8, num_mip_levels: 4,
  texture_data: Object.fromEntries(TERRAIN.map((t) => [`${NS}_${t}`, { textures: `textures/blocks/${NS}_${t}` }])),
});
write(path.join(RP, "textures", "item_texture.json"), {
  resource_pack_name: NAME, texture_name: "atlas.items",
  texture_data: Object.fromEntries(ITEMS.map(([id]) => [`${NS}_${id}`, { textures: `textures/items/${NS}_${id}` }])),
});
write(path.join(RP, "blocks.json"), {
  format_version: "1.21.40",
  ...Object.fromEntries(BLOCKS.map(([id, , sound]) => [`${NS}:${id}`, { sound }])),
});
const DESC = "Insanely gigantic engineering: 16,384-block capital starships, Titan Thrusters, fusion reactors, warp drives, super-cannons, shields, plus every MegaCraft Pro system.";
const lang = [
  `pack.name=${NAME}`,
  `pack.description=${DESC}`,
  ...BLOCKS.map(([id, name]) => `tile.${NS}:${id}.name=${name}`),
  ...ITEMS.map(([id, name]) => `item.${NS}:${id}=${name}`),
].join("\n") + "\n";
for (const dir of [BP, RP]) {
  write(path.join(dir, "texts", "en_US.lang"), lang);
  write(path.join(dir, "texts", "languages.json"), JSON.stringify(["en_US"]) + "\n");
}

// Sanity: every texture referenced exists.
const terrain = new Set(TERRAIN);
for (const f of fs.readdirSync(path.join(BP, "blocks"))) {
  const s = fs.readFileSync(path.join(BP, "blocks", f), "utf8");
  for (const m of s.matchAll(/"texture": "supermegacraft_(\w+)"/g)) if (!terrain.has(m[1])) throw new Error(`${f}: missing terrain texture ${m[1]}`);
}
for (const [id] of ITEMS) if (!ITEM_TEX.includes(id)) throw new Error(`missing item texture ${id}`);
for (const t of TERRAIN) if (!fs.existsSync(path.join(RP, "textures", "blocks", `${NS}_${t}.png`))) throw new Error(`missing png ${t}`);
console.log(`Built ${BLOCKS.length} blocks, ${ITEMS.length} items ->`, BP, RP);
