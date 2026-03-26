const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const uuidv4 = () => randomUUID();
const {
  processMessage, getChatHistory, listUserSessions, clearChatHistory, deleteSession
} = require('./chatbot_service');

// POST /api/v1/chatbot/chat
router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const userId = req.userId;
    const organizationId = req.organizationId;

    if (!message || !message.trim())
      return res.status(400).json({ error: 'Message is required', code: 'EMPTY_MESSAGE' });
    if (message.length > 2000)
      return res.status(400).json({ error: 'Message too long (max 2000 chars)', code: 'MESSAGE_TOO_LONG' });

    const resolvedSessionId = sessionId || uuidv4();
    const result = await processMessage(message.trim(), resolvedSessionId, { _id: userId, organizationId });

    res.json({ success: true, reply: result.reply, sessionId: result.sessionId, timestamp: result.timestamp });
  } catch (error) {
    console.error('[Chatbot] /chat error:', error.message);
    if (error.status === 429 || error.message?.includes('rate limit'))
      return res.status(429).json({ error: 'AI rate limit reached. Please wait a moment.', code: 'RATE_LIMIT' });
    res.status(500).json({ error: 'Failed to process message', code: 'CHAT_ERROR' });
  }
});

// GET /api/v1/chatbot/history?sessionId=xxx&limit=50
router.get('/history', async (req, res) => {
  try {
    const { sessionId, limit = 50 } = req.query;
    if (!sessionId)
      return res.status(400).json({ error: 'sessionId is required', code: 'MISSING_SESSION_ID' });
    const history = await getChatHistory(sessionId, req.userId, parseInt(limit));
    res.json({ success: true, ...history });
  } catch (error) {
    console.error('[Chatbot] /history error:', error.message);
    res.status(500).json({ error: 'Failed to fetch history', code: 'HISTORY_ERROR' });
  }
});

// GET /api/v1/chatbot/sessions
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await listUserSessions(req.userId);
    res.json({ success: true, sessions });
  } catch (error) {
    console.error('[Chatbot] /sessions error:', error.message);
    res.status(500).json({ error: 'Failed to fetch sessions', code: 'SESSIONS_ERROR' });
  }
});

// DELETE /api/v1/chatbot/history — clear messages
router.delete('/history', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId)
      return res.status(400).json({ error: 'sessionId is required', code: 'MISSING_SESSION_ID' });
    const cleared = await clearChatHistory(sessionId, req.userId);
    res.json({ success: cleared, message: cleared ? 'Chat history cleared' : 'Session not found' });
  } catch (error) {
    console.error('[Chatbot] DELETE /history error:', error.message);
    res.status(500).json({ error: 'Failed to clear history', code: 'CLEAR_ERROR' });
  }
});

// DELETE /api/v1/chatbot/session — delete entire session
router.delete('/session', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId)
      return res.status(400).json({ error: 'sessionId is required', code: 'MISSING_SESSION_ID' });
    const deleted = await deleteSession(sessionId, req.userId);
    res.json({ success: deleted, message: deleted ? 'Session deleted' : 'Session not found' });
  } catch (error) {
    console.error('[Chatbot] DELETE /session error:', error.message);
    res.status(500).json({ error: 'Failed to delete session', code: 'DELETE_ERROR' });
  }
});

module.exports = router;
