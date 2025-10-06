const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { db } = require('../firebase');
const { verifyToken } = require('./auth');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

async function generateQuestions(text, questionType, count = 10, specialInstructions = '', format = 'default', associationType = 'mix') {
  const prompt = buildPrompt(text, questionType, count, specialInstructions, format, associationType);

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You are an expert teacher creating high-quality quiz questions. Follow all instructions carefully, especially special instructions from the user." },
        { role: "user", content: prompt }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 2000
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Groq API error:', error);
    throw new Error('Failed to generate questions');
  }
}

function buildPrompt(text, questionType, count, specialInstructions, format, associationType = 'mix') {
  const shortText = text.substring(0, 2500);
  let basePrompt = '';
  
  const prompts = {
    'identification': `Create ${count} identification (fill-in-the-blank) questions.`,
    'multiple-choice': `Create ${count} multiple choice questions with 4 options each.`,
    'true-false': `Create ${count} true/false statements.`,
    'flashcard': `Create ${count} flashcards with front (question/term) and back (answer/definition).`,
    'enumeration': `Create ${count} enumeration questions that require listing multiple items.`,
    'matching': `Create ${count} matching pairs of terms and definitions.`,
    'association': `Create ${count} association questions. The type should be: ${associationType}.
${associationType === 'except' ? 'Create "EXCEPT" type questions where you ask "All of the following are [category] EXCEPT:" and one option is clearly different.' : ''}
${associationType === 'odd-one-out' ? 'Create "Odd One Out" questions where you ask "Which does NOT belong to this group?" and one option is clearly different from the others.' : ''}
${associationType === 'mix' ? 'Create a mix of both "EXCEPT" questions and "Odd One Out" questions.' : ''}
Make sure one option in each question is clearly the exception or odd one out.`
  };

  basePrompt = prompts[questionType] || prompts['identification'];

  // Add special instructions with STRONG emphasis
  let specialInstruction = '';
  if (specialInstructions && specialInstructions.trim()) {
    specialInstruction = `\n\n🚨 **CRITICAL SPECIAL INSTRUCTIONS - MUST FOLLOW THESE:**
${specialInstructions}

⚠️ IMPORTANT: You MUST modify and adapt the questions according to these special instructions above. The questions should clearly reflect these requirements. Do NOT ignore these instructions!`;
  }

  let formatInstruction = '';
  if (format && format !== 'default' && questionType !== 'flashcard') {
    formatInstruction = `\n\nFormat requirement: ${format}`;
  }

  const formatExamples = {
    'identification': `\nFormat each as:\nQ: [question with blank _____]\nA: [correct answer]`,
    'multiple-choice': `\nFormat each as:\nQ: [question]\nA) [option]\nB) [option]\nC) [option]\nD) [option]\nCorrect: [A/B/C/D]`,
    'true-false': `\nFormat each as:\nStatement: [statement]\nAnswer: [True/False]\nExplanation: [brief explanation]`,
    'flashcard': `\nFormat each as:\nFront: [term/question]\nBack: [definition/answer]`,
    'enumeration': `\nFormat as:\nQ: [question asking to list items]\nA: 1. [item], 2. [item], 3. [item]\nMnemonic: [create a helpful acronym or mnemonic]`,
    'matching': `\nFormat as:\nColumn A | Column B\n[term] | [definition]`,
    'association': `\nFormat each as:\nQ: [question - All are X EXCEPT: OR Which does NOT belong?]\nA) [option that belongs]\nB) [option that belongs]\nC) [option that belongs]\nD) [CORRECT - the one that does NOT belong]\nCorrect: [A/B/C/D - the letter of the odd one out]`
  };

  return `${basePrompt}${formatExamples[questionType] || ''}${specialInstruction}${formatInstruction}\n\nContent to base questions on:\n${shortText}`;
}

router.post('/', verifyToken, async (req, res) => {
  try {
    const { reviewerId, questionType, count, specialInstructions, format, associationType } = req.body;

    if (!reviewerId || !questionType) {
      return res.status(400).json({ error: 'reviewerId and questionType are required' });
    }

    const reviewerDoc = await db.collection('reviewers').doc(reviewerId).get();
    
    if (!reviewerDoc.exists) {
      return res.status(404).json({ error: 'Reviewer not found' });
    }

    const reviewerData = reviewerDoc.data();
    
    // Verify ownership
    if (reviewerData.userId !== req.user.uid) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const extractedText = reviewerData.textExtracted;

    console.log(`Generating ${questionType} questions with Groq...`);
    if (specialInstructions) {
      console.log(`Special instructions: ${specialInstructions}`);
    }
    if (questionType === 'association' && associationType) {
      console.log(`Association type: ${associationType}`);
    }
    
    const questions = await generateQuestions(
      extractedText, 
      questionType, 
      count || 10,
      specialInstructions || '',
      format || 'default',
      associationType || 'mix'
    );

    res.json({
      success: true,
      questionType: questionType,
      questions: questions,
      reviewerId: reviewerId
    });

  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;