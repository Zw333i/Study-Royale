//reviewer.js
const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const { verifyToken } = require('./auth');

function getTodayDateOnly() {
  return new Date().toISOString().split('T')[0];
}

// GET ALL reviewers for user
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid; 
    const today = getTodayDateOnly();

    console.log('Fetching reviewers for userId:', userId);

    const reviewersSnapshot = await db.collection('reviewers')
      .where('userId', '==', userId)
      .get();

    console.log('Found documents:', reviewersSnapshot.size);

    const reviewers = [];
    const deletePromises = [];
    reviewersSnapshot.forEach(doc => {
      const data = doc.data();

      // Fail-safe cleanup: remove expired items while loading materials.
      if (data.examDate && data.examDate < today) {
        deletePromises.push(doc.ref.delete());
        return;
      }

      reviewers.push({
        id: doc.id,
        fileName: data.fileName,
        uploadDate: data.uploadDate,
        examDate: data.examDate,
        fileSize: data.fileSize || 0,
        textLength: data.textLength || 0
      });
    });

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
      console.log(`Deleted ${deletePromises.length} expired reviewer(s) during fetch`);
    }

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
    const today = getTodayDateOnly();

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

    // If expired, delete and treat as not found.
    if (reviewerData.examDate && reviewerData.examDate < today) {
      await reviewerDoc.ref.delete();
      return res.status(404).json({ error: 'Reviewer not found' });
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