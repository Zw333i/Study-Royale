// API Configuration
// This file handles API URL for different environments
const CONFIG = {
    // Production API URL - UPDATE THIS after deploying to Render
    PRODUCTION_API_URL: 'https://studyroyale-backend.onrender.com/api',
    
    // Development API URL
    DEVELOPMENT_API_URL: 'http://localhost:3000/api',
    
    // Automatically detect environment
    getApiUrl: function() {
        // Check if we're on localhost or deployed
        const isLocalhost = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1' ||
                           window.location.hostname === '';
        
        return isLocalhost ? this.DEVELOPMENT_API_URL : this.PRODUCTION_API_URL;
    }
};

// Export for use in app.js
window.CONFIG = CONFIG;
