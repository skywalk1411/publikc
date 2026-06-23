// Pack / Chest / Card opener. Talks to Kirka's inventory API directly (no eval).
//
// Two data files drive it, served from publikc's static host so they can be
// updated without a new build:
//   openerlist.json  — the chests/cards shown in the dropdown
//   microwaves.json  — Kirka obfuscates its API field names/paths; this maps the
//                      readable names we use to the current obfuscated keys.
// Both have a baked-in fallback below (verified current 2025-10) so the feature
// works if the host is unreachable. Kirka rotates these keys periodically; if
// opening starts failing, refresh microwaves.json.
//
// Original opener logic & KirkaScripts by CarrySheriff (@carrysheriff).

const STATIC = "https://kirka.lukeskywalk.com/static";
const OPENER_LIST_URL = `${STATIC}/openerlist.json`;
const MICROWAVES_URL = `${STATIC}/microwaves.json`;
const SKIN_SHEET_URL =
  "https://opensheet.elk.sh/1tzHjKpu2gYlHoCePjp6bFbKBGvZpwDjiRzT9ZUfNwbY/Alphabetical";
const CONFETTI_URL =
  "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js";

const OPEN_DELAY = 2000;
const MAX_FAILS = 2;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Kirka's obfuscated tokens are built only from these letters (e.g. "wWWwmMn").
const OBFUSCATED_RE = /^[wWmMnN]+$/;

const RARITY_COLORS: Record<string, string> = {
  PARANORMAL: "000000",
  MYTHICAL: "c20025",
  LEGENDARY: "feaa37",
  EPIC: "cd2afc",
  RARE: "43abde",
  COMMON: "47f2a0",
  DEFAULT: "ffffff",
};

const RARITY_ORDER = ["PARANORMAL", "MYTHICAL", "LEGENDARY", "EPIC", "RARE", "COMMON"];

interface Container {
  id: string;
  name: string;
}
interface OpenerList {
  chests: Container[];
  cards: Container[];
}

type Translations = Record<string, string>;

const FALLBACK_LIST: OpenerList = {
  chests: [
    { id: "077a4cf2-7b76-4624-8be6-4a7316cf5906", name: "Golden" },
    { id: "ec230bdb-4b96-42c3-8bd0-65d204a153fc", name: "Ice" },
    { id: "71182187-109c-40c9-94f6-22dbb60d70ee", name: "Wood" },
    { id: "ccf1dc3a-099b-4f9c-af5b-bc7136530a77", name: "Halloween" },
    { id: "be1fec80-d4e4-47ab-9f73-9f5622e6e905", name: "Christmas" },
  ],
  cards: [
    { id: "723c4ba7-57b3-4ae4-b65e-75686fa77bf2", name: "Cold" },
    { id: "723c4ba7-57b3-4ae4-b65e-75686fa77bf1", name: "Girls band" },
    { id: "6281ed5a-663a-45e1-9772-962c95aa4605", name: "Party" },
    { id: "9cc5bd60-806f-4818-a7d4-1ba9b32bd96c", name: "Soldiers" },
    { id: "a5002827-97d1-4eb4-b893-af4047e0c77f", name: "Periodic" },
  ],
};

// Verified current via live inventory probe (2025-10): inventory + rarity keys
// confirmed. id/name field keys are discovered at runtime, not from here.
const FALLBACK_TRANSLATIONS: Translations = {
  inventory: "wmMWnNw",
  openChest: "wmMWnwNW",
  openCharacterCard: "wWMnmNWw",
  rarity: "wnWmM",
  PARANORMAL: "wWWwmMn",
  MYTHICAL: "wmNnWW",
  LEGENDARY: "wmWWNw",
  EPIC: "wNmnwMW",
  RARE: "wNmnwM",
  COMMON: "wnWMmwWN",
};

// ── Data loading ───────────────────────────────────────────────────────────

const normalizeList = (raw: any): OpenerList => ({
  chests: (raw?.chests || []).map((c: any) => ({ id: c.chestid ?? c.id, name: c.name })),
  cards: (raw?.cards || []).map((c: any) => ({ id: c.cardid ?? c.id, name: c.name })),
});

