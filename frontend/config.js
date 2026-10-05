// API Configuration
// This file handles API URL for different environments
const CONFIG = {
    // Production API URL - UPDATE THIS after deploying to Render
    PRODUCTION_API_URL: 'https://studyroyale-backend.onrender.com/api',
    
    // Development API URL
    DEVELOPMENT_API_URL: 'http://localhost:3000/api',

    // Local development auth toggle
    LOCAL_AUTH_REQUIRED: false,
    PRODUCTION_AUTH_REQUIRED: true,
    DEV_USER_ID: 'local-dev-user',
    
    // Automatically detect environment
    getApiUrl: function() {
        // Check if we're on localhost or deployed
        const isLocalhost = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1' ||
                           window.location.hostname === '';
        
        return isLocalhost ? this.DEVELOPMENT_API_URL : this.PRODUCTION_API_URL;
    },

    isAuthRequired: function() {
        const isLocalhost = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname === '';

        return isLocalhost ? this.LOCAL_AUTH_REQUIRED : this.PRODUCTION_AUTH_REQUIRED;
    }
};

function normalizeRequestBody(input, options = {}) {
    const {
        maxTextLength = 2000,
        allowedKeys = null,
        trimStrings = true,
        defaultValues = {},
        maxArrayLength = 25
    } = options;

    if (input === null || input === undefined) {
        return { ...defaultValues };
    }

    if (typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('Request payload must be an object.');
    }

    const pickedKeys = allowedKeys
        ? Object.keys(input).filter((key) => allowedKeys.includes(key))
        : Object.keys(input);

    const safe = { ...defaultValues };

    for (const key of pickedKeys) {
        const value = input[key];

        if (value === null || value === undefined) {
            continue;
        }

        if (typeof value === 'string') {
            const cleaned = (trimStrings ? value.trim() : value)
                .replace(/\s+/g, ' ')
                .slice(0, maxTextLength);

            if (cleaned === '') {
                continue;
            }

            safe[key] = cleaned;
            continue;
        }

        if (typeof value === 'number') {
            if (!Number.isFinite(value)) {
                continue;
            }

            safe[key] = value;
            continue;
        }

        if (typeof value === 'boolean') {
            safe[key] = value;
            continue;
        }

        if (Array.isArray(value)) {
            const cleanedItems = value
                .filter((item) => item !== null && item !== undefined && item !== '')
                .slice(0, maxArrayLength)
                .map((item) => {
                    if (typeof item === 'string') {
                        const cleaned = (trimStrings ? item.trim() : item)
                            .replace(/\s+/g, ' ')
                            .slice(0, maxTextLength);

                        return cleaned === '' ? null : cleaned;
                    }

                    if (typeof item === 'number' && Number.isFinite(item)) {
                        return item;
                    }

                    if (typeof item === 'boolean') {
                        return item;
                    }

                    return item;
                })
                .filter((item) => item !== null && item !== undefined && item !== '');

            if (cleanedItems.length > 0) {
                safe[key] = cleanedItems;
            }
            continue;
        }

        if (typeof value === 'object') {
            const nestedSafe = normalizeRequestBody(value, {
                maxTextLength,
                trimStrings,
                defaultValues: {}
            });

            if (Object.keys(nestedSafe).length > 0) {
                safe[key] = nestedSafe;
            }
        }
    }

    return safe;
}

// Export for use in app.js
window.CONFIG = CONFIG;
window.normalizeRequestBody = normalizeRequestBody;
