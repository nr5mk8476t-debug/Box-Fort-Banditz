// The people of Trashington (Phase 2.5): pedestrian types, their speeds, loot, and lines.
// Adult cartoon characters only; slapstick, not violence.

export type NpcKind = "tourist" | "businessman" | "influencer" | "jogger" | "gym_bro" | "mall_cop" | "mime" | "pigeon_lady" | "raccoon" | "cashier" | "cop"
  // Phase 4.5 big shots (+ their entourage)
  | "millionaire" | "bodyguard" | "courier" | "celebrity" | "fan" | "crypto_bro"
  // C1.1: the apartment tower's doorman (stands at his door, very snooty, fights back)
  | "doorman"
  // C3: the park's fisherman (sits on his jetty, hates noise, whacks you with his rod)
  | "fisherman"
  // C4b: lives above the laundromat; noise wakes her, she yells, calls the cops and comes down with her cane
  | "old_lady"
  // C5a: the lobby squat's mentor: a grubby, wise old hobo in a bathrobe who talks about trash like a kung-fu master
  | "uncle_dumpster"
  // C5c: the Trashington Bank's guards (come for you when the vault alarm goes)
  | "bank_guard"
  // C5c.2: Le Dumpstère's maître d'
  | "maitre_d"
  // C5c.3: THE COMPACTOR's bouncer (Big Crunch), and Sal's nephew Big Vinnie at PAWN-O-RAMA
  | "bouncer" | "vinnie"
  // R5: HOT STUFF PAWN & LOAN: Twitchy Lou behind his barred window, and his bodyguard Meat Locker
  | "lou" | "meat_locker"
  // R6: the new station's holding cell: the Champ (an old prison arm-wrestling champion with a golden spoon)
  | "champ"
  // R7: the right-hand pawn shop's owner and bouncer (Meat Locker's twin brother); the station's receptionist
  | "fran" | "cold_cuts" | "receptionist"
  // R11: NEON FEVER DREAM's private lounge: DON BINNIE (a cartoon mob boss) and his two bodyguards
  | "don" | "velvet_guard"
  // R11.4: SKETCHY STEVE, the back alley's raccoon in a trench coat
  | "sketchy_steve"
  // R12.1: THE SOGGY SHAMROCK: Fergal behind the bar, the two old regulars on their stools (Old Mossy, Noreen), and
  // the session band in the corner (THE RUSTY BIN LIDS: fiddle, tin whistle, bodhrán, banjo)
  | "barman" | "regular" | "trad_band"
  // R12.1b: the drinkers who live at THE SOGGY SHAMROCK
  | "patron"
  // R12.2: upstairs: the céilí band (accordion, fiddle, flute, bodhrán), six costumed dancers, MAMMY MOLONEY who owns the place
  | "ceili_band" | "ceili_dancer" | "mammy";

export interface NpcDef {
  kind: NpcKind;
  name: string;
  /** walking speed (m/s) */
  walk: number;
  /** fleeing speed (m/s) */
  flee: number;
  /** fights back when hit (chase + trade punches) */
  fighter: boolean;
  /** hits needed to KO a fighter */
  hp: number;
  /** chance to dodge a punch while not fleeing (jogger) */
  dodge: number;
  /** extra notoriety when you hit this one (mall cop reports you) */
  notoriety: number;
  /** C4b: chase speed (m/s) if not the usual 5.6 */
  chase?: number;
  spawnWeight: number;
  loot: [string, number][];
  /** big shot: rare, announced, marked with $$$, carries a jackpot (Phase 4.5) */
  bigShot?: { title: string; weight: number; follower?: NpcKind; followers?: number; heat: number };
  /** only drops their loot when knocked out (armored courier) */
  dropOnKo?: boolean;
  lines: { idle: string[]; hit: string[]; fight?: string[]; win?: string[]; lose?: string[]; dodge?: string[]; film?: string[]; yell?: string[]; holdup?: string[]; spot?: string[]; lost?: string[]; bust?: string[]; warn?: string[]; sold?: string[];
    /** R12.1: the pub: pouring, cutting you off, judging your split */
    pour?: string[]; cutoff?: string[]; perfect?: string[]; close?: string[]; miss?: string[] };
}