const fetchOpenerList = async (): Promise<OpenerList> => {
  try {
    const res = await fetch(OPENER_LIST_URL);
    if (!res.ok) throw new Error(String(res.status));
    return normalizeList(await res.json());
  } catch {
    return FALLBACK_LIST;
  }
};

// Returns the name→obfuscated-key map plus its inverse, so we can both build
// requests and read obfuscated keys back out of responses.
const fetchTranslations = async (): Promise<Translations> => {
  let base: Translations = FALLBACK_TRANSLATIONS;
  try {
    const res = await fetch(MICROWAVES_URL);
    if (res.ok) base = (await res.json()) as Translations;
  } catch {
    /* baked-in keys */
  }
  const t: Translations = { ...base };
  Object.keys(base).forEach((name) => {
    t[base[name]] = name;
  });
  return t;
};

// ── Skin-name → rarity backup lookup (community spreadsheet) ─────────────────

const rarityBackup = (sheet: any[], skinName: string): string => {
  for (const row of sheet) {
    if (
      row &&
      row["Skin Name"] === skinName &&
      row["Rarity"] &&
      RARITY_COLORS[String(row["Rarity"]).toUpperCase()] !== undefined
    ) {
      return row["Rarity"];
    }
  }
  return "Unknown-Rarity";
};

// ── In-game notifications (work even though Kirka nukes console.log) ──────────

const notify = (html: string, lifetimeMs: number): void => {
  const group = document.getElementsByClassName("vue-notification-group")[0];
  if (!group || !group.children[0]) return;

  const elem = document.createElement("div");
  elem.className = "vue-notification-wrapper";
  elem.style.cssText =
    "transition-timing-function: ease; transition-delay: 0s; transition-property: all;";
  elem.innerHTML = html;
  elem.onclick = () => {
    try {
      elem.remove();
    } catch {}
  };
  group.children[0].appendChild(elem);
  setTimeout(() => {
    try {
      elem.remove();
    } catch {}
  }, lifetimeMs);
};

const showMessage = (message: string, lifetimeMs: number): void =>
  notify(`<div class="alert-default"><span class="text">${message}</span></div>`, lifetimeMs);

const showResult = (
  translations: Translations,
  sheet: any[],
  message: string,
  rarityKey: string,
  name: string
): void => {
  let rarity = translations[rarityKey];
  if (rarity === undefined) rarity = rarityBackup(sheet, name);

  const color = RARITY_COLORS[rarity.toUpperCase()] || RARITY_COLORS.DEFAULT;
  const text = `${rarity} ${message} from: ${name}`;
  notify(
    `<div class="alert-default"><span class="text" style="color:#${color}">${text}</span></div>`,
    5000
  );
};

// ── Confetti (loaded on demand for the rarest pulls) ─────────────────────────

const loadConfetti = (): void => {
  if (document.getElementById("konfettijs")) return;
  const script = document.createElement("script");
  script.id = "konfettijs";
  script.src = CONFETTI_URL;
  document.head.appendChild(script);
};

const confettiBurst = (): void => {
  const confetti = (window as any).confetti;
  if (typeof confetti !== "function") return;

  const duration = 15 * 1000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 99999 };
  const randomInRange = (min: number, max: number): number => Math.random() * (max - min) + min;

  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) return clearInterval(interval);
    const particleCount = 50 * (timeLeft / duration);
    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
  }, 250);
};

// ── Inventory probing ────────────────────────────────────────────────────────

