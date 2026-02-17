import Chat from '../models/Chat.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';

// Get all users for chat (excluding current user)
export const getAllUsers = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const users = await User.find({ _id: { $ne: userId } })
      .select('_id name email profileImage isOnline')
      .limit(100);

    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ FIX: getConversations — was being called with wrong URL from context
export const getConversations = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const conversations = await Conversation.find({
      'participants.userId': userId,
      isActive: true
    })
      .sort({ updatedAt: -1 })
      .populate('participants.userId', 'name profileImage email');

    res.status(200).json({ success: true, conversations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ FIX: getChatHistory — now uses dynamic conversationId from params (was hardcoded before)
export const getChatHistory = async (req, res) => {
  console.log(req.params);
  try {
    const { conversationId } = req.params;
    const userId = req.user._id || req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    if (!conversationId) {
      return res.status(400).json({ success: false, message: 'conversationId is required' });
    }

    const conversation = await Conversation.findOne({ conversationId });

    if (!conversation) {
      // New conversation — verify user belongs to it
      const userIds = conversationId.split('-');
      if (!userIds.includes(userId.toString())) {
        return res.status(403).json({ success: false, message: 'Unauthorized access to conversation' });
      }
      return res.status(200).json({ success: true, messages: [], total: 0, isNewConversation: true });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId.toString() === userId.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to conversation' });
    }

    const messages = await Chat.find({ conversationId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip);

    // Mark all received messages as read
    await Chat.updateMany(
      { conversationId, recipientId: userId, isRead: false },
      { isRead: true }
    );

    const total = await Chat.countDocuments({ conversationId });

    res.status(200).json({
      success: true,
      messages: messages.reverse(),
      total
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET single chat by recipientId (for quick access when starting new conversation)
export const getChat = async (req, res) => {
  try {
    const { receivedId } = req.params;
    const userId = req.user._id || req.user.id;
    const conversationId = [userId.toString(), receivedId].sort().join('-');
    const messages = await Chat.find({ conversationId }).sort({ timestamp: -1 }).limit(50);

    res.status(200).json({ success: true, messages: messages.reverse() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

// ✅ Send a message (with optional replyTo support)
export const sendMessage = async (req, res) => {
  try {
    const {
      recipientId,
      message,
      messageType = 'text',
      fileUrl = null,
      fileName = null,
      replyTo = null
    } = req.body;

    const senderId = req.user._id || req.user.id;

    if (!recipientId || !message) {
      return res.status(400).json({ success: false, message: 'Recipient and message are required' });
    }

    const sender = await User.findById(senderId);
    const recipient = await User.findById(recipientId);

    if (!sender || !recipient) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Build conversationId (sorted for consistency)
    const ids = [senderId.toString(), recipientId.toString()].sort();
    const conversationId = `${ids[0]}-${ids[1]}`;

    const chatData = {
      conversationId,
      senderId,
      senderName: sender.name,
      senderImage: sender.profileImage,
      recipientId,
      recipientName: recipient.name,
      message,
      messageType,
      fileUrl,
      fileName
    };

    if (replyTo && replyTo._id) {
      chatData.replyTo = {
        _id: replyTo._id,
        message: replyTo.message,
        senderName: replyTo.senderName
      };
    }

    const chat = new Chat(chatData);
    await chat.save();

    // Update or create conversation record
    let conversation = await Conversation.findOne({ conversationId });

    if (!conversation) {
      conversation = new Conversation({
        conversationId,
        participants: [
          { userId: senderId, name: sender.name, profileImage: sender.profileImage },
          { userId: recipientId, name: recipient.name, profileImage: recipient.profileImage }
        ],
        lastMessage: { content: message, senderId, timestamp: new Date() },
        unreadCount: new Map([[recipientId.toString(), 1]])
      });
    } else {
      conversation.lastMessage = { content: message, senderId, timestamp: new Date() };
      const currentUnread = conversation.unreadCount.get(recipientId.toString()) || 0;
      conversation.unreadCount.set(recipientId.toString(), currentUnread + 1);
      conversation.updatedAt = new Date();
    }

    await conversation.save();

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      chat
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Mark messages as read
export const markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.body;
    const userId = req.user._id || req.user.id;

    await Chat.updateMany(
      { conversationId, recipientId: userId, isRead: false },
      { isRead: true }
    );

    await Conversation.updateOne(
      { conversationId },
      { $set: { [`unreadCount.${userId}`]: 0 } }
    );

    res.status(200).json({ success: true, message: 'Messages marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get unread count
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const unreadMessages = await Chat.countDocuments({ recipientId: userId, isRead: false });
    res.status(200).json({ success: true, unreadCount: unreadMessages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a message
export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id || req.user.id;

    const message = await Chat.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    if (message.senderId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this message' });
    }

    await Chat.findByIdAndDelete(messageId);
    res.status(200).json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Search users for chat
export const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    const userId = req.user._id || req.user.id;

    if (!query || query.length < 2) {
      return res.status(400).json({ success: false, message: 'Query must be at least 2 characters' });
    }

    const users = await User.find({
      _id: { $ne: userId },
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    }).select('_id name email profileImage').limit(10);

    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Clear all messages in a conversation
export const clearConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id || req.user.id;

    const conversation = await Conversation.findOne({ conversationId });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId.toString() === userId.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Unauthorized to clear this conversation' });
    }

    const result = await Chat.deleteMany({ conversationId });

    res.status(200).json({
      success: true,
      message: 'All messages cleared successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}