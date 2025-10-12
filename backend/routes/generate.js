// generate.js
const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const OpenAI = require('openai');
const { db } = require('../firebase');
const { verifyToken } = require('./auth');

if (!Groq) {
    console.error('CRITICAL: Groq SDK not properly imported');
}
if (!OpenAI) {
    console.error('CRITICAL: OpenAI SDK not properly imported');
}

const primaryAI = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const validatorAI = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://study-royale.app",
    "X-Title": "Study Royale Quiz Generator"
  }
});

// COMPLETELY REWRITTEN - Replace entire generateQuestions function
async function generateQuestions(text, questionTypes, count = 10, specialInstructions = '', questionsData = {}) {
  let attempt = 0;
  const maxAttempts = 2;
  
  while (attempt < maxAttempts) {
    attempt++;
    console.log(`\n🔄 ===== ATTEMPT ${attempt}/${maxAttempts} =====`);
    console.log(`🎯 Target: ${count} questions total`);
    console.log(`📝 Types: ${questionTypes.join(', ')}`);
    
    // STEP 1: Generate each question type SEPARATELY instead of all at once
    console.log('\n🤖 STEP 1: GROQ generating questions by type (SEPARATE GENERATION)...');
    
    let allQuestions = '';
    const typesToGenerate = Array.isArray(questionTypes) ? questionTypes : [questionTypes];
    const questionsPerType = Math.floor(count / typesToGenerate.length);
    const remainder = count % typesToGenerate.length;
    
    for (let typeIndex = 0; typeIndex < typesToGenerate.length; typeIndex++) {
      const type = typesToGenerate[typeIndex];
      const questionsForThisType = questionsPerType + (typeIndex < remainder ? 1 : 0);
      
      console.log(`  ➜ Generating ${questionsForThisType} ${type} questions...`);
      
      const singleTypePrompt = buildSingleTypePrompt(text, type, questionsForThisType, specialInstructions, questionsData);
      
      try {
        const completion = await primaryAI.chat.completions.create({
          messages: [
            { 
              role: "system", 
              content: `You are a quiz generator. Generate EXACTLY ${questionsForThisType} ${type} questions in the EXACT format specified. No extra text, no numbering, no section headers. Just the questions.` 
            },
            { role: "user", content: singleTypePrompt }
          ],
          model: "llama-3.3-70b-versatile",
          temperature: 0.7,
          max_tokens: 3000
        });
        
        let typeQuestions = completion.choices[0].message.content;
        
        // Clean up any intro text
        typeQuestions = typeQuestions.replace(/^(Here are|Here's|Below are|I've generated).*?:\s*/i, '');
        typeQuestions = typeQuestions.trim();
        
        allQuestions += typeQuestions + '\n\n';
        console.log(`  ✅ Generated ${questionsForThisType} ${type} questions`);
        
      } catch (error) {
        console.error(`  ❌ Error generating ${type}:`, error.message);
        if (attempt === maxAttempts) {
          throw error;
        }
      }
    }
    
    // STEP 2: Validate what Groq generated
    console.log('\n📊 STEP 2: Validating Groq output...');
    const initialValidation = await validateAndFixQuestions(allQuestions, typesToGenerate, count);
    console.log('📈 Groq generated:', initialValidation.counts);
    
    // STEP 3: If missing questions, use Gemini to fill ONLY the gaps
    console.log('\n🛠️  STEP 3: Checking for missing questions...');
    const missingByType = [];
    
    for (let i = 0; i < typesToGenerate.length; i++) {
      const type = typesToGenerate[i];
      const expected = questionsPerType + (i < remainder ? 1 : 0);
      const actual = initialValidation.counts[type] || 0;
      const diff = expected - actual;
      
      if (diff > 0) {
        missingByType.push({ type, needed: diff, expected, actual });
        console.log(`  ⚠️  Missing ${diff} ${type} questions (have ${actual}, need ${expected})`);
      }
    }
    
    // If we have missing questions, use Gemini to generate ONLY those
    if (missingByType.length > 0) {
      console.log('\n🤖 STEP 3b: GEMINI generating missing questions...');
      
      for (const missing of missingByType) {
        console.log(`  ➜ Gemini generating ${missing.needed} missing ${missing.type} questions...`);
        
        const geminiPrompt = buildGeminiPrompt(text, missing.type, missing.needed);
        
        try {
          const completion = await validatorAI.chat.completions.create({
            model: "google/gemini-flash-1.5",
            messages: [
              { 
                role: "system", 
                content: `Generate EXACTLY ${missing.needed} ${missing.type} questions. Use ONLY the exact format shown. No intro text. No numbering. No headers.` 
              },
              { role: "user", content: geminiPrompt }
            ],
            temperature: 0.4,
            max_tokens: 2500
          });
          
          let newQuestions = completion.choices[0].message.content.trim();
          
          // Aggressive cleanup
          newQuestions = newQuestions.replace(/^(Here are|Here's|Below are|I've|This is|Generate).*?:\s*/gi, '');
          newQuestions = newQuestions.replace(/^(Case Study|Multiple Choice|True\/False|Identification|Odd One Out|Enumeration|Matching|Association|Flashcard|Fill|Except).*?\n/gim, '');
          newQuestions = newQuestions.trim();
          
          console.log(`  ✅ Gemini generated ${missing.needed} ${missing.type} questions`);
          allQuestions += '\n\n' + newQuestions + '\n\n';
          
        } catch (error) {
          console.error(`  ❌ Gemini generation failed for ${missing.type}:`, error.message);
        }
      }
    }
    
    // STEP 4: Final validation
    console.log('\n✅ STEP 4: Final validation...');
    const finalValidation = await validateAndFixQuestions(allQuestions, typesToGenerate, count);
    console.log('📊 Final counts:', finalValidation.counts);
    
    if (finalValidation.isValid) {
      console.log('🎉 SUCCESS! All questions validated.');
      console.log(`📝 Total generated: ${Object.values(finalValidation.counts).reduce((a, b) => a + b, 0)} questions`);
      return allQuestions;
    } else {
      console.warn(`⚠️  Validation has issues:`, finalValidation.issues);
      
      if (attempt === maxAttempts) {
        console.log('📋 Max attempts reached. Returning best effort result.');
        return allQuestions;
      }
      
      console.log('🔄 Retrying with stronger instructions...');
      continue;
    }
  }
}