export const NPC_DEFS: Record<NpcKind, NpcDef> = {
  tourist: {
    kind: "tourist", name: "Tourist", walk: 1.3, flee: 5.2, fighter: false, hp: 1, dodge: 0, notoriety: 0, spawnWeight: 6,
    loot: [["wrong_map", 4], ["disposable_camera", 4], ["half_sandwich", 2], ["mystery_wallet", 1]],
    lines: { idle: ["Where is the famous trash?", "Ooh, a pigeon!", "Is this the Mayor's house?"], hit: ["MY SOUVENIRS!", "Is this a local custom?!", "Worst tour ever!"] },
  },
  businessman: {
    kind: "businessman", name: "Businessman", walk: 1.6, flee: 5.6, fighter: false, hp: 1, dodge: 0, notoriety: 0, spawnWeight: 5,
    loot: [["mystery_wallet", 4], ["expired_coupon", 3], ["pocket_lint", 2], ["rolecks_watch", 1.3]],
    lines: { idle: ["Let's circle back.", "Synergy...", "I'm walking and TALKING."], hit: ["MY ROLECKS!", "I'm calling my lawyer!", "This is NOT on the agenda!"] },
  },
  influencer: {
    kind: "influencer", name: "Influencer", walk: 1.2, flee: 5.0, fighter: false, hp: 1, dodge: 0, notoriety: 0, spawnWeight: 4,
    loot: [["bedazzled_phone", 3], ["half_sandwich", 1], ["expired_coupon", 1]],
    lines: { idle: ["Hey besties!", "Don't forget to like!", "Trashington core."], hit: ["This is going on my story!", "Like and SUBSCRIBE?!", "Ratio!"], film: ["We're LIVE!", "Chat, are you seeing this?!"] },
  },
  jogger: {
    kind: "jogger", name: "Jogger", walk: 3.6, flee: 7.0, fighter: false, hp: 1, dodge: 0.35, notoriety: 0, spawnWeight: 4,
    loot: [["fancy_earbuds", 3], ["protein_shaker", 1], ["pocket_lint", 1]],
    lines: { idle: ["On your left!", "Hydrate!", "Personal best incoming!"], hit: ["My PB!", "I was in the ZONE!"], dodge: ["Too slow!", "Cardio, baby!"] },
  },
  gym_bro: {
    kind: "gym_bro", name: "Gym Bro", walk: 1.5, flee: 5.2, fighter: true, hp: 2, dodge: 0, notoriety: 0, spawnWeight: 3,
    loot: [["protein_shaker", 4], ["half_sandwich", 2], ["mystery_wallet", 1]],
    lines: { idle: ["Protein time.", "Never skip leg day.", "Is that a squat rack?"], hit: ["Oh it's ON.", "Bro. BRO."], fight: ["Do you even lift?!", "Come at me, bro!"], win: ["Light weight!", "Yeah buddy!"], lose: ["...should've done cardio..."] },
  },
  mall_cop: {
    kind: "mall_cop", name: "Off-duty Mall Cop", walk: 1.4, flee: 5.0, fighter: true, hp: 2, dodge: 0, notoriety: 15, spawnWeight: 3,
    loot: [["plastic_badge", 4], ["half_sandwich", 2], ["expired_coupon", 2]],
    lines: { idle: ["Keep it moving.", "No loitering. Probably.", "Food court was quiet today."], hit: ["That's assault on a... uh... me!"], fight: ["I'm off duty but STILL!", "Halt, citizen!"], win: ["Justice. Served.", "Mall rules apply everywhere."], lose: ["Tell the food court... I tried..."] },
  },
  mime: {
    kind: "mime", name: "Mime", walk: 1.2, flee: 5.0, fighter: true, hp: 2, dodge: 0, notoriety: 0, spawnWeight: 2,
    loot: [["mime_beret", 3], ["pocket_lint", 2]],
    lines: { idle: ["*walks against the wind*", "*pulls invisible rope*", "..."], hit: ["*invisible box*", "..."], fight: ["...", "*rolls up invisible sleeves*"], win: ["*silent bow*"], lose: ["*dramatic faint*"] },
  },
  pigeon_lady: {
    kind: "pigeon_lady", name: "Pigeon Lady", walk: 1.1, flee: 4.8, fighter: false, hp: 1, dodge: 0, notoriety: 0, spawnWeight: 3,
    loot: [["bread_crumbs", 5], ["mystery_wallet", 1], ["lucky_pigeon", 0.3]],
    lines: { idle: ["Who's a good pigeon?", "Coo coo, my darlings.", "They understand me."], hit: ["COO COO! GET 'EM!", "My babies will avenge me!"] },
  },
  // Phase 3 event: raccoons sneak into forts and run off with loot. Never spawn as pedestrians.
  raccoon: {
    kind: "raccoon", name: "Raccoon", walk: 3.2, flee: 4.4, fighter: false, hp: 1, dodge: 0, notoriety: 0, spawnWeight: 0,
    loot: [["pocket_lint", 1]],
    lines: { idle: ["*chitter*", "*sniff sniff*"], hit: ["*SKREEE!*", "*angry chitter*"], win: ["*triumphant chitter*"] },
  },
  // Phase 3.5: one behind every shop counter. Never fights, never leaves the shop.
  // C5c.3: THE COMPACTOR's bouncer: cover charge or VIP, otherwise you're back on the pavement
  bouncer: {
    kind: "bouncer", name: "Big Crunch", walk: 1.2, flee: 5.0, fighter: true, hp: 4, dodge: 0, notoriety: 18, spawnWeight: 0, chase: 7.0,
    loot: [["vip_wristband", 2], ["glow_stick", 2], ["coin_pile", 2]],
    lines: {
      idle: ["Fifteen bucks. Or be somebody.", "Name's not on the list. There is no list. Fifteen bucks.", "No boxes on the dance floor.", "Dress code: not garbage. Well. Less garbage.", "Tonight's DJ: DJ Crunch. My cousin.", "Shoes optional. Attitude mandatory."],
      hit: ["Did you just... poke me?", "That tickled. Now I'm mad.", "OW. Rude."],
      fight: ["You're getting COMPACTED.", "Outside. Now.", "Crunch time!"],
      win: ["And STAY out.", "Next!", "Crunched."],
      lose: ["Tell DJ Crunch... play my song..."],
    },
  },
  // C5c.3: Sal's nephew: dozes by the guitars, comes swinging if somebody smashes the pawn case
  vinnie: {
    kind: "vinnie", name: "Big Vinnie", walk: 1.2, flee: 5.0, fighter: true, hp: 3, dodge: 0, notoriety: 14, spawnWeight: 0, chase: 6.6,
    loot: [["coin_pile", 3], ["gold_chain", 0.6]],
    lines: {
      idle: ["Uncle Sal says no touching.", "You break it, you bought it. Then I break you.", "*picks at a guitar string*", "We don't do refunds. Or questions."],
      hit: ["HEY! That's my good shirt!", "Uncle Saaaal!"],
      fight: ["You smashed the CASE?!", "Put it BACK!", "Nobody robs Pawn-O-Rama!"],
      win: ["Pawned.", "Sold, to the guy on the floor."],
      lose: ["Uncle Sal's gonna kill me..."],
    },
  },
  // R5: HOT STUFF PAWN & LOAN. Lou never leaves his barred booth (he ducks); Meat Locker guards the back room.
  lou: {
    kind: "lou", name: "Twitchy Lou", walk: 1.0, flee: 1.0, fighter: false, hp: 1, dodge: 0, notoriety: 12, spawnWeight: 0,
    loot: [["coin_pile", 1]],
    lines: {
      idle: ["Psst. Whatcha got?", "*eye twitches*", "I don't ask where it's from. Don't tell me.", "Cash. Today. No paperwork.", "Is that a cop? ...no? OK.", "Everything here fell off something."],
      hit: ["HEY! Not the face! MEAT!", "MEAT LOCKER! WE GOT ONE!", "Through the BARS?! Rude!"],
      yell: ["Buy or bye, pal.", "You're makin' me nervous. MEAT?", "This ain't a museum. Sell or scram."],
    },
  },
  don: {
    kind: "don", name: "Don Binnie", walk: 1.0, flee: 1.0, fighter: false, hp: 1, dodge: 0, notoriety: 10, spawnWeight: 0,
    loot: [["coin_pile", 1]],
    lines: {
      idle: ["*adjusts gold chain*", "Ey. This is a private party.", "Nobody tells me when the drop is. I TELL the drop.", "You like my club? I like my club.", "Sal, more velvet. Everything velvet.", "*sips a glowing mocktail*"],
      hit: ["You just made a big mistake, pal.", "BOYS. Him.", "Nobody touches the suit."],
      yell: ["Did I invite you? I don't think I invited you.", "Private means PRIVATE."],
    },
  },
  sketchy_steve: {
    kind: "sketchy_steve", name: "Sketchy Steve", walk: 1.0, flee: 4.6, fighter: false, hp: 1, dodge: 0, notoriety: 8, spawnWeight: 0,
    loot: [["coin_pile", 1]],
    lines: {
      idle: ["Psst. Hey. You. Wanna go FAST?", "*opens trench coat* Take a look, take a look.", "All natural. Probably.", "Side effects include: side effects.", "I'm not here. You didn't see me.", "First one's fifteen. So is the second one."],
      hit: ["OW! Bad for business!", "Not the coat! It's vintage!", "That's assault AND battery!"],
      yell: ["COPS! I was never here!", "Scatter! SCATTER!", "Uh oh. Gotta bounce."],
      sold: ["Pleasure doin' business.", "Don't tell your mum.", "Enjoy the ride, kid.", "No refunds. Ever."],
    },
  },
  barman: {
    kind: "barman", name: "Fergal", walk: 1.0, flee: 1.0, fighter: false, hp: 1, dodge: 0, notoriety: 10, spawnWeight: 0,
    loot: [["coin_pile", 1]],
    lines: {
      idle: ["What'll it be?", "*polishes a glass that's already clean*", "Two-part pour. You don't rush a GUZZLE'S.", "Split the G and the next round's on you. That's the rule. I made it up.", "No boxes on the bar, lads.", "*nods along to the band*"],
      hit: ["Ah, would you STOP.", "Not behind MY bar.", "That's you barred. Well. Nearly."],
      yell: ["Settle DOWN!", "Not in here, pal!"],
      pour: ["Let it settle now. Patience.", "One GUZZLE'S. Mind the G.", "There she is. Beautiful.", "Top it off... and there."],
      cutoff: ["You've had plenty, pal. Water.", "Go home and sleep it off.", "Not a chance. Come back when you can see straight."],
      perfect: ["Now THAT'S a split!", "Right through the middle! Lovely stuff!", "Somebody frame that!"],
      close: ["Ah, so close. Not bad.", "Nearly! I'll allow it.", "Close enough for a Tuesday."],
      miss: ["What was THAT?", "You went right past it!", "Ah, you're only codding yourself."],
    },
  },
  regular: {
    kind: "regular", name: "The Regulars", walk: 0.8, flee: 1.0, fighter: false, hp: 1, dodge: 0, notoriety: 6, spawnWeight: 0,
    loot: [["coin_pile", 1]],
    lines: {
      idle: ["Did I ever tell you about the time I wrestled a seagull for a chip? Lost. Twice.", "This stool's had my shape since 1987.", "The Mayor's statue? I knew the fella who modelled the nose.", "I once saw a raccoon pay for a pint. Exact change.", "Back in my day, the dumpsters had DUMPSTERS.", "Rain's coming. My knee says so. My knee's never wrong. Except Tuesdays.", "The band's grand tonight.", "I've a cousin in the sewers. Lovely fella. Smells awful."],
      hit: ["I'll tell your mother!", "Ah, mind the pint!", "In MY day we said please first!"],
      perfect: ["Ah, beautiful!", "Did you SEE that?!", "Slainte! Lovely!"],
      close: ["Not bad, not bad.", "Nearly had it!"],
      miss: ["Ah, unlucky.", "Back of the queue, you."],
    },
  },
  patron: {
    kind: "patron", name: "A Regular", walk: 0.9, flee: 3.5, fighter: false, hp: 1, dodge: 0, notoriety: 6, spawnWeight: 0,
    loot: [["coin_pile", 2], ["glass_bottle", 1]],
    lines: {
      idle: ["Another round? Go on so.", "Did you see the match? Neither did I.", "This is my spot. Has been for twenty years.", "Sure look, it is what it is.", "Grand stretch in the evenings.", "I only came in for the one.", "Fergal pours the best pint in Trashington. Don't tell him.", "The band's flying tonight!", "*hums along*", "Who's buying? ...Not me."],
      hit: ["Mind the PINT!", "Ah here, what was that for?!", "You've spilt me drink!", "Fergal! FERGAL!"],
      perfect: ["YEOOO! Right through the G!", "Ah, you're a legend!", "Stop the lights!", "Slainte!"],
      close: ["Ah, nearly!", "Not bad at all."],
      miss: ["Ha! Unlucky!", "Back of the class!"],
    },
  },
  ceili_band: {
    kind: "ceili_band", name: "The Shamrock Shufflers", walk: 0.8, flee: 1.0, fighter: false, hp: 1, dodge: 0, notoriety: 8, spawnWeight: 0,
    loot: [["coin_pile", 1]],
    lines: {
      idle: ["Take your partners!", "Faster? Grand. FASTER.", "*squeezes the accordion*", "One more time round!", "Mind your feet now!"],
      hit: ["Not the box!", "Ah, you've me out of tune now!", "Heckler!"],
    },
  },
  ceili_dancer: {
    kind: "ceili_dancer", name: "A Céilí Dancer", walk: 1.0, flee: 3.5, fighter: false, hp: 1, dodge: 0, notoriety: 6, spawnWeight: 0,
    loot: [["coin_pile", 1]],
    lines: {
      idle: ["Hup! Come on, join in!", "Arms DOWN, that's the trick.", "Hop, two, three!", "Swing your partner!", "You've two left feet. Perfect!"],
      hit: ["Ow! Mind the shoes!", "That's not a step!", "Rude!"],
      perfect: ["Woo! Lovely!", "Hup hup!"],
    },
  },
  mammy: {
    kind: "mammy", name: "Mammy Moloney", walk: 0.6, flee: 0.6, fighter: false, hp: 1, dodge: 0, notoriety: 12, spawnWeight: 0,
    loot: [["coin_pile", 1]],
    lines: {
      idle: ["Sit up straight.", "*taps her stick*", "Fergal! Pints!", "I've buried two husbands and a landlord.", "Nobody fights in MY pub.", "You've a look of my third cousin. Shifty."],
      hit: ["You'll regret that, pet.", "OUT!", "How DARE you."],
      yell: ["OUT! And don't come back till you've manners!", "Not in MY pub!", "Fergal, get the door."],
    },
  },
  trad_band: {
    kind: "trad_band", name: "The Rusty Bin Lids", walk: 0.8, flee: 1.0, fighter: false, hp: 1, dodge: 0, notoriety: 8, spawnWeight: 0,
    loot: [["coin_pile", 1]],
    lines: {
      idle: ["*taps foot*", "This one's called The Bin Lid Reel.", "One more, then a break. Ha. No.", "Hup!", "*winks over the fiddle*"],
      hit: ["Not the INSTRUMENT!", "Ah, you knocked me off the beat!", "Heckler!"],
    },
  },
  velvet_guard: {
    kind: "velvet_guard", name: "Binnie's Bodyguard", walk: 1.2, flee: 3.0, fighter: true, hp: 30, dodge: 0, notoriety: 12, spawnWeight: 0, chase: 7.2,
    loot: [["coin_pile", 1]],
    lines: {
      idle: ["...", "Mr Binnie is not seeing visitors.", "*touches earpiece*", "Keep it moving.", "Rope means no."],
      hit: ["...really?", "Cute.", "Hm."],
      fight: ["You're leaving. Now.", "The Don says goodnight.", "Out you go."],
      win: ["And stay out.", "Boss, we're good.", "Next."],
      lose: ["...tell the Don... I tried..."],
    },
  },
  meat_locker: {
    kind: "meat_locker", name: "Meat Locker", walk: 1.1, flee: 3.0, fighter: true, hp: 30, dodge: 0, notoriety: 16, spawnWeight: 0, chase: 7.0,
    loot: [["coin_pile", 3], ["gold_chain", 1]],
    lines: {
      idle: ["...", "*cracks knuckles*", "Back room's closed.", "Lou says no.", "*flexes, slowly*", "I'm not here to talk."],
      hit: ["...was that a punch?", "Cute.", "Hm."],
      fight: ["You're done.", "Lights out.", "Meat's on the menu.", "Wrong shop, pal."],
      win: ["Next.", "And stay on the pavement.", "Lou, we're good."],
      lose: ["...ow. Need... a nap..."],
      warn: ["Lou says buy or move along. Last warning.", "You're loitering. I don't like loitering."],
    },
  },
  // R7: FINDERS KEEPERS PAWN (the mirror of Lou's shop): Sticky Fran behind the till, Cold Cuts on the door
  fran: {
    kind: "fran", name: "Sticky Fran", walk: 1.0, flee: 1.0, fighter: false, hp: 1, dodge: 0, notoriety: 12, spawnWeight: 0,
    loot: [["coin_pile", 1]],
    lines: {
      idle: ["Finders keepers, hon. What'd you find?", "*chews gum loudly*", "No receipts. No questions. No refunds.", "Ooh, is that real? Don't answer.", "Cash only, sweetie.", "My ex-husband's in that cabinet. His watch, I mean."],
      hit: ["COLD CUTS! He touched me!", "Not the NAILS!", "COLD CUTS! WORK!"],
    },
  },
  cold_cuts: {
    kind: "cold_cuts", name: "Cold Cuts", walk: 1.1, flee: 3.0, fighter: true, hp: 30, dodge: 0, notoriety: 16, spawnWeight: 0, chase: 7.0,
    loot: [["coin_pile", 3], ["gold_chain", 1]],
    lines: {
      idle: ["...", "*cracks knuckles*", "Fran says no touching.", "My brother works at Lou's. He's the ugly one.", "*flexes, even slower than his brother*", "I'm not here to talk."],
      hit: ["...was that a punch?", "Cute.", "Hm."],
      fight: ["You're done.", "Lights out.", "Sliced and diced.", "Wrong shop, pal."],
      win: ["Next.", "And stay on the pavement.", "Fran, we're good."],
      lose: ["...ow. Tell my brother... nothing."],
    },
  },
  // R7: the station's front desk
  receptionist: {
    kind: "receptionist", name: "Officer Pam (Front Desk)", walk: 1.0, flee: 1.0, fighter: false, hp: 1, dodge: 0, notoriety: 30, spawnWeight: 0,
    loot: [["donut", 1]],
    lines: {
      idle: ["Take a number.", "Evidence room's upstairs. Don't even think about it.", "*stamps something*", "Is this about the TV? It's always about a TV.", "The chief is in a meeting. With his lunch.", "Please hold. Forever."],
      hit: ["OFFICER DOWN! Well. Officer slightly bumped!", "You hit the FRONT DESK?!", "BACKUP! FRONT DESK!"],
    },
  },
  champ: {
    kind: "champ", name: "The Champ", walk: 1.0, flee: 2.0, fighter: true, hp: 40, dodge: 0, notoriety: 0, spawnWeight: 0, chase: 4.6, dropOnKo: true,
    loot: [["golden_spoon", 1]],
    lines: {
      idle: ["Seven letters, 'a quiet place'... C-E-L-L-...", "*polishes his golden spoon*", "Arm-wrestling champ, cell block D, 1998 to 2009.", "Don't touch the spoon.", "Four down: 'loser'. That's you.", "Shower's cold. Always cold."],
      hit: ["...a fly landed on me.", "Hm? You say something?", "Cute."],
      fight: ["Alright. One round.", "You wanna arm wrestle? No? Fine.", "Sit DOWN."],
      win: ["*sits on you* Now... nine across...", "Comfy. Stay.", "Champ's still champ."],
      lose: ["...my spoon... MY SPOON...", "Nobody's ever... ugh."],
    },
  },
  bank_guard: {
    kind: "bank_guard", name: "Bank Guard", walk: 1.3, flee: 5.0, fighter: true, hp: 3, dodge: 0, notoriety: 20, spawnWeight: 0, chase: 7.2,
    loot: [["coin_pile", 3], ["donut", 1]],
    lines: {
      idle: ["Welcome to Trashington Bank. Please don't.", "No loitering near the vault.", "I've got my eye on you. Both eyes.", "Deposits only. No withdrawals of the stealing kind."],
      hit: ["Assaulting a guard! That's a fine!", "My badge!", "I'm pressing the button! THE BUTTON!"],
      fight: ["FREEZE! ...Please?", "Step away from the vault!", "Not on my shift!", "Halt in the name of compound interest!"],
      win: ["Case closed.", "Account frozen.", "Have a secure day."],
      lose: ["Tell the manager... I tried..."],
    },
  },
  maitre_d: {
    kind: "maitre_d", name: "Maitre d'", walk: 1.3, flee: 5.0, fighter: true, hp: 3, dodge: 0, notoriety: 15, spawnWeight: 0,
    loot: [["coin_pile", 3], ["silver_cutlery", 1], ["mystery_wallet", 0.6]],
    lines: {
      idle: ["Bonjour. Non.", "Do you have a reservation? Of course you don't.", "We have a dress code, monsieur. It is 'not a box'.", "The table for twenty dollars is... available.", "Le Dumpstere. Three bins in the guide.", "Please do not lick the menu."],
      hit: ["Sacre bleu! My moustache!", "This is a five-bin establishment!", "Not ze face!"],
      fight: ["Out! OUT!", "You are banned from ze premises!", "Garcon! Ze rolling pin!"],
      win: ["Bon appetit... elsewhere.", "Next!"],
      lose: ["Tell ze chef... ze souffle..."],
    },
  },
  doorman: {
    kind: "doorman", name: "Doorman", walk: 1.4, flee: 4.8, fighter: true, hp: 3, dodge: 0, notoriety: 12, spawnWeight: 0,
    loot: [["coin_pile", 4], ["sunglasses", 1], ["gold_chain", 0.4]],
    lines: {
      idle: ["Residents only.", "Sir, this is a luxury establishment.", "I can smell the cardboard from here.", "Do you have an appointment? No? Didn't think so.", "Wipe your feet. Actually, just leave.", "The penthouse does not accept boxes."],
      hit: ["My HAT! You've dented my hat!", "Do you know how much this coat cost?!", "I'm calling the residents' association!"],
      fight: ["Nobody touches the velvet rope!", "I trained for this. By correspondence course.", "You are NOT on the list!"],
      win: ["And stay out!", "Have a *lovely* day.", "Riff-raff removed."],
      lose: ["Tell the residents... I held the door..."],
    },
  },
  fisherman: {
    kind: "fisherman", name: "Fisherman", walk: 1.2, flee: 3.6, fighter: true, hp: 2, dodge: 0, notoriety: 8, spawnWeight: 0,
    loot: [["canned_beans", 1], ["coin_pile", 1]],
    lines: {
      idle: ["Shh. You'll scare the fish.", "Been here since 1987. Caught one boot.", "There's a shark in there. Don't laugh.", "The fish know. They always know.", "It's a pond. I KNOW it's a pond.", "Stop wading in my spot!"],
      hit: ["My ROD!", "You made me lose the big one!", "OW! Right in the tackle box!"],
      fight: ["Take THIS, you land-lubber!", "I've wrestled catfish bigger than you!"],
      win: ["Catch and release, pal.", "Back to fishing."],
      lose: ["The fish... will avenge me..."],
    },
  },
  uncle_dumpster: {
    kind: "uncle_dumpster", name: "Uncle Dumpster", walk: 1.0, flee: 3.0, fighter: false, hp: 99, dodge: 1, notoriety: 0, spawnWeight: 0,
    loot: [["pocket_lint", 1]],
    lines: {
      // (his tips: he goes round them in order while anyone's near)
      idle: [
        "Welcome, young bandit. The city is a dumpster. And the dumpster... is a city.",
        "E picks things up. Small things go in your pockets. Big things fill your hands.",
        "Carry treasure home to your box fort. Loot inside your yard is banked.",
        "Punch a phone booth, a vending machine, a parking meter: coins fall out. Also: fun.",
        "Hold E at a shop till to rob it. The cashier will not enjoy this.",
        "Heat comes from being SEEN. An empty alley is a quiet friend.",
        "Wanted? Crouch in a bush. Cops walk right past a good bush.",
        "A spray can holds five tags. Every tag is aura. Aura is how you become Mayor, one day.",
        "Drag a trolley round the cones for the Grand Prix. I once did it in eleven seconds. In 1987.",
        "Throw bin lids at the targets. Aim for the middle, like life.",
        "Press M for the map. Even I use the map. The map does not judge.",
        "When the host starts the match, you'll wake up at your fort. Make me proud.",
      ],
      hit: ["Ow. Rude."],
      dodge: ["Too slow, grasshopper.", "You punch like wet cardboard.", "The dumpster sees all.", "*sips tea* Missed.", "Hah! Bathrobe style!"],
    },
  },
  old_lady: {
    kind: "old_lady", name: "Grumpy Old Lady", walk: 1.3, flee: 3.0, fighter: true, hp: 2, dodge: 0, notoriety: 15, spawnWeight: 0, chase: 5.0,
    loot: [["coin_pile", 2], ["candy_bar", 1], ["mystery_wallet", 0.5]],
    lines: {
      idle: ["*snores*"],
      yell: ["SOME OF US ARE TRYING TO SLEEP!", "I'M CALLING THE POLICE! AND YOUR MOTHER!", "NOT AGAIN! I'VE GOT MY CANE!", "KEEP IT DOWN, HOOLIGANS!", "THAT'S IT. I'M COMING DOWN THERE."],
      hit: ["You hit a LADY?!", "I survived three husbands, I'll survive you!", "OW! My hip!"],
      fight: ["Take THAT, whippersnapper!", "CANE TIME!", "In my day we respected the elderly!"],
      win: ["And STAY down!", "Back to my stories.", "Hmph. Kids."],
      lose: ["I'll... tell... the residents' committee..."],
    },
  },
  cashier: {
    kind: "cashier", name: "Cashier", walk: 1.4, flee: 1.4, fighter: false, hp: 1, dodge: 0, notoriety: 10, spawnWeight: 0,
    loot: [["cash_bundle", 1]],
    lines: {
      idle: ["Welcome in!", "Cash or... cash?", "No loitering. Please.", "Have a trashy day!"],
      hit: ["OW! Take the money!", "I'm on minimum wage!", "This is not in my job description!"],
      yell: ["HEY! Put that back!", "I SAW THAT!", "Security! ...we don't have security.", "That's not free!"],
      holdup: ["Take it! Take it all!", "Please don't hurt the register!", "Okay okay okay!"],
    },
  },
  // Phase 4: Trashington's finest. Sent by the police system when your heat gets high.
  cop: {
    kind: "cop", name: "Cop", walk: 3.6, flee: 6.1, fighter: true, hp: 3, dodge: 0, notoriety: 15, spawnWeight: 0,
    loot: [["donut", 1]],
    lines: {
      idle: ["Nice day for a donut.", "Move along.", "Anybody seen a bum with a TV?"],
      hit: ["You just made it worse, pal!", "That's resisting!", "OW! My badge!"],
      fight: ["FREEZE!", "STOP RIGHT THERE!", "Hands where I can see 'em!"],
      spot: ["There he is!", "HEY! You! Stop!", "Suspect spotted!", "We got a runner!"],
      lost: ["Where'd he go?", "Lost him...", "Sneaky little dumpster rat.", "I'll get you next time!"],
      bust: ["Gotcha!", "You're going downtown!", "Book 'em!", "Nighty night, bandit."],
      win: ["Gotcha!"], lose: ["...call... for... backup..."],
    },
  },
  // ---- Phase 4.5: big shots. Worth the heat. ----
  millionaire: {
    kind: "millionaire", name: "Millionaire", walk: 1.1, flee: 4.6, fighter: false, hp: 1, dodge: 0, notoriety: 20, spawnWeight: 0,
    loot: [["gold_bar", 1], ["diamond_ring", 1]],
    bigShot: { title: "A MILLIONAIRE", weight: 3, follower: "bodyguard", followers: 1, heat: 30 },
    lines: { idle: ["Is this... the poor part of town?", "Monocle check.", "I bought this street. Twice."], hit: ["MY MONOCLE!", "Do you know who I AM?!", "Security! SECURITY!"] },
  },
  bodyguard: {
    kind: "bodyguard", name: "Bodyguard", walk: 1.3, flee: 5.8, fighter: true, hp: 3, dodge: 0, notoriety: 5, spawnWeight: 0,
    loot: [["mystery_wallet", 1]],
    lines: { idle: ["...", "Keep walking, pal.", "*cracks knuckles*"], hit: ["That tickled."], fight: ["Back off!", "Not on my watch!"], win: ["Stay down."], lose: ["...fired... for sure..."] },
  },
  courier: {
    kind: "courier", name: "Armored Courier", walk: 1.4, flee: 5.4, fighter: true, hp: 2, dodge: 0, notoriety: 25, spawnWeight: 0, dropOnKo: true,
    loot: [["money_bag", 1]],
    bigShot: { title: "AN ARMORED CASH COURIER", weight: 3, heat: 40 },
    lines: { idle: ["Bank run. Literally.", "Nobody look at the bag.", "Totally normal bag."], hit: ["Armor, pal!", "Nice try!"], fight: ["Hands off the bag!", "You picked the wrong courier!"], win: ["Delivery complete."], lose: ["...the bag... the BAG!"] },
  },
  celebrity: {
    kind: "celebrity", name: "Celebrity", walk: 1.2, flee: 5.0, fighter: false, hp: 1, dodge: 0, notoriety: 20, spawnWeight: 0,
    loot: [["award_trophy", 1]],
    bigShot: { title: "A CELEBRITY", weight: 2, follower: "fan", followers: 2, heat: 25 },
    lines: { idle: ["No photos! ...okay, one photo.", "My agent says I'm relatable.", "Is this the red carpet?"], hit: ["MY AWARD!", "This will be SO good for my comeback!", "I'll sue! Stylishly!"] },
  },
  fan: {
    kind: "fan", name: "Superfan", walk: 1.3, flee: 5.2, fighter: false, hp: 1, dodge: 0, notoriety: 0, spawnWeight: 0,
    loot: [["expired_coupon", 1]],
    lines: { idle: ["OMG OMG OMG", "Sign my forehead!", "I'm your biggest fan!"], hit: ["Not the phone!"], film: ["WE'RE LIVE! THIS IS INSANE!", "Chat, it's happening!"] },
  },
  crypto_bro: {
    kind: "crypto_bro", name: "Crypto Bro", walk: 1.4, flee: 5.6, fighter: false, hp: 1, dodge: 0, notoriety: 10, spawnWeight: 0,
    loot: [["hardware_wallet", 1]],
    bigShot: { title: "A CRYPTO BRO", weight: 2, heat: 15 },
    lines: { idle: ["Have you heard about my coin?", "HODL.", "Number go up. Trust."], hit: ["MY SEED PHRASE!", "That was my whole portfolio!", "Rug pulled! LITERALLY!"] },
  },
};

