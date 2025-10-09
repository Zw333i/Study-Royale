// routes/learn.js
const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { db } = require('../firebase');
const { verifyToken } = require('./auth');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

router.post('/', verifyToken, async (req, res) => {
  try {
    console.log('Learn mode request received');
    console.log('User:', req.user.uid);
    console.log('Body:', req.body);
    
    const { message, reviewerId, conversationHistory } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let materialContext = '';
    if (reviewerId) {
      console.log('Fetching reviewer:', reviewerId);
      const reviewerDoc = await db.collection('reviewers').doc(reviewerId).get();
      
      if (reviewerDoc.exists) {
        const reviewerData = reviewerDoc.data();
        
        if (reviewerData.userId !== req.user.uid) {
          console.log('Unauthorized access to reviewer');
          return res.status(403).json({ error: 'Unauthorized' });
        }
        
        materialContext = `\n\nStudy Material Context:\n${reviewerData.textExtracted.substring(0, 2000)}`;
        console.log('Material context loaded, length:', materialContext.length);
      } else {
        console.log('Reviewer not found');
      }
    }

    let messages = [
      { 
        role: "system", 
        content: `You are a helpful and encouraging study tutor. Help students understand concepts from their study material. Provide clear explanations, examples, and encourage learning. Be patient and supportive.${materialContext}` 
      }
    ];

    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-10);
      messages = messages.concat(
        recentHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        }))
      );
    }

    console.log('Calling Groq API...');
    const completion = await groq.chat.completions.create({
      messages: messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 800
    });

    const response = completion.choices[0].message.content;
    console.log('Response generated successfully');

    res.json({
      success: true,
      response: response
    });

  } catch (error) {
    console.error('Learn mode error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

module.exports = router;