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

  // Default albums (collections shown in navigation)
  // adminOnly: true = hidden from guests, only visible in admin mode
  DEFAULT_ALBUMS: [
    { name: 'Couple Entry',  color: '#E91E63' },
    { name: 'Ceremony',      color: '#F44336' },
    { name: 'Photobooth',    color: '#9C27B0' },
    { name: 'Family',        color: '#2196F3' },
    { name: 'Meet&Greet',    color: '#3F51B5' },
    { name: 'Candid',        color: '#FF9800' },
    { name: 'Group Photos',  color: '#00BCD4' },
    { name: 'Food & Cake',   color: '#795548' },
    { name: 'Decor',         color: '#E67E22', adminOnly: true },
  ],
};
