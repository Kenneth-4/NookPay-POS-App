# Brothers Nook POS - Progressive Web App Guide

This guide explains how to build and deploy the Brothers Nook POS as a Progressive Web App (PWA).

## What is a PWA?

A Progressive Web App provides an app-like experience in the browser. It can be installed on devices, work offline, and provide a more native-like experience than traditional web apps.

## Building the PWA

Follow these steps to build the PWA version:

1. Make sure you have all dependencies installed:
   ```
   npm install
   ```

2. Build the PWA:
   ```
   npm run build:pwa
   ```
   This command:
   - Exports the web version to the `dist` directory
   - Copies the necessary PWA assets to the dist folder

3. Test the PWA locally:
   ```
   npm run serve-pwa
   ```
   This will start a local server at http://localhost:8080

## Installing the PWA

When viewing the app in a compatible browser (Chrome, Edge, etc.):

1. Look for the install icon in the address bar (usually a + sign or similar)
2. Click the icon and follow the prompts to install the app
3. The app will now appear on your desktop or home screen

## Deploying to Production

To deploy to a production server:

1. Build the PWA as described above
2. Copy the entire contents of the `dist` directory to your web server
3. Make sure your web server is configured to:
   - Serve `index.html` for any missing routes (for SPA functionality)
   - Use HTTPS (required for PWAs in production)
   - Set appropriate cache headers

## Troubleshooting

- **PWA not installing**: Make sure you're using HTTPS in production environments
- **Service worker not registering**: Check browser console for errors
- **Offline functionality not working**: Ensure the service worker is properly registered and caching files

## Technical Details

The PWA implementation includes:

- **Web Manifest**: Defines how the app appears when installed
- **Service Worker**: Enables offline functionality and caching
- **Offline Page**: Shown when the app is offline
- **App Icons**: Used when the app is installed

The PWA features are implemented using standard web technologies and don't rely on any specific third-party libraries. 
