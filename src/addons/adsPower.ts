import type { Settings } from "../types";

interface CameraLike {
  [key: string]: unknown;
}

const findCameraInInstance = (instance: CameraLike): CameraLike | null => {
  const keys = Object.getOwnPropertyNames(instance);
  for (let i = 0; i < keys.length; i++) {
    const val = instance[keys[i]];
    if (!val || typeof val !== "object") continue;
    const names = Object.getOwnPropertyNames(val);
    let hasFov = false;
    let hasZoom = false;
    for (let j = 0; j < names.length; j++) {
      if (names[j] === "zoom") { hasZoom = true; continue; }
      if (hasFov) continue;
      const desc = Object.getOwnPropertyDescriptor(val, names[j]);
      if (!desc || !desc.get) continue;
      try {
        const v = desc.get.call(val);
        if (typeof v === "number" && v >= 40 && v <= 150) hasFov = true;
      } catch {}
    }
    if (hasFov && hasZoom) return val as CameraLike;
  }
  return null;
};

const FOV_KEY = "SETTINGS___SETTING/CAMERA___SETTING/MAIN_FOV___SETTING";

export function initAdsPower(settings: Settings): void {
  let hooked = false;

  const hook = (): void => {
    if (hooked) return;

    // Try Dawn-compatible __zoomInstance first (set via bundle patching).
    const zoomInstance = ((window as unknown) as Record<string, unknown>).__zoomInstance as CameraLike | undefined;
    const searchSpace = zoomInstance
      ? [zoomInstance]
      : Object.getOwnPropertyNames(window).map(
          (k) => ((window as unknown) as Record<string, unknown>)[k] as CameraLike | undefined
        ).filter(Boolean) as CameraLike[];

    for (let i = 0; i < searchSpace.length; i++) {
      try {
        const val = searchSpace[i];
        if (!val || typeof val !== "object") continue;
        const cam = findCameraInInstance(val);
        if (!cam) continue;

        const fovKey = Object.getOwnPropertyNames(cam).find((k) => {
          const desc = Object.getOwnPropertyDescriptor(cam, k);
          if (!desc || !desc.get) return false;
          try {
            const v = desc.get.call(cam);
            return typeof v === "number" && v >= 40 && v <= 150;
          } catch { return false; }
        });

        if (!fovKey) continue;

        const desc = Object.getOwnPropertyDescriptor(cam, fovKey)!;
        const origGet = desc.get!;
        const origSet = desc.set!;

        Object.defineProperty(cam, fovKey, {
          get(): number { return origGet.call(this); },
          set(v: number) {
            const defaultFov = parseFloat(
              localStorage.getItem(FOV_KEY)?.replace(/"/g, "") || "100"
            );

            if (v === defaultFov) {
              origSet.call(this, v);
              return;
            }

            if (v < defaultFov) {
              const adsPower = settings.ads_power ?? 1;
              const zoomDelta = Math.abs(defaultFov - v);
              const curved = Math.pow(adsPower, 0.4);
              origSet.call(this, Math.max(1, Math.min(179, defaultFov - zoomDelta * curved)));
            } else {
              origSet.call(this, v);
            }
          },
          configurable: true,
          enumerable: true,
        });

        hooked = true;
        return;
      } catch {}
    }
  };

  hook();
  if (!hooked) {
    const retry = setInterval(() => {
      hook();
      if (hooked) clearInterval(retry);
    }, 200);
  }

  document.addEventListener("juice-settings-changed", (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail.setting === "ads_power") {
      settings.ads_power = detail.value;
    }
  });
}
