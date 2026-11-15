// R14: THE GAME LOOP's data. Everything a designer tunes lives here: the balance numbers, what category every item is,
// the fort's upgrades, the workbench's recipes. Rules live in fort.ts / quests.ts / mayor.ts; nothing in here runs.
// Blake's decisions (docs/game-loop-plan.md, 2026-11-14) are marked (B).

/** the balance (B = Blake decided; the rest are proposals in docs/game-loop-plan.md) */
export const LOOP = {
  /** (B) seconds on your deposit mat before an item is banked */
  bankTime: 10,
  /** the deposit mat: half its size (metres) round the fort's pad */
  matHalf: 1.6,
  /** (B) shelves / safe to start with, and with the upgrades */
  shelves: [8, 12, 16], safe: [2, 3, 4],
  /** (B) night theft: how long at a rival's shelves (ALARM II makes it 10) and how far you may drift while you do it */
  theftTime: 5, theftTimeAlarm: 10, theftDrift: 1.5, theftReach: 2.4,
  /** (B) PREP: Sal's van pays this much of an item's worth; his "wanted today" list x2 (each type once a prep) */
  vanRate: 0.6, wantedMult: 2, wantedCount: 3,
  /** (B) street counters while scavenging (carried, unbanked loot) */
  streetPawn: 0.3, streetSpecialist: 0.45, streetMickey: 0.6,
  /** (B) 8:00 scavenge (day 5:30, sunset 0:30, NIGHT 2:00), 2:00 PREP, a 5 s countdown; 8 cycles at most */
  prepTime: 120, introTime: 5, maxCycles: 8,
  /** the warnings during a scavenge (seconds left in the whole scavenge) */
  warnAt: [150, 60, 10],
  /** (B) aura tasks: the price climbs x1.5 from $25 (rounded); interruption: owner -4, interrupter +3, once per pair a cycle */
  taskPrice0: 25, taskPriceMult: 1.5, interruptLoss: 4, interruptGain: 3,
  /** small aura: a cop knocked down (each cop once a cycle, 3 a cycle at most); a theft from a rival fort (each item once a cycle) */
  copAura: 1, copAuraMax: 3, theftAura: 2,
  /** (B) MAYOR */
  mayorAura: 60, mayorFee: 800, campaignTime: 240, campaignStrikes: 3, strikeTime: 15,
} as const;

// ---------------------------------------------------------------------------------------------------------------------
// ITEM CATEGORIES (what crafting and upgrades ask for). Items not listed fall back: money → cash, junk → junk, else
// "misc". Add a new item here to make it count toward recipes.
export type ItemCategory = "construction" | "electronics" | "furnishing" | "specialist" | "trophy" | "food" | "junk" | "cash" | "misc";
const CATS: Record<Exclude<ItemCategory, "cash" | "misc">, string[]> = {
  construction: ["brick", "plank", "duct_tape", "bag_of_screws", "liquid_nails", "nails_box", "hammer", "handsaw", "pipe", "timber_bundle", "pipe_fittings", "scrap_metal", "paint_tin", "toolbox", "traffic_cone", "traffic_barrier", "bin_lid", "plastic_crate", "oil_barrel", "shopping_trolley"],
  electronics: ["kettle", "toaster", "stand_mixer", "espresso_machine", "smart_watch", "crt_tv", "laptop", "phone_handset", "bedazzled_phone", "fancy_earbuds", "disposable_camera", "dj_headphones", "giant_toaster", "arcade_machine", "cash_register", "hardware_wallet"],
  furnishing: ["table_lamp", "bar_stool", "cushion", "vase", "rug", "designer_lamp", "velvet_sofa", "lava_lamp", "armchair", "cafe_chair", "cardboard_cutout", "snow_globe", "lucky_cat", "mirror_ball", "jade_dragon", "tower_globe", "mini_gondola", "paper_fan", "mystery_suitcase"],
  specialist: ["lost_ring", "abandoned_bag", "copper_pan", "knife_block", "pocket_watch", "cufflinks", "vinyl_record", "golden_record", "mixtape", "guitar", "golden_accordion", "fancy_fizz", "designer_hoodie", "designer_scarf", "diamond_ring", "gold_chain", "pearl_necklace", "rolecks_watch", "fancy_cheese", "cheese_wheel", "silver_cutlery", "macaron_box", "cursed_sneakers", "sunglasses", "jade_dragon"],
  trophy: ["grandfather_clock", "watch_winder", "golden_spork", "award_trophy", "gold_nose", "mayors_medal", "golden_toilet_seat", "lucky_pigeon", "gold_bar", "golden_truffle", "rubber_duck", "diamond_pigeon", "gold_sign"],
  food: ["crisps", "bread_loaf", "milk_carton", "instant_noodles", "half_sandwich", "candy_bar", "soda_can", "canned_beans", "donut", "energy_drink", "bagel", "baguette", "birthday_cake", "dumpling_box", "bao_bun", "fortune_cookie", "mooncake", "pizza_slice", "garlic_knot", "gelato_cup", "breadstick", "tiramisu", "neon_fizz", "smelly_fish", "salami"],
  junk: ["toilet_roll", "washing_up", "laundry_bag", "detergent", "lottery_scratch", "rubber_chicken", "trash_bag", "pocket_lint", "expired_coupon", "wrong_map", "bread_crumbs", "newspaper", "glass_bottle", "odd_sock", "single_shoe", "novelty_undies", "spray_can", "glow_stick", "family_photo"],
};
const CAT_OF = new Map<string, ItemCategory>();
for (const [c, ts] of Object.entries(CATS)) for (const t of ts) if (!CAT_OF.has(t)) CAT_OF.set(t, c as ItemCategory);
/** an item type's category (see CATS) */
export function itemCategory(type: string, def?: { money?: boolean; junk?: boolean }): ItemCategory {
  return CAT_OF.get(type) ?? (def?.money ? "cash" : def?.junk ? "junk" : "misc");
}
export const CATEGORY_NAMES: Record<ItemCategory, string> = { construction: "construction supplies", electronics: "electronics", furnishing: "furnishings", specialist: "specialist goods", trophy: "trophies", food: "food", junk: "junk", cash: "cash", misc: "odds and ends" };

