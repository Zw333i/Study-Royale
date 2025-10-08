// routes/chatbot.js
const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { verifyToken } = require('./auth');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const { message, questions } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Build context from questions
    let questionsContext = '';
    if (questions && questions.length > 0) {
      questionsContext = '\n\nQuiz Questions Context:\n';
      questions.forEach((q, idx) => {
        if (q.question) {
          questionsContext += `\nQ${idx + 1}: ${q.question}\nCorrect Answer: ${q.correctAnswer || q.answer}\n`;
        } else if (q.statement) {
          questionsContext += `\nStatement ${idx + 1}: ${q.statement}\nCorrect Answer: ${q.answer}\n`;
        }
      });
    }

    const completion = await groq.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: `You are a helpful study assistant. Help students understand quiz questions and concepts. Explain answers clearly and provide additional context when needed. Be encouraging and educational.${questionsContext}` 
        },
        { role: "user", content: message }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 500
    });

    const response = completion.choices[0].message.content;

    res.json({
      success: true,
      response: response
    });

  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;