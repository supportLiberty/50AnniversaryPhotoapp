// =====================================================
// CONFIGURATION
// =====================================================

const CONFIG = {
  // Gallery title and subtitle
  TITLE: '50th Anniversary',
  SUBTITLE: 'Celebrating 50 Golden Years Together',

  // Slideshow settings
  SLIDESHOW_INTERVAL: 4000,  // ms between slides (4 seconds)

  // Performance settings for large galleries
  BATCH_SIZE: 40,            // Photos to load per batch
  THUMBNAIL_SIZE: 400,       // Thumbnail width in pixels
  LIGHTBOX_SIZE: 1600,       // Full-size image width for lightbox

  // Admin PIN for delete mode (only you know this)
  ADMIN_PIN: '1234',

  // Default albums (users can add more from the UI)
  // Each album has: name, color (for the chip/dot), shortcut key (1-9)
  DEFAULT_ALBUMS: [
    { name: 'Decor',         color: '#E67E22' },
    { name: 'Couple Entry',  color: '#E91E63' },
    { name: 'Photobooth',    color: '#9C27B0' },
    { name: 'Family',        color: '#2196F3' },
    { name: 'Performances',   color: '#4CAF50' },
    { name: 'DJ & Candid',   color: '#FF9800' },
    { name: 'Group Photos',  color: '#00BCD4' },
    { name: 'Food & Cake',   color: '#795548' },
  ],
};
