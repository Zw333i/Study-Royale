// routes/importedQuiz.js
const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const OpenAI = require('openai');
const { db, FieldValue } = require('../firebase');
const { verifyToken } = require('./auth');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://study-royale.app',
    'X-Title': 'Study Royale Quiz Import'
  }
});
const OPENROUTER_MODEL = process.env.OPENROUTER_IMPORT_MODEL || 'google/gemini-flash-1.5';

function parseQuestionsWithoutAI(questionsText, type) {
  const lines = questionsText
    .split(/\r?\n/)
    .map(line => line.trim().replace(/^\d+[.)]\s*/, ''))
    .filter(Boolean);
  const questions = [];

  for (let i = 0; i < lines.length; i++) {
    const questionLine = lines[i].match(/^(?:Q|Question):\s*(.+)$/i);
    const statementLine = lines[i].match(/^Statement:\s*(.+)$/i);

    if (questionLine) {
      const question = questionLine[1].trim();
      const options = [];
      let answer = '';
      let answerIndex = i + 1;

      for (; answerIndex < lines.length; answerIndex++) {
        const line = lines[answerIndex];
        if (/^(?:Q|Question|Statement):/i.test(line)) break;
        if (/^[A-D][.)]\s*/i.test(line)) {
          options.push(line);
        } else if (/^(?:A|Answer|Correct):\s*/i.test(line)) {
          answer = line.replace(/^(?:A|Answer|Correct):\s*/i, '').trim();
          break;
        }
      }

      if (!answer) continue;
      if (options.length >= 2 && type === 'multiple-choice') {
        questions.push({ question, options, correctAnswer: answer, type });
      } else if (type === 'enumeration') {
        questions.push({ question, answer, type });
      } else {
        questions.push({ question, answer, type: question.includes('_____') ? 'fill-blank' : type });
      }
      i = answerIndex;
      continue;
    }

    if (statementLine && type === 'true-false') {
      const answerLine = lines[i + 1]?.match(/^(?:A|Answer|Correct):\s*(.+)$/i);
      if (answerLine) {
        questions.push({ statement: statementLine[1].trim(), answer: answerLine[1].trim(), type });
        i++;
      }
    }
  }

  return questions;
}

// Use AI to parse and normalize questions
async function normalizeQuestionsWithAI(questionsText, type, associationType = 'mix') {
  const prompts = {
    'multiple-choice': `Parse the following text into multiple choice questions. Extract each question, its options (A, B, C, D), and the correct answer. Return ONLY valid JSON array with this exact format:
[{"question": "question text", "options": ["A) option1", "B) option2", "C) option3", "D) option4"], "correctAnswer": "A", "type": "multiple-choice"}]

Text to parse:
${questionsText}`,

    'identification': `Parse the following text into identification/fill-in-the-blank questions. Extract each question and its answer. Return ONLY valid JSON array with this exact format:
[{"question": "question text", "answer": "correct answer", "type": "identification"}]

Text to parse:
${questionsText}`,

    'true-false': `Parse the following text into true/false statements. Extract each statement and whether it's true or false. Return ONLY valid JSON array with this exact format:
[{"statement": "statement text", "answer": "True", "type": "true-false"}]

Text to parse:
${questionsText}`,

    'enumeration': `Parse the following text into enumeration questions. Extract each question and the list of correct answers. Return ONLY valid JSON array with this exact format:
[{"question": "question text", "answer": "item1, item2, item3", "type": "enumeration"}]

Text to parse:
${questionsText}`,

    'association': `Parse the following text into association questions. These are "${associationType}" type questions.
${associationType === 'except' ? 'Look for questions asking "All are X EXCEPT:" or "All of the following EXCEPT:"' : ''}
${associationType === 'odd-one-out' ? 'Look for questions asking "Which does NOT belong?" or "Which is the odd one out?"' : ''}
${associationType === 'mix' ? 'Look for both "EXCEPT" questions and "Which does NOT belong" questions.' : ''}

Extract each question, options, and the correct answer (the one that does NOT belong or is the exception). Return ONLY valid JSON array with this exact format:
[{"question": "question text", "options": ["A) option1", "B) option2", "C) option3", "D) option4"], "correctAnswer": "A", "type": "association"}]

Text to parse:
${questionsText}`
  };

  const messages = [
    {
      role: 'system',
      content: 'You are a quiz parser. You MUST return ONLY valid JSON array, no other text. Extract all questions from the input text no matter the format.'
    },
    { role: 'user', content: prompts[type] || prompts['multiple-choice'] }
  ];

  let completion;
  let lastError;
  const providers = [
    {
      name: 'Groq',
      client: groq,
      model: GROQ_MODEL
    },
    {
      name: 'OpenRouter',
      client: openrouter,
      model: OPENROUTER_MODEL
    }
  ];

  for (const provider of providers) {
    try {
      if (!provider.client.apiKey) {
        continue;
      }

      completion = await provider.client.chat.completions.create({
        messages,
        model: provider.model,
        temperature: 0.1,
        max_tokens: 3000
      });
      break;
    } catch (error) {
      lastError = error;
      console.error(`${provider.name} import parsing error:`, error.message);
    }
  }

  if (!completion) {
    const localQuestions = parseQuestionsWithoutAI(questionsText, type);
    if (localQuestions.length > 0) {
      console.log(`AI unavailable; parsed ${localQuestions.length} ${type} questions locally`);
      return localQuestions;
    }
    throw new Error(`AI parsing unavailable: ${lastError?.message || 'No AI provider is configured'}`);
  }

  try {

    const response = completion.choices?.[0]?.message?.content?.trim();
    if (!response) {
      throw new Error('AI returned an empty response');
    }
    
    // Extract JSON from response (in case there's extra text)
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in AI response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('AI returned no questions');
    }
    return parsed;
  } catch (error) {
    console.error('AI parsing error:', error);
    const localQuestions = parseQuestionsWithoutAI(questionsText, type);
    if (localQuestions.length > 0) {
      console.log(`AI returned an invalid format; parsed ${localQuestions.length} ${type} questions locally`);
      return localQuestions;
    }
    throw new Error('Failed to parse questions with AI: ' + error.message);
  }
}

