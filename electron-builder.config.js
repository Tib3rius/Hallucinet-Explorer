module.exports = {
  appId: 'com.hallucinet-explorer.browser',
  productName: 'Hallucinet Explorer',
  directories: {
    output: 'release',
  },
  files: [
    'dist/**/*',
    'src/renderer/**/*.html',
    'src/renderer/**/*.css',
    'assets/**/*',
  ],
  linux: {
    target: 'AppImage',
  },
  mac: {
    target: 'dmg',
  },
  win: {
    target: 'nsis',
  },
};
