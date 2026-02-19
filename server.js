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
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
// Route imports 
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import branchRoutes from './routes/branchRoutes.js';
import paperRoutes from './routes/paperRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
// import compileRoutes from './routes/compilerRoute.js';

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
  // origin: "https://major-project-git-main-saifs-projects-e8e089b8.vercel.app/",
  origin: process.env.FRONTEND_URL,
  credentials: true
}));  

// console.log("Frontend URL:", process.env.FRONTEND_URL);
 
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
app.post("/api/compiler", async (req, res) => {
  const { code, language, input } = req.body;

  const languageMap = {
    python: 71,
    java: 62,
    c: 50
  }; 
 
  try {
    const response = await axios.post(
      "https://ce.judge0.com/submissions?base64_encoded=false&wait=true",
      {
        source_code: code,
        language_id: languageMap[language],
        stdin: input || ""
      }
    );

    res.json({
      output: response.data.stdout,
      error: response.data.stderr,
      status: response.data.status.description
    });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Execution failed" });
  }
});


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/papers', paperRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);
// app.use('/api/compiler', compileRoutes); // Add compiler route

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

// Create HTTP server and Socket.IO instance
const server = createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Map to store active user socket connections
const userSocketMap = new Map();

// Socket.IO middleware for authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication failed'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    socket.userName = decoded.name;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`👤 User connected: ${socket.userId} (${socket.id})`);
  
  // Map user ID to socket ID for direct messaging
  userSocketMap.set(socket.userId, socket.id);
  
  // Broadcast online users
  io.emit('usersOnline', Array.from(userSocketMap.keys()));

  // User joins a conversation room
  socket.on('joinConversation', (conversationId) => {
    socket.join(conversationId);
    console.log(`📍 User ${socket.userId} joined conversation: ${conversationId}`);
    
    // Notify other user in conversation
    socket.broadcast.to(conversationId).emit('userJoined', {
      userId: socket.userId,
      userName: socket.userName
    });
  });

  // Handle new message
 // Handle new message — ✅ FIX: includes replyTo in socket handler
  socket.on('sendMessage', async (data) => {
    const {
      conversationId,
      recipientId,
      message,
      messageType = 'text',
      fileUrl,
      fileName,
      replyTo = null   // ✅ FIX: was missing, caused replyTo to never persist via socket
    } = data;

    console.log(`💬 [BACKEND] Message from ${socket.userId} to ${recipientId}: ${message.substring(0, 50)}`);

    try {
      const Chat = await import('./models/Chat.js').then(m => m.default);
      const User = await import('./models/User.js').then(m => m.default);
      const Conversation = await import('./models/Conversation.js').then(m => m.default);

      const sender = await User.findById(socket.userId);
      const recipient = await User.findById(recipientId);

      if (!sender || !recipient) {
        socket.emit('messageError', { error: 'Sender or recipient not found' });
        return;
      }

      // ✅ FIX: Build chatData with optional replyTo
      const chatData = {
        conversationId,
        senderId: socket.userId,
        senderName: sender.name,
        senderImage: sender.profileImage,
        recipientId,
        recipientName: recipient.name || 'Unknown',
        message,
        messageType,
        fileUrl,
        fileName,
        timestamp: new Date()
      };

      if (replyTo && replyTo._id) {
        chatData.replyTo = {
          _id: replyTo._id,
          message: replyTo.message,
          senderName: replyTo.senderName
        };
      }

      const newMessage = new Chat(chatData);
      await newMessage.save();
      console.log(`💾 [BACKEND] Message saved: ${newMessage._id}`);

      // Create or update conversation
      let conversation = await Conversation.findOne({ conversationId });

      if (!conversation) {
        conversation = new Conversation({
          conversationId,
          participants: [
            { userId: socket.userId, name: sender.name, profileImage: sender.profileImage },
            { userId: recipientId, name: recipient.name, profileImage: recipient.profileImage }
          ],
          lastMessage: { content: message, senderId: socket.userId, timestamp: new Date() },
          unreadCount: new Map([[recipientId, 1]]),
          isActive: true
        });
        console.log(`📝 [BACKEND] New conversation created: ${conversationId}`);
      } else {
        conversation.lastMessage = { content: message, senderId: socket.userId, timestamp: new Date() };
        const currentUnread = conversation.unreadCount.get(recipientId) || 0;
        conversation.unreadCount.set(recipientId, currentUnread + 1);
        conversation.updatedAt = new Date();
        conversation.isActive = true;
        console.log(`✏️ [BACKEND] Conversation updated: ${conversationId}`);
      }

      await conversation.save();

      // ✅ Emit to both users in the conversation room (includes replyTo for UI)
      io.to(conversationId).emit('messageReceived', {
        _id: newMessage._id,
        conversationId,
        senderId: socket.userId,
        senderName: sender.name,
        senderImage: sender.profileImage,
        recipientId,
        message,
        messageType,
        fileUrl,
        fileName,
        replyTo: newMessage.replyTo || null,  // ✅ FIX: pass replyTo back to clients
        timestamp: newMessage.timestamp,
        isRead: false
      });
      console.log(`✅ [BACKEND] Message emitted to room: ${conversationId}`);

      // Notification to recipient if they're online
      const recipientSocketId = userSocketMap.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('newMessageNotification', {
          senderId: socket.userId,
          senderName: sender.name,
          senderImage: sender.profileImage,
          conversationId,
          message: message.substring(0, 50),
          timestamp: new Date()
        });
        console.log(`🔔 [BACKEND] Notification sent to: ${recipientId}`);
      }
    } catch (error) {
      console.error('❌ [BACKEND] Error saving message:', error);
      socket.emit('messageError', {
        error: 'Failed to save message',
        details: error.message
      });
    }
  });
  // Handle typing indicator
  socket.on('typing', (data) => {
    const { conversationId, userName } = data;
    socket.broadcast.to(conversationId).emit('userTyping', {
      userId: socket.userId,
      userName,
      conversationId
    });
  });

  // Handle stop typing
  socket.on('stopTyping', (conversationId) => {
    socket.broadcast.to(conversationId).emit('userStoppedTyping', {
      userId: socket.userId,
      conversationId
    });
  });

  // Handle message read receipt
  socket.on('markAsRead', async (data) => {
    const { conversationId, messageIds } = data;
    
    try {
      const Chat = await import('./models/Chat.js').then(m => m.default);
      await Chat.updateMany(
        { _id: { $in: messageIds } },
        { isRead: true }
      );
      
      io.to(conversationId).emit('messagesRead', {
        messageIds,
        readBy: socket.userId,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('❌ Error marking messages as read:', error);
    }
  });

  // Handle user going offline
  socket.on('leaveConversation', (conversationId) => {
    socket.leave(conversationId);
    console.log(`👋 User ${socket.userId} left conversation: ${conversationId}`);
    
    socket.broadcast.to(conversationId).emit('userLeft', {
      userId: socket.userId,
      userName: socket.userName
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    userSocketMap.delete(socket.userId);
    console.log(`❌ User disconnected: ${socket.userId}`);
    
    // Broadcast updated online users
    io.emit('usersOnline', Array.from(userSocketMap.keys()));
    
    // Notify other users that this user is offline
    socket.broadcast.emit('userOffline', {
      userId: socket.userId,
      userName: socket.userName
    });
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`❌ Socket error for ${socket.userId}:`, error);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`💭 Real-time chat enabled with Socket.IO`);
});
