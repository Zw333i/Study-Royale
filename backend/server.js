//server.js
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
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
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chatbot', chatbotRoute);
app.use('/api/learn', learnRoute);
app.use('/api/generate', generateRoutes);
app.use('/api/reviewer', reviewerRoutes);
app.use('/api/imported-quiz', importedQuizRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/delete', deleteRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Study Royale API is running!' });
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
  console.log(`Server running on port ${PORT}`);
});