const fetchInventory = async (translations: Translations): Promise<any[]> => {
  const res = await fetch(`https://api2.kirka.io/api/${translations.inventory}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });
  return res.json();
};

// Kirka obfuscates the item field names and rotates them. Rather than matching
// hardcoded reference skins (smudgy's approach — breaks if you don't own them),
// discover the keys by value shape from a live inventory entry:
//   item = the object-valued field; id = the field holding a UUID;
//   name = the first readable (non-UUID, non-obfuscated) string field.
const discoverInnerKeys = (translations: Translations, inventory: any[]): void => {
  for (const entry of inventory) {
    if (!entry || typeof entry !== "object") continue;
    for (const key of Object.keys(entry)) {
      const inner = entry[key];
      if (!inner || typeof inner !== "object" || Array.isArray(inner)) continue;

      let idKey = "";
      let nameKey = "";
      for (const k of Object.keys(inner)) {
        const v = inner[k];
        if (typeof v !== "string" || !v) continue;
        if (!idKey && UUID_RE.test(v)) idKey = k;
        else if (!nameKey && !UUID_RE.test(v) && !OBFUSCATED_RE.test(v) && k !== translations.rarity)
          nameKey = k;
      }

      if (idKey) {
        translations.item = key;
        translations.id = idKey;
        if (nameKey) translations.name = nameKey;
        return;
      }
    }
  }
};

// Marks (skipper=0) the containers present in the inventory; everything else
// starts "skipped" so we don't hammer the API opening things you don't own.
const buildSkipper = (translations: Translations, inventory: any[], items: Container[]): number[] => {
  const skipper = new Array(items.length).fill(MAX_FAILS);
  if (skipper.length) skipper[0] = 0;
  try {
    inventory.forEach((entry) => {
      const ownedId = entry[translations.item]?.[translations.id];
      for (let i = 0; i < items.length; i++) {
        if (ownedId === items[i].id) skipper[i] = 0;
      }
    });
  } catch {
    /* leave defaults */
  }
  return skipper;
};

// ── Opening a single container ───────────────────────────────────────────────

const openContainer = async (
  translations: Translations,
  endpointKey: "openChest" | "openCharacterCard",
  id: string
): Promise<any> => {
  const body: Record<string, string> = {};
  body[translations.id] = id;

  // Kirka requires a CSRF header on these POST mutations; it's captured from
  // Kirka's own traffic by the fetch wrapper in preload/game.ts. Cookies
  // (credentials: include) are sent too, matching Kirka's own open request.
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${localStorage.getItem("token")}`,
    "content-type": "application/json;charset=UTF-8",
  };
  const csrf = localStorage.getItem("publikc-csrf");
  if (csrf) headers.csrf = csrf;

  const res = await fetch(
    `https://api2.kirka.io/api/${translations.inventory}/${translations[endpointKey]}`,
    {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(body),
    }
  );

  const json = await res.json();

  // Card opens return an array of candidate results; the real one is the entry
  // flagged with a boolean `true`. Chest opens return the result object directly.
  if (endpointKey === "openCharacterCard" && Array.isArray(json)) {
    let result: any = {};
    json.forEach((item) => {
      Object.keys(item).forEach((key) => {
        if (typeof item[key] === "boolean" && item[key] === true) result = item;
      });
    });
    return result;
  }
  return json;
};

// ── Summary log (uses notify, since console.log is suppressed by Kirka) ───────

