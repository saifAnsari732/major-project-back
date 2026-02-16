import mongoose from 'mongoose';

const branchSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  code: { 
    type: String,
    unique: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    default: ''
  },
  image: {
    type: String,
    default: ''
  },
  color: {
    type: String,
    default: '#4F46E5'
  },
  totalPapers: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

const Branch = mongoose.model('Branch', branchSchema);

export default Branch;