/** Pedestrian types that wander the streets (raccoons and cashiers have their own jobs). */
export const NPC_KINDS = (Object.keys(NPC_DEFS) as NpcKind[]).filter((k) => NPC_DEFS[k].spawnWeight > 0);
/** Kinds that are never part of the everyday crowd (own jobs, own counts). */
export const SPECIAL_KINDS = new Set<NpcKind>(["raccoon", "cashier", "doorman", "fisherman", "old_lady", "uncle_dumpster", "bank_guard", "maitre_d", "bouncer", "vinnie", "lou", "meat_locker", "champ", "fran", "cold_cuts", "receptionist", "don", "velvet_guard", "sketchy_steve", "cop", "millionaire", "bodyguard", "courier", "celebrity", "fan", "crypto_bro"]);
/** The four big shots. */
export const BIG_SHOTS = (Object.keys(NPC_DEFS) as NpcKind[]).filter((k) => !!NPC_DEFS[k].bigShot);

/** R5: Meat Locker: knocked out this long (the back room's unguarded), and what his one punch does to you */
export const MEAT_LOCKER = { ko: 40, knock: 6, throw: 8.5, lift: 3.5, windup: 0.18, cooldown: 0.45 };
/** R7: the two pawn shops' bouncers (Meat Locker and his twin Cold Cuts: the same in every way but the name) */
export const BOUNCERS = new Set<NpcKind>(["meat_locker", "cold_cuts", "velvet_guard"]);
/** R7: the two pawn shop owners (they never leave the till; they duck and holler for the bouncer) */
export const SHOP_OWNERS = new Set<NpcKind>(["lou", "fran"]);
/** R6: the Champ: one hit and he sits on you (as long as you're down); knocked out a good while; quick on the swing */
export const CHAMP = { ko: 25, knock: 6, windup: 0.25, cooldown: 0.6,
  /** R7: punches 1 and 2 just nudge him back; the 3rd inside this many seconds makes him dizzy (he spins) */
  stunHits: 3, stunWindow: 4, dizzy: 2.2, nudge: 1.4 };

/** Extra loot a KO'd fighter drops. */
export const KO_BONUS: [string, number][] = [["mystery_wallet", 3], ["fancy_earbuds", 2], ["rolecks_watch", 1]];

export const BYSTANDER_SCREAMS = ["AAAH!", "Not again!", "Only in Trashington...", "Somebody do something!", "I saw nothing!"];

export function pickWeighted<T>(table: [T, number][], rand: () => number): T {
  let total = 0;
  for (const [, w] of table) total += w;
  let r = rand() * total;
  for (const [v, w] of table) { r -= w; if (r <= 0) return v; }
  return table[table.length - 1][0];
}

export function pickLine(list: string[] | undefined, rand: () => number): string {
  if (!list || !list.length) return "";
  return list[Math.floor(rand() * list.length)];
}
