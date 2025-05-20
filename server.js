const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Middleware for parsing JSON bodies
app.use(express.json());

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Serve static files from the dist directory (expo build output)
app.use(express.static(path.join(__dirname, 'dist')));

// Serve service worker at the root
app.get('/service-worker.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/service-worker.js'));
});

// Serve manifest.json at the root
app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/manifest.json'));
});

// Serve PWA icons
app.use('/icons', express.static(path.join(__dirname, 'public/icons')));

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server
app.listen(port, () => {
  console.log(`POS Server running at http://localhost:${port}`);
  console.log(`Open the browser and navigate to the above URL to use the Brothers Nook POS PWA`);
}); 