// NEW: Generate single question type at a time
function buildSingleTypePrompt(text, questionType, count, specialInstructions = '', questionsData = {}) {
  const shortText = text.substring(0, 3000);
  
  const prompts = {
    'fill-blank': `Generate EXACTLY ${count} fill-in-the-blank questions.

FORMAT (MANDATORY - NO NUMBERING):
Q: [question with blank _____]
A: [correct answer]

Study material: ${shortText}

Generate now:`,

    'identification': `Generate EXACTLY ${count} identification questions.

FORMAT (MANDATORY - NO NUMBERING):
Q: [question]
A: [1-3 word answer]

Study material: ${shortText}

Generate now:`,

    'multiple-choice': `Generate EXACTLY ${count} multiple choice questions.

FORMAT (MANDATORY - NO NUMBERING):
Q: [question]
A) [option]
B) [option]
C) [option]
D) [option]
Correct: [A/B/C/D]

Study material: ${shortText}

Generate now:`,

    'true-false': questionsData.trueFalseVariant === 'conditional'
      ? `Generate EXACTLY ${count} conditional true/false questions.

FORMAT (MANDATORY - NO NUMBERING):
Statement: If [condition 1] is true, then [condition 2] is:
Answer: [True/False/Cannot be determined]
Explanation: [brief]

Study material: ${shortText}

Generate now:`
      : `Generate EXACTLY ${count} true/false questions.

FORMAT (MANDATORY - NO NUMBERING):
Statement: [statement]
Answer: [True/False]
Explanation: [brief]

Study material: ${shortText}

Generate now:`,

    'flashcard': `Generate EXACTLY ${count} flashcards.

FORMAT (MANDATORY - NO NUMBERING):
Front: [term/question]
Back: [definition/answer]

Study material: ${shortText}

Generate now:`,

    'enumeration': `Generate EXACTLY ${count} enumeration questions.

FORMAT (MANDATORY - NO NUMBERING):
Q: [question asking to list items]
A: 1. [item], 2. [item], 3. [item]

Study material: ${shortText}

Generate now:`,

'matching': `Generate EXACTLY ${questionsForThisType} matching pairs.

FORMAT (MANDATORY - MUST INCLUDE HEADER):
Column A | Column B
term1 | definition1
term2 | definition2
term3 | definition3

CRITICAL: Always start with "Column A | Column B" header line first, then list pairs below.
Do not skip the header.

Generate now:

Study material: ${shortText}

Generate now:`,

    'association': `Generate EXACTLY ${count} association questions.

FORMAT (MANDATORY - NO NUMBERING):
Statement: [characteristic]
I. [item]
II. [item]
A) If "I" is associated
B) If "II" is associated
C) If both are associated
D) Neither are associated
Correct: [A/B/C/D]

Study material: ${shortText}

Generate now:`,

    'case-study': `Generate EXACTLY ${count} case study questions.

FORMAT (MANDATORY - NO NUMBERING - NO BULLETS):
Scenario: [2-4 sentence situation]
Question: [what should be done?]
ModelAnswer: [2-3 sentence answer]

Repeat this pattern ${count} times with different scenarios.

Study material: ${shortText}

Generate now:`,

    'odd-one-out': `Generate EXACTLY ${count} odd one out questions.

FORMAT (MANDATORY - NO NUMBERING):
Q: Which is the odd one out?
A) [item]
B) [item]
C) [item]
D) [item]
Correct: [A/B/C/D]

Study material: ${shortText}

Generate now:`,

    'except-questions': `Generate EXACTLY ${count} EXCEPT questions.

FORMAT (MANDATORY - NO NUMBERING):
Q: All of the following are [category] EXCEPT:
A) [option]
B) [option]
C) [option]
D) [option]
Correct: [A/B/C/D]

Study material: ${shortText}

Generate now:`
  };
  
  const base = prompts[questionType] || prompts['identification'];
  
  if (specialInstructions && specialInstructions.trim()) {
    return base + `\n\nADDITIONAL REQUIREMENT: ${specialInstructions}`;
  }
  
  return base;
}

