/**
 * Hardcoded public Top9 cards, captured once from x.com on 2026-09-28.
 * The app never fetches these live. Titles were read from the posted card
 * image (or the numbered tweet text where noted) and are used as-is, so an
 * example chip fills the nine slots without calling extract or vision.
 * Engagement counts are the snapshot at capture time.
 */
export type Top9Example = {
  handle: string;
  tweetUrl: string;
  games: readonly [string, string, string, string, string, string, string, string, string];
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  notes: string;
  /** Optional public Greenhouse or Ashby posting to pair with the card. */
  jobUrl?: string;
};

export const TOP9_EXAMPLES: readonly Top9Example[] = [
  {
    handle: "theo",
    tweetUrl: "https://x.com/theo/status/2104007341511467381",
    games: [
      "Outer Wilds",
      "Skate",
      "Minecraft: Java Edition",
      "Mass Effect 2",
      "Undertale",
      "Kingdom Hearts II",
      "Portal",
      "Garry's Mod",
      "Persona 5",
    ],
    likes: 873,
    reposts: 8,
    replies: 156,
    quotes: 184,
    notes:
      "High-engagement EN tech Twitter wave (quotes justalexoki). Titles from cached /workspace/top9_examples/theo.jpg labels. engagementSum=1221",
  },
  {
    handle: "bentlegen",
    tweetUrl: "https://x.com/bentlegen/status/2104242029748162652",
    games: [
      "Final Fantasy III",
      "Theme Park",
      "Super Metroid",
      "Sid Meier's Civilization II",
      "Counter-Strike",
      "System Shock 2",
      "StarCraft II: Wings of Liberty",
      "SubSpace",
      "Fallout: A Post Nuclear Role Playing Game",
    ],
    likes: 40,
    reposts: 0,
    replies: 5,
    quotes: 7,
    notes:
      "Ben Vinegar; quoted by @sergical. Titles from /workspace/top9_examples/bentlegen.jpg. engagementSum=52",
  },
  {
    handle: "sergical",
    tweetUrl: "https://x.com/sergical/status/2104571062591828004",
    games: [
      "Hitman: Blood Money",
      "Heroes of Might and Magic III: Armageddon's Blade",
      "Warcraft III: The Frozen Throne",
      "Diablo II",
      "StarCraft",
      "Space Rangers",
      "Counter-Strike",
      "Cossacks: European Wars",
      "Need for Speed: Most Wanted",
    ],
    likes: 15,
    reposts: 0,
    replies: 7,
    quotes: 1,
    notes:
      "Quotes bentlegen. Titles from /workspace/top9_examples/sergical.jpg. engagementSum=23",
  },
  {
    handle: "LinkofSunshine",
    tweetUrl: "https://x.com/LinkofSunshine/status/2103484901773246572",
    games: [
      "Minecraft: Java Edition",
      "The Legend of Zelda: Breath of the Wild",
      "Persona 3 Portable",
      "NieR: Automata",
      "Europa Universalis IV",
      "NBA 2K14",
      "Madden NFL 11",
      "Pokémon Platinum Version",
      "PokéPark Wii: Pikachu's Adventure",
    ],
    likes: 246,
    reposts: 1,
    replies: 37,
    quotes: 130,
    notes:
      "Upstream of justalexoki→theo quote chain. Titles from media labels. engagementSum=414",
  },
  {
    handle: "justalexoki",
    tweetUrl: "https://x.com/justalexoki/status/2103738203987747066",
    games: [
      "RuneScape Classic",
      "Counter-Strike: Source",
      "Warcraft III: Reign of Chaos",
      "Halo 3",
      "Age of Empires II: The Age of Kings",
      "The Sims",
      "Skate",
      "Assassin's Creed",
      "Need for Speed: Carbon",
    ],
    likes: 215,
    reposts: 0,
    replies: 47,
    quotes: 82,
    notes:
      "Quoted by theo; text mentions runescape/css/wc3/halo. Titles from media labels. engagementSum=344",
  },
  {
    handle: "grichadev",
    tweetUrl: "https://x.com/grichadev/status/2104415820348899808",
    games: [
      "RuneScape 2",
      "StarCraft",
      "Portal",
      "Pokémon Crystal Version",
      "Counter-Strike: Source",
      "Heroes of Might and Magic III Remake",
      "Quake III Arena",
      "The Settlers III",
      "The Legend of Zelda: Ocarina of Time",
    ],
    likes: 25,
    reposts: 0,
    replies: 8,
    quotes: 0,
    notes:
      "Titles from /workspace/top9_examples/grichadev.jpg (matches tweet media). engagementSum=33",
  },
  {
    handle: "ptruiz_dev",
    tweetUrl: "https://x.com/ptruiz_dev/status/2104667323902624239",
    games: [
      "Dungeons & Dragons",
      "StarCraft",
      "Stellaris",
      "Age of Empires II",
      "Diablo II: Lord of Destruction",
      "The Legend of Dragoon",
      "Sins of a Solar Empire",
      "Baldur's Gate 3",
      "Civilization V",
    ],
    likes: 1,
    reposts: 0,
    replies: 1,
    quotes: 0,
    notes:
      "Text-only numbered list quoting Dillon Mulroy hiring pitch (no grid image). Titles from tweet text. engagementSum=2",
  },
  {
    handle: "dorryspears",
    tweetUrl: "https://x.com/dorryspears/status/2104661416011497578",
    games: [
      "Factorio",
      "Terraria",
      "Pokémon HeartGold Version",
      "Minecraft: Java Edition",
      "Offworld Trading Company",
      "Dyson Sphere Program",
      "Super Smash Bros. Ultimate",
      "Satisfactory",
      "Counter-Strike: Global Offensive",
    ],
    likes: 0,
    reposts: 0,
    replies: 0,
    quotes: 0,
    notes:
      "Grid image titles from tweet media (= /workspace/top9_examples/dorry.jpg). Separate text post 2104660436704706924 lists a different 9 (Radical Red, civ, etc.) — use image for hardcode demos. engagementSum=0",
  },
];
