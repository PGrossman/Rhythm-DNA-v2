export default {
  packagerConfig: {
    name: "RhythmDNA",
    executableName: "RhythmDNA"
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin']
    }
  ]
};