function buildPrompt(text, questionTypes, count, specialInstructions, questionsData = {}, attempt = 1) {
  const shortText = text.substring(0, 3000);
  
  const typesArray = Array.isArray(questionTypes) ? questionTypes : [questionTypes];
  const questionsPerType = Math.floor(count / typesArray.length);
  const remainder = count % typesArray.length;
  
  let prompts = [];
  
  let breakdown = `\n📋 QUESTION DISTRIBUTION (MUST FOLLOW EXACTLY):\n`;
  typesArray.forEach((type, index) => {
    const questionsForThisType = questionsPerType + (index < remainder ? 1 : 0);
    breakdown += `- ${type.toUpperCase()}: ${questionsForThisType} questions\n`;
  });
  breakdown += `TOTAL: ${count} questions\n\n`;
  
  typesArray.forEach((type, index) => {
    const questionsForThisType = questionsPerType + (index < remainder ? 1 : 0);
    
    const typePrompts = {
        'fill-blank': `
═══════════════════════════════════════════════════
SECTION ${index + 1}: FILL IN THE BLANK (${questionsForThisType} QUESTIONS)
═══════════════════════════════════════════════════

Create EXACTLY ${questionsForThisType} fill-in-the-blank questions.

FORMAT (MANDATORY):
Q: [question with blank _____]
A: [correct answer]

EXAMPLE:
Q: _____ routing is best for small networks.
A: Static`,

        'identification': `
═══════════════════════════════════════════════════
SECTION ${index + 1}: IDENTIFICATION (${questionsForThisType} QUESTIONS)
═══════════════════════════════════════════════════

Create EXACTLY ${questionsForThisType} identification questions.

FORMAT (MANDATORY):
Q: [direct question]
A: [short answer - 1-3 words max]

EXAMPLE:
Q: What routing method requires manual configuration?
A: Static routing`,

        'multiple-choice': `
═══════════════════════════════════════════════════
SECTION ${index + 1}: MULTIPLE CHOICE (${questionsForThisType} QUESTIONS)
═══════════════════════════════════════════════════

Create EXACTLY ${questionsForThisType} multiple choice questions.

FORMAT (MANDATORY):
Q: [question]
A) [option]
B) [option]
C) [option]
D) [option]
Correct: [A/B/C/D]

EXAMPLE:
Q: Which routing protocol is distance-vector?
A) OSPF
B) RIP
C) IS-IS
D) BGP
Correct: B`,

        'true-false': questionsData.trueFalseVariant === 'conditional' 
          ? `
═══════════════════════════════════════════════════
SECTION ${index + 1}: TRUE/FALSE CONDITIONAL (${questionsForThisType} QUESTIONS)
═══════════════════════════════════════════════════

Create EXACTLY ${questionsForThisType} conditional true/false questions.

FORMAT (MANDATORY):
Statement: If [statement 1] is true, then [statement 2] is:
Answer: [True/False/Cannot be determined]
Explanation: [brief explanation]`
          : `
═══════════════════════════════════════════════════
SECTION ${index + 1}: TRUE/FALSE (${questionsForThisType} QUESTIONS)
═══════════════════════════════════════════════════

Create EXACTLY ${questionsForThisType} true/false statements.

FORMAT (MANDATORY):
Statement: [statement]
Answer: [True/False]
Explanation: [brief explanation]

EXAMPLE:
Statement: Static routing updates automatically.
Answer: False
Explanation: Static routing requires manual configuration.`,

        'flashcard': `
═══════════════════════════════════════════════════
SECTION ${index + 1}: FLASHCARDS (${questionsForThisType} QUESTIONS)
═══════════════════════════════════════════════════

Create EXACTLY ${questionsForThisType} flashcards.

FORMAT (MANDATORY):
Front: [term/question]
Back: [definition/answer]

EXAMPLE:
Front: Static Routing
Back: Manual route configuration suitable for small networks`,

        'enumeration': `
═══════════════════════════════════════════════════
SECTION ${index + 1}: ENUMERATION (${questionsForThisType} QUESTIONS)
═══════════════════════════════════════════════════

Create EXACTLY ${questionsForThisType} enumeration questions.

FORMAT (MANDATORY):
Q: [question asking to list items]
A: 1. [item], 2. [item], 3. [item]

EXAMPLE:
Q: List three types of routing protocols.
A: 1. RIP, 2. OSPF, 3. EIGRP`,

        'matching': `
═══════════════════════════════════════════════════
SECTION ${index + 1}: MATCHING (${questionsForThisType} PAIRS)
═══════════════════════════════════════════════════

Create EXACTLY ${questionsForThisType} matching pairs.

FORMAT (MANDATORY):
Column A | Column B
[term] | [definition]

CRITICAL: The first line MUST be "Column A | Column B" - NEVER skip this header!`,

        'association': `
═══════════════════════════════════════════════════
SECTION ${index + 1}: ASSOCIATION (${questionsForThisType} QUESTIONS)
═══════════════════════════════════════════════════

Create EXACTLY ${questionsForThisType} association questions.

FORMAT (MANDATORY - USE ROMAN NUMERALS I and II):
Statement: [characteristic or description]
I. [first item]
II. [second item]
A) If "I" is associated with the statement
B) If "II" is associated with the statement
C) If both are associated with the statement
D) Neither are associated with the statement
Correct: [A/B/C/D]

EXAMPLE:
Statement: Suitable for small networks
I. Static Routing
II. Dynamic Routing
A) If "I" is associated with the statement
B) If "II" is associated with the statement
C) If both are associated with the statement
D) Neither are associated with the statement
Correct: A`,

        'case-study': `
═══════════════════════════════════════════════════
SECTION ${index + 1}: CASE STUDY (${questionsForThisType} QUESTIONS)
═══════════════════════════════════════════════════

Create EXACTLY ${questionsForThisType} case study questions.

FORMAT (MANDATORY - NO MULTIPLE CHOICE):
Scenario: [2-4 sentence real-world situation]
Question: [What should be done/analyzed?]
ModelAnswer: [2-3 sentence expected answer]

DO NOT USE: Multiple choice (A/B/C/D), "Case:", "Q:", "A:", numbering (1., 2., etc.)
ONLY use: "Scenario:", "Question:", "ModelAnswer:" (exactly these labels)

EXAMPLE:
Scenario: A small business network has 5 computers that need to share files and a printer. The owner wants a simple, cost-effective solution that doesn't require a dedicated IT person to maintain.
Question: What network topology and equipment would you recommend for this business?
ModelAnswer: A star topology with a basic switch would be most suitable. This provides centralized management, easy troubleshooting, and allows all devices to communicate efficiently without complex configuration.`,

        'odd-one-out': `
═══════════════════════════════════════════════════
SECTION ${index + 1}: ODD ONE OUT (${questionsForThisType} QUESTIONS)
═══════════════════════════════════════════════════

Create EXACTLY ${questionsForThisType} "Odd One Out" questions.

FORMAT (MANDATORY):
Q: Which is the odd one out?
A) [item]
B) [item]
C) [item]
D) [item]
Correct: [A/B/C/D]

EXAMPLE:
Q: Which is the odd one out?
A) RIP
B) OSPF
C) Static Routing
D) EIGRP
Correct: C`,

        'except-questions': `
═══════════════════════════════════════════════════
SECTION ${index + 1}: ALL EXCEPT (${questionsForThisType} QUESTIONS)
═══════════════════════════════════════════════════

Create EXACTLY ${questionsForThisType} "All EXCEPT" questions.

FORMAT (MANDATORY):
Q: All of the following are [category] EXCEPT:
A) [option]
B) [option]
C) [option]
D) [option]
Correct: [A/B/C/D]

EXAMPLE:
Q: All of the following are dynamic routing protocols EXCEPT:
A) RIP
B) OSPF
C) Static Routing
D) EIGRP
Correct: C`
      };
      
      prompts.push(typePrompts[type] || typePrompts['identification']);
    });
    
  let specialInstruction = '';
  if (specialInstructions && specialInstructions.trim()) {
    specialInstruction = `\n\n🎯 SPECIAL REQUIREMENTS (APPLY TO ALL SECTIONS):\n${specialInstructions}\n`;
  }
  
  const warningMessage = attempt > 1 
    ? `\n\n⚠️⚠️⚠️ CRITICAL WARNING - ATTEMPT ${attempt} ⚠️⚠️⚠️\nPrevious attempt failed validation! You MUST:\n- Generate ALL ${typesArray.length} question types\n- Create EXACTLY the specified number for EACH type\n- Follow the FORMAT precisely for EACH section\n- Complete ALL sections before finishing\n⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️\n\n`
    : '';
  
  return `${warningMessage}${breakdown}${prompts.join('\n\n')}${specialInstruction}\n\n📚 STUDY MATERIAL:\n${shortText}\n\n✅ REMEMBER: Generate ALL ${typesArray.length} sections with EXACTLY the quantities specified!`;
}

