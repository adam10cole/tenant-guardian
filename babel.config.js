// Resolves a preset from Expo's nested node_modules when not hoisted top-level.
function resolvePreset(name) {
  try {
    return require.resolve(name);
  } catch {
    return require.resolve(`expo/node_modules/${name}`);
  }
}

module.exports = {
  presets: [
    [resolvePreset('babel-preset-expo'), { jsxImportSource: 'nativewind' }],
  ],
  plugins: [
    // react-native-reanimated/plugin must be listed last
    'react-native-reanimated/plugin',
  ],
};
