import express from 'express';
import {
  getAllUsers,
  getConversations,
  getChatHistory,
  sendMessage,
  markAsRead,
  getUnreadCount,
  deleteMessage,
  searchUsers,
  clearConversation,
  getChat
} from '../controllers/chatController.js';
import { protect } from '../middleware/auth.js'; // adjust path as needed

const router = express.Router();

// All routes are protected
router.use(protect);

// Users
router.get('/users', getAllUsers);
router.get('/search/users', searchUsers);

// ✅ FIX: This route MUST exist — ChatContext calls GET /chat/conversations
router.get('/conversations', getConversations);

// Chat history — dynamic conversationId
router.get('/history/:conversationId', getChatHistory);
router.get('/:receivedId', getChat);

// Messages
router.post('/send', sendMessage);
router.post('/mark-read', markAsRead);
router.get('/unread-count', getUnreadCount);

// Delete / clear
router.delete('/message/:messageId', deleteMessage);
router.delete('/clear/:conversationId', clearConversation);

export default router;