// POST /api/imported-quiz - Save imported quiz (with AI parsing)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, type, questionsText, associationType } = req.body;
    const userId = req.user.uid;

    if (!title || !type || !questionsText) {
      return res.status(400).json({ error: 'Title, type, and questions are required' });
    }

    // Use AI to parse questions
    console.log(`Parsing ${type} questions with AI...`);
    if (type === 'association') {
      console.log(`Association type: ${associationType || 'mix'}`);
    }
    
    const questions = await normalizeQuestionsWithAI(questionsText, type, associationType || 'mix');

    if (!questions || questions.length === 0) {
      return res.status(400).json({ error: 'No valid questions could be extracted' });
    }

    const docRef = await db.collection('importedQuizzes').add({
      userId: userId,
      title: title,
      type: type,
      questions: questions,
      associationType: associationType || null,
      createdAt: FieldValue.serverTimestamp(),
      uploadDate: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Quiz imported successfully',
      quizId: docRef.id,
      title: title,
      questionCount: questions.length
    });

  } catch (error) {
    console.error('Import quiz error:', error);
    const status = error.message.startsWith('AI parsing') || error.message.startsWith('Failed to parse')
      ? 503
      : 500;
    res.status(status).json({ error: error.message });
  }
});

// GET /api/imported-quiz - Get all imported quizzes for user
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid;

    const quizzesSnapshot = await db.collection('importedQuizzes')
      .where('userId', '==', userId)
      .get();

    const quizzes = [];
    quizzesSnapshot.forEach(doc => {
      const data = doc.data();
      quizzes.push({
        id: doc.id,
        title: data.title,
        type: data.type,
        questions: data.questions,
        uploadDate: data.uploadDate,
        createdAt: data.createdAt
      });
    });

    // Sort by upload date (newest first)
    quizzes.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

    res.json({
      success: true,
      quizzes: quizzes
    });

  } catch (error) {
    console.error('Get imported quizzes error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/imported-quiz/:id - Delete imported quiz
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const quizId = req.params.id;
    const userId = req.user.uid;

    const quizDoc = await db.collection('importedQuizzes').doc(quizId).get();

    if (!quizDoc.exists) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const quizData = quizDoc.data();
    
    // Verify ownership
    if (quizData.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await db.collection('importedQuizzes').doc(quizId).delete();

    res.json({
      success: true,
      message: 'Imported quiz deleted successfully'
    });

  } catch (error) {
    console.error('Delete imported quiz error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;