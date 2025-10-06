//upload.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { db, admin } = require('../firebase');
const { verifyToken } = require('./auth');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOCX, and TXT files are allowed'));
    }
  }
});

// Extract text from different file types
async function extractText(filePath, fileType) {
  try {
    if (fileType === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } else if (fileType === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } else if (fileType === '.txt') {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch (error) {
    throw new Error(`Failed to extract text: ${error.message}`);
  }
}

// POST /api/upload - Single file upload
router.post('/', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { examDate } = req.body;
    const userId = req.user.uid;
    
    if (!examDate) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'examDate is required' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileType = path.extname(fileName).toLowerCase();

    // Extract text from file
    console.log('Extracting text from file...');
    const extractedText = await extractText(filePath, fileType);

    if (!extractedText || extractedText.trim().length < 50) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ 
        error: 'File contains insufficient text content (minimum 50 characters required)' 
      });
    }

    // Save to Firestore
    console.log('Saving to Firestore...');
    const docRef = await db.collection('reviewers').add({
      userId: userId,
      fileName: fileName,
      textExtracted: extractedText,
      uploadDate: new Date().toISOString(),
      examDate: examDate,
      fileSize: req.file.size,
      fileType: fileType,
      textLength: extractedText.length,
      isMerged: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Delete local file
    fs.unlinkSync(filePath);
    console.log('File processed and deleted locally');

    res.json({
      success: true,
      message: 'File uploaded and processed successfully',
      reviewerId: docRef.id,
      fileName: fileName,
      textLength: extractedText.length
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: error.message });
  }
});

// POST /api/upload-merged - Multiple files merged upload
router.post('/upload-merged', verifyToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { examDate } = req.body;
    const userId = req.user.uid;
    
    if (!examDate) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
      return res.status(400).json({ error: 'examDate is required' });
    }

    let mergedText = '';
    let fileNames = [];
    let totalSize = 0;

    // Extract and merge text from all files
    for (const file of req.files) {
      const filePath = file.path;
      const fileName = file.originalname;
      const fileType = path.extname(fileName).toLowerCase();

      console.log(`Extracting text from ${fileName}...`);
      const extractedText = await extractText(filePath, fileType);

      if (extractedText && extractedText.trim().length >= 50) {
        mergedText += `\n\n===== ${fileName} =====\n\n${extractedText}`;
        fileNames.push(fileName);
        totalSize += file.size;
      }

      // Delete local file
      fs.unlinkSync(filePath);
    }

    if (mergedText.trim().length < 50) {
      return res.status(400).json({ 
        error: 'Combined files contain insufficient text content' 
      });
    }

    // Save merged content to Firestore
    console.log('Saving merged files to Firestore...');
    const docRef = await db.collection('reviewers').add({
      userId: userId,
      fileName: `Merged: ${fileNames.join(', ')}`,
      textExtracted: mergedText,
      uploadDate: new Date().toISOString(),
      examDate: examDate,
      fileSize: totalSize,
      fileType: 'merged',
      textLength: mergedText.length,
      isMerged: true,
      fileCount: fileNames.length,
      mergedFileNames: fileNames,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('Merged files processed successfully');

    res.json({
      success: true,
      message: 'Files merged and uploaded successfully',
      reviewerId: docRef.id,
      fileName: `Merged: ${fileNames.join(', ')}`,
      fileCount: fileNames.length,
      textLength: mergedText.length
    });

  } catch (error) {
    console.error('Merged upload error:', error);
    
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;