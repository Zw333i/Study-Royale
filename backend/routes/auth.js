// auth.js
const express = require('express');
const router = express.Router();
const { admin, db } = require('../firebase');

// Middleware to verify Firebase token
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Create user profile
router.post('/create-profile', verifyToken, async (req, res) => {
  try {
    const { displayName } = req.body;
    const userId = req.user.uid;

    await db.collection('users').doc(userId).set({
      displayName: displayName || 'Student',
      email: req.user.email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      totalQuizzesTaken: 0,
      totalReviewers: 0
    });

    res.json({ success: true, userId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({ success: true, profile: userDoc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.verifyToken = verifyToken;