// ---------------------------------------------------------------------------------------------------------------------
// FORT UPGRADES (bought in PREP). `needs`: upgrades you must have first. `items`: categories (or exact item types)
// used up, from your fort's shelves or safe. Each has one fixed place on the fort (client/src/game/fortRenderer.ts).
export type UpgradeId = "level2" | "level3" | "level4" | "shelves2" | "shelves3" | "safe2" | "safe3" | "workbench" | "alarm1" | "alarm2" | "handtruck" | "harness";
export interface UpgradeDef { id: UpgradeId; name: string; blurb: string; cash: number; items: Partial<Record<ItemCategory, number>>; needs: UpgradeId[] }
export const UPGRADES: UpgradeDef[] = [
  { id: "level2", name: "DUCT-TAPE FORT", blurb: "Fort level 2. It's mostly tape now. That's structural.", cash: 150, items: { construction: 2 }, needs: [] },
  { id: "level3", name: "PLYWOOD PALACE", blurb: "Fort level 3. Walls! A roof! A door that nearly shuts!", cash: 350, items: { construction: 4, furnishing: 1 }, needs: ["level2"] },
  { id: "level4", name: "MAYOR'S FORT", blurb: "Fort level 4. Columns, a dome, a red carpet. You need it to run for Mayor.", cash: 900, items: { construction: 4, furnishing: 2, trophy: 1 }, needs: ["level3"] },
  { id: "shelves2", name: "SHELVES II", blurb: "12 shelf spots (from 8).", cash: 100, items: { construction: 2 }, needs: [] },
  { id: "shelves3", name: "SHELVES III", blurb: "16 shelf spots.", cash: 250, items: { construction: 2, furnishing: 1 }, needs: ["shelves2", "level2"] },
  { id: "safe2", name: "SAFE II", blurb: "Your safe holds 3 things nobody can steal.", cash: 150, items: { electronics: 1 }, needs: [] },
  { id: "safe3", name: "SAFE III", blurb: "Your safe holds 4.", cash: 300, items: { electronics: 1, construction: 1 }, needs: ["safe2", "level2"] },
  { id: "workbench", name: "WORKBENCH", blurb: "Craft gear in PREP: megaphones, moustaches, banana peels, campaign kit.", cash: 80, items: { construction: 1 }, needs: [] },
  { id: "alarm1", name: "TIN-CAN ALARM", blurb: "Rattles when a thief's at your shelves: you're told at once.", cash: 60, items: { electronics: 1 }, needs: [] },
  { id: "alarm2", name: "BELL-AND-WHISTLE ALARM", blurb: "Thieves take 10 s at your fort (not 5), and you're told who and where.", cash: 150, items: { electronics: 1, construction: 1 }, needs: ["alarm1", "level2"] },
  { id: "handtruck", name: "HAND TRUCK", blurb: "Big things carried at almost walking speed.", cash: 150, items: { construction: 1 }, needs: [] },
  { id: "harness", name: "DRAG HARNESS", blurb: "Drag a giant thing alone a lot faster.", cash: 200, items: { construction: 1, furnishing: 1 }, needs: ["level2"] },
];
export const UPGRADE = new Map(UPGRADES.map((u) => [u.id, u]));
/** a fort's level from its upgrades (1-4) */
export const fortLevel = (ups: Iterable<string>) => { const s = new Set(ups); return s.has("level4") ? 4 : s.has("level3") ? 3 : s.has("level2") ? 2 : 1; };
export const FORT_LEVEL_NAMES = ["", "BOX FORT", "DUCT-TAPE FORT", "PLYWOOD PALACE", "MAYOR'S FORT"];

// ---------------------------------------------------------------------------------------------------------------------
// THE WORKBENCH's RECIPES (PREP, with a WORKBENCH). Gear is kept in your fort (not loot: it can't be stolen or sold).
export type GearId = "megaphone" | "moustache" | "banana" | "posters" | "sash";
export interface RecipeDef { id: GearId; name: string; blurb: string; cash: number; items: Partial<Record<ItemCategory, number>>; makes: number }
export const RECIPES: RecipeDef[] = [
  { id: "megaphone", name: "MEGAPHONE", blurb: "Stunt tasks give +50% aura. Very loud. Mostly feedback.", cash: 10, items: { electronics: 1, junk: 1 }, makes: 1 },
  { id: "moustache", name: "FAKE MOUSTACHE", blurb: "The next cop who'd arrest you loses interest. Used up.", cash: 10, items: { furnishing: 1 }, makes: 1 },
  { id: "banana", name: "BANANA PEELS (x3)", blurb: "A rival who knocks you down during a task or campaign slips on one. Used up.", cash: 0, items: { food: 1 }, makes: 3 },
  { id: "posters", name: "CAMPAIGN POSTERS", blurb: "For the Mayor campaign. Your face, but smug.", cash: 50, items: { junk: 2 }, makes: 1 },
  { id: "sash", name: "CEREMONIAL SASH", blurb: "For the Mayor campaign. Says MAYOR (probably).", cash: 100, items: { furnishing: 1, specialist: 1 }, makes: 1 },
];
export const RECIPE = new Map(RECIPES.map((r) => [r.id, r]));