// Validate and count questions
async function validateAndFixQuestions(text, expectedTypes, expectedCount) {
  const lines = text.split('\n').filter(line => line.trim());
  
  const questionCounts = {
    'case-study': 0,
    'multiple-choice': 0,
    'true-false': 0,
    'association': 0,
    'identification': 0,
    'enumeration': 0,
    'matching': 0,
    'flashcard': 0,
    'fill-blank': 0,
    'odd-one-out': 0,
    'except-questions': 0
  };
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // Count case studies (NEW FORMAT)
    if (line.startsWith('Scenario:')) {
      const questionLine = lines[i + 1];
      const answerLine = lines[i + 2];
      if (questionLine && questionLine.startsWith('Question:') && 
          answerLine && answerLine.startsWith('ModelAnswer:')) {
        questionCounts['case-study']++;
        i += 3;
        continue;
      }
    }
    
    // Count case studies (OLD FORMAT)
    if (line.startsWith('Case:')) {
      questionCounts['case-study']++;
      i++;
      continue;
    }
    
    // Count associations
    if (line.startsWith('Statement:') && !lines[i + 1]?.startsWith('Answer:')) {
      const hasRomanNumerals = lines[i + 1]?.startsWith('I.') && lines[i + 2]?.startsWith('II.');
      if (hasRomanNumerals) {
        questionCounts['association']++;
        i += 7;
        continue;
      }
    }
    
    // Count True/False
    if (line.startsWith('Statement:') && lines[i + 1]?.startsWith('Answer:')) {
      questionCounts['true-false']++;
      i += 2;
      continue;
    }
    
    if (line.startsWith('Column A |')) {
        questionCounts['matching']++;
        i++;
        continue;
    } else if (line.includes(' | ') && !line.startsWith('Q:') && !line.startsWith('A)') && 
              !line.startsWith('Statement:') && !line.startsWith('Scenario:')) {
        questionCounts['matching']++;
        i++;
        continue;
    }
    
    // Count flashcards
    if (line.startsWith('Front:')) {
      questionCounts['flashcard']++;
      i += 2;
      continue;
    }
    
    // Count odd-one-out (BEFORE generic Q:)
    if (line.startsWith('Q: Which is the odd one out?')) {
      questionCounts['odd-one-out']++;
      i += 6;
      continue;
    }
    
    // Count except-questions
    if (line.includes('EXCEPT:')) {
      questionCounts['except-questions']++;
      i += 6;
      continue;
    }
    
    // Count multiple choice
    if (line.startsWith('Q:')) {
      const nextFewLines = lines.slice(i + 1, i + 6).join('\n');
      const hasOptions = nextFewLines.match(/^[A-D]\)/m);
      const hasCorrect = nextFewLines.includes('Correct:');
      
      if (hasOptions && hasCorrect) {
        questionCounts['multiple-choice']++;
        i += 6;
        continue;
      } else {
        // Identification or enumeration
        const answerLine = lines[i + 1];
        if (answerLine && answerLine.startsWith('A:')) {
        const answer = answerLine.substring(2).trim();
        const isEnumeration = answer.match(/^\d+\.\s/) || 
                              (answer.includes(',') && answer.split(',').length >= 2);
        if (isEnumeration) {
            questionCounts['enumeration']++;
        } else {
            questionCounts['identification']++;
        }
          i += 2;
          continue;
        }
      }
    }
    
    i++;
  }
  
  // Show validation breakdown
  const typesArray = Array.isArray(expectedTypes) ? expectedTypes : [expectedTypes];
  const questionsPerType = Math.floor(expectedCount / typesArray.length);

  console.log('📋 VALIDATION BREAKDOWN:');
  const issues = [];
  
  typesArray.forEach((type, idx) => {
    const expected = questionsPerType + (idx < (expectedCount % typesArray.length) ? 1 : 0);
    const actual = questionCounts[type] || 0;
    const status = actual === expected ? '✅' : (actual === 0 ? '❌ MISSING' : `⚠️  ${actual}/${expected}`);
    console.log(`  ${type}: ${status}`);
    
    if (actual === 0) {
      issues.push(`Missing all ${type} questions (expected ${expected})`);
    } else if (actual !== expected) {
      issues.push(`${type}: got ${actual}, expected ${expected}`);
    }
  });
  
  return {
    isValid: issues.length === 0,
    issues: issues,
    counts: questionCounts
  };
}