const logSummary = (itemsByRarity: Record<string, string[]>): void => {
  const sorted = Object.keys(itemsByRarity).sort((a, b) => {
    const ia = RARITY_ORDER.indexOf(a);
    const ib = RARITY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const lines: string[] = [];
  for (const rarity of sorted) {
    const items = itemsByRarity[rarity];
    if (!items || !items.length) continue;
    lines.push(`${items.length}x ${rarity}`);
  }
  if (lines.length) showMessage(`Opened — ${lines.join(", ")}`, 15000);
};

// ── The run loop ─────────────────────────────────────────────────────────────

let running = false;

const runOpener = async (kind: "chest" | "card", list: Container[]): Promise<void> => {
  if (running) return; // one batch at a time; "Refresh to stop" per the UI
  const items = list && list.length ? list : kind === "card" ? FALLBACK_LIST.cards : FALLBACK_LIST.chests;
  if (!items[0]) return;

  running = true;
  const endpointKey = kind === "card" ? "openCharacterCard" : "openChest";

  try {
    if (!localStorage.getItem("token")) {
      showMessage("Opener: not logged in (no Kirka token found)", 8000);
      running = false;
      return;
    }

    const translations = await fetchTranslations();

    let sheet: any[] = [];
    try {
      sheet = await fetch(SKIN_SHEET_URL).then((r) => r.json());
    } catch {}

    const inventory = await fetchInventory(translations);
    if (!Array.isArray(inventory)) {
      showMessage("Opener: inventory request failed — microwaves.json keys are stale", 12000);
      running = false;
      return;
    }

    discoverInnerKeys(translations, inventory);
    if (!translations.item || !translations.id) {
      showMessage("Opener: couldn't read inventory structure (Kirka field names changed)", 12000);
      running = false;
      return;
    }

    const skipper = buildSkipper(translations, inventory, items);
    loadConfetti();

    const openedItems: Record<string, string[]> = {};
    let counter = 0;

    const advance = (): void => {
      counter = (counter + 1) % items.length;
      while (skipper[counter] >= MAX_FAILS) {
        counter = (counter + 1) % items.length;
        if (skipper.reduce((a, b) => a + b, 0) === skipper.length * MAX_FAILS) {
          counter = 0;
          break;
        }
      }
    };

    const interval = setInterval(async () => {
      const result = await openContainer(translations, endpointKey, items[counter].id);
      const resultName = result[translations.name];
      const resultRarity = result[translations.rarity];

      if (resultName) {
        showResult(translations, sheet, resultName, resultRarity, items[counter].name);

        let rarity = translations[resultRarity];
        if (rarity === undefined) rarity = rarityBackup(sheet, resultName);
        rarity = rarity.toUpperCase();
        (openedItems[rarity] ||= []).push(resultName);

        if (translations[resultRarity] === "MYTHICAL" || translations[resultRarity] === "PARANORMAL")
          confettiBurst();
      } else if (result.code === 9910) {
        showMessage("Opener: rate-limited, slowing down…", 4000);
      } else {
        skipper[counter]++;
        if (skipper[counter] >= MAX_FAILS) {
          const reason = result?.message ?? result?.code ?? JSON.stringify(result);
          showMessage(`Opener: couldn't open ${items[counter].name} — ${reason}`, 8000);
        }
      }

      advance();

      if (skipper.reduce((a, b) => a + b, 0) === skipper.length * MAX_FAILS) {
        clearInterval(interval);
        running = false;
        logSummary(openedItems);
      }
    }, OPEN_DELAY);
  } catch (err) {
    showMessage(`Opener: error — ${String(err)}`, 10000);
    running = false;
  }
};

// ── Dropdown wiring ──────────────────────────────────────────────────────────

const populateDropdown = (select: HTMLSelectElement, list: OpenerList): void => {
  select.innerHTML = `<option value="none">None</option>`;

  list.chests.forEach((chest) => {
    const opt = document.createElement("option");
    opt.value = `Chest_${chest.name}`;
    opt.textContent = chest.name;
    select.appendChild(opt);
  });
  const allChests = document.createElement("option");
  allChests.value = "Chest_All";
  allChests.textContent = "All Chests";
  select.appendChild(allChests);

  list.cards.forEach((card) => {
    const opt = document.createElement("option");
    opt.value = `Card_${card.name.replace(/\s+/g, "")}`;
    opt.textContent = card.name;
    select.appendChild(opt);
  });
  const allCards = document.createElement("option");
  allCards.value = "Card_All";
  allCards.textContent = "All Cards";
  select.appendChild(allCards);
};

export function opener(): void {
  const select = document.getElementById("opener") as HTMLSelectElement | null;
  if (!select) return;

  fetchOpenerList().then((list) => {
    populateDropdown(select, list);

    select.addEventListener("change", () => {
      const value = select.value;
      if (value === "none") return;

      if (value === "Chest_All") return void runOpener("chest", list.chests);
      if (value.startsWith("Chest_")) {
        const name = value.slice("Chest_".length);
        const chest = list.chests.find((c) => c.name === name);
        if (chest) return void runOpener("chest", [chest]);
      }

      if (value === "Card_All") return void runOpener("card", list.cards);
      if (value.startsWith("Card_")) {
        const name = value.slice("Card_".length);
        const card = list.cards.find((c) => c.name.replace(/\s+/g, "") === name);
        if (card) return void runOpener("card", [card]);
      }
    });
  });
}
