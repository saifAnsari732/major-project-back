import mongoose from 'mongoose';

const paperSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  paperCode: {
    type: String,
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  year: {
    type: Number,
    required: true
  }, 
  semester: {
    type: Number,
    required: true
  },
  paperFile: {
     public_id: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
  },
  solvePaperFile: {
     public_id: {
          type: String,
          required: false,
        },
        url: {
          type: String,
          required: false,
        },
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  views: {
    type: Number,
    default: 0
  },
  downloads: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Index for better search performance
paperSchema.index({ paperCode: 1, name: 1, branch: 1 });

const Paper = mongoose.model('Paper', paperSchema);

export default Paper;