async function geminiGenerateMissingQuestions(originalText, groqQuestions, expectedTypes, expectedCount, validation) {
  const questionsPerType = Math.floor(expectedCount / expectedTypes.length);
  const fixNeeded = [];
  
  // Find what's missing
  for (let i = 0; i < expectedTypes.length; i++) {
    const type = expectedTypes[i];
    const expected = questionsPerType + (i < (expectedCount % expectedTypes.length) ? 1 : 0);
    const actual = validation.counts[type] || 0;
    const diff = expected - actual;
    
    if (diff > 0) {
      fixNeeded.push({ type, needed: diff, expected, actual });
    }
  }
  
  if (fixNeeded.length === 0) {
    console.log('✅ No missing questions! Groq generated correctly.');
    return groqQuestions;
  }
  
  console.log('🚨 Missing questions detected:', fixNeeded.map(f => `${f.type}: ${f.needed}`).join(', '));
  
  let fixedQuestions = groqQuestions;
  
  // Generate each missing type
  for (const fix of fixNeeded) {
    console.log(`\n🤖 GEMINI generating ${fix.needed} ${fix.type} questions...`);
    
    const geminiPrompt = buildGeminiPrompt(originalText, fix.type, fix.needed);
    
    try {
      const completion = await validatorAI.chat.completions.create({
        model: "google/gemini-flash-1.5",
        messages: [
          { 
            role: "system", 
            content: `You are a precise question generator. Generate EXACTLY the number requested in the EXACT format shown. No extra text, no explanations, no section headers, just the questions in the exact format.` 
          },
          { role: "user", content: geminiPrompt }
        ],
        temperature: 0.4,
        max_tokens: 3000
      });
      
      let newQuestions = completion.choices[0].message.content.trim();

      newQuestions = newQuestions.replace(/^(Here are|Here's|Below are|I've generated).*?:\s*/i, '');
      newQuestions = newQuestions.replace(/^(Case Study Questions?|Odd One Out Questions?).*?\n/gim, '');

      if (fix.type === 'matching' && !newQuestions.startsWith('Column A |')) {
          newQuestions = 'Column A | Column B\n' + newQuestions;
      }
      
      console.log('📋 GEMINI RAW OUTPUT:');
      console.log(newQuestions);
      
      // Verify Gemini actually generated the right amount
      const geminiLines = newQuestions.split('\n').filter(l => l.trim());
      let geminiCount = 0;
      
      // Count what Gemini generated
      if (fix.type === 'odd-one-out') {
        geminiCount = geminiLines.filter(l => l.startsWith('Q: Which is the odd one out?') || l.match(/^Q:.*odd one out/i)).length;
      } else if (fix.type === 'case-study') {
        geminiCount = geminiLines.filter(l => l.startsWith('Scenario:')).length;
      } else if (fix.type === 'multiple-choice') {
        geminiCount = geminiLines.filter(l => l.startsWith('Q:') && !l.includes('odd one out')).length;
      } else if (fix.type === 'except-questions') {
        geminiCount = geminiLines.filter(l => l.includes('EXCEPT:')).length;
      } else if (fix.type === 'identification') {
        let i = 0;
        while (i < geminiLines.length) {
          if (geminiLines[i].startsWith('Q:') && geminiLines[i + 1]?.startsWith('A:')) {
            geminiCount++;
            i += 2;
          } else {
            i++;
          }
        }
      }
      
      console.log(`✅ GEMINI generated ${geminiCount} ${fix.type} questions (requested: ${fix.needed})`);
      
      if (geminiCount < fix.needed) {
        console.warn(`⚠️ GEMINI only generated ${geminiCount}/${fix.needed} questions!`);
      }
      
      // Append to main questions with clear separator
      fixedQuestions += '\n\n' + newQuestions + '\n';
      
    } catch (error) {
      console.error(`❌ GEMINI generation failed for ${fix.type}:`, error.message);
    }
  }
  
  console.log('\n📊 FINAL COMBINED OUTPUT LENGTH:', fixedQuestions.length, 'characters');
  return fixedQuestions;
}

