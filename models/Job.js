const mongoose = require('mongoose');

const questSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['aptitude', 'technical', 'dsa', 'behavioral']
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard', 'Expert'],
    default: 'Medium'
  },
  duration: {
    type: Number,
    required: true,
    min: 1
  },
  questions: {
    type: Number,
    required: true,
    min: 1
  },
  passingScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  enabled: {
    type: Boolean,
    default: true
  },
  topics: [{
    type: String
  }],
  questionsPerTopic: {
    type: Number,
    default: 5
  }
});

const jobSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  department: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['Full-time', 'Part-time', 'Contract', 'Internship']
  },
  description: {
    type: String,
    required: true
  },
  requirements: [{
    type: String
  }],
  salary: {
    min: {
      type: String,
      required: true
    },
    max: {
      type: String,
      required: true
    }
  },
  quests: [questSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Job', jobSchema); 