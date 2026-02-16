import User from '../models/User.js';
import Paper from '../models/Paper.js';
import Course from '../models/Course.js';
import Branch from '../models/Branch.js';

// @desc    Get dashboard stats
// @route   GET /api/admin/dashboard
// @access  Private/Admin
export const getDashboardStats = async (req, res) => {
  try {
    // Get total counts
    const totalUsers = await User.countDocuments();
    const totalPapers = await Paper.countDocuments();
    const totalCourses = await Course.countDocuments();
    const totalBranches = await Branch.countDocuments();

    // Get pending papers count
    const pendingPapers = await Paper.countDocuments({ status: 'pending' });

    // Get recent users
    const recentUsers = await User.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email role createdAt');

    // Get recent papers
    const recentPapers = await Paper.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('uploadedBy', 'name email')
      .populate('branch', 'name');

    // Get top contributors
    const topContributors = await User.find({})
      .sort({ papersUploaded: -1 })
      .limit(5)
      .select('name email papersUploaded coins');

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalPapers,
          totalCourses,
          totalBranches,
          pendingPapers
        },
        recentUsers,
        recentPapers,
        topContributors
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all pending papers
// @route   GET /api/admin/papers/pending
// @access  Private/Admin
export const getPendingPapers = async (req, res) => {
  try {
    const papers = await Paper.find({ status: 'pending' })
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
