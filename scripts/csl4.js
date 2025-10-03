var customSkinLink = "https://i.imgur.com/28oRhB7.png";
var oldIsArr = Array.isArray;
var muzzleImg = "https://kirka.io/assets/img/__shooting-fire__.effa20af.png";
var muzzleImg2 = "shooting-fire";
// Track already-patched images to prevent repeated replacements
var patchedImages = new WeakSet();
Array.isArray = function () {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    // Fast path: if first arg doesn't have map.image structure, skip immediately
    var arg = args[0];
    if (!arg || !arg.map || !arg.map.image) {
        return oldIsArr.apply(Array, args);
    }
    var image = arg.map.image;
    var width = image.width, height = image.height, src = image.src;
    // Check if this is a player skin texture (64x64, 64x32, 42x42, 42x32)
    // and NOT a muzzle flash or already-patched texture
    if (customSkinLink &&
        (width === 64 || width === 42) &&
        (height === 64 || height === 42 || height === 32) &&
        src !== muzzleImg &&
        src !== customSkinLink &&
        !src.includes(muzzleImg2) &&
        !patchedImages.has(image)) {
        image.src = customSkinLink;
        patchedImages.add(image);
    }
    return oldIsArr.apply(Array, args);
};
