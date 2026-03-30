/**
 * Chatbot Service — Agentic RAG Orchestrator
 * Located at Backend/server/chatbot/chatbot_service.js
 */

const { retrieveContext } = require('./ragPipeline');
const { runAgentLoop, executePendingAction } = require('./agentEngine');
const ChatSession = require('./chatHistory');

/**
 * Process a chat message through the full Agentic RAG pipeline
 */
async function processMessage(message, sessionId, user) {
  const userId = user._id;
  const organizationId = user.organizationId || user._id;
  const agentContext = { organizationId, userId };

  // 1. Retrieve RAG context
  const { context, errors } = await retrieveContext(message, organizationId);
  if (errors) console.warn('[Chatbot] RAG warnings:', errors);

  // 2. Find or create session
  let session = await ChatSession.findOne({ sessionId, userId });
  if (!session) {
    session = new ChatSession({
      sessionId, userId, organizationId,
      messages: [],
      title: message.slice(0, 50) + (message.length > 50 ? '…' : '')
    });
  }

  // 3. Build conversation history (last 20 messages)
  const conversationHistory = session.messages.slice(-20).map(m => ({
    role: m.role, content: m.content
  }));

  // 4. Run agentic loop
  const { reply, actionsLog, pendingAction, iterationsUsed } = await runAgentLoop(
    message, context, conversationHistory, agentContext
  );

  const timestamp = new Date();

  // 5. Persist messages
  session.messages.push({ role: 'user', content: message, timestamp });
  session.messages.push({
    role: 'assistant', content: reply, timestamp,
    metadata: { actionsLog: actionsLog || [], hasPendingAction: !!pendingAction, iterationsUsed }
  });

  // Store pending action (serialized)
  session.pendingAction = pendingAction ? JSON.stringify(pendingAction) : null;

  // Cap at 100 messages
  if (session.messages.length > 100) session.messages = session.messages.slice(-100);

  await session.save();

  return { reply, sessionId, timestamp, actionsLog, hasPendingAction: !!pendingAction, contextUsed: !!context };
}

/**
 * Execute a pending (confirmed) agent action
 */
async function confirmPendingAction(sessionId, user) {
  const userId = user._id;
  const organizationId = user.organizationId || user._id;
  const agentContext = { organizationId, userId };

  const session = await ChatSession.findOne({ sessionId, userId });
  if (!session || !session.pendingAction) {
    return { reply: 'No pending action found for this session.', actionsLog: [], sessionId };
  }

  let pendingAction;
  try { pendingAction = JSON.parse(session.pendingAction); }
  catch (e) { return { reply: 'Failed to parse pending action.', actionsLog: [], sessionId }; }

  const { reply, actionsLog } = await executePendingAction(pendingAction, agentContext);
  const timestamp = new Date();

  session.messages.push({ role: 'user', content: '✅ Yes, proceed.', timestamp });
  session.messages.push({
    role: 'assistant', content: reply, timestamp,
    metadata: { actionsLog, confirmed: true }
  });
  session.pendingAction = null;
  await session.save();

  return { reply, actionsLog, sessionId, timestamp };
}

/**
 * Cancel a pending agent action
 */
async function cancelPendingAction(sessionId, user) {
  const session = await ChatSession.findOne({ sessionId, userId: user._id });
  if (!session) return { success: false };

  const timestamp = new Date();
  session.pendingAction = null;
  session.messages.push({
    role: 'assistant',
    content: '❌ Action cancelled. No changes were made.',
    timestamp
  });
  await session.save();

  return { reply: '❌ Action cancelled. No changes were made.', sessionId, timestamp, success: true };
}

/**
 * Get chat history for a session
 */
async function getChatHistory(sessionId, userId, limit = 50) {
  const session = await ChatSession.findOne({ sessionId, userId });
  if (!session) return { messages: [], sessionId };

  return {
    messages: session.messages.slice(-limit),
    sessionId,
    title: session.title,
    createdAt: session.createdAt,
    hasPendingAction: !!session.pendingAction
  };
}

/**
 * List all sessions for a user
 */
async function listUserSessions(userId) {
  return ChatSession.find({ userId })
    .select('sessionId title createdAt updatedAt')
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean();
}

/**
 * Clear chat history for a session
 */
async function clearChatHistory(sessionId, userId) {
  const session = await ChatSession.findOne({ sessionId, userId });
  if (!session) return false;
  session.messages = [];
  session.title = 'New Chat';
  session.pendingAction = null;
  await session.save();
  return true;
}

/**
 * Delete a chat session entirely
 */
async function deleteSession(sessionId, userId) {
  const result = await ChatSession.deleteOne({ sessionId, userId });
  return result.deletedCount > 0;
}

module.exports = {
  processMessage,
  confirmPendingAction,
  cancelPendingAction,
  getChatHistory,
  listUserSessions,
  clearChatHistory,
  deleteSession
};
