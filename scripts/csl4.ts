const customSkinLink = "https://i.imgur.com/28oRhB7.png";
//const customSkinLink = "https://i.imgur.com/PWt8IYi.png" //volcanogirl
/* DONT CHANGE ANYTHING BELOW */

interface ImageMapArgs {
  map?: {
    image?: {
      width?: number;
      height?: number;
      src?: string;
    };
  };
}

const oldIsArr = Array.isArray;
const muzzleImg = "https://kirka.io/assets/img/__shooting-fire__.effa20af.png";
const muzzleImg2 = "shooting-fire";

// Track already-patched images to prevent repeated replacements
const patchedImages = new WeakSet<HTMLImageElement>();

(Array.isArray as any) = (...args: any[]): boolean => {
  // Fast path: if first arg doesn't have map.image structure, skip immediately
  const arg = args[0];
  if (!arg || !arg.map || !arg.map.image) {
    return oldIsArr.apply(Array, args);
  }

  const image = arg.map.image;
  const { width, height, src } = image;

  // Check if this is a player skin texture (64x64, 64x32, 42x42, 42x32)
  // and NOT a muzzle flash or already-patched texture
  if (
    customSkinLink &&
    (width === 64 || width === 42) &&
    (height === 64 || height === 42 || height === 32) &&
    src !== muzzleImg &&
    src !== customSkinLink &&
    !src.includes(muzzleImg2) &&
    !patchedImages.has(image)
  ) {
    image.src = customSkinLink;
    patchedImages.add(image);
  }

  return oldIsArr.apply(Array, args);
};
