import { clipboard } from "electron";
import type { UserCustomization } from "../types";

// Lets a user design their OWN name gradient and badges locally (no backend).
// The builder lives in the menu and persists to localStorage; the result is
// injected into the customizations map for the current user so the existing
// badge/gradient rendering applies it everywhere.

const GRADIENT_KEY = "publikc-local-gradient";
const BADGES_KEY = "publikc-local-badges";

interface ColorStop {
  hex: string;
  position: string;
}
interface GradientState {
  rotation: string;
  colors: ColorStop[];
  shadowIntensity: string;
  shadowColor: string;
  animated: boolean;
}

const GRADIENT_PRESETS: Record<string, ColorStop[]> = {
  Sunrise: [
    { hex: "#ff512f", position: "0%" },
    { hex: "#f09819", position: "100%" },
  ],
  Aqua: [
    { hex: "#1a2980", position: "0%" },
    { hex: "#26d0ce", position: "100%" },
  ],
  Aurora: [
    { hex: "#00c3ff", position: "0%" },
    { hex: "#77e190", position: "50%" },
    { hex: "#ffff1c", position: "100%" },
  ],
  Hazel: [
    { hex: "#77a1d3", position: "0%" },
    { hex: "#79cbca", position: "50%" },
    { hex: "#e684ae", position: "100%" },
  ],
};

const defaultState = (): GradientState => ({
  rotation: "90",
  colors: [
    { hex: "#ff5500", position: "0%" },
    { hex: "#ffb914", position: "100%" },
  ],
  shadowIntensity: "0",
  shadowColor: "#ffffff",
  animated: false,
});

const loadState = (): GradientState => {
  try {
    const raw = JSON.parse(localStorage.getItem(GRADIENT_KEY) || "null");
    if (raw && Array.isArray(raw.colors) && raw.colors.length) return { ...defaultState(), ...raw };
  } catch {}
  return defaultState();
};

const loadBadges = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(BADGES_KEY) || "[]") || [];
  } catch {
    return [];
  }
};

// ── Import helpers: global customizations use a looser format than the builder
// (stops may omit positions; shadow color may be rgba). These normalise it. ──

// Normalises any CSS color to 6-digit hex for <input type="color">.
const colorToHex = (color: string): string => {
  const c = color.trim();
  if (c.startsWith("#")) {
    if (c.length === 4) return "#" + c.slice(1).split("").map((ch) => ch + ch).join(""); // #rgb → #rrggbb
    return c.slice(0, 7); // drop alpha from #rrggbbaa
  }
  const m = c.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return "#" + [m[1], m[2], m[3]].map((n) => (Number(n) & 255).toString(16).padStart(2, "0")).join("");
  return "#ffffff";
};

// Global stops can be "#hex" (positions implied) or "#hex 50%". Fills in even
// positions when absent so the builder reproduces the same gradient.
const parseStops = (stops: string[]): ColorStop[] => {
  const parsed = stops.map((s) => {
    const m = s.trim().match(/^(\S+)\s+(.+)$/);
    return m ? { hex: m[1], position: m[2].trim() } : { hex: s.trim(), position: "" };
  });
  const n = parsed.length;
  return parsed.map((p, i) => ({
    hex: p.hex,
    position: p.position || (n > 1 ? `${Math.round((i / (n - 1)) * 100)}%` : "0%"),
  }));
};

// Global shadow like "0px 0px 4px rgba(0,0,204,1)" or "0 0 4px #0000cc".
// Returns the blur radius (px, as string) and a hex color for the builder.
const parseShadow = (shadow: string): { px: string; color: string } | null => {
  if (!shadow) return null;
  const colorMatch = shadow.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/);
  const color = colorMatch ? colorMatch[0] : "#ffffff";
  const lengths = shadow.replace(color, "").match(/-?\d*\.?\d+\s*px/gi) || [];
  // CSS order is offsetX offsetY blur [spread]; blur is the 3rd length.
  const blurToken = lengths.length >= 3 ? lengths[2] : lengths[lengths.length - 1] || "0";
  return { px: String(parseInt(blurToken, 10) || 0), color: colorToHex(color) };
};

// Builds the UserCustomization the rest of the client understands, or null when
// local customizations are disabled / empty.
export function buildLocalCustomization(shortId: string): UserCustomization | null {
  if (!shortId) return null;
  const state = loadState();
  const badges = loadBadges();
  const intensity = parseInt(state.shadowIntensity, 10) || 0;

  return {
    shortId,
    gradient: {
      rot: `${state.rotation}deg`,
      stops: state.colors.map((c) => `${c.hex} ${c.position}`),
      shadow: intensity > 0 ? `0 0 ${intensity}px ${state.shadowColor}` : undefined,
    },
    animated: state.animated,
    badges,
  } as UserCustomization;
}

const notifyChange = (): void => {
  document.dispatchEvent(new CustomEvent("publikc-local-customizations-changed"));
};

// Wires the in-menu gradient builder + badge manager.
export function initLocalCustomizations(): void {
  const root = document.getElementById("local-customizations");
  if (!root) return;

  const state = loadState();

  root.innerHTML = `
    <div class="lc-global-status"></div>
    <button class="juice-button lc-import-global" style="display:none"><span class="text">Import Global</span><div class="custom-border"></div></button>
    <div class="lc-preview-row"><span class="lc-preview">Your Name</span></div>
    <div class="option"><span>Rotation</span>
      <div class="range-wrap">
        <input type="range" class="range lc-rotation" min="0" max="360" value="${state.rotation}" />
        <span class="range-value" data-unit="°"></span>
      </div>
    </div>
    <div class="lc-colors"></div>
    <button class="juice-button lc-add-color"><span class="text">+ Add Color</span><div class="custom-border"></div></button>
    <div class="lc-presets"></div>
    <div class="option"><span>Shadow</span>
      <div class="range-wrap">
        <input type="range" class="range lc-shadow" min="0" max="40" value="${state.shadowIntensity}" />
        <span class="range-value" data-unit="px"></span>
      </div>
    </div>
    <div class="option"><span>Shadow Color</span><input type="color" class="lc-shadow-color" value="${state.shadowColor}" /></div>
    <div class="option"><div class="left"><span>Animate Gradient</span><span class="description">Slowly shift the colors</span></div>
      <div class="checkbox"><input type="checkbox" class="lc-animated" ${state.animated ? "checked" : ""} /><label></label></div>
    </div>
    <div class="lc-badges-title">Badges</div>
    <div class="lc-badges"></div>
    <button class="juice-button lc-add-badge"><span class="text">+ Add Badge</span><div class="custom-border"></div></button>
    <div class="lc-badges-title">Customization JSON</div>
    <textarea class="lc-json" readonly spellcheck="false" rows="7"></textarea>
    <button class="juice-button lc-copy-json"><span class="text">Copy JSON</span><div class="custom-border"></div></button>
  `;

  const preview = root.querySelector(".lc-preview") as HTMLElement;
  const colorsBox = root.querySelector(".lc-colors") as HTMLElement;
  const badgesBox = root.querySelector(".lc-badges") as HTMLElement;
  const rotation = root.querySelector(".lc-rotation") as HTMLInputElement;
  const rotationValue = root.querySelector(".lc-rotation")!.parentElement!.querySelector(".range-value") as HTMLElement;
  const shadow = root.querySelector(".lc-shadow") as HTMLInputElement;
  const shadowValue = root.querySelector(".lc-shadow")!.parentElement!.querySelector(".range-value") as HTMLElement;
  const shadowColor = root.querySelector(".lc-shadow-color") as HTMLInputElement;
  const animated = root.querySelector(".lc-animated") as HTMLInputElement;
  const jsonField = root.querySelector(".lc-json") as HTMLTextAreaElement;
  const statusBox = root.querySelector(".lc-global-status") as HTMLElement;
  const importBtn = root.querySelector(".lc-import-global") as HTMLButtonElement;

  const currentShortId = (): string => {
    try {
      return JSON.parse(localStorage.getItem("current-user") || "{}")?.shortId || "";
    } catch {
      return "";
    }
  };

  // The global (backend) customization for the logged-in player, if any — pulled
  // from the list game.ts caches in localStorage as "juice-customizations".
  const globalCustomization = (): UserCustomization | null => {
    const id = currentShortId();
    if (!id) return null;
    try {
      const all = JSON.parse(localStorage.getItem("juice-customizations") || "[]");
      if (!Array.isArray(all)) return null;
      return all.find((c: UserCustomization) => c && c.shortId === id) || null;
    } catch {
      return null;
    }
  };

  // Local overrides global only while "Local Name Customization" is enabled.
  const localEnabled = (): boolean =>
    !!(document.getElementById("local_customizations") as HTMLInputElement | null)?.checked;

  // Mirror the built UserCustomization (the shape used in customizations.json)
  // into the read-only field so it can be copied/shared. Uses a placeholder id
  // when the logged-in player hasn't resolved yet.
  const updateJson = (): void => {
    const obj = buildLocalCustomization(currentShortId() || "YOURID");
    jsonField.value = obj ? JSON.stringify(obj, null, 2) : "";
  };

  const readColors = (): ColorStop[] =>
    Array.from(colorsBox.querySelectorAll(".lc-color")).map((row) => ({
      hex: (row.querySelector(".lc-hex") as HTMLInputElement).value,
      position: (row.querySelector(".lc-pos") as HTMLInputElement).value.trim() || "0%",
    }));

  const persist = (): void => {
    const next: GradientState = {
      rotation: rotation.value,
      colors: readColors(),
      shadowIntensity: shadow.value,
      shadowColor: shadowColor.value,
      animated: animated.checked,
    };
    localStorage.setItem(GRADIENT_KEY, JSON.stringify(next));
    localStorage.setItem(
      BADGES_KEY,
      JSON.stringify(
        Array.from(badgesBox.querySelectorAll(".lc-badge-url"))
          .map((i) => (i as HTMLInputElement).value.trim())
          .filter(Boolean)
      )
    );
    notifyChange();
  };

  const refreshPreview = (): void => {
    const colors = readColors();
    const css = `linear-gradient(${rotation.value}deg, ${colors.map((c) => `${c.hex} ${c.position}`).join(", ")})`;
    preview.style.backgroundImage = css;
    preview.style.webkitBackgroundClip = "text";
    (preview.style as any).backgroundClip = "text";
    preview.style.webkitTextFillColor = "transparent";
    const intensity = parseInt(shadow.value, 10) || 0;
    preview.style.textShadow = intensity > 0 ? `0 0 ${intensity}px ${shadowColor.value}` : "none";
    if (animated.checked) {
      preview.style.backgroundSize = "200% 200%";
      preview.style.animation = "animated-gradient 3s linear infinite";
    } else {
      preview.style.backgroundSize = "";
      preview.style.animation = "";
    }
    rotationValue.textContent = `${rotation.value}°`;
    shadowValue.textContent = `${shadow.value}px`;
  };

  const apply = (): void => {
    refreshPreview();
    persist();
    updateJson();
  };

  const addColor = (stop: ColorStop): void => {
    const row = document.createElement("div");
    row.className = "lc-color option";
    row.innerHTML = `
      <input type="color" class="lc-hex" value="${stop.hex}" />
      <input type="text" class="lc-pos" value="${stop.position}" placeholder="50%" />
      <button class="juice-button gallery-icon-btn lc-remove"><i class="fas fa-times"></i></button>
    `;
    row.querySelector(".lc-hex")!.addEventListener("input", apply);
    row.querySelector(".lc-pos")!.addEventListener("change", apply);
    row.querySelector(".lc-remove")!.addEventListener("click", () => {
      row.remove();
      apply();
    });
    colorsBox.appendChild(row);
  };

  const addBadge = (url: string): void => {
    const row = document.createElement("div");
    row.className = "lc-badge option";
    row.innerHTML = `
      <input type="text" class="lc-badge-url" value="${url}" placeholder="https://.../badge.png" />
      <button class="juice-button gallery-icon-btn lc-remove"><i class="fas fa-times"></i></button>
    `;
    row.querySelector(".lc-badge-url")!.addEventListener("change", apply);
    row.querySelector(".lc-remove")!.addEventListener("click", () => {
      row.remove();
      apply();
    });
    badgesBox.appendChild(row);
  };

  // Loads a global (backend) UserCustomization into the builder so the user can
  // start from / tweak it locally. Reverses buildLocalCustomization's encoding.
  const importGlobal = (custom: UserCustomization): void => {
    const g = custom.gradient;
    rotation.value = g ? String(parseInt(g.rot, 10) || 90) : "90";

    colorsBox.innerHTML = "";
    const stops = parseStops(g?.stops || []);
    (stops.length ? stops : defaultState().colors).forEach(addColor);

    const sh = g?.shadow ? parseShadow(g.shadow) : null;
    if (sh) {
      shadow.value = sh.px;
      shadowColor.value = sh.color;
    } else {
      shadow.value = "0";
    }

    animated.checked = !!custom.animated;

    badgesBox.innerHTML = "";
    (custom.badges || []).forEach(addBadge);

    apply();
    updateGlobalStatus();
  };

  // Status banner: makes the local-vs-global relationship explicit, and offers
  // to import the player's global customization when one exists.
  const updateGlobalStatus = (): void => {
    const id = currentShortId();
    const global = globalCustomization();

    importBtn.style.display = global ? "" : "none";
    importBtn.onclick = global ? () => importGlobal(global) : null;

    if (!id) {
      statusBox.className = "lc-global-status";
      statusBox.innerHTML = `<span class="lc-status-dot"></span><span>Sign in to manage your name customization.</span>`;
    } else if (!global) {
      statusBox.className = "lc-global-status";
      statusBox.innerHTML =
        `<span class="lc-status-dot local"></span><span>No global customization for <b>#${id}</b> — your local design applies${localEnabled() ? "" : " once enabled"}.</span>`;
    } else if (localEnabled()) {
      statusBox.className = "lc-global-status overriding";
      statusBox.innerHTML =
        `<span class="lc-status-dot local"></span><span><b>Local</b> is overriding your <b>global</b> customization for #${id}.</span>`;
    } else {
      statusBox.className = "lc-global-status global-active";
      statusBox.innerHTML =
        `<span class="lc-status-dot global"></span><span>Your <b>global</b> customization is active. Enable "Local Name Customization" to override it.</span>`;
    }
  };

  // Preset chips
  const presetBox = root.querySelector(".lc-presets") as HTMLElement;
  Object.keys(GRADIENT_PRESETS).forEach((name) => {
    const chip = document.createElement("button");
    chip.className = "juice-button lc-preset";
    chip.innerHTML = `<span class="text">${name}</span>`;
    chip.addEventListener("click", () => {
      colorsBox.innerHTML = "";
      GRADIENT_PRESETS[name].forEach(addColor);
      apply();
    });
    presetBox.appendChild(chip);
  });

  state.colors.forEach(addColor);
  loadBadges().forEach(addBadge);

  rotation.addEventListener("input", apply);
  shadow.addEventListener("input", apply);
  shadowColor.addEventListener("input", apply);
  animated.addEventListener("change", apply);
  root.querySelector(".lc-add-color")!.addEventListener("click", () => {
    addColor({ hex: "#ffffff", position: "50%" });
    apply();
  });
  root.querySelector(".lc-add-badge")!.addEventListener("click", () => addBadge(""));

  const copyBtn = root.querySelector(".lc-copy-json") as HTMLButtonElement;
  const copyLabel = copyBtn.querySelector(".text") as HTMLElement;
  copyBtn.addEventListener("click", () => {
    clipboard.writeText(jsonField.value);
    copyLabel.textContent = "Copied!";
    setTimeout(() => {
      copyLabel.textContent = "Copy JSON";
    }, 1200);
  });

  refreshPreview();
  updateJson();
  updateGlobalStatus();

  // Refresh the global-vs-local banner when the player resolves, when the
  // backend customizations finish loading, or when the override toggle changes.
  document.addEventListener("publikc-current-user-resolved", updateGlobalStatus);
  document.addEventListener("publikc-customizations-loaded", updateGlobalStatus);
  document.addEventListener("juice-settings-changed", (event: Event) => {
    if ((event as CustomEvent).detail?.setting === "local_customizations") updateGlobalStatus();
  });
}
