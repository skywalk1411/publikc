// Save/restore presets of the "create room" form. A floating card is injected
// next to Kirka's room-creation modal; it snapshots the form's selects,
// checkboxes and custom-map field, and can re-apply them later.

import { ipcRenderer } from "electron";

const STORAGE_KEY = "publikc-room-presets";

interface Preset {
  name: string;
  settings: Record<string, string | boolean>;
}

const loadPresets = (): Preset[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") || [];
  } catch {
    return [];
  }
};

const storePresets = (presets: Preset[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
};

const escapeHtml = (value: string): string =>
  String(value).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });

const flashBorder = (el: HTMLElement): void => {
  const previous = el.style.borderColor;
  el.style.transition = "border-color .1s";
  el.style.borderColor = "rgba(255, 200, 60, 0.9)";
  setTimeout(() => {
    el.style.borderColor = previous;
  }, 700);
};

// Reads the current state of every form control in the modal into a flat record
// keyed by each control's visible label.
const snapshot = (modal: Element): Record<string, string | boolean> => {
  const data: Record<string, string | boolean> = {};

  modal.querySelectorAll(".wrapper-input.select .input").forEach((input) => {
    const label = input.closest(".element")?.querySelector(".label");
    const key = label?.firstChild?.textContent?.trim();
    if (key) data[key] = input.querySelector(".selected")?.textContent?.trim() ?? "";
  });

  modal.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
    const span = cb.nextElementSibling;
    if (span?.textContent) data[span.textContent.trim()] = cb.checked;
  });

  const mapInput = modal.querySelector<HTMLInputElement>(".keybind-input .input");
  if (mapInput) data["__customMap"] = mapInput.value;

  return data;
};

// Replays a snapshot back onto the modal by clicking the matching dropdown
// options / toggling checkboxes, mirroring how a user would set them.
const restore = (modal: Element, data: Record<string, string | boolean>): void => {
  modal.querySelectorAll(".wrapper-input.select .input").forEach((input) => {
    const label = input.closest(".element")?.querySelector(".label");
    const key = label?.firstChild?.textContent?.trim();
    if (!key || !(key in data)) return;
    input.querySelectorAll<HTMLElement>(".items > div").forEach((option) => {
      if (option.textContent?.trim() === data[key]) option.click();
    });
  });

  modal.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
    const span = cb.nextElementSibling;
    const key = span?.textContent?.trim();
    if (key && key in data && cb.checked !== data[key]) cb.click();
  });

  const mapInput = modal.querySelector<HTMLInputElement>(".keybind-input .input");
  if (mapInput && "__customMap" in data) {
    mapInput.value = String(data["__customMap"]);
    mapInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
};

