// Metro tuned for an npm-workspaces monorepo.
//
// Without this, Metro only watches apps/mobile and cannot resolve @dailynote/core
// from packages/, and cannot find hoisted dependencies in the root node_modules.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so edits in packages/ trigger a reload.
config.watchFolders = [workspaceRoot];

// 2. Resolve from the app first, then the hoisted root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Do not walk up past the workspace root looking for modules.
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: './src/global.css' });
