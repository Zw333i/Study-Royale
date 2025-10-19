//server.js
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

require('dotenv').config();

const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const generateRoutes = require('./routes/generate');
const deleteRoutes = require('./routes/delete');
const reviewerRoutes = require('./routes/reviewer');
const importedQuizRoutes = require('./routes/importedQuiz');
const chatbotRoute = require('./routes/chatbot');
const learnRoute = require('./routes/learn');

const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://your-frontend-domain.com' 
    : '*',
  methods: ['GET', 'POST', 'DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const generateLimiter = rateLimit({
    windowMs: 60 * 1000, 
    max: 10, 
    message: { 
        error: 'Too many quiz generations. Please wait a minute and try again.',
        retryAfter: 60 
    },
    standardHeaders: true, 
    legacyHeaders: false
});

const aiLimiter = rateLimit({
    windowMs: 60 * 1000, 
    max: 20, 
    message: { 
        error: 'Too many AI requests. Please slow down.',
        retryAfter: 60 
    },
    standardHeaders: true,
    legacyHeaders: false
});

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 20, 
    message: { 
        error: 'Too many uploads. Please try again in 15 minutes.',
        retryAfter: 900 
    },
    standardHeaders: true,
    legacyHeaders: false
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 200, 
    message: { 
        error: 'Too many requests. Please try again in 15 minutes.',
        retryAfter: 900 
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        return req.path === '/' || req.path === '/health';
    }
});

app.use('/api/generate', generateLimiter);
app.use('/api/chatbot', aiLimiter);
app.use('/api/learn', aiLimiter);
app.use('/api/upload', uploadLimiter);

app.use('/api/', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/chatbot', chatbotRoute);
app.use('/api/learn', learnRoute);
app.use('/api/generate', generateRoutes);
app.use('/api/reviewer', reviewerRoutes);
app.use('/api/imported-quiz', importedQuizRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/delete', deleteRoutes);

// ===== HEALTH CHECK =====
app.get('/', (req, res) => {
  res.json({ 
    message: 'Study Royale API is running!',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  const message = process.env.NODE_ENV === 'production' 
    ? 'Something went wrong. Please try again.'
    : err.message;
  
  res.status(err.status || 500).json({ 
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

cron.schedule('0 0 * * *', async () => {
  console.log('Running auto-delete job...');
  try {
    const deleteRoute = require('./routes/delete');
    await deleteRoute.autoDeleteExpired();
    console.log('Auto-delete completed');
  } catch (error) {
    console.error('Auto-delete failed:', error);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 Rate limiting enabled`);
});

module.exports = app; 