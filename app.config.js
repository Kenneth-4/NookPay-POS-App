export default ({ config }) => {
  // Determine environment
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Base configuration
  const appConfig = {
    ...config,
    extra: {
      ...config.extra,
      isProduction,
      buildEnvironment: process.env.NODE_ENV || 'development',
      version: config.version,
    },
    web: {
      ...config.web,
      favicon: './assets/images/nook.png',
      name: 'Brothers Nook POS',
      shortName: 'Nook POS',
      description: 'Point of Sale system for Brothers Nook',
      themeColor: '#F36514',
      backgroundColor: '#FFFFFF',
      // PWA configuration
      meta: {
        viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
        'theme-color': '#F36514',
        'apple-mobile-web-app-capable': 'yes',
        'apple-mobile-web-app-status-bar-style': 'black-translucent',
        'apple-mobile-web-app-title': 'Nook POS',
      },
      // Custom HTML head content for PWA
      headTags: [
        {
          tagName: 'link',
          attributes: {
            rel: 'manifest',
            href: '/manifest.json',
          },
        },
        {
          tagName: 'link',
          attributes: {
            rel: 'apple-touch-icon',
            href: '/icons/nook.png',
          },
        },
        {
          tagName: 'link',
          attributes: {
            rel: 'apple-touch-icon',
            sizes: '152x152',
            href: '/icons/nook.png',
          },
        },
        {
          tagName: 'link',
          attributes: {
            rel: 'apple-touch-icon',
            sizes: '180x180',
            href: '/icons/nook.png',
          },
        },
        {
          tagName: 'link',
          attributes: {
            rel: 'apple-touch-icon',
            sizes: '167x167',
            href: '/icons/nook.png',
          },
        },
        {
          tagName: 'meta',
          attributes: {
            name: 'application-name',
            content: 'Nook POS',
          },
        },
        {
          tagName: 'meta',
          attributes: {
            name: 'mobile-web-app-capable',
            content: 'yes',
          },
        },
        {
          tagName: 'script',
          innerHTML: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/service-worker.js')
                  .then(function(registration) {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                  }, function(err) {
                    console.log('ServiceWorker registration failed: ', err);
                  });
              });
            }
          `,
        },
      ],
    }
  };
  
  // Production-specific configurations
  if (isProduction) {
    // Add production optimizations
    appConfig.web.build = {
      ...appConfig.web.build,
      minify: true,
      babel: {
        dangerouslyAddModulePathsToTranspile: [
          '@expo/vector-icons'
        ]
      }
    };
    
    // Enable hermes for production
    appConfig.jsEngine = 'hermes';
  }
  
  return appConfig;
}; 