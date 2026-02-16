import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import fileUpload from 'express-fileupload'
import { v2 as cloudinary } from 'cloudinary'
import path from 'path'
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios'
// Route imports 
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import branchRoutes from './routes/branchRoutes.js';
import paperRoutes from './routes/paperRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Fix __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// file Uploade with cross-platform temp directory
app.use(fileUpload({
    useTempFiles : true,
    tempFileDir : os.tmpdir()
}));
 
// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'build')));

// CORS middleware
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));





// Cloudinary code
cloudinary.config({ 
      cloud_name: "dc0eskzxx" ,
      api_key: "645985342632788" ,  
      api_secret: "iu7MJQ6i5XHaX-yjn5-YodGakdg", 
  });
// Static folder for uploads
// app.use('/uploads', express.static('uploads'));
// GEMINI CODE with File Upload Support
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });
  
// Helper function to read file as base64
const readFileAsBase64 = (filePath) => {
  return fs.readFileSync(filePath, { encoding: 'base64' });
}; 

// Helper function to get MIME type
const getMimeType = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  const mimeTypes = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    csv: 'text/csv',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  return mimeTypes[ext] || 'text/plain';
};

// Helper function to clean response - remove comment lines
const cleanResponse = (text) => {
  const lines = text.split('\n');
  const cleanedLines = lines.filter(line => {
    const trimmed = line.trim();
    // Remove empty lines and comment lines
    if (!trimmed) return false;
    if (trimmed.startsWith('//')) return false;
    if (trimmed.startsWith('#')) return false;
    if (trimmed.startsWith('/*')) return false;
    if (trimmed.startsWith('*')) return false;
    if (trimmed.startsWith('--')) return false;
    if (trimmed.startsWith('<!--')) return false;
    if (trimmed.startsWith('```')) return false;
    return true;
  });
  
  // Remove leading/trailing empty lines and rejoin
  return cleanedLines
    .filter((line, index, arr) => {
      // Remove leading empty lines
      if (index === 0) return line.trim().length > 0;
      // Remove trailing empty lines
      if (index === arr.length - 1) return line.trim().length > 0;
      return true;
    })
    .join('\n')
    .trim();
};

app.post("/api/gemini", async (req, res) => {
  const { question, message } = req.body;
  
  try {
    const userMessage = message || question;
    
    if (!userMessage) {
      return res.status(400).json({ 
        error: "No message provided",
        details: "Please provide a 'message' or 'question' in the request body" 
      });
    }

    // Initialize content array with the message
    const contents = [
      {
        role: "user",
        parts: [{ text: userMessage }]
      }
    ];

    // If file is uploaded, include it in the request
    if (req.files && req.files.file) {
      const uploadedFile = req.files.file;
      const filePath = uploadedFile.tempFilePath;
      const mimeType = getMimeType(uploadedFile.name);

      console.log(`📄 Processing file: ${uploadedFile.name} (${mimeType})`);

      // For text files, read content directly
      if (mimeType === 'text/plain' || mimeType === 'text/csv') {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        
        // Add file content to the message
        contents[0].parts.push({ text: `\n\nFile content (${uploadedFile.name}):\n\n${fileContent}` });
      } 
      // For PDFs and images, use File API
      else if (['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)) {
        const fileData = fs.readFileSync(filePath);
        const base64Data = fileData.toString('base64');
        
        // Add file to parts with MIME type
        contents[0].parts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        });
      }
    }

    // Generate response from Gemini
    const result = await model.generateContent({
      contents: contents
    });
    
    const response = await result.response;
    const rawAnswer = response.text();
    
    // Clean the response - remove comment lines
    const answer = cleanResponse(rawAnswer);

    res.json({ 
      _status: "Success", 
      answer,
      timestamp: new Date().toISOString(),
      message: "Response generated successfully"
    });
    
  } catch (error) {
    console.error("❌ Error generating content:", error);
    
    res.status(500).json({ 
      error: "Error generating content",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Compile API
app.post('/api/compiler', async (req, res) => {
  const { code, language, input } = req.body;
    console.log(req.body);
  const languageMap = {
    python: { language: 'python', version: '3.10.0' },
    java: { language: 'java', version: '15.0.2' },
    c: { language: 'c', version: '10.2.0' },
    Cpp: { language: 'c++', version: '10.2.0' }
  };

  if (!languageMap[language]) {
    return res.status(400).json({ error: 'Unsupported language' });
  }

  try {
    const response = await axios.post(
      'https://emkc.org/api/v2/piston/execute',
      {
        language: languageMap[language].language,
        version: languageMap[language].version,
        files: [{ name: 'main', content: code }],
        stdin: input || ''
      }
    );

    const { stdout, stderr, code: exitCode } = response.data.run;
    res.json({ output: stdout, error: stderr, exitCode });
  } catch (err) {
    res.status(500).json({ error: 'Compilation failed' });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/papers', paperRoutes);
app.use('/api/admin', adminRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// Error handler middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Server Error'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
