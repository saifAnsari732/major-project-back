import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  code: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    default: 'Kuch bhi nahi hai'
  },
  icon: {
    type: String,
    default: ''
  },
  color: {
    type: String,
    default: '#4F46E5'
  }
}, {
  timestamps: true
});

const Course = mongoose.model('Course', courseSchema);

export default Course;
