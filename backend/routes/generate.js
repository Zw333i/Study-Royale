const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { db } = require('../firebase');
const { verifyToken } = require('./auth');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

async function generateQuestions(text, questionTypes, count = 10, specialInstructions = '', associationType = 'mix') {
  const prompt = buildPrompt(text, questionTypes, count, specialInstructions, associationType);

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: "You are creating quiz questions based on the provided study material. Generate clear, accurate questions that test understanding of the content." 
        },
        { role: "user", content: prompt }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 3000
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Groq API error:', error);
    throw new Error('Failed to generate questions');
  }
}

function buildPrompt(text, questionTypes, count, specialInstructions, associationType = 'mix') {
  const shortText = text.substring(0, 3000);
  
  // Calculate questions per type
  const typesArray = Array.isArray(questionTypes) ? questionTypes : [questionTypes];
  const questionsPerType = Math.ceil(count / typesArray.length);
  
  let prompts = [];
  
  typesArray.forEach(type => {
    const typePrompts = {
      'identification': `Create ${questionsPerType} identification (fill-in-the-blank) questions.\nFormat each as:\nQ: [question with blank _____]\nA: [correct answer]`,
      
      'multiple-choice': `Create ${questionsPerType} multiple choice questions with 4 options each.\nFormat each as:\nQ: [question]\nA) [option]\nB) [option]\nC) [option]\nD) [option]\nCorrect: [A/B/C/D]`,
      
      'true-false': `Create ${questionsPerType} true/false statements.\nFormat each as:\nStatement: [statement]\nAnswer: [True/False]\nExplanation: [brief explanation]`,
      
      'flashcard': `Create ${questionsPerType} flashcards with memorable content. Use acronyms, mnemonics, or memory techniques when listing multiple items.\nFormat each as:\nFront: [term/question]\nBack: [definition/answer - use acronyms like D.A.R.T for lists]`,
      
      'enumeration': `Create ${questionsPerType} enumeration questions.\nFormat as:\nQ: [question asking to list items]\nA: 1. [item], 2. [item], 3. [item]\nMnemonic: [create a helpful acronym or mnemonic]`,
      
      'matching': `Create ${questionsPerType} matching pairs.\nFormat as:\nColumn A | Column B\n[term] | [definition]`,
      
      'association': `Create ${questionsPerType} association questions. Type: ${associationType}.
${associationType === 'except' ? 'Create "EXCEPT" questions: "All of the following are [category] EXCEPT:"' : ''}
${associationType === 'odd-one-out' ? 'Create "Odd One Out" questions: "Which does NOT belong?"' : ''}
${associationType === 'conditional' ? 'Create conditional statement questions with options: A) If statement 1 is true, B) If statement 2 is true, C) If both are true, D) If neither is true' : ''}
${associationType === 'mix' ? 'Mix "EXCEPT", "Odd One Out", and conditional statement questions.' : ''}
Format each as:\nQ: [question]\nA) [option]\nB) [option]\nC) [option]\nD) [option]\nCorrect: [A/B/C/D]`
    };
    
    prompts.push(typePrompts[type] || typePrompts['identification']);
  });
  
  let specialInstruction = '';
  if (specialInstructions && specialInstructions.trim()) {
    specialInstruction = `\n\n🎯 SPECIAL REQUIREMENTS (MUST FOLLOW):\n${specialInstructions}\n\n⚠️ CRITICAL: Apply these requirements to ALL questions. Ensure questions clearly reflect these specifications.`;
  }
  
  return `${prompts.join('\n\n')}${specialInstruction}\n\nStudy Material:\n${shortText}`;
}

// AI-powered answer checking
async function checkAnswerWithAI(userAnswer, correctAnswer, questionText) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: "You are checking if a student's answer is correct. Be lenient with spelling, capitalization, and minor variations. Return ONLY 'CORRECT' or 'INCORRECT' followed by a brief explanation." 
        },
        { 
          role: "user", 
          content: `Question: ${questionText}\nCorrect Answer: ${correctAnswer}\nStudent Answer: ${userAnswer}\n\nIs the student's answer correct?` 
        }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 100
    });

    const response = completion.choices[0].message.content;
    const isCorrect = response.toLowerCase().includes('correct') && !response.toLowerCase().startsWith('incorrect');
    
    return {
      isCorrect,
      explanation: response
    };
  } catch (error) {
    console.error('AI checking error:', error);
    // Fallback to simple comparison
    return {
      isCorrect: userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim(),
      explanation: 'Basic comparison used'
    };
  }
}

router.post('/', verifyToken, async (req, res) => {
  try {
    const { reviewerId, questionTypes, questionType, count, specialInstructions, associationType } = req.body;

    // Accept both questionTypes (array) and questionType (single string)
    let types = questionTypes || (questionType ? [questionType] : null);
    
    // Ensure types is an array
    if (types && !Array.isArray(types)) {
      types = [types];
    }
    
    if (!reviewerId || !types || types.length === 0) {
      console.log('Validation failed:', { reviewerId, questionTypes, questionType, types });
      return res.status(400).json({ error: 'reviewerId and questionType(s) are required' });
    }

    const reviewerDoc = await db.collection('reviewers').doc(reviewerId).get();
    
    if (!reviewerDoc.exists) {
      return res.status(404).json({ error: 'Reviewer not found' });
    }

    const reviewerData = reviewerDoc.data();
    
    if (reviewerData.userId !== req.user.uid) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const extractedText = reviewerData.textExtracted;

    console.log(`Generating questions for types: ${JSON.stringify(types)}`);
    if (specialInstructions) {
      console.log(`Special instructions: ${specialInstructions}`);
    }
    
    const questions = await generateQuestions(
      extractedText, 
      types,
      count || 10,
      specialInstructions || '',
      associationType || 'mix'
    );

    res.json({
      success: true,
      questionTypes: types,
      questions: questions,
      reviewerId: reviewerId
    });

  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// New endpoint for AI answer checking
router.post('/check-answer', verifyToken, async (req, res) => {
  try {
    const { userAnswer, correctAnswer, questionText } = req.body;

    if (!userAnswer || !correctAnswer || !questionText) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await checkAnswerWithAI(userAnswer, correctAnswer, questionText);

    res.json({
      success: true,
      isCorrect: result.isCorrect,
      explanation: result.explanation
    });

  } catch (error) {
    console.error('Answer checking error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;