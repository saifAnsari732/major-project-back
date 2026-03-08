import Paper from "../models/Paper.js";
import Branch from "../models/Branch.js";
import User from "../models/User.js";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";

// Helper: upload a single file to cloudinary
const uploadToCloudinary = async (file, folder) => {
  const isPDF = file.mimetype === "application/pdf";
  const response = await cloudinary.uploader.upload(file.tempFilePath, {
    resource_type: isPDF ? "raw" : "auto",
    folder,
    access_mode: "public",
    // ✅ REMOVED: flags: 'immutable' - this is invalid for upload endpoint
    // Use quality optimization instead
    quality: "auto",
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

    if (paperCode) query.paperCode = { $regex: paperCode, $options: "i" };
    if (name) query.name = { $regex: name, $options: "i" };
    if (branch) query.branch = branch;
    if (course) query.course = course;

    query.status = status || "approved";

    const papers = await Paper.find(query)
      .populate("course", "name code")
      .populate("branch", "name code")
      .populate("uploadedBy", "name email profileImage")
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
      .populate("course", "name code")
      .populate("branch", "name code")
      .populate("uploadedBy", "name email profileImage");

    if (!paper) {
      return res
        .status(404)
        .json({ success: false, message: "Paper not found" });
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
    const {
      name,
      course,
      branch,
      subject,
      paperCode,
      year,
      semester,
      uploadedBy,
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !course ||
      !subject ||
      !year ||
      !semester ||
      !uploadedBy ||
      !paperCode
    ) {
      return res
        .status(400)
        .json({ success: false, errors: "Missing required fields" });
    }

    // Check duplicate paper code
    const existingPaper = await Paper.findOne({ paperCode });
    if (existingPaper) {
      return res
        .status(400)
        .json({
          success: false,
          errors: "Already uploaded paper with this code",
        });
    }

    // Validate front side file (required)
    if (!req.files || !req.files.paperFile) {
      return res
        .status(400)
        .json({
          success: false,
          errors: "Front side file (paperFile) is required",
        });
    }

    const paperFile = req.files.paperFile;
    if (!paperFile.tempFilePath) {
      return res
        .status(400)
        .json({ success: false, errors: "Invalid file path for front side" });
    }

    // Upload front side
    let frontCloudResponse;
    try {
      frontCloudResponse = await uploadToCloudinary(paperFile, "papers/front");
      console.log("✅ Front side uploaded:", frontCloudResponse.public_id);
    } catch (err) {
      console.error("❌ Front side upload failed:", err.message);
      return res
        .status(500)
        .json({ success: false, errors: "Failed to upload front side file" });
    }

    // Upload back side (optional)
    let backCloudResponse = null;
    const backSideFile = req.files?.backSideFile;
    if (backSideFile && backSideFile.tempFilePath) {
      try {
        backCloudResponse = await uploadToCloudinary(
          backSideFile,
          "papers/back",
        );
        console.log("✅ Back side uploaded:", backCloudResponse.public_id);
      } catch (err) {
        console.warn("⚠️ Back side upload failed (non-critical):", err.message);
      }
    } else {
      console.log("ℹ️ No back side file provided (optional)");
    }

    // Upload solve PDF (optional)
    let solvePaperCloudResponse = null;
    const solvePaperFile = req.files?.solvePaperFile;

    if (solvePaperFile && solvePaperFile.tempFilePath) {
      try {
        console.log("📤 Starting solution file upload...");
        console.log("   File type:", solvePaperFile.mimetype);
        console.log("   File size:", solvePaperFile.size);

        // ✅ Always use 'raw' for PDF to get correct Content-Type
        solvePaperCloudResponse = await cloudinary.uploader.upload(
          solvePaperFile.tempFilePath,
          {
             resource_type: "image",  // ✅ image use karo — browser render karega
    format: "jpg",           // ✅ PDF → JPG convert hoga
    folder: "papers/solutions",
    access_mode: "public",
    type: "upload",
          },
        );

        console.log("✅ Solution file uploaded successfully!");
        console.log("   Public ID:", solvePaperCloudResponse.public_id);
        console.log(
          "   URL:",
          solvePaperCloudResponse.secure_url || solvePaperCloudResponse.url,
        );
      } catch (err) {
        console.error(
          "❌ Solution file upload failed (non-critical):",
          err.message,
        );
        console.error("   Error details:", err);
        solvePaperCloudResponse = null;
      }
    } else {
      console.log("ℹ️ No solution file provided (optional)");
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

    // Solve PDF (optional) - Add inline display transformation
    if (solvePaperCloudResponse) {
  console.log("📝 Adding solution file to database document");
  let solutionUrl =
    solvePaperCloudResponse.secure_url || solvePaperCloudResponse.url;

  // ✅ isSolutionPDF flag bhi save karo
  paperData.solvePaperFile = {
    public_id: solvePaperCloudResponse.public_id,
    url: solutionUrl,
    isImage: true, // ← ab ye image hai, PDF nahi
  };
}
    else {
      console.log(
        "⚠️ Solution file not included (upload failed or not provided)",
      );
      paperData.solvePaperFile = null;
    }

    console.log("💾 Creating paper in database...");
    const paper = await Paper.create(paperData);
    console.log("✅ Paper created successfully:", paper._id);

 // ✅ FIX: Award coins to uploader - Use uploadedBy field instead of req.user
try {
  console.log("💰 Updating user stats for:", uploadedBy);
  
  // Use uploadedBy from req.body (which should contain the user's ID)
  const user = await User.findById(uploadedBy);
  
  if (user) {
    console.log("📊 Current user stats:", {
      papersUploaded: user.papersUploaded,
      coins: user.coins
    });
    
    user.papersUploaded = (user.papersUploaded || 0) + 1;
    user.coins = (user.coins || 0) + 5;
    
    await user.save();
    
    console.log("✅ User stats updated:", {
      papersUploaded: user.papersUploaded,
      coins: user.coins
    });
  } else {
    console.warn("⚠️ User not found with ID:", uploadedBy);
  }
} catch (err) {
  console.error("❌ Failed to update user stats:", err.message);
  console.error("   Stack:", err.stack);
  // Don't fail the entire request if user update fails
}

// Update branch paper count
if (branch) {
  try {
    console.log("📚 Updating branch paper count for:", branch);
    const branchDoc = await Branch.findById(branch);
    if (branchDoc) {
      branchDoc.totalPapers = (branchDoc.totalPapers || 0) + 1;
      await branchDoc.save();
      console.log("✅ Branch paper count updated:", branchDoc.totalPapers);
    } else {
      console.warn("⚠️ Branch not found with ID:", branch);
    }
  } catch (err) {
    console.error("❌ Failed to update branch count:", err.message);
  }
}

    res.status(201).json({
      message: "Paper uploaded successfully",
      success: true,
      data: paper,
      solutionIncluded: !!solvePaperCloudResponse,
    });
  } catch (error) {
    console.error("❌ Upload error:", error);
    res
      .status(500)
      .json({ success: false, message: error.message, errors: error.message });
  }
};

// @desc    Update paper
// @route   PUT /api/papers/:id
// @access  Private
// @desc    Update paper
// @route   PUT /api/papers/:id
// @access  Private/Admin
export const updatePaper = async (req, res) => {
  try {
    let paper = await Paper.findById(req.params.id);

    if (!paper)
      return res.status(404).json({ success: false, message: "Paper not found" });

    if (
      paper.uploadedBy.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ success: false, message: "Not authorized to update this paper" });
    }

    // Extract text fields from body
    const { name, paperCode, course, branch, subject, year, semester, status } = req.body;

    const updateData = {};
    if (name)       updateData.name = name;
    if (paperCode)  updateData.paperCode = paperCode;
    if (course)     updateData.course = course;
    if (branch)     updateData.branch = branch;
    if (subject)    updateData.subject = subject;
    if (year)       updateData.year = year;
    if (semester)   updateData.semester = semester;
    if (status)     updateData.status = status;

    // ── Handle file updates if any files uploaded ──────────────────────────

    // Front Side (paperFile)
    if (req.files?.paperFile) {
      try {
        // Delete old file from Cloudinary
        if (paper.paperFile?.public_id) {
          await cloudinary.uploader.destroy(paper.paperFile.public_id, {
            resource_type: paper.paperFile.url?.includes('.pdf') ? 'raw' : 'image',
          }).catch(() => {});
        }
        // Upload new file
        const frontRes = await uploadToCloudinary(req.files.paperFile, 'papers/front');
        updateData.paperFile = {
          public_id: frontRes.public_id,
          url: frontRes.secure_url || frontRes.url,
        };
        console.log('✅ Front side updated:', frontRes.public_id);
      } catch (err) {
        console.error('❌ Front side update failed:', err.message);
      }
    }

    // Back Side (backSideFile)
    if (req.files?.backSideFile) {
      try {
        if (paper.backSideFile?.public_id) {
          await cloudinary.uploader.destroy(paper.backSideFile.public_id, {
            resource_type: paper.backSideFile.url?.includes('.pdf') ? 'raw' : 'image',
          }).catch(() => {});
        }
        const backRes = await uploadToCloudinary(req.files.backSideFile, 'papers/back');
        updateData.backSideFile = {
          public_id: backRes.public_id,
          url: backRes.secure_url || backRes.url,
        };
        console.log('✅ Back side updated:', backRes.public_id);
      } catch (err) {
        console.error('❌ Back side update failed:', err.message);
      }
    }

    // Solution File (solvePaperFile)
    if (req.files?.solvePaperFile) {
      try {
        if (paper.solvePaperFile?.public_id) {
          await cloudinary.uploader.destroy(paper.solvePaperFile.public_id, {
            resource_type: 'image',
          }).catch(() => {});
        }
        // Upload as image (PDF → JPG conversion)
        const solveRes = await cloudinary.uploader.upload(
          req.files.solvePaperFile.tempFilePath,
          {
            resource_type: 'image',
            format: 'jpg',
            folder: 'papers/solutions',
            access_mode: 'public',
            type: 'upload',
             public_id: `solution_${req.params.id}_${Date.now()}`, // ✅ Unique ID — cache bust
             invalidate: true, // ✅ Cloudinary CDN cache clear kar
          }
        );
        updateData.solvePaperFile = {
          public_id: solveRes.public_id,
          url: solveRes.secure_url || solveRes.url,
          isImage: true,
        };
        console.log('✅ Solution file updated:', solveRes.public_id);
      } catch (err) {
        console.error('❌ Solution file update failed:', err.message);
      }
    }

    // ── Save to DB ─────────────────────────────────────────────────────────
    paper = await Paper.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({ success: true, data: paper });

  } catch (error) {
    console.error('❌ Update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete paper
// @route   DELETE /api/papers/:id
// @access  Private
export const deletePaper = async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);

    if (!paper)
      return res
        .status(404)
        .json({ success: false, message: "Paper not found" });

    if (
      paper.uploadedBy.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Not authorized to delete this paper",
        });
    }

    // Delete files from cloudinary
    if (paper.paperFile?.public_id) {
      const isPDF = paper.paperFile.url?.includes(".pdf");
      await cloudinary.uploader
        .destroy(paper.paperFile.public_id, {
          resource_type: isPDF ? "raw" : "auto",
        })
        .catch(() => {});
    }
    if (paper.backSideFile?.public_id) {
      const isPDF = paper.backSideFile.url?.includes(".pdf");
      await cloudinary.uploader
        .destroy(paper.backSideFile.public_id, {
          resource_type: isPDF ? "raw" : "auto",
        })
        .catch(() => {});
    }
    if (paper.solvePaperFile?.public_id) {
      const isPDF = paper.solvePaperFile.url?.includes(".pdf");
      await cloudinary.uploader
        .destroy(paper.solvePaperFile.public_id, {
          resource_type: isPDF ? "raw" : "auto",
        })
        .catch(() => {});
    }

    await paper.deleteOne();

    res.json({ success: true, message: "Paper removed" });
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

    if (!paper)
      return res
        .status(404)
        .json({ success: false, message: "Paper not found" });

    paper.status = "approved";
    await paper.save();

    const user = await User.findById(paper.uploadedBy);
    if (user) {
      user.coins +=5;
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

    if (!paper)
      return res
        .status(404)
        .json({ success: false, message: "Paper not found" });

    paper.status = "rejected";
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

    if (!paper)
      return res
        .status(404)
        .json({ success: false, message: "Paper not found" });

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
      .populate("course", "name code")
      .populate("branch", "name code")
      .sort({ createdAt: -1 });

    res.json({ success: true, count: papers.length, data: papers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