const injectStyles = (): void => {
  if (document.getElementById("publikc-preset-styles")) return;
  const style = document.createElement("style");
  style.id = "publikc-preset-styles";
  style.textContent = `
    @keyframes pp-in { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
    #publikc-preset-panel { position: fixed; z-index: 999999; width: 320px; padding: 14px 12px; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; animation: pp-in .2s ease forwards; }
    #publikc-preset-panel .pp-title { font-size: 12px; font-weight: 800; letter-spacing: 2.5px; text-transform: uppercase; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,.12); opacity: .85; }
    #publikc-preset-panel .pp-list { display: flex; flex-direction: column; gap: 5px; max-height: 320px; overflow-y: auto; }
    #publikc-preset-panel .pp-item { display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,.2); border: 1px solid rgba(255,255,255,.08); border-radius: 6px; padding: 5px 7px; transition: border-color .15s; }
    #publikc-preset-panel .pp-item.drag-over { border-color: rgba(255,200,60,.9); }
    #publikc-preset-panel .pp-item.dragging { opacity: .35; }
    #publikc-preset-panel .pp-drag { cursor: grab; opacity: .5; font-size: 13px; line-height: 1; flex-shrink: 0; user-select: none; padding: 0 2px; }
    #publikc-preset-panel .pp-name { flex: 1; background: transparent; border: none; color: inherit; font-size: 12px; font-weight: 600; font-family: inherit; outline: none; min-width: 0; }
    #publikc-preset-panel .pp-actions { display: flex; gap: 2px; flex-shrink: 0; }
    #publikc-preset-panel .pp-btn { background: none; border: none; cursor: pointer; font-size: 13px; padding: 3px 6px; border-radius: 4px; color: inherit; opacity: .55; transition: opacity .15s, background .15s, color .15s; font-family: inherit; }
    #publikc-preset-panel .pp-btn:hover { opacity: 1; }
    #publikc-preset-panel .pp-btn.apply:hover { background: rgba(76,222,120,.2); color: rgb(76,222,120); }
    #publikc-preset-panel .pp-btn.over:hover { background: rgba(74,144,226,.2); color: rgb(120,170,240); }
    #publikc-preset-panel .pp-btn.del:hover { background: rgba(226,74,74,.2); color: rgb(232,100,100); }
    #publikc-preset-panel .pp-save { background: rgba(47,128,237,.85); border: 1px solid rgba(0,0,0,.3); color: #fff; border-radius: 6px; padding: 9px; font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; font-family: inherit; width: 100%; transition: background .2s ease, filter .2s ease; }
    #publikc-preset-panel .pp-save:hover { background: rgba(79,148,241,.95); filter: brightness(1.1); }
    #publikc-preset-panel .pp-empty { font-size: 11px; opacity: .5; text-align: center; padding: 10px 0; font-style: italic; }
  `;
  document.head.appendChild(style);
};

let panel: HTMLElement | null = null;
let trackId: number | null = null;
let onResize: (() => void) | null = null;

const removePanel = (): void => {
  if (!panel) return;
  if (trackId) {
    cancelAnimationFrame(trackId);
    trackId = null;
  }
  if (onResize) {
    window.removeEventListener("resize", onResize);
    onResize = null;
  }
  panel.remove();
  panel = null;
};

// Copies the look of Kirka's modal card onto the floating panel so it blends in.
const mirrorCardStyle = (card: Element): void => {
  if (!panel) return;
  const computed = getComputedStyle(card);
  const props = [
    "background-color", "background-image", "background-size",
    "background-repeat", "background-position", "border-top-color",
    "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-width", "border-right-width", "border-bottom-width",
    "border-left-width", "border-top-style", "border-right-style",
    "border-bottom-style", "border-left-style", "border-top-left-radius",
    "border-top-right-radius", "border-bottom-left-radius",
    "border-bottom-right-radius", "color", "font-family", "box-shadow",
  ];
  for (const p of props) panel.style.setProperty(p, computed.getPropertyValue(p));
};

const renderList = (modal: Element): void => {
  if (!panel) return;
  const list = panel.querySelector(".pp-list") as HTMLElement;
  const presets = loadPresets();
  list.innerHTML = "";

  if (!presets.length) {
    list.innerHTML = '<div class="pp-empty">No presets saved yet</div>';
    return;
  }

  let dragFrom: number | null = null;

  presets.forEach((preset, index) => {
    const item = document.createElement("div");
    item.className = "pp-item";
    item.innerHTML = `
      <span class="pp-drag" draggable="true" title="Drag to reorder">⋮⋮</span>
      <input class="pp-name" type="text" value="${escapeHtml(preset.name)}" spellcheck="false" />
      <div class="pp-actions">
        <button class="pp-btn apply" title="Apply">▶</button>
        <button class="pp-btn over" title="Overwrite with current settings">⟲</button>
        <button class="pp-btn del" title="Delete">✕</button>
      </div>
    `;

    const nameInput = item.querySelector(".pp-name") as HTMLInputElement;
    nameInput.addEventListener("change", () => {
      const presetsNow = loadPresets();
      presetsNow[index].name = nameInput.value.trim() || `Preset ${index + 1}`;
      storePresets(presetsNow);
    });

    item.querySelector(".apply")!.addEventListener("click", () =>
      restore(modal, preset.settings)
    );

    item.querySelector(".over")!.addEventListener("click", () => {
      const presetsNow = loadPresets();
      presetsNow[index].settings = snapshot(modal);
      storePresets(presetsNow);
      flashBorder(item);
    });

    item.querySelector(".del")!.addEventListener("click", () => {
      const presetsNow = loadPresets();
      presetsNow.splice(index, 1);
      storePresets(presetsNow);
      renderList(modal);
    });

    const handle = item.querySelector(".pp-drag") as HTMLElement;
    handle.addEventListener("dragstart", (e) => {
      dragFrom = index;
      item.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
      }
    });
    handle.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      list.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    });

    item.addEventListener("dragover", (e) => {
      if (dragFrom === null) return;
      e.preventDefault();
      item.classList.add("drag-over");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      item.classList.remove("drag-over");
      if (dragFrom === null || dragFrom === index) return;
      const presetsNow = loadPresets();
      const [moved] = presetsNow.splice(dragFrom, 1);
      presetsNow.splice(index, 0, moved);
      storePresets(presetsNow);
      dragFrom = null;
      renderList(modal);
    });

    list.appendChild(item);
  });
};

