const { withAppBuildGradle } = require('expo/config-plugins')

// Generated native files stay disposable. Release credentials come only from
// the build environment; no credentials means an unsigned release for F-Droid.
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, config => {
    const marker = '// G-Code Forge release signing'
    if (!config.modResults.contents.includes(marker)) {
      config.modResults.contents += `
${marker}
android {
    signingConfigs {
        forgeRelease {
            def path = System.getenv('FORGE_KEYSTORE_PATH')
            if (path) {
                storeFile file(path)
                storePassword System.getenv('FORGE_KEYSTORE_PASSWORD')
                keyAlias System.getenv('FORGE_KEY_ALIAS')
                keyPassword System.getenv('FORGE_KEY_PASSWORD')
            }
        }
    }
    buildTypes {
        release {
            signingConfig System.getenv('FORGE_KEYSTORE_PATH') ? signingConfigs.forgeRelease : null
        }
    }
}
`
    }
    return config
  })
}
