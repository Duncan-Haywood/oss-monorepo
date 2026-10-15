// The app shares calc.mjs (rates, audit, CSV) with the web version one level up.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "..")];
config.resolver.sourceExts.push("mjs");
module.exports = config;
