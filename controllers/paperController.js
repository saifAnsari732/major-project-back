import Paper from '../models/Paper.js';
import Branch from '../models/Branch.js';
import User from '../models/User.js';
import { v2 as cloudinary } from 'cloudinary'

// Helper: upload a single file to cloudinary
const uploadToCloudinary = async (file, folder) => {
  const isPDF = file.mimetype === 'application/pdf';
  const response = await cloudinary.uploader.upload(file.tempFilePath, {
    resource_type: isPDF ? 'raw' : 'auto',
    folder,
    access_mode: 'public',
    ...(isPDF && { flags: 'attachment' }),
  });
  return response;
};

// @desc    Get all papers
// @route   GET /api/papers
// @access  Public
export const getAllPapers = async (req, res) => {
  try {
    const { paperCode, name, branch, course, status } = req.query;
    
    let query = {};

    if (paperCode) query.paperCode = { $regex: paperCode, $options: 'i' };
    if (name) query.name = { $regex: name, $options: 'i' };
    if (branch) query.branch = branch;
    if (course) query.course = course;

    query.status = status || 'approved';

    const papers = await Paper.find(query)
      .populate('course', 'name code')
      .populate('branch', 'name code')
      .populate('uploadedBy', 'name email profileImage')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: papers.length, data: papers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single paper
// @route   GET /api/papers/:id
// @access  Public
export const getPaper = async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id)
      .populate('course', 'name code')
      .populate('branch', 'name code')
      .populate('uploadedBy', 'name email profileImage');

    if (!paper) {
      return res.status(404).json({ success: false, message: 'Paper not found' });
    }

    paper.views += 1;
    await paper.save();

    res.json({ success: true, data: paper });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Upload paper
// @route   POST /api/papers
// @access  Private
export const uploadPaper = async (req, res) => {
  try {
    // console.log('📝 Request body:', req.body);
    // console.log('📁 Request files:', req.files ? Object.keys(req.files) : 'none');

    const { name, course, branch, subject, paperCode, year, semester, uploadedBy } = req.body;

    // Validate required fields
    if (!name || !course || !subject || !year || !semester || !uploadedBy  || !paperCode) {
      return res.status(400).json({ success: false, errors: 'Missing required fields' });
    }

    // Check duplicate paper code
    const existingPaper = await Paper.findOne({ paperCode });
    if (existingPaper) {
      return res.status(400).json({ success: false, errors: 'Already uploaded paper with this code' });
    }

    // Validate front side file (required)
    if (!req.files || !req.files.paperFile) {
      return res.status(400).json({ success: false, errors: 'Front side file (paperFile) is required' });
    }

    const paperFile = req.files.paperFile;
    if (!paperFile.tempFilePath) {
      return res.status(400).json({ success: false, errors: 'Invalid file path for front side' });
    }

    // Upload front side
    let frontCloudResponse;
    try {
      frontCloudResponse = await uploadToCloudinary(paperFile, 'papers/front');
      console.log('✅ Front side uploaded:', frontCloudResponse.public_id);
    } catch (err) {
      console.error('❌ Front side upload failed:', err.message);
      return res.status(500).json({ success: false, errors: 'Failed to upload front side file' });
    }

    // Upload back side (optional)
    let backCloudResponse = null;
    const backSideFile = req.files.backSideFile;
    if (backSideFile) {
      if (!backSideFile.tempFilePath) {
        console.warn('⚠️ Back side file has no tempFilePath, skipping');
      } else {
        try {
          backCloudResponse = await uploadToCloudinary(backSideFile, 'papers/back');
          console.log('✅ Back side uploaded:', backCloudResponse.public_id);
        } catch (err) {
          console.warn('⚠️ Back side upload failed (non-critical):', err.message);
          // Don't fail the entire request — back side is optional
        }
      }
    } else {
      console.log('ℹ️ No back side file provided (optional)');
    }

    // Upload solve PDF (optional)
    let solvePaperCloudResponse = null;
    const solvePaperFile = req.files.solvePaperFile;
    if (solvePaperFile && solvePaperFile.tempFilePath) {
      try {
        solvePaperCloudResponse = await cloudinary.uploader.upload(solvePaperFile.tempFilePath, {
          resource_type: 'raw',
          folder: 'papers/solutions',
          access_mode: 'public',
          type: 'upload',
        });
        console.log('✅ Solve PDF uploaded:', solvePaperCloudResponse.public_id);
      } catch (err) {
        console.warn('⚠️ Solve PDF upload failed (non-critical):', err.message);
      }
    }

    // Build paper document
    const paperData = {
      name,
      paperCode,
      course,
      branch: branch || null,
      subject,
      year,
      semester,
      uploadedBy,
      // Front side (required)
      paperFile: {
        public_id: frontCloudResponse.public_id,
        url: frontCloudResponse.secure_url || frontCloudResponse.url,
      },
    };

    // Back side (optional)
    if (backCloudResponse) {
      paperData.backSideFile = {
        public_id: backCloudResponse.public_id,
        url: backCloudResponse.secure_url || backCloudResponse.url,
      };
    }

    // Solve PDF (optional)
    if (solvePaperCloudResponse) {
      paperData.solvePaperFile = {
        public_id: solvePaperCloudResponse.public_id,
        url: solvePaperCloudResponse.secure_url || solvePaperCloudResponse.url,
      };
    }

    const paper = await Paper.create(paperData);

    // Award coins to uploader
    if (req.user?.id) {
      try {
        const user = await User.findById(req.user.id);
        if (user) {
          user.papersUploaded += 1;
          user.coins += 5;
          await user.save();
        }
      } catch (err) {
        console.warn('⚠️ Failed to update user stats:', err.message);
      }
    }

    // Update branch paper count
    if (branch) {
      try {
        const branchDoc = await Branch.findById(branch);
        if (branchDoc) {
          branchDoc.totalPapers += 1;
          await branchDoc.save();
        }
      } catch (err) {
        console.warn('⚠️ Failed to update branch count:', err.message);
      }
    }

    res.status(201).json({ message: 'Paper uploaded successfully', success: true, data: paper });

  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ success: false, message: error.message, errors: error.message });
  }
};

// @desc    Update paper
// @route   PUT /api/papers/:id
// @access  Private
export const updatePaper = async (req, res) => {
  try {
    let paper = await Paper.findById(req.params.id);

    if (!paper) return res.status(404).json({ success: false, message: 'Paper not found' });

    if (paper.uploadedBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to update this paper' });
    }

    paper = await Paper.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

    res.json({ success: true, data: paper });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete paper
// @route   DELETE /api/papers/:id
// @access  Private
export const deletePaper = async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);

    if (!paper) return res.status(404).json({ success: false, message: 'Paper not found' });

    if (paper.uploadedBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this paper' });
    }

    // Optionally delete from cloudinary too
    if (paper.paperFile?.public_id) {
      await cloudinary.uploader.destroy(paper.paperFile.public_id, { resource_type: 'raw' }).catch(() => {});
    }
    if (paper.backSideFile?.public_id) {
      await cloudinary.uploader.destroy(paper.backSideFile.public_id, { resource_type: 'raw' }).catch(() => {});
    }

    await paper.deleteOne();

    res.json({ success: true, message: 'Paper removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Approve paper (Admin only)
// @route   PUT /api/papers/:id/approve
// @access  Private/Admin
export const approvePaper = async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);

    if (!paper) return res.status(404).json({ success: false, message: 'Paper not found' });

    paper.status = 'approved';
    await paper.save();

    const user = await User.findById(paper.uploadedBy);
    if (user) {
      user.coins += 10;
      await user.save();
    }

    res.json({ success: true, data: paper });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reject paper (Admin only)
// @route   PUT /api/papers/:id/reject
// @access  Private/Admin
export const rejectPaper = async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);

    if (!paper) return res.status(404).json({ success: false, message: 'Paper not found' });

    paper.status = 'rejected';
    await paper.save();

    res.json({ success: true, data: paper });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Increment paper downloads
// @route   PUT /api/papers/:id/download
// @access  Public
export const incrementDownload = async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);

    if (!paper) return res.status(404).json({ success: false, message: 'Paper not found' });

    paper.downloads += 1;
    await paper.save();

    res.json({ success: true, data: paper });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get user's uploaded papers
// @route   GET /api/papers/my-papers
// @access  Private
export const getMyPapers = async (req, res) => {
  try {
    const papers = await Paper.find({ uploadedBy: req.user.id })
      .populate('course', 'name code')
      .populate('branch', 'name code')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: papers.length, data: papers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};