function buildGeminiPrompt(text, questionType, count) {
  const shortText = text.substring(0, 2500);
  
  // Cleaner, simpler prompts that Gemini can handle
  const prompts = {
    'case-study': `You must generate EXACTLY ${count} case study questions. Use only this format with NO numbering, NO bullets, NO headers:

Scenario: [situation description]
Question: [what to do/analyze]
ModelAnswer: [answer]

Repeat ${count} times.

Material: ${shortText}`,

    'odd-one-out': `Generate EXACTLY ${count} odd one out questions. Use only this format with NO numbering:

Q: Which is the odd one out?
A) [item]
B) [item]
C) [item]
D) [item]
Correct: [letter]

Repeat ${count} times.

Material: ${shortText}`,

    'multiple-choice': `Generate EXACTLY ${count} multiple choice questions. Use only this format with NO numbering:

Q: [question]
A) [option]
B) [option]
C) [option]
D) [option]
Correct: [letter]

Repeat ${count} times.

Material: ${shortText}`,

    'identification': `Generate EXACTLY ${count} identification questions. Use only this format with NO numbering:

Q: [question]
A: [1-3 word answer]

Repeat ${count} times.

Material: ${shortText}`,

    'true-false': `Generate EXACTLY ${count} true/false questions. Use only this format with NO numbering:

Statement: [statement]
Answer: [True or False]
Explanation: [brief reason]

Repeat ${count} times.

Material: ${shortText}`,

    'association': `Generate EXACTLY ${count} association questions. Use only this format with NO numbering:

Statement: [description]
I. [first item]
II. [second item]
A) If "I" is associated
B) If "II" is associated  
C) If both are associated
D) Neither are associated
Correct: [letter]

Repeat ${count} times.

Material: ${shortText}`,

    'enumeration': `Generate EXACTLY ${count} enumeration questions. Use only this format with NO numbering:

Q: [question asking to list]
A: 1. [item], 2. [item], 3. [item]

Repeat ${count} times.

Material: ${shortText}`,

    'flashcard': `Generate EXACTLY ${count} flashcards. Use only this format with NO numbering:

Front: [term or question]
Back: [definition or answer]

Repeat ${count} times.

Material: ${shortText}`,

'matching': `You MUST generate EXACTLY ${count} matching pairs. 

CRITICAL FORMATTING RULES:
1. ALWAYS start with this exact line first: Column A | Column B
2. Then list each pair on a new line with format: term | definition
3. NO extra text, NO numbering, NO sections

EXAMPLE OUTPUT:
Column A | Column B
Static Routing | Manual route configuration
Dynamic Routing | Automatic route learning
RIP | Distance vector protocol
OSPF | Link state protocol

NOW GENERATE EXACTLY ${count} PAIRS:`,

    'except-questions': `Generate EXACTLY ${count} EXCEPT questions. Use only this format with NO numbering:

Q: All of the following are [category] EXCEPT:
A) [option]
B) [option]
C) [option]
D) [option]
Correct: [letter]

Repeat ${count} times.

Material: ${shortText}`,

    'fill-blank': `Generate EXACTLY ${count} fill-in-the-blank questions. Use only this format with NO numbering:

Q: [question with _____]
A: [answer]

Repeat ${count} times.

Material: ${shortText}`
  };
  
  return prompts[questionType] || prompts['identification'];
}

// groq for checking
async function checkAnswerWithAI(userAnswer, correctAnswer, questionText) {
  try {
    const completion = await primaryAI.chat.completions.create({
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
    const userLower = userAnswer.toLowerCase().trim();
    const correctLower = correctAnswer.toLowerCase().trim();
    return userLower === correctLower || userAnswer.trim() === correctAnswer.trim();
  }
}

// API Routes
router.post('/', verifyToken, async (req, res) => {
  try {
    const { reviewerId, questionTypes, questionType, count, specialInstructions, associationType } = req.body;

    let types = questionTypes || (questionType ? [questionType] : null);
    
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

    console.log(`\n📝 Generating questions for types: ${JSON.stringify(types)}`);
    if (specialInstructions) {
      console.log(`🎯 Special instructions: ${specialInstructions}`);
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