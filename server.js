const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const User = require('./models/User');
const Job = require('./models/Job');
const { auth, checkRole, generateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/skill-quest';

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

// Apply rate limiting to all routes
app.use(limiter);

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(cors());
app.use(express.json());

// Available topics in the Aptitude API with their endpoint mappings
const AVAILABLE_TOPICS = {
  'Mixture and Alligation': 'MixtureAndAlligation',
  'Profit and Loss': 'ProfitAndLoss',
  'Pipes and Cisterns': 'PipesAndCistern',
  'Age': 'Age',
  'Permutation and Combination': 'PermutationAndCombination',
  'Speed Time Distance': 'SpeedTimeDistance',
  'Simple Interest': 'SimpleInterest',
  'Calendars': 'Calendar'
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, role, companyName } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create new user
    const user = new User({
      email,
      password,
      name,
      role,
      companyName
    });

    await user.save();
    const token = generateToken(user);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyName: user.companyName
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyName: user.companyName
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Job Routes
app.post('/api/jobs', auth, checkRole(['company', 'admin']), async (req, res) => {
  try {
    const job = new Job({
      ...req.body,
      company: req.user._id
    });
    await job.save();
    res.status(201).json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create job' });
  }
});

app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await Job.find({ isActive: true }).populate('company', 'companyName');
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

app.get('/api/company/jobs', auth, checkRole(['company']), async (req, res) => {
  try {
    const jobs = await Job.find({ company: req.user._id });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch company jobs' });
  }
});

// Get available topics
app.get('/api/topics', (req, res) => {
  res.json({ topics: Object.keys(AVAILABLE_TOPICS) });
});

// Company endpoints
app.post('/api/company/tests', auth, checkRole(['company', 'admin']), async (req, res) => {
  try {
    const { 
      testId,
      name,
      description,
      duration,
      topics,
      questionsPerTopic,
      passingScore,
      isActive 
    } = req.body;

    if (!testId || !name || !topics || !questionsPerTopic) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate topics
    for (const topic of topics) {
      if (!AVAILABLE_TOPICS[topic]) {
        return res.status(400).json({ error: `Invalid topic: ${topic}` });
      }
    }

    // Create test configuration
    const testConfig = {
      testId,
      company: req.user._id,
      name,
      description,
      duration: duration || 45,
      topics,
      questionsPerTopic,
      passingScore: passingScore || 60,
      isActive: isActive !== false,
      createdAt: new Date().toISOString()
    };

    const job = await Job.findOneAndUpdate(
      { company: req.user._id },
      { $push: { quests: testConfig } },
      { new: true }
    );

    res.json(testConfig);
  } catch (error) {
    console.error('Error creating test configuration:', error);
    res.status(500).json({ error: 'Failed to create test configuration' });
  }
});

// User endpoints
app.post('/api/tests/:testId/start', auth, async (req, res) => {
  try {
    const { testId } = req.params;
    const job = await Job.findOne({ 'quests.testId': testId });
    
    if (!job) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const testConfig = job.quests.find(q => q.testId === testId);
    if (!testConfig || !testConfig.isActive) {
      return res.status(404).json({ error: 'Test not found or inactive' });
    }

    // Fetch questions for each topic
    const test = {
      testId,
      userId: req.user._id,
      startTime: new Date().toISOString(),
      duration: testConfig.duration,
      topics: [],
      totalQuestions: 0
    };

    for (const topic of testConfig.topics) {
      const endpoint = AVAILABLE_TOPICS[topic];
      const response = await axios.get(`https://aptitude-api.vercel.app/${endpoint}`);
      const questions = Array.isArray(response.data) ? response.data : [response.data];
      
      const selectedQuestions = questions
        .sort(() => Math.random() - 0.5)
        .slice(0, testConfig.questionsPerTopic)
        .map(q => ({
          ...q,
          topic,
          options: q.options || [],
          question: q.question || ''
        }));

      test.topics.push({
        name: topic,
        questions: selectedQuestions
      });
      test.totalQuestions += selectedQuestions.length;
    }

    // Store test session
    const sessionId = `${testId}-${req.user._id}-${Date.now()}`;

    res.json({
      sessionId,
      testId: test.testId,
      startTime: test.startTime,
      duration: test.duration,
      topics: test.topics.map(topic => ({
        name: topic.name,
        questions: topic.questions.map(q => ({
          id: q.id,
          question: q.question,
          options: q.options,
          topic: q.topic
        }))
      })),
      totalQuestions: test.totalQuestions
    });
  } catch (error) {
    console.error('Error starting test:', error);
    res.status(500).json({ error: 'Failed to start test' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 