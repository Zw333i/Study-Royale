const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const { verifyToken } = require('./auth');

// DELETE /api/delete/:reviewerId - ADD verifyToken
router.delete('/:reviewerId', verifyToken, async (req, res) => {
  try {
    const { reviewerId } = req.params;
    const userId = req.user.uid; 

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Get reviewer document
    const reviewerDoc = await db.collection('reviewers').doc(reviewerId).get();
    
    if (!reviewerDoc.exists) {
      return res.status(404).json({ error: 'Reviewer not found' });
    }

    const reviewerData = reviewerDoc.data();

    // Verify ownership
    if (reviewerData.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Delete from Firestore
    await db.collection('reviewers').doc(reviewerId).delete();
    console.log(`Deleted reviewer: ${reviewerId}`);

    res.json({
      success: true,
      message: 'Reviewer deleted successfully'
    });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-delete expired reviewers (called by cron job)
async function autoDeleteExpired() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const expiredReviewers = await db.collection('reviewers')
      .where('examDate', '<', today)
      .get();

    console.log(`Found ${expiredReviewers.size} expired reviewers`);

    for (const doc of expiredReviewers.docs) {
      await doc.ref.delete();
      console.log(`Deleted expired reviewer: ${doc.id}`);
    }

    return { deleted: expiredReviewers.size };
  } catch (error) {
    console.error('Auto-delete error:', error);
    throw error;
  }
}

module.exports = router;
module.exports.autoDeleteExpired = autoDeleteExpired;