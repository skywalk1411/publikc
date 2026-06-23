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
// Instead we keep two cheap flags up to date out-of-band:
//   `spectating`  — polled on a low-frequency timer
//   `modsActive`  — recomputed only when a setting actually changes
// When `modsActive` is false the hook is fully transparent.
let spectating = false;
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
  let lastTexture: WebGLTexture | null = null;

  const paint = (r: number, g: number, b: number): void => {
    colorPixel[0] = r;
    colorPixel[1] = g;
    colorPixel[2] = b;
    colorPixel[3] = 255;
    realBindTexture(gl.TEXTURE_2D, colorTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, colorPixel);
  };

  (gl as any).bindTexture = (target: number, texture: WebGLTexture | null) => {
    if (target === gl.TEXTURE_2D) lastTexture = texture;
    return realBindTexture(target, texture);
  };

  (gl as any).uniformMatrix4fv = (
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Float32Array | number[],
    srcOffset?: number,
    srcLength?: number
  ): void => {
    if (modsActive && !spectating && data && (data as ArrayLike<number>).length >= 16) {
      const offset = srcOffset ?? 0;
      const slice =
        offset === 0 && (data as ArrayLike<number>).length === 16
          ? (data as ArrayLike<number>)
          : (data as Float32Array).subarray
          ? (data as Float32Array).subarray(offset, offset + 16)
          : (data as number[]).slice(offset, offset + 16);

      const kind = classifyMatrix(slice);

      if (kind === "weapon" || (kind === "arms" && settings.include_arms)) {
        modifyNextDraw = true;

        if (settings.weapon_color && settings.weapon_rgb && lastTexture !== null) {
          const [r, g, b] = hueToRgb((performance.now() / 3000) * 360);
          paint(r, g, b);
        } else if (settings.weapon_color && lastTexture !== null) {
          const hex = (settings.weapon_color_hex || "#ffffff").replace("#", "");
          paint(
            parseInt(hex.substring(0, 2), 16) || 0,
            parseInt(hex.substring(2, 4), 16) || 0,
            parseInt(hex.substring(4, 6), 16) || 0
          );
        } else if (lastTexture !== null) {
          realBindTexture(gl.TEXTURE_2D, lastTexture);
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
    return realDrawArrays(mode, first, count);
  };

  (gl as any).drawElements = (mode: number, count: number, type: number, offset: number) => {
    if (settings.weapon_wireframe && modifyNextDraw) mode = asWireframe(mode);
    modifyNextDraw = false;
    return realDrawElements(mode, count, type, offset);
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
  // The spectate HUD (`.infos .fps`) only appears/disappears when entering or
  // leaving spectator mode, so polling a few times a second is ample.
  setInterval(() => {
    spectating = !!document.querySelector(".infos .fps");
  }, 250);

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
