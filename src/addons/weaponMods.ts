import type { Settings } from "../types";

// Live weapon/arms model tweaks. We can't reach the game's render graph
// directly, so we intercept the WebGL context of the `#game` canvas and rewrite
// the per-draw model matrix (scale + offset), the bound texture (solid/RGB
// color) and the primitive mode (wireframe) for draws we recognise as the
// first-person viewmodel.

// Cycles fully saturated hues; `hue` is in degrees.
const hueToRgb = (hue: number): [number, number, number] => {
  hue = ((hue % 360) + 360) % 360;
  const segment = Math.floor(hue / 60);
  const frac = hue / 60 - segment;
  const rising = Math.round(frac * 255);
  const falling = Math.round((1 - frac) * 255);
  switch (segment) {
    case 0: return [255, rising, 0];
    case 1: return [falling, 255, 0];
    case 2: return [0, 255, rising];
    case 3: return [0, falling, 255];
    case 4: return [rising, 0, 255];
    default: return [255, 0, falling];
  }
};

// Length of one 3-component column of a column-major 4x4 matrix.
const columnLength = (m: ArrayLike<number>, i: number): number =>
  Math.sqrt(m[i] * m[i] + m[i + 1] * m[i + 1] + m[i + 2] * m[i + 2]);

// Heuristically labels a model matrix as the held weapon, the arms, or neither,
// based on it being an affine transform with a small translation and a scale
// range characteristic of the viewmodel. These thresholds are tuned to Kirka's
// renderer; changing them breaks detection.
const classifyMatrix = (m: ArrayLike<number>): "weapon" | "arms" | null => {
  if (!m || m.length < 16) return null;

  if (Math.abs(m[3]) > 0.001) return null;
  if (Math.abs(m[7]) > 0.001) return null;
  if (Math.abs(m[11]) > 0.001) return null;
  if (Math.abs(m[15] - 1.0) > 0.001) return null;

  const sx = columnLength(m, 0);
  const sy = columnLength(m, 4);
  const sz = columnLength(m, 8);
  if (sx < 0.001 || sx > 15.0) return null;
  if (sy < 0.001 || sy > 15.0) return null;
  if (sz < 0.001 || sz > 15.0) return null;

  const distance = Math.sqrt(m[12] * m[12] + m[13] * m[13] + m[14] * m[14]);
  if (distance < 0.001 || distance > 0.6) return null;

  const maxScale = Math.max(sx, sy, sz);
  if (maxScale < 1.7) return "weapon";

  const minScale = Math.min(sx, sy, sz);
  return maxScale / minScale < 1.05 ? "weapon" : "arms";
};

const num = (value: string, fallback: number): number => {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
};

// The WebGL hooks below run on the render hot path (per matrix upload, many
// times per frame), so they must never touch the DOM or re-scan settings.
// `modsActive` is recomputed only when a setting actually changes; when it's
// false the hook is fully transparent.
let modsActive = false;

const computeModsActive = (s: Settings): boolean =>
  s.weapon_color ||
  s.weapon_rgb ||
  s.weapon_wireframe ||
  s.include_arms ||
  num(s.weapon_size, 1) !== 1 ||
  num(s.weapon_offset_x, 0) !== 0 ||
  num(s.weapon_offset_y, 0) !== 0 ||
  num(s.weapon_offset_z, 0) !== 0;