const buildPanel = (modal: Element): void => {
  if (panel) return;
  injectStyles();

  const card = modal.querySelector(".container-card");
  if (!card) return;

  panel = document.createElement("div");
  panel.id = "publikc-preset-panel";
  panel.className = "container-card";
  panel.innerHTML = `
    <div class="pp-title">Presets</div>
    <div class="pp-list"></div>
    <button class="pp-save">+ Save Current</button>
  `;
  mirrorCardStyle(card);

  const initial = card.getBoundingClientRect();
  panel.style.top = initial.top + "px";
  panel.style.left = initial.right + 12 + "px";
  document.body.appendChild(panel);

  // Keep the panel glued to the card. The modal only moves while it animates
  // in, so we follow it frame-by-frame until its box has been stable for a few
  // frames, then stop (no permanent per-frame reflow) and re-sync on resize.
  let frame = 0;
  let prevTop = initial.top;
  let prevLeft = initial.right + 12;
  let stable = 0;

  const place = (): void => {
    const rect = card.getBoundingClientRect();
    const top = rect.top;
    const left = rect.right + 12;
    if (top !== prevTop || left !== prevLeft) {
      panel!.style.top = top + "px";
      panel!.style.left = left + "px";
      prevTop = top;
      prevLeft = left;
      stable = 0;
    } else {
      stable++;
    }
  };

  const track = (): void => {
    if (!panel) return;
    place();
    if (++frame % 30 === 0) mirrorCardStyle(card);
    if (stable < 10) {
      trackId = requestAnimationFrame(track);
    } else {
      trackId = null;
    }
  };
  trackId = requestAnimationFrame(track);

  onResize = (): void => {
    if (!panel) return;
    stable = 0;
    if (trackId === null) trackId = requestAnimationFrame(track);
  };
  window.addEventListener("resize", onResize);

  panel.querySelector(".pp-save")!.addEventListener("click", () => {
    const presets = loadPresets();
    presets.push({ name: `Preset ${presets.length + 1}`, settings: snapshot(modal) });
    storePresets(presets);
    renderList(modal);
  });

  renderList(modal);
};

export function initRoomPresets(): void {
  const observer = new MutationObserver(() => {
    const modal = document.querySelector("#create-modal-modal");
    if (modal && !panel) buildPanel(modal);
    else if (!modal && panel) removePanel();
  });

  let observerActive = false;

  // The create-room modal can only be opened from the lobby, never during a
  // match — so keep the body-subtree observer detached while in a game, where
  // the HUD mutates the DOM on every frame.
  const updateObserver = (url: string): void => {
    const inMatch = url.includes("/games/");
    if (!inMatch && !observerActive) {
      observer.observe(document.body, { childList: true, subtree: true });
      observerActive = true;
    } else if (inMatch && observerActive) {
      observer.disconnect();
      observerActive = false;
      if (panel) removePanel();
    }
  };

  updateObserver(window.location.href);
  ipcRenderer.on("url-change", (_: unknown, url: string) => updateObserver(url));
}
