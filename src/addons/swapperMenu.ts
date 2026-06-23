import { ipcRenderer } from "electron";

// Kirka asset filenames (carrying the resource swapper's `__` markers) for each
// weapon texture and game sound. An upload saved under one of these names is
// what makes the swapper redirect the matching in-game asset on next launch.
const WEAPON_SKINS: Record<string, string> = {
  revolver: "__texture__.0bed9187__.webp",
  bayonet: "__texture__.76c24e59__.webp",
  tomahawk: "__texture__.397a3f05__.webp",
  ar9: "__texture__.1794de31__.webp",
  vita: "__texture__.b2a49027__.webp",
  scar: "__texture__.b3fc7981__.webp",
  lar: "__texture__.d97db214__.webp",
  mac10: "__texture__.36d894bd__.webp",
  weatie: "__texture__.212a85fe__.webp",
  shark: "__texture__.6c8a6582__.webp",
  m60: "__texture__.b658c822__.webp",
};

const GAME_SOUNDS: Record<string, string> = {
  dash: "__whoosh__.634f7dda.mp3",
  reload: "__reload__.fed3e0ac.mp3",
  hit: "__hit__.200043fa.mp3",
  kill1: "__kill1__.623ec38b.mp3",
  kill2: "__kill2__.8ffe9342.mp3",
  kill3: "__kill3__.ba83d756.mp3",
  kill4: "__kill4__.08568f50.mp3",
  kill5: "__kill5__.cf529154.mp3",
  wound1: "__wound1__.531f0649.mp3",
  wound2: "__wound2__.6d084558.mp3",
  userevolver: "__use__.cbf719c0.mp3",
  useknife: "__use__.fd944232.mp3",
  usevita: "__use__.5421e46b.mp3",
  useweatie: "__use__.0621a61a.mp3",
  usescar: "__use__.5ab6f364.mp3",
  uselar: "__use__.8dd49954.mp3",
  usear9: "__use__.6f884eb5.mp3",
  usem60: "__use__.a6197a4d.mp3",
  useshark: "__use__.4337da3c.mp3",
  usemac10: "__use__.259ad4a5.mp3",
  stepgrass: "__Grass__.9d721edd.mp3",
  stepdirt: "__Earth__.37abd171.mp3",
  stepmud: "__Mud__.44d00950.mp3",
  stepsand: "__Sand__.10a59d13.mp3",
  stepstone: "__Stone__.a9cedce8.mp3",
};

// Wires up the in-menu skin and sound swapper. Safe to call once after the menu
// DOM exists; it no-ops if the swapper section is not present.
export function swapperMenu(): void {
  const byId = (id: string): HTMLElement | null => document.getElementById(id);

  const skinSelect = byId("skin-select") as HTMLSelectElement | null;
  const soundSelect = byId("sound-select") as HTMLSelectElement | null;
  if (!skinSelect && !soundSelect) return;

  const flash = (el: HTMLElement | null, message: string): void => {
    if (!el) return;
    el.textContent = message;
  };

  wireSkins(byId, skinSelect, flash);
  wireSounds(byId, soundSelect, flash);
}

function wireSkins(
  byId: (id: string) => HTMLElement | null,
  skinSelect: HTMLSelectElement | null,
  flash: (el: HTMLElement | null, message: string) => void
): void {
  const dropzone = byId("upload-skin");
  const fileInput = byId("skin-file") as HTMLInputElement | null;
  const urlInput = byId("skin-url") as HTMLInputElement | null;
  const preview = byId("skin-preview") as HTMLImageElement | null;
  const status = byId("skin-status");

  let skinName = WEAPON_SKINS.revolver;
  let sourcePath = "";
  let sourceBuffer: ArrayBuffer | null = null;

  const showPreview = (src: string): void => {
    if (!preview) return;
    preview.src = src;
    preview.style.display = "block";
  };

  const acceptFile = (file: File | undefined): void => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      flash(status, "That file is not an image.");
      return;
    }
    sourceBuffer = null;
    sourcePath = (file as unknown as { path: string }).path || "";
    const reader = new FileReader();
    reader.onload = (e) => showPreview(e.target!.result as string);
    reader.readAsDataURL(file);
    flash(status, `Loaded ${file.name}`);
  };

  fileInput?.addEventListener("change", () =>
    acceptFile(fileInput.files?.[0])
  );

  if (dropzone) {
    dropzone.addEventListener("click", () => fileInput?.click());
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-over");
    });
    dropzone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
      acceptFile(e.dataTransfer?.files?.[0]);
    });
  }

  urlInput?.addEventListener("change", async () => {
    const value = urlInput.value.trim();
    if (!value) return;
    try {
      const response = await fetch(value);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        flash(status, "URL does not point to an image.");
        return;
      }
      sourcePath = "";
      sourceBuffer = await blob.arrayBuffer();
      showPreview(URL.createObjectURL(blob));
      flash(status, "Loaded image from URL");
    } catch {
      flash(status, "Could not load that URL.");
    }
  });

  skinSelect?.addEventListener("change", () => {
    skinName = WEAPON_SKINS[skinSelect.value] || skinName;
  });

  byId("save-skin")?.addEventListener("click", () => {
    if (sourcePath) {
      ipcRenderer.send("save-skin-local", skinName, sourcePath);
    } else if (sourceBuffer) {
      ipcRenderer.send(
        "save-skin-from-buffer",
        skinName,
        Buffer.from(sourceBuffer)
      );
    } else {
      flash(status, "Upload or link an image first.");
      return;
    }
    flash(status, "Skin saved — restart the client to apply.");
  });

  byId("open-skins-folder")?.addEventListener("click", () =>
    ipcRenderer.send("open-skins-folder")
  );
}

function wireSounds(
  byId: (id: string) => HTMLElement | null,
  soundSelect: HTMLSelectElement | null,
  flash: (el: HTMLElement | null, message: string) => void
): void {
  const dropzone = byId("upload-sound");
  const fileInput = byId("sound-file") as HTMLInputElement | null;
  const previewBox = byId("sound-preview");
  const playBtn = byId("sound-play");
  const volumeIcon = byId("sound-volume-icon");
  const volumeSlider = byId("sound-volume") as HTMLInputElement | null;
  const fileLabel = byId("sound-filename");
  const status = byId("sound-status");

  let soundName = GAME_SOUNDS.dash;
  let sourcePath = "";
  let audio: HTMLAudioElement | null = null;

  const setPlayIcon = (playing: boolean): void => {
    if (playBtn)
      playBtn.innerHTML = `<i class="fas fa-${playing ? "pause" : "play"}"></i>`;
  };

  const setVolumeIcon = (value: number): void => {
    if (!volumeIcon) return;
    const name = value === 0 ? "mute" : value < 0.5 ? "down" : "up";
    volumeIcon.innerHTML = `<i class="fas fa-volume-${name}"></i>`;
  };

  const acceptFile = (file: File | undefined): void => {
    if (!file) return;
    sourcePath = (file as unknown as { path: string }).path || "";

    if (audio) {
      audio.pause();
      audio = null;
    }
    audio = new Audio(URL.createObjectURL(file));
    audio.volume = volumeSlider ? parseFloat(volumeSlider.value) : 1;
    audio.onended = () => setPlayIcon(false);

    if (previewBox) previewBox.style.display = "flex";
    if (fileLabel) fileLabel.textContent = file.name;
    setPlayIcon(false);
    flash(status, "");
  };

  fileInput?.addEventListener("change", () =>
    acceptFile(fileInput.files?.[0])
  );

  if (dropzone) {
    dropzone.addEventListener("click", () => fileInput?.click());
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-over");
    });
    dropzone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
      acceptFile(e.dataTransfer?.files?.[0]);
    });
  }

  playBtn?.addEventListener("click", () => {
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setPlayIcon(true);
    } else {
      audio.pause();
      setPlayIcon(false);
    }
  });

  volumeSlider?.addEventListener("input", () => {
    const value = parseFloat(volumeSlider.value);
    if (audio) audio.volume = value;
    setVolumeIcon(value);
  });

  volumeIcon?.addEventListener("click", () => {
    if (!volumeSlider) return;
    const muted = parseFloat(volumeSlider.value) > 0;
    volumeSlider.value = muted ? "0" : "1";
    if (audio) audio.volume = muted ? 0 : 1;
    setVolumeIcon(muted ? 0 : 1);
  });

  soundSelect?.addEventListener("change", () => {
    soundName = GAME_SOUNDS[soundSelect.value] || soundName;
  });

  ipcRenderer.on("save-sound-success", () =>
    flash(status, "Sound saved — restart the client to apply.")
  );
  ipcRenderer.on("save-sound-error", (_e, message: string) =>
    flash(status, `Error saving sound: ${message}`)
  );

  byId("save-sound")?.addEventListener("click", () => {
    if (!sourcePath) {
      flash(status, "Upload a sound file first.");
      return;
    }
    const volume = volumeSlider ? volumeSlider.value : "1";
    flash(status, "Saving…");
    ipcRenderer.send("save-sound", soundName, sourcePath, volume);
  });

  byId("open-sounds-folder")?.addEventListener("click", () =>
    ipcRenderer.send("open-sounds-folder")
  );

  setPlayIcon(false);
  setVolumeIcon(1);
}