// Wraps the relevant WebGL calls of a single context.
const patchContext = (gl: WebGLRenderingContext, settings: Settings): void => {
  const matrix = new Float32Array(16);
  const colorPixel = new Uint8Array([255, 255, 255, 255]);

  const colorTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, colorTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, colorPixel);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_2D, null);

  const realUniformMatrix4fv = gl.uniformMatrix4fv.bind(gl);
  const realDrawArrays = gl.drawArrays.bind(gl);
  const realDrawElements = gl.drawElements.bind(gl);
  const realBindTexture = gl.bindTexture.bind(gl);

  let modifyNextDraw = false;

  // Kirka draws the first-person viewmodel in a pass of its own, opened with a
  // depth-only clear so the gun and arms can never be occluded by the world.
  // That clear is a far more reliable marker of the pass than the shape of the
  // matrix, so matrices arriving outside one are left alone however much they
  // look like a viewmodel. The mask stays set for the rest of the pass.
  let lastClearMask = 0;
  const realClear = gl.clear.bind(gl);

  (gl as any).clear = (mask: number) => {
    lastClearMask = mask;
    return realClear(mask);
  };

  const inViewmodelPass = (): boolean => lastClearMask === gl.DEPTH_BUFFER_BIT;

  // One object can upload the same matrix to several uniform locations before
  // it is drawn (the skinning bind matrices alongside the model matrix, say).
  // Transforming it each time would compound the scale, so matrices already
  // handled since the last draw are passed through untouched. Held as raw
  // floats rather than string keys in a Set to keep the hot path free of
  // allocation.
  const SEEN_CAPACITY = 8;
  const seen = new Float32Array(SEEN_CAPACITY * 6);
  let seenCount = 0;

  // Reports whether this matrix was already transformed for the pending draw,
  // recording it as a side effect when it wasn't.
  const seenSinceLastDraw = (m: ArrayLike<number>): boolean => {
    for (let i = 0; i < seenCount; i++) {
      const o = i * 6;
      if (
        Math.abs(seen[o] - m[0]) < 0.001 &&
        Math.abs(seen[o + 1] - m[5]) < 0.001 &&
        Math.abs(seen[o + 2] - m[10]) < 0.001 &&
        Math.abs(seen[o + 3] - m[12]) < 0.0001 &&
        Math.abs(seen[o + 4] - m[13]) < 0.0001 &&
        Math.abs(seen[o + 5] - m[14]) < 0.0001
      ) {
        return true;
      }
    }
    if (seenCount < SEEN_CAPACITY) {
      const o = seenCount * 6;
      seen[o] = m[0];
      seen[o + 1] = m[5];
      seen[o + 2] = m[10];
      seen[o + 3] = m[12];
      seen[o + 4] = m[13];
      seen[o + 5] = m[14];
      seenCount++;
    }
    return false;
  };

  // Three.js caches the texture bound to each unit and skips redundant binds.
  // Binding behind its back desyncs that cache and the next draw samples the
  // wrong texture, so any override we make must be undone before the renderer
  // regains control -- i.e. immediately after the draw call it was made for.
  // `undefined` means "nothing to restore"; `null` is a genuine unbound unit.
  let pendingRestoreTex: WebGLTexture | null | undefined = undefined;

  const restoreTexture = (): void => {
    if (pendingRestoreTex === undefined) return;
    if (pendingRestoreTex !== null) realBindTexture(gl.TEXTURE_2D, pendingRestoreTex);
    pendingRestoreTex = undefined;
  };

  const paint = (r: number, g: number, b: number): void => {
    if (pendingRestoreTex === undefined) {
      pendingRestoreTex = gl.getParameter(gl.TEXTURE_BINDING_2D);
    }
    colorPixel[0] = r;
    colorPixel[1] = g;
    colorPixel[2] = b;
    colorPixel[3] = 255;
    realBindTexture(gl.TEXTURE_2D, colorTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, colorPixel);
  };

  (gl as any).uniformMatrix4fv = (
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Float32Array | number[],
    srcOffset?: number,
    srcLength?: number
  ): void => {
    if (modsActive && data && (data as ArrayLike<number>).length >= 16) {
      const offset = srcOffset ?? 0;
      const slice =
        offset === 0 && (data as ArrayLike<number>).length === 16
          ? (data as ArrayLike<number>)
          : (data as Float32Array).subarray
          ? (data as Float32Array).subarray(offset, offset + 16)
          : (data as number[]).slice(offset, offset + 16);

      const kind = classifyMatrix(slice);

      if (
        (kind === "weapon" || (kind === "arms" && settings.include_arms)) &&
        inViewmodelPass() &&
        !seenSinceLastDraw(slice)
      ) {
        modifyNextDraw = true;

        // Only touch the texture state when we actually recolour. Rebinding
        // "the same" texture here is not a no-op: it lands on whichever unit
        // happens to be active, not the one it came from.
        if (settings.weapon_color && settings.weapon_rgb) {
          const [r, g, b] = hueToRgb((performance.now() / 3000) * 360);
          paint(r, g, b);
        } else if (settings.weapon_color) {
          const hex = (settings.weapon_color_hex || "#ffffff").replace("#", "");
          paint(
            parseInt(hex.substring(0, 2), 16) || 0,
            parseInt(hex.substring(2, 4), 16) || 0,
            parseInt(hex.substring(4, 6), 16) || 0
          );
        }

        if (kind === "weapon") {
          const scale = num(settings.weapon_size, 1);
          matrix.set(slice);
          matrix[0] *= scale; matrix[1] *= scale; matrix[2] *= scale;
          matrix[4] *= scale; matrix[5] *= scale; matrix[6] *= scale;
          matrix[8] *= scale; matrix[9] *= scale; matrix[10] *= scale;
          matrix[12] += num(settings.weapon_offset_x, 0);
          matrix[13] += num(settings.weapon_offset_y, 0);
          matrix[14] += num(settings.weapon_offset_z, 0);
          return realUniformMatrix4fv(location, transpose, matrix, 0, 16);
        }
      }
    }
    return realUniformMatrix4fv(location, transpose, data as Float32Array, srcOffset, srcLength);
  };

  const asWireframe = (mode: number): number =>
    mode === gl.TRIANGLES || mode === gl.TRIANGLE_FAN || mode === gl.TRIANGLE_STRIP
      ? gl.LINES
      : mode;

  (gl as any).drawArrays = (mode: number, first: number, count: number) => {
    if (settings.weapon_wireframe && modifyNextDraw) mode = asWireframe(mode);
    modifyNextDraw = false;
    seenCount = 0;
    const result = realDrawArrays(mode, first, count);
    restoreTexture();
    return result;
  };

  (gl as any).drawElements = (mode: number, count: number, type: number, offset: number) => {
    if (settings.weapon_wireframe && modifyNextDraw) mode = asWireframe(mode);
    modifyNextDraw = false;
    seenCount = 0;
    const result = realDrawElements(mode, count, type, offset);
    restoreTexture();
    return result;
  };
};

// Installs the context interceptor. Must run before the game creates its WebGL
// context, i.e. at preload module evaluation.
export function installWeaponHook(settings: Settings): void {
  // Keep the hot-path flags current without doing any work inside the hooks.
  modsActive = computeModsActive(settings);
  document.addEventListener("juice-settings-changed", () => {
    modsActive = computeModsActive(settings);
  });

  const hooked = new WeakSet<object>();
  const realGetContext = HTMLCanvasElement.prototype.getContext;

  (HTMLCanvasElement.prototype as any).getContext = function (
    this: HTMLCanvasElement,
    type: string,
    attrs?: any
  ): RenderingContext | null {
    const ctx = realGetContext.call(this, type as any, attrs);
    if (!ctx || (type !== "webgl" && type !== "webgl2")) return ctx;
    if (this.id !== "game" || hooked.has(ctx)) return ctx;

    hooked.add(ctx);
    patchContext(ctx as WebGLRenderingContext, settings);
    return ctx;
  };
}
