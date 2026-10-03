// The loot catalog. Every item's rules live here, shared by server, solo mode and the renderer.

export type SizeClass = "small" | "big" | "giant";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type Material = "rubber" | "plastic" | "cloth" | "glass" | "metal" | "cardboard" | "trash";

export interface LootDef {
  type: string;
  name: string;
  /** small = pocketable, big = both hands, giant = dragged along the ground (slowly) */
  size: SizeClass;
  rarity: Rarity;
  valueMin: number;
  valueMax: number;
  /** Mystery items show "???" until sold. Value may be wildly different. */
  mystery?: boolean;
  /** 0..1 speed penalty while carried (0.35 = 35% slower). */
  weight: number;
  /** Heavy items stop you sprinting and dodging. */
  heavy?: boolean;
  material: Material;
  /** collision sphere radius (m) and bounciness */
  radius: number;
  bounce: number;
  /** relative chance to spawn */
  spawnWeight: number;
  /** a line of flavour text for the look prompt */
  blurb: string;
  /** only ever dropped by pedestrians (never spawns loose in the city) */
  npcOnly?: boolean;
  /** Phase 5A: small money (coins, cash, wallets) goes straight into your cash when you grab it */
  money?: boolean;
  /** C4a: street junk: sits at its own spots round the city (never a random loot spawn), worth $0-5, back each day */
  junk?: boolean;
}

