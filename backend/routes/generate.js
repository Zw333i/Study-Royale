// generate.js
const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { db } = require('../firebase');
const { verifyToken } = require('./auth');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

async function generateQuestions(text, questionTypes, count = 10, specialInstructions = '', questionsData = {}) {
  const prompt = buildPrompt(text, questionTypes, count, specialInstructions, questionsData);

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

function buildPrompt(text, questionTypes, count, specialInstructions, questionsData = {}) {
  const shortText = text.substring(0, 3000);
  
  // Calculate questions per type - use floor to prevent exceeding count
  const typesArray = Array.isArray(questionTypes) ? questionTypes : [questionTypes];
  const questionsPerType = Math.floor(count / typesArray.length);
  const remainder = count % typesArray.length;
  
  let prompts = [];
  
  typesArray.forEach((type, index) => {
    // Add 1 extra question to first types to handle remainder
  const questionsForThisType = questionsPerType + (index < remainder ? 1 : 0);
const typePrompts = {
        'fill-blank': `Create EXACTLY ${questionsForThisType} fill-in-the-blank questions (no more, no less).\nFormat each as:\nQ: [question with blank _____]\nA: [correct answer]`,
        
        'identification': `Create EXACTLY ${questionsForThisType} identification questions (no more, no less). Answers must be SHORT - single words or short phrases (1-3 words maximum), NOT full sentences.\nFormat each as:\nQ: [direct question]\nA: [short answer]`,
        
        'multiple-choice': `Create EXACTLY ${questionsForThisType} multiple choice questions (no more, no less) with 4 options each.\nFormat each as:\nQ: [question]\nA) [option]\nB) [option]\nC) [option]\nD) [option]\nCorrect: [A/B/C/D]`,
        
        'true-false': questionsData.trueFalseVariant === 'conditional' 
          ? `Create EXACTLY ${questionsForThisType} conditional true/false questions (no more, no less).\nFormat each as:\nStatement: If [statement 1] is true, then [statement 2] is:\nAnswer: [True/False/Cannot be determined]\nExplanation: [brief explanation]`
          : `Create EXACTLY ${questionsForThisType} traditional true/false statements (no more, no less).\nFormat each as:\nStatement: [statement]\nAnswer: [True/False]\nExplanation: [brief explanation]`,
        
        'flashcard': `Create EXACTLY ${questionsForThisType} flashcards (no more, no less).\nFormat each as:\nFront: [term/question]\nBack: [definition/answer]`,
        
        'enumeration': `Create EXACTLY ${questionsForThisType} enumeration questions (no more, no less).\nFormat as:\nQ: [question asking to list items]\nA: 1. [item], 2. [item], 3. [item]`,
        
        'matching': `Create EXACTLY ${questionsForThisType} matching pairs (no more, no less).\nFormat as:\nColumn A | Column B\n[term] | [definition]`,
        
        'association': `Create EXACTLY ${questionsForThisType} association questions (no more, no less). 

        ⚠️ CRITICAL FORMAT - USE ROMAN NUMERALS I and II:

        Statement: [characteristic or description]
        I. [first item]
        II. [second item]
        A) If "I" is associated with the statement
        B) If "II" is associated with the statement
        C) If both are associated with the statement
        D) Neither are associated with the statement
        Correct: [A/B/C/D]

        CORRECT Example:
        Statement: Simple topology with manual configuration
        I. Static Routing
        II. Dynamic Routing
        A) If "I" is associated with the statement
        B) If "II" is associated with the statement
        C) If both are associated with the statement
        D) Neither are associated with the statement
        Correct: A

        WRONG Example (DO NOT DO THIS):
        Q: Static Routing
        a. Simple topology
        b. Scalable
        A) Only a
        B) Only b
        Correct: A

        YOU MUST USE "Statement:" "I." and "II." format with capital letters.`,
        
        'case-study': `Create EXACTLY ${questionsForThisType} case study questions (no more, no less). 

        ⚠️ CRITICAL FORMAT - DO NOT USE MULTIPLE CHOICE:

        Scenario: [Write a detailed 2-4 sentence real-world situation or problem]
        Question: [Ask what should be done or analyzed]
        ModelAnswer: [Expected answer content]

        CORRECT Example:
        Scenario: A small business network has 5 computers that need to share files and a printer. The owner wants a simple, cost-effective solution that doesn't require a dedicated IT person to maintain.
        Question: What network topology and equipment would you recommend for this business?
        ModelAnswer: A star topology with a basic switch would be most suitable. This provides centralized management, easy troubleshooting, and allows all devices to communicate efficiently without complex configuration.

        WRONG Example (DO NOT DO THIS):
        Case: A network scenario
        Q: What would you do?
        A) Option 1
        B) Option 2
        Correct: A

        YOU MUST USE "Scenario:" "Question:" and "ModelAnswer:" keywords.`,
        
        'odd-one-out': `Create EXACTLY ${questionsForThisType} "Odd One Out" questions (no more, no less).\nFormat each as:\nQ: Which is the odd one out?\nA) [item]\nB) [item]\nC) [item]\nD) [item]\nCorrect: [A/B/C/D]`,
        
        'except-questions': `Create EXACTLY ${questionsForThisType} "All EXCEPT" questions (no more, no less).\nFormat each as:\nQ: All of the following are [category] EXCEPT:\nA) [option]\nB) [option]\nC) [option]\nD) [option]\nCorrect: [A/B/C/D]`
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
      {
        associationType: req.body.associationType || 'real-association',
        trueFalseVariant: req.body.trueFalseVariant || 'traditional'
      }
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