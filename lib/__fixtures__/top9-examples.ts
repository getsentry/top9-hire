/**
 * Public Top9 posts from tech Twitter, captured once from x.com on 2026-09-28.
 * The app never fetches these live. Card images were downloaded into
 * `public/top9/` from the post media, and the titles were read from that card
 * (or from the numbered post text for ptruiz_dev, who posted no card). Loading
 * a fixture fills the plate without calling extract or vision.
 */
export type Top9Games = readonly [string, string, string, string, string, string, string, string, string];

export type Top9Example = {
  id: string;
  handle: string;
  name: string;
  tweetUrl: string;
  caption: string;
  games: Top9Games;
  image: { src: string; width: number; height: number } | null;
};

export const CAPTURED_AT = "2026-09-28";

export const TOP9_EXAMPLES: readonly Top9Example[] = [
  {
    id: "T9-01",
    handle: "theo",
    name: "Theo",
    tweetUrl: "https://x.com/theo/status/2104007341511467381",
    caption: "This was significantly harder than I thought it would be.",
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
    image: { src: "/top9/theo.jpg", width: 778, height: 1200 },
  },
  {
    id: "T9-02",
    handle: "LinkofSunshine",
    name: "Basil",
    tweetUrl: "https://x.com/LinkofSunshine/status/2103484901773246572",
    caption: "The 9 games that were most formative to me",
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
    image: { src: "/top9/linkofsunshine.jpg", width: 859, height: 1200 },
  },
  {
    id: "T9-03",
    handle: "justalexoki",
    name: "taoki",
    tweetUrl: "https://x.com/justalexoki/status/2103738203987747066",
    caption: "runescape, css, wc3, and the halo games definitely defined my childhood",
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
    image: { src: "/top9/justalexoki.jpg", width: 778, height: 1200 },
  },
  {
    id: "T9-04",
    handle: "bentlegen",
    name: "Ben Vinegar",
    tweetUrl: "https://x.com/bentlegen/status/2104242029748162652",
    caption: "Theme Park taught me everything I know about business",
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
    image: { src: "/top9/bentlegen.jpg", width: 778, height: 1200 },
  },
  {
    id: "T9-05",
    handle: "grichadev",
    name: "Greg Pstrucha",
    tweetUrl: "https://x.com/grichadev/status/2104415820348899808",
    caption: "ok here's my down the nostalgia lane",
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
    image: { src: "/top9/grichadev.jpg", width: 778, height: 1200 },
  },
  {
    id: "T9-06",
    handle: "sergical",
    name: "Serge",
    tweetUrl: "https://x.com/sergical/status/2104571062591828004",
    caption: "very nice trip down memory lane this morning",
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
    image: { src: "/top9/sergical.jpg", width: 778, height: 1200 },
  },
  {
    id: "T9-07",
    handle: "dorryspears",
    name: "Dorry",
    tweetUrl: "https://x.com/dorryspears/status/2104661416011497578",
    caption: "I've played a ton of modded stuff. Pokemon rom hacks are highly slept on.",
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
    image: { src: "/top9/dorryspears.jpg", width: 869, height: 1199 },
  },
  {
    id: "T9-08",
    handle: "ptruiz_dev",
    name: "Paul Ruiz",
    tweetUrl: "https://x.com/ptruiz_dev/status/2104667323902624239",
    caption: "Ohh a bandwagon I can get behind.",
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
    image: null,
  },
];
