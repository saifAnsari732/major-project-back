import Paper from '../models/Paper.js';
import Branch from '../models/Branch.js';
import User from '../models/User.js';
import { v2 as cloudinary } from 'cloudinary'
// import SolvePaper from '../models/solvepaper.js';

// @desc    Get all papers
// @route   GET /api/papers
// @access  Public
export const getAllPapers = async (req, res) => {
  try {
    const { paperCode, name, branch, course, status } = req.query;
    
    let query = {};

    // Add filters if provided
    if (paperCode) {
      query.paperCode = { $regex: paperCode, $options: 'i' };
    }
    
    if (name) {
      query.name = { $regex: name, $options: 'i' };
    }

    if (branch) {
      query.branch = branch;
    }

    if (course) {
      query.course = course;
    }

    if (status) {
      query.status = status;
    } else {
      // By default, only show approved papers to non-admin users
      query.status = 'approved';
    }

    const papers = await Paper.find(query)
      .populate('course', 'name code')
      .populate('branch', 'name code')
      .populate('uploadedBy', 'name email profileImage')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: papers.length,
      data: papers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
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
      return res.status(404).json({
        success: false,
        message: 'Paper not found'
      });
    }

    // Increment views
    paper.views += 1;
    await paper.save();

    res.json({
      success: true,
      data: paper
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Upload paper
// @route   POST /api/papers
// @access  Private
export const uploadPaper = async (req, res) => {
  try {
    console.log('📝 Request body:', req.body);
    console.log('📁 Request files:', req.files);
    
    const { name, course, branch, subject,paperCode, year, semester, uploadedBy } = req.body;
    
    // Validate required fields
    if (!name || !course || !subject || !year || !semester || !uploadedBy || !branch || !paperCode) {
      return res.status(400).json({ 
        success: false,
        errors: "Missing required fields" 
      });
    }

    // Check if paper code already exists
    const exitpapercode = await Paper.findOne({ paperCode: paperCode });
    if (exitpapercode) {
      return res.status(400).json({ 
        success: false,
        errors: "Already uploaded paper with this code" 
      });
    }

    // Check if files were uploaded
    if (!req.files || Object.keys(req.files).length === 0) {
      console.error('❌ No files in request');
      return res.status(400).json({ 
        success: false,
        errors: "No file uploaded" 
      });
    }

    // Extract the paper file from req.files
    const paperFile = req.files.paperFile;
    if (!paperFile) {
      console.error('❌ Available fields in req.files:', Object.keys(req.files));
      return res.status(400).json({ 
        success: false,
        errors: `No paperFile found. Available fields: ${Object.keys(req.files).join(', ')}` 
      });
    }

    // Get file path for cloudinary
    const filePath = paperFile.tempFilePath;
    if (!filePath) {
      console.error('❌ File object:', paperFile);
      return res.status(400).json({ 
        success: false,
        errors: "Invalid file path" 
      });
    }
    
    // Determine resource type based on file mime type
    const isPDF = paperFile.mimetype === 'application/pdf';
    
    // Upload main paper file to cloudinary
    const cloud_response = await cloudinary.uploader.upload(filePath, {
      resource_type: isPDF ? 'raw' : 'auto',
      folder: 'papers',
      access_mode: 'public', // Ensure file is publicly accessible
      ...(isPDF && { 
        flags: 'attachment', // Force download for PDFs (optional)
      })
    });

    if (!cloud_response || cloud_response.error) {
      console.error('❌ Cloudinary error:', cloud_response.error);
      return res.status(400).json({ 
        success: false,
        errors: "Error uploading file to cloudinary" 
      });
    }

    // console.log('✅ Cloudinary upload successful:', cloud_response.public_id);
    // console.log('✅ Cloudinary URL:', cloud_response.secure_url || cloud_response.url);

    // Handle solve PDF file (optional)
    let solvePaperCloudResponse = null;
    const solvePaperFile = req.files.solvePaperFile;
    
    if (solvePaperFile) {
      console.log('📄 Solve PDF file detected:', solvePaperFile.name);
      console.log('📄 Solve PDF mimetype:', solvePaperFile.mimetype);
      const solvePaperFilePath = solvePaperFile.tempFilePath;
      
      if (!solvePaperFilePath) {
        console.warn('⚠️ Solve PDF file has no tempFilePath');
      } else {
        try {
          // Upload PDF with 'raw' resource type - this is critical for PDFs
          solvePaperCloudResponse = await cloudinary.uploader.upload(solvePaperFilePath, {
            resource_type: 'raw', // Must be 'raw' for PDFs
            folder: 'papers/solutions',
            access_mode: 'public', // Ensure file is publicly accessible
            type: 'upload', // Explicitly set upload type
          });
          
          console.log('✅ Solve PDF uploaded successfully');
          console.log('✅ Public ID:', solvePaperCloudResponse.public_id);
          console.log('✅ Secure URL:', solvePaperCloudResponse.secure_url);
          console.log('✅ Regular URL:', solvePaperCloudResponse.url);
          
        } catch (error) {
          console.error('❌ Solve PDF upload failed:', error.message);
          console.error('Error details:', error);
          // Don't fail the entire request if solve pdf upload fails
        }
      }
    } else {
      console.log('ℹ️ No solve PDF file provided (optional field)');
    }

    // Create paper document with secure URLs
    const paperData = {
      name: name,
      paperCode: paperCode,
      course: course,
      branch: branch || null,
      subject: subject,
      year: year,
      semester: semester,
      uploadedBy: uploadedBy,
      paperFile: {
        public_id: cloud_response.public_id,
        url: cloud_response.secure_url || cloud_response.url,
      },
    };

    // Add solve paper file if uploaded successfully
    if (solvePaperCloudResponse && solvePaperCloudResponse.public_id) {
      paperData.solvePaperFile = {
        public_id: solvePaperCloudResponse.public_id,
        url: solvePaperCloudResponse.secure_url || solvePaperCloudResponse.url,
      };
      console.log('✅ Solve PDF added to paper data with URL:', paperData.solvePaperFile.url);
    }

    const paper = await Paper.create(paperData);

    // console.log('✅ Paper created successfully:', paper._id);
    // console.log('✅ Paper data:', JSON.stringify(paperData, null, 2));

    // Update user's papers uploaded count and award coins
    if (req.user && req.user.id) {
      try {
        const user = await User.findById(req.user.id);
        if (user) {
          user.papersUploaded += 1;
          user.coins += 5; // Award 5 coins for uploading a paper
          await user.save();
          console.log('✅ User papers count updated');
          console.log('✅ User awarded 5 coins for paper upload');
        }
      } catch (error) {
        console.error('⚠️ Failed to update user papers count:', error.message);
      }
    }

    // Update branch total papers
    if (branch) {
      try {
        const branchs = await Branch.findById(branch);
        if (branchs) {
          branchs.totalPapers += 1;
          await branchs.save();
          console.log('✅ Branch papers count updated');
        }
      } catch (error) {
        console.error('⚠️ Failed to update branch papers count:', error.message);
      }
    }

    res.status(201).json({
      message: "Paper uploaded successfully",
      success: true,
      data: paper
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      errors: error.message
    });
  }
};
// @desc    Update paper
// @route   PUT /api/papers/:id
// @access  Private
export const updatePaper = async (req, res) => {
  try {
    let paper = await Paper.findById(req.params.id);

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: 'Paper not found'
      });
    }

    // Check if user owns the paper or is admin
    if (paper.uploadedBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this paper'
      });
    }

    paper = await Paper.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: paper
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete paper
// @route   DELETE /api/papers/:id
// @access  Private
export const deletePaper = async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: 'Paper not found'
      });
    }

    // Check if user owns the paper or is admin
    if (paper.uploadedBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this paper'
      });
    }

    await paper.deleteOne();

    res.json({
      success: true,
      message: 'Paper removed'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Approve paper (Admin only)
// @route   PUT /api/papers/:id/approve
// @access  Private/Admin
export const approvePaper = async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: 'Paper not found'
      });
    }

    paper.status = 'approved';
    await paper.save();

    // Award coins to user
    const user = await User.findById(paper.uploadedBy);
    user.coins += 10; // 10 coins per approved paper
    await user.save();

    res.json({
      success: true,
      data: paper
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Reject paper (Admin only)
// @route   PUT /api/papers/:id/reject
// @access  Private/Admin
export const rejectPaper = async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: 'Paper not found'
      });
    }

    paper.status = 'rejected';
    await paper.save();

    res.json({
      success: true,
      data: paper
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Increment paper downloads
// @route   PUT /api/papers/:id/download
// @access  Public
export const incrementDownload = async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: 'Paper not found'
      });
    }

    paper.downloads += 1;
    await paper.save();

    res.json({
      success: true,
      data: paper
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
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

    res.json({
      success: true,
      count: papers.length,
      data: papers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

