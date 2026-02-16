import Branch from '../models/Branch.js';
import Paper from '../models/Paper.js';

// @desc    Get all branches
// @route   GET /api/branches
// @access  Public
export const getAllBranches = async (req, res) => {
  try {
    const branches = await Branch.find({}).populate('course', 'name code');

    res.json({
      success: true,
      count: branches.length,
      data: branches
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single branch
// @route   GET /api/branches/:id
// @access  Public
export const getBranch = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id)
      .populate('course', 'name code');

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    res.json({
      success: true,
      data: branch
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create branch (Admin only)
// @route   POST /api/branches
// @access  Private/Admin
export const createBranch = async (req, res) => {
  try {
    const branch = await Branch.create(req.body);

    res.status(201).json({
      success: true,
      data: branch
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update branch (Admin only)
// @route   PUT /api/branches/:id
// @access  Private/Admin
export const updateBranch = async (req, res) => {
  try {
    const branch = await Branch.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    res.json({
      success: true,
      data: branch
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete branch (Admin only)
// @route   DELETE /api/branches/:id
// @access  Private/Admin
export const deleteBranch = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    await branch.deleteOne();

    res.json({
      success: true,
      message: 'Branch removed'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get papers by branch
// @route   GET /api/branches/:id/papers
// @access  Public
export const getPapersByBranch = async (req, res) => {
  try {
    const { paperCode, name } = req.query;
    
    let query = { 
      branch: req.params.id,
      status: 'approved'
    };

    // Add filters if provided
    if (paperCode) {
      query.paperCode = { $regex: paperCode, $options: 'i' };
    }
    
    if (name) {
      query.name = { $regex: name, $options: 'i' };
    }

    const papers = await Paper.find(query)
      .populate('course', 'name code')
      .populate('branch', 'name code')
      .populate('uploadedBy', 'name email')
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
