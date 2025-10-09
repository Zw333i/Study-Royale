//reviewer.js
const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const { verifyToken } = require('./auth');

// GET ALL reviewers for user
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid; 

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

// GET SINGLE reviewer by ID
router.get('/:reviewerId', verifyToken, async (req, res) => {
  try {
    const { reviewerId } = req.params;
    const userId = req.user.uid;

    console.log('Fetching single reviewer:', reviewerId, 'for user:', userId);

    const reviewerDoc = await db.collection('reviewers').doc(reviewerId).get();
    
    if (!reviewerDoc.exists) {
      console.log('Reviewer not found:', reviewerId);
      return res.status(404).json({ error: 'Reviewer not found' });
    }

    const reviewerData = reviewerDoc.data();

    if (reviewerData.userId !== userId) {
      console.log('Unauthorized access attempt for reviewer:', reviewerId);
      return res.status(403).json({ error: 'Unauthorized' });
    }

    console.log('Successfully fetched reviewer:', reviewerId);

    res.json({
      success: true,
      reviewer: {
        id: reviewerDoc.id,
        fileName: reviewerData.fileName,
        uploadDate: reviewerData.uploadDate,
        examDate: reviewerData.examDate,
        fileSize: reviewerData.fileSize || 0,
        textLength: reviewerData.textLength || 0
      }
    });

  } catch (error) {
    console.error('Get single reviewer error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;