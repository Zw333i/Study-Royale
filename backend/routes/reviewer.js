//reviewer.js
const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const { verifyToken } = require('./auth');

// GET /api/reviewer - ADD verifyToken
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid; // Get from authenticated user

    console.log('Fetching reviewers for userId:', userId);

    const reviewersSnapshot = await db.collection('reviewers')
      .where('userId', '==', userId)
      .get();

    console.log('Found documents:', reviewersSnapshot.size);

    const reviewers = [];
    reviewersSnapshot.forEach(doc => {
      const data = doc.data();
      reviewers.push({
        id: doc.id,
        fileName: data.fileName,
        uploadDate: data.uploadDate,
        examDate: data.examDate,
        fileSize: data.fileSize || 0,
        textLength: data.textLength || 0
      });
    });

    // Sort in JavaScript instead of Firestore
    reviewers.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

    res.json({
      success: true,
      reviewers: reviewers
    });

  } catch (error) {
    console.error('Get reviewers error:', error);
    res.status(500).json({ 
      error: error.message
    });
  }
});

module.exports = router;