//firebase.js
const admin = require('firebase-admin');

// Use environment variable in production, local file in development
let serviceAccount;

if (process.env.FIREBASE_ADMIN_CONFIG) {
  try {
    // Parse the JSON from environment variable
    serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_CONFIG);
    console.log('✅ Using Firebase config from environment variable');
  } catch (error) {
    console.error('❌ Error parsing FIREBASE_ADMIN_CONFIG:', error.message);
    throw new Error('Invalid FIREBASE_ADMIN_CONFIG environment variable');
  }
} else {
  // Fallback to local file in development
  try {
    serviceAccount = require('./serviceAccountKey.json');
    console.log('✅ Using Firebase config from local file');
  } catch (error) {
    console.error('❌ Firebase configuration not found!');
    console.error('Set FIREBASE_ADMIN_CONFIG environment variable or add serviceAccountKey.json');
    throw error;
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports = { admin, db };