export const LOOT: LootDef[] = [
  // ---- small (pocketable) -----------------------------------------------------------
  { type: "rubber_chicken", name: "Rubber Chicken", size: "small", rarity: "common", valueMin: 4, valueMax: 10, weight: 0, material: "rubber", radius: 0.18, bounce: 0.65, spawnWeight: 10, blurb: "Squeaks with regret." },
  { type: "mixtape", name: "Mysterious Mixtape", size: "small", rarity: "common", valueMin: 6, valueMax: 14, weight: 0, material: "plastic", radius: 0.12, bounce: 0.3, spawnWeight: 9, blurb: "Side B is just screaming." },
  { type: "cursed_sneakers", name: "Cursed Sneakers", size: "small", rarity: "uncommon", valueMin: 18, valueMax: 40, weight: 0, material: "cloth", radius: 0.2, bounce: 0.2, spawnWeight: 6, blurb: "Still warm. Nobody knows why." },
  { type: "snow_globe", name: "Suspicious Snow Globe", size: "small", rarity: "rare", valueMin: 45, valueMax: 90, weight: 0, material: "glass", radius: 0.16, bounce: 0.25, spawnWeight: 3, blurb: "There's a tiny box fort inside." },
  { type: "lucky_pigeon", name: "Lucky Pigeon Statue", size: "small", rarity: "epic", valueMin: 110, valueMax: 220, weight: 0.05, material: "metal", radius: 0.2, bounce: 0.15, spawnWeight: 1.2, blurb: "Blessed by the Pigeon Council." },
  { type: "golden_spork", name: "Golden Spork", size: "small", rarity: "legendary", valueMin: 260, valueMax: 520, weight: 0, material: "metal", radius: 0.14, bounce: 0.3, spawnWeight: 0.4, blurb: "Spoon. Fork. Destiny." },

  // ---- big (both hands) -------------------------------------------------------------
  { type: "traffic_cone", name: "Traffic Cone", size: "big", rarity: "common", valueMin: 8, valueMax: 16, weight: 0.05, material: "plastic", radius: 0.3, bounce: 0.35, spawnWeight: 9, blurb: "Borrowed. Permanently." },
  { type: "cardboard_cutout", name: "Cardboard Cutout of a Stranger", size: "big", rarity: "common", valueMin: 10, valueMax: 22, weight: 0.1, material: "cardboard", radius: 0.35, bounce: 0.15, spawnWeight: 7, blurb: "Who is this guy? He's everywhere." },
  { type: "trash_bag", name: "Suspiciously Valuable Trash", size: "big", rarity: "common", valueMin: 2, valueMax: 12, mystery: true, weight: 0.1, material: "trash", radius: 0.35, bounce: 0.1, spawnWeight: 8, blurb: "It's... jingling?" },
  { type: "gold_sign", name: "\"WE BUY GOLD\" Sign", size: "big", rarity: "uncommon", valueMin: 20, valueMax: 45, weight: 0.15, material: "metal", radius: 0.4, bounce: 0.2, spawnWeight: 5, blurb: "They did not, in fact, buy gold." },
  { type: "crt_tv", name: "Old CRT TV", size: "big", rarity: "uncommon", valueMin: 30, valueMax: 60, weight: 0.35, heavy: true, material: "glass", radius: 0.4, bounce: 0.1, spawnWeight: 5, blurb: "Weighs as much as a small car." },
  { type: "giant_toaster", name: "Giant Toaster", size: "big", rarity: "rare", valueMin: 60, valueMax: 120, weight: 0.4, heavy: true, material: "metal", radius: 0.42, bounce: 0.15, spawnWeight: 2.5, blurb: "Toasts one (1) mattress." },
  { type: "mystery_suitcase", name: "Mystery Suitcase", size: "big", rarity: "rare", valueMin: 20, valueMax: 200, mystery: true, weight: 0.2, material: "cloth", radius: 0.38, bounce: 0.15, spawnWeight: 2.5, blurb: "Locked. Rattling. Promising." },

  // ---- giant (two players) ------------------------------------------------------------
  { type: "arcade_machine", name: "Broken Arcade Machine", size: "giant", rarity: "epic", valueMin: 180, valueMax: 320, weight: 0.4, heavy: true, material: "metal", radius: 0.65, bounce: 0.05, spawnWeight: 1, blurb: "High score held by a raccoon. Drag it home." },
  { type: "rubber_duck", name: "Giant Rubber Duck", size: "giant", rarity: "legendary", valueMin: 300, valueMax: 600, weight: 0.4, heavy: true, material: "rubber", radius: 0.75, bounce: 0.5, spawnWeight: 0.5, blurb: "Escaped from a parade. Drag it home." },

  // ---- pedestrian drops (Phase 2.5): "low but funny", with the occasional surprise ----
  { type: "half_sandwich", name: "Half a Sandwich", size: "small", rarity: "common", valueMin: 1, valueMax: 4, weight: 0, material: "cloth", radius: 0.12, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "The good half. Allegedly." },
  { type: "pocket_lint", name: "Pocket Lint Collection", size: "small", rarity: "common", valueMin: 1, valueMax: 3, weight: 0, material: "cloth", radius: 0.1, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "Curated over many years." },
  { type: "expired_coupon", name: "Expired Coupon", size: "small", rarity: "common", valueMin: 1, valueMax: 5, weight: 0, material: "cardboard", radius: 0.1, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "10% off one (1) soup. Expired 1998." },
  { type: "wrong_map", name: "Tourist Map (Wrong)", size: "small", rarity: "common", valueMin: 2, valueMax: 6, weight: 0, material: "cardboard", radius: 0.12, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "Trashington is apparently in the sea." },
  { type: "bread_crumbs", name: "Bag of Bread Crumbs", size: "small", rarity: "common", valueMin: 1, valueMax: 2, weight: 0, material: "cloth", radius: 0.12, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "Pigeon currency." },
  { type: "protein_shaker", name: "Protein Shaker", size: "small", rarity: "common", valueMin: 5, valueMax: 12, weight: 0, material: "plastic", radius: 0.13, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Smells like chalk and ambition." },
  { type: "disposable_camera", name: "Disposable Camera", size: "small", rarity: "common", valueMin: 8, valueMax: 20, weight: 0, material: "plastic", radius: 0.1, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "27 photos of pigeons." },
  { type: "mime_beret", name: "Mime Beret", size: "small", rarity: "uncommon", valueMin: 6, valueMax: 14, weight: 0, material: "cloth", radius: 0.12, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "..." },
  { type: "plastic_badge", name: "Plastic Security Badge", size: "small", rarity: "uncommon", valueMin: 8, valueMax: 18, weight: 0, material: "plastic", radius: 0.1, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Authority: very limited." },
  { type: "fancy_earbuds", name: "Fancy Earbuds", size: "small", rarity: "uncommon", valueMin: 20, valueMax: 45, weight: 0, material: "plastic", radius: 0.08, bounce: 0.4, spawnWeight: 0, npcOnly: true, blurb: "Still playing a motivational podcast." },
  { type: "bedazzled_phone", name: "Bedazzled Phone", size: "small", rarity: "uncommon", valueMin: 25, valueMax: 60, weight: 0, material: "glass", radius: 0.1, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "4 million followers. Still live." },
  { type: "mystery_wallet", name: "Mystery Wallet", size: "small", rarity: "uncommon", valueMin: 5, valueMax: 80, mystery: true, weight: 0, material: "cloth", radius: 0.1, bounce: 0.1, spawnWeight: 0, npcOnly: true, money: true, blurb: "Could be anything. Probably receipts." },
  // Phase 3.5: loot from shops, dumpsters, smashed props and parked cars (never spawns on the street by itself)
  { type: "phone_handset", name: "Payphone Handset", size: "small", rarity: "uncommon", valueMin: 12, valueMax: 30, weight: 0, material: "plastic", radius: 0.12, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Still has a dial tone. Somehow." },
  { type: "candy_bar", name: "Candy Bar", size: "small", rarity: "common", valueMin: 2, valueMax: 5, weight: 0, material: "plastic", radius: 0.1, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Mostly nougat. Mostly." },
  { type: "soda_can", name: "Soda Can", size: "small", rarity: "common", valueMin: 2, valueMax: 4, weight: 0, material: "metal", radius: 0.09, bounce: 0.4, spawnWeight: 0, npcOnly: true, blurb: "Pre-shaken for your enjoyment." },
  { type: "coin_pile", name: "Loose Change", size: "small", rarity: "common", valueMin: 3, valueMax: 12, weight: 0, material: "metal", radius: 0.1, bounce: 0.2, spawnWeight: 0, npcOnly: true, money: true, blurb: "Jingles with possibility." },
  { type: "newspaper", name: "Yesterday's Newspaper", size: "small", rarity: "common", valueMin: 1, valueMax: 3, weight: 0, material: "cloth", radius: 0.14, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "Headline: LOCAL BANDIT STRIKES AGAIN." },
  { type: "cash_bundle", name: "Bundle of Cash", size: "small", rarity: "rare", valueMin: 40, valueMax: 90, weight: 0, material: "cloth", radius: 0.1, bounce: 0.1, spawnWeight: 0, npcOnly: true, money: true, blurb: "Smells like crime." },
  { type: "cash_register", name: "Cash Register", size: "big", rarity: "epic", valueMin: 150, valueMax: 260, weight: 0.5, heavy: true, material: "metal", radius: 0.38, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "The whole till. Very subtle." },
  { type: "laptop", name: "Laptop", size: "big", rarity: "rare", valueMin: 60, valueMax: 140, weight: 0.2, material: "plastic", radius: 0.3, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "37 tabs open. All recipes." },
  { type: "sunglasses", name: "Designer Sunglasses", size: "small", rarity: "uncommon", valueMin: 10, valueMax: 25, weight: 0, material: "plastic", radius: 0.1, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Designed by someone, definitely." },
  { type: "canned_beans", name: "Canned Beans", size: "small", rarity: "common", valueMin: 3, valueMax: 6, weight: 0, material: "metal", radius: 0.1, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "The currency of the streets." },
  // Phase 4.5 big-shot jackpots (worth the heat)
  { type: "gold_bar", name: "Gold Bar", size: "small", rarity: "legendary", valueMin: 160, valueMax: 260, weight: 0, material: "metal", radius: 0.12, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "The millionaire's paperweight." },
  { type: "diamond_ring", name: "Diamond Ring", size: "small", rarity: "legendary", valueMin: 140, valueMax: 300, weight: 0, material: "metal", radius: 0.08, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Big enough to see from space." },
  { type: "money_bag", name: "Bank Money Bag", size: "big", rarity: "legendary", valueMin: 250, valueMax: 400, weight: 0.55, heavy: true, material: "cloth", radius: 0.32, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "It has a dollar sign on it. Nobody will notice." },
  { type: "award_trophy", name: "Golden Award", size: "big", rarity: "epic", valueMin: 120, valueMax: 220, weight: 0.3, material: "metal", radius: 0.26, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "Best Actor in a Supporting Commercial." },
  { type: "hardware_wallet", name: "Crypto Wallet", size: "small", rarity: "epic", valueMin: 0, valueMax: 500, mystery: true, weight: 0, material: "plastic", radius: 0.08, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Worth a fortune. Or nothing. Password: probably 'password'." },
  { type: "donut", name: "Evidence Donut", size: "small", rarity: "uncommon", valueMin: 12, valueMax: 25, weight: 0, material: "cloth", radius: 0.1, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Taken from a sleeping cop. Bold." },
  { type: "energy_drink", name: "Energy Drink", size: "small", rarity: "common", valueMin: 4, valueMax: 8, weight: 0, material: "metal", radius: 0.09, bounce: 0.4, spawnWeight: 0, npcOnly: true, blurb: "Tastes like a battery." },
  { type: "lottery_ticket", name: "Lottery Ticket", size: "small", rarity: "rare", valueMin: 1, valueMax: 250, weight: 0, material: "cloth", radius: 0.1, bounce: 0.05, spawnWeight: 0, npcOnly: true, mystery: true, blurb: "Scratch later. Dream now." },
  { type: "fancy_cheese", name: "Fancy Cheese Wheel", size: "small", rarity: "rare", valueMin: 25, valueMax: 60, weight: 0, material: "cloth", radius: 0.13, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Aged longer than the Mayor." },
  { type: "gold_chain", name: "Gold Chain", size: "small", rarity: "epic", valueMin: 90, valueMax: 180, weight: 0, material: "metal", radius: 0.1, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Heavy. Shiny. Questionable." },
  { type: "guitar", name: "Pawned Guitar", size: "big", rarity: "uncommon", valueMin: 30, valueMax: 70, weight: 0.15, material: "cardboard", radius: 0.45, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Knows one chord." },
  { type: "bagel", name: "Everything Bagel", size: "small", rarity: "common", valueMin: 2, valueMax: 5, weight: 0, material: "cloth", radius: 0.1, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Has everything except hope." },
  { type: "baguette", name: "Baguette", size: "small", rarity: "common", valueMin: 3, valueMax: 6, weight: 0, material: "cloth", radius: 0.14, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Also a sword." },
  { type: "birthday_cake", name: "Birthday Cake", size: "big", rarity: "rare", valueMin: 40, valueMax: 90, weight: 0.1, material: "cloth", radius: 0.3, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "Happy birthday, Gary." },
  // Phase 3 event loot (never spawns normally): the airdrop crate parachutes into the plaza
  { type: "airdrop_crate", name: "Airdrop Crate", size: "giant", rarity: "legendary", valueMin: 350, valueMax: 600, weight: 0.4, heavy: true, material: "cardboard", radius: 0.75, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "Care package from nobody. Drag it home." },
  // ---- C4a: street junk (throw it, push it, break things with it). Worth almost nothing. ----
  { type: "cafe_chair", name: "Cafe Chair", size: "big", rarity: "common", valueMin: 1, valueMax: 4, weight: 0.1, material: "metal", radius: 0.35, bounce: 0.3, spawnWeight: 0, junk: true, blurb: "Reserved for customers. You are not a customer." },
  { type: "bin_lid", name: "Bin Lid", size: "big", rarity: "common", valueMin: 0, valueMax: 2, weight: 0.05, material: "metal", radius: 0.32, bounce: 0.45, spawnWeight: 0, junk: true, blurb: "A shield. A frisbee. A lid." },
  { type: "glass_bottle", name: "Empty Bottle", size: "small", rarity: "common", valueMin: 0, valueMax: 1, weight: 0, material: "glass", radius: 0.1, bounce: 0.2, spawnWeight: 0, junk: true, blurb: "Smells like last Tuesday." },
  { type: "brick", name: "Brick", size: "small", rarity: "common", valueMin: 0, valueMax: 1, weight: 0.08, material: "trash", radius: 0.12, bounce: 0.05, spawnWeight: 0, junk: true, blurb: "The city's favourite window opener." },
  { type: "smelly_fish", name: "Smelly Fish", size: "small", rarity: "common", valueMin: 1, valueMax: 5, weight: 0, material: "rubber", radius: 0.15, bounce: 0.4, spawnWeight: 0, junk: true, blurb: "Slap someone with it. You know you want to." },
  { type: "traffic_barrier", name: "Traffic Barrier", size: "big", rarity: "common", valueMin: 2, valueMax: 5, weight: 0.2, material: "plastic", radius: 0.45, bounce: 0.2, spawnWeight: 0, junk: true, blurb: "ROAD CLOSED (by you)." },
  { type: "plastic_crate", name: "Stack of Crates", size: "giant", rarity: "common", valueMin: 2, valueMax: 5, weight: 0.3, heavy: true, material: "plastic", radius: 0.6, bounce: 0.1, spawnWeight: 0, junk: true, blurb: "Push them somewhere more annoying." },
  { type: "oil_barrel", name: "Oil Barrel", size: "giant", rarity: "common", valueMin: 3, valueMax: 5, weight: 0.35, heavy: true, material: "metal", radius: 0.55, bounce: 0.15, spawnWeight: 0, junk: true, blurb: "Empty. Probably. Don't shake it." },
  { type: "shopping_trolley", name: "Shopping Trolley", size: "giant", rarity: "common", valueMin: 3, valueMax: 5, weight: 0.2, heavy: true, material: "metal", radius: 0.6, bounce: 0.2, spawnWeight: 0, junk: true, blurb: "One wheel has its own ideas." },
  // ---- C4b: the laundromat's machines (and spray cans for tagging) ----
  { type: "odd_sock", name: "Odd Sock", size: "small", rarity: "common", valueMin: 1, valueMax: 3, weight: 0, material: "cloth", radius: 0.1, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Its partner is out there somewhere." },
  { type: "single_shoe", name: "Single Shoe", size: "small", rarity: "common", valueMin: 2, valueMax: 6, weight: 0, material: "cloth", radius: 0.14, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Left foot only. Very specific market." },
  { type: "novelty_undies", name: "Novelty Underpants", size: "small", rarity: "common", valueMin: 2, valueMax: 7, weight: 0, material: "cloth", radius: 0.12, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Printed with tiny pizzas. Still warm from the dryer." },
  { type: "fresh_laundry", name: "Freshly Laundered Hoodie", size: "small", rarity: "uncommon", valueMin: 18, valueMax: 35, weight: 0, material: "cloth", radius: 0.16, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "FRESHLY LAUNDERED: smells like a meadow. Sells for more." },
  { type: "designer_hoodie", name: "GOOCHY Hoodie", size: "small", rarity: "epic", valueMin: 120, valueMax: 220, weight: 0, material: "cloth", radius: 0.16, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Genuine GOOCHY. The G is upside down, which means it's rare." },
  { type: "designer_scarf", name: "VERSAYCHEE Scarf", size: "small", rarity: "epic", valueMin: 100, valueMax: 200, weight: 0, material: "cloth", radius: 0.12, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Silk. Probably. The label is sewn on with fishing line." },
  // C5b: Chinatown (from its stalls, its seafood tank and the dragon parade; never loose in the street)
  { type: "dumpling_box", name: "Box of Dumplings", size: "small", rarity: "common", valueMin: 6, valueMax: 14, weight: 0, material: "cardboard", radius: 0.12, bounce: 0.15, spawnWeight: 0, npcOnly: true, blurb: "Still steaming. Don't eat the evidence." },
  { type: "bao_bun", name: "Pork Bao", size: "small", rarity: "common", valueMin: 3, valueMax: 8, weight: 0, material: "cloth", radius: 0.09, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Fluffy. Warm. Perfect." },
  { type: "fortune_cookie", name: "Fortune Cookie", size: "small", rarity: "common", valueMin: 1, valueMax: 5, weight: 0, material: "cardboard", radius: 0.07, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "\"You will soon steal something shiny.\"" },
  { type: "mooncake", name: "Mooncake", size: "small", rarity: "uncommon", valueMin: 8, valueMax: 20, weight: 0, material: "cardboard", radius: 0.09, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "Dense. Delicious. Could stop a door." },
  { type: "live_crab", name: "Live Crab", size: "small", rarity: "uncommon", valueMin: 10, valueMax: 25, weight: 0, material: "rubber", radius: 0.12, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Snip snip. It does not want to be here." },
  { type: "paper_fan", name: "Paper Fan", size: "small", rarity: "common", valueMin: 3, valueMax: 9, weight: 0, material: "cardboard", radius: 0.1, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Very cooling. Very flappy." },
  { type: "lucky_cat", name: "Lucky Waving Cat", size: "small", rarity: "rare", valueMin: 25, valueMax: 60, weight: 0.05, material: "plastic", radius: 0.12, bounce: 0.25, spawnWeight: 0, npcOnly: true, blurb: "It never stops waving. Good luck for your fort." },
  { type: "jade_dragon", name: "Jade Dragon Statue", size: "big", rarity: "epic", valueMin: 80, valueMax: 200, weight: 0.3, heavy: true, material: "glass", radius: 0.3, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "Heavy, green and definitely priceless-ish." },
  { type: "red_envelope", name: "Red Envelope", size: "small", rarity: "uncommon", valueMin: 5, valueMax: 40, weight: 0, material: "cloth", radius: 0.08, bounce: 0.1, spawnWeight: 0, npcOnly: true, money: true, blurb: "Lucky money from the dragon! Straight into your wallet." },
  // C5c: the Trashington Bank's vault, its deposit boxes, the manager's keycard
  { type: "cash_bag", name: "Bag of Cash", size: "small", rarity: "rare", valueMin: 50, valueMax: 120, weight: 0, material: "cloth", radius: 0.14, bounce: 0.1, spawnWeight: 0, npcOnly: true, money: true, blurb: "It has a dollar sign on it. Classic." },
  { type: "pearl_necklace", name: "Pearl Necklace", size: "small", rarity: "rare", valueMin: 60, valueMax: 140, weight: 0, material: "plastic", radius: 0.08, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "From a safety deposit box. Very safe. Was." },
  { type: "bearer_bond", name: "Bearer Bond", size: "small", rarity: "epic", valueMin: 100, valueMax: 400, weight: 0, material: "cardboard", radius: 0.08, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "Pay to the bearer. That's you." },
  { type: "family_photo", name: "Awkward Family Photo", size: "small", rarity: "common", valueMin: 0, valueMax: 2, weight: 0, material: "cardboard", radius: 0.09, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Someone kept this in a vault. Why." },
  { type: "bank_keycard", name: "Bank Manager's Keycard", size: "small", rarity: "rare", valueMin: 1, valueMax: 1, weight: 0, material: "plastic", radius: 0.07, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Opens the Trashington Bank's vault. Quietly." },
  // C5c: golden stash items (only ever hidden at the landmarks)
  { type: "gold_nose", name: "The Mayor's Gold Nose", size: "small", rarity: "legendary", valueMin: 180, valueMax: 320, weight: 0.1, material: "metal", radius: 0.12, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Prised off his statue. He'll smell trouble." },
  { type: "mayors_medal", name: "Mayor's Medal of Honour", size: "small", rarity: "legendary", valueMin: 200, valueMax: 400, weight: 0, material: "metal", radius: 0.08, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Awarded to himself. Several times." },
  { type: "golden_toilet_seat", name: "Golden Toilet Seat", size: "big", rarity: "legendary", valueMin: 300, valueMax: 600, weight: 0.25, heavy: true, material: "metal", radius: 0.3, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "The bank manager's private throne." },
  { type: "diamond_pigeon", name: "Diamond Pigeon", size: "small", rarity: "legendary", valueMin: 250, valueMax: 500, weight: 0, material: "glass", radius: 0.1, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Coo. Sparkle. Coo." },
  // C5c.2: LE DUMPSTÈRE (the cloakroom, the dessert trolley, the chef's table, the kitchen) and its golden stash
  { type: "fancy_fizz", name: "Fancy Fizz", size: "small", rarity: "uncommon", valueMin: 18, valueMax: 40, weight: 0, material: "glass", radius: 0.09, bounce: 0.15, spawnWeight: 0, npcOnly: true, blurb: "Sparkling apple juice in a very serious bottle." },
  { type: "silver_cutlery", name: "Silver Cutlery", size: "small", rarity: "uncommon", valueMin: 15, valueMax: 35, weight: 0, material: "metal", radius: 0.09, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "A fork for every course. There are eleven courses." },
  { type: "macaron_box", name: "Box of Macarons", size: "small", rarity: "uncommon", valueMin: 8, valueMax: 20, weight: 0, material: "cardboard", radius: 0.1, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Tiny. Pastel. Twelve dollars each." },
  { type: "golden_truffle", name: "Golden Truffle", size: "small", rarity: "legendary", valueMin: 260, valueMax: 480, weight: 0, material: "plastic", radius: 0.09, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "A mushroom worth more than your fort. Do not eat." },
  // C5c.3: THE COMPACTOR (the conveyor bar, the DJ's rider, the staff lockers, the sorting bins, the VIP booths) and its golden stash
  { type: "glow_stick", name: "Glow Stick", size: "small", rarity: "common", valueMin: 1, valueMax: 3, weight: 0, material: "plastic", radius: 0.08, bounce: 0.4, spawnWeight: 0, npcOnly: true, junk: true, blurb: "Snap it. Wave it. Throw it at a rival." },
  { type: "neon_fizz", name: "Neon Fizz", size: "small", rarity: "common", valueMin: 3, valueMax: 8, weight: 0, material: "glass", radius: 0.08, bounce: 0.15, spawnWeight: 0, npcOnly: true, blurb: "Glows in the dark. So will you." },
  { type: "vinyl_record", name: "Rare Vinyl", size: "small", rarity: "uncommon", valueMin: 10, valueMax: 35, weight: 0, material: "plastic", radius: 0.16, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "DJ CRUNCH - 'COMPACT DISCO' (white label)." },
  { type: "dj_headphones", name: "DJ Headphones", size: "small", rarity: "rare", valueMin: 30, valueMax: 70, weight: 0, material: "plastic", radius: 0.12, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "One ear on, one ear off. Very professional." },
  { type: "vip_wristband", name: "VIP Wristband", size: "small", rarity: "uncommon", valueMin: 6, valueMax: 15, weight: 0, material: "cloth", radius: 0.07, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Big Crunch waves you in while you carry it." },
  { type: "mirror_ball", name: "Crushed-Can Mirror Ball", size: "big", rarity: "epic", valueMin: 70, valueMax: 150, weight: 0.2, heavy: true, material: "metal", radius: 0.3, bounce: 0.35, spawnWeight: 0, npcOnly: true, blurb: "Two thousand squashed soda cans. Sparkly." },
  { type: "golden_record", name: "The Golden Record", size: "small", rarity: "legendary", valueMin: 240, valueMax: 460, weight: 0, material: "metal", radius: 0.16, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Platinum was taken. 'TRASH TALK' by MC Compactor." },
  { type: "spray_can", name: "Spray Can", size: "small", rarity: "common", valueMin: 2, valueMax: 4, weight: 0, material: "metal", radius: 0.1, bounce: 0.35, spawnWeight: 0, npcOnly: true, junk: true, blurb: "5 tags left. Hold E on a blank wall." },
  { type: "rolecks_watch", name: "Rolecks Watch", size: "small", rarity: "epic", valueMin: 150, valueMax: 300, weight: 0, material: "metal", radius: 0.09, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Genuine imitation luxury." },
];

export const LOOT_BY_TYPE: Record<string, LootDef> = Object.fromEntries(LOOT.map((d) => [d.type, d]));

export function lootDef(type: string): LootDef {
  const d = LOOT_BY_TYPE[type];
  if (!d) throw new Error("unknown loot type " + type);
  return d;
}

export const RARITY_COLOR: Record<Rarity | "mystery", string> = {
  common: "#b9b4c2",
  uncommon: "#5fe07a",
  rare: "#39a8ff",
  epic: "#b36bff",
  legendary: "#ffcf3a",
  mystery: "#ffffff",
};

/** Rare-and-up items (and non-common mystery items) twinkle with a small sparkle. */
export function hasSparkle(def: LootDef): boolean {
  return def.rarity === "rare" || def.rarity === "epic" || def.rarity === "legendary" || !!def.mystery && def.rarity !== "common";
}

/** Phase 5A: giant items are dragged by ONE player, slowly. */
export const GIANT_DRAG_MUL = 0.4;

/** Speed multiplier while carrying (1 = no penalty). Giant items depend on carrier count. */
export function carrySpeedMul(def: LootDef, carriers = 1): number {
  if (def.size === "giant") return carriers >= 2 ? 0 : GIANT_DRAG_MUL; // 2 = a tug of war: nobody moves
  return 1 - def.weight;
}

/** Deterministic value roll. Suspicious trash has a 10% chance to be secretly valuable. */
export function rollValue(def: LootDef, rand: () => number): number {
  if (def.type === "trash_bag" && rand() < 0.1) return 120 + Math.floor(rand() * 60);
  return Math.round(def.valueMin + rand() * (def.valueMax - def.valueMin));
}
