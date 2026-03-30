/**
 * Chatbot Service — Agentic RAG Orchestrator
 *
 * Orchestrates the full agentic pipeline:
 * 1. Retrieve relevant context from MongoDB via ragPipeline
 * 2. Run the agentic loop (agentEngine) — LLM + tool calls
 * 3. Persist Q&A + action logs to ChatSession in MongoDB
 * 4. Handle pending confirmation flow
 */

const { retrieveContext } = require('./ragPipeline');
const { runAgentLoop, executePendingAction } = require('./agentEngine');
const ChatSession = require('./chatHistory');

/**
 * Process a chat message through the Agentic RAG pipeline
 */
async function processMessage(message, sessionId, user) {
  const userId = user._id;
  const organizationId = user.organizationId || user._id;
  const agentContext = { organizationId, userId };

  // 1. Retrieve relevant context from MongoDB
  const { context, errors } = await retrieveContext(message, organizationId);
  if (errors) console.warn('[Chatbot] RAG retrieval warnings:', errors);

  // 2. Find or create chat session
  let session = await ChatSession.findOne({ sessionId, userId });
  if (!session) {
    session = new ChatSession({
      sessionId,
      userId,
      organizationId,
      messages: [],
      title: message.slice(0, 50) + (message.length > 50 ? '…' : '')
    });
  }

  // 3. Build conversation history for the LLM (last 20 messages)
  const recentMessages = session.messages.slice(-20);
  const conversationHistory = recentMessages.map(m => ({
    role: m.role,
    content: m.content
  }));

  // 4. Run the agentic loop
  const { reply, actionsLog, pendingAction, iterationsUsed } = await runAgentLoop(
    message,
    context,
    conversationHistory,
    agentContext
  );

  const timestamp = new Date();

  // 5. Persist user message
  session.messages.push({ role: 'user', content: message, timestamp });

  // 6. Persist assistant reply
  session.messages.push({
    role: 'assistant',
    content: reply,
    timestamp,
    metadata: {
      actionsLog: actionsLog || [],
      hasPendingAction: !!pendingAction,
      iterationsUsed
    }
  });

  // Store pending action in session for later confirmation
  if (pendingAction) {
    session.pendingAction = JSON.stringify(pendingAction);
  } else {
    session.pendingAction = null;
  }

  // Keep max 100 messages per session
  if (session.messages.length > 100) {
    session.messages = session.messages.slice(-100);
  }

  await session.save();

  return {
    reply,
    sessionId,
    timestamp,
    actionsLog,
    hasPendingAction: !!pendingAction,
    contextUsed: !!context
  };
}

/**
 * Confirm and execute a pending agent action
 */
async function confirmPendingAction(sessionId, user) {
  const userId = user._id;
  const organizationId = user.organizationId || user._id;
  const agentContext = { organizationId, userId };

  const session = await ChatSession.findOne({ sessionId, userId });

  if (!session || !session.pendingAction) {
    return {
      reply: 'No pending action found for this session.',
      actionsLog: [],
      sessionId
    };
  }

  let pendingAction;
  try {
    pendingAction = JSON.parse(session.pendingAction);
  } catch (e) {
    return { reply: 'Failed to parse pending action.', actionsLog: [], sessionId };
  }

  // Execute the pending action
  const { reply, actionsLog } = await executePendingAction(pendingAction, agentContext);

  const timestamp = new Date();

  // Record confirmation and result in chat history
  session.messages.push({
    role: 'user',
    content: '✅ Yes, proceed.',
    timestamp
  });
  session.messages.push({
    role: 'assistant',
    content: reply,
    timestamp,
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
  return {
    reply: '❌ Action cancelled. No changes were made.',
    sessionId,
    timestamp,
    success: true
  };
}

/**
 * Get chat history for a session
 */
async function getChatHistory(sessionId, userId, limit = 50) {
  const session = await ChatSession.findOne({ sessionId, userId });
  if (!session) return { messages: [], sessionId };

  const messages = session.messages.slice(-limit);
  return {
    messages,
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
  const sessions = await ChatSession.find({ userId })
    .select('sessionId title createdAt updatedAt')
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean();
  return sessions;
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
