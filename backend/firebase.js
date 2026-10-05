//firebase.js
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// Use environment variable in production, local file in development
let serviceAccount;

if (process.env.FIREBASE_ADMIN_CONFIG) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_CONFIG);
    console.log('✅ Using Firebase config from environment variable');
  } catch (error) {
    console.error('❌ Error parsing FIREBASE_ADMIN_CONFIG:', error.message);
    throw new Error('Invalid FIREBASE_ADMIN_CONFIG environment variable');
  }
} else {
  try {
    serviceAccount = require('./serviceAccountKey.json');
    console.log('✅ Using Firebase config from local file');
  } catch (error) {
    console.error('❌ Firebase configuration not found!');
    console.error('Set FIREBASE_ADMIN_CONFIG environment variable or add serviceAccountKey.json');
    throw error;
  }
}

const firebaseCredential = admin.credential && admin.credential.cert
  ? admin.credential.cert(serviceAccount)
  : admin.cert(serviceAccount);

admin.initializeApp({
  credential: firebaseCredential
});

const db = getFirestore();
const auth = getAuth();

module.exports = { admin, db, auth, FieldValue };