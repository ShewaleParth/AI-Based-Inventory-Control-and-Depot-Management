/**
 * Chatbot Service — RAG Orchestrator
 *
 * Orchestrates the full RAG pipeline:
 * 1. Retrieve relevant context from MongoDB via ragPipeline
 * 2. Build a system prompt with that context
 * 3. Call GROQ LLM for a response
 * 4. Persist Q&A to ChatSession in MongoDB
 */

const Groq = require('groq-sdk');
const { retrieveContext } = require('./ragPipeline');
const ChatSession = require('./chatHistory');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT_TEMPLATE = (context) => `You are Sangrahak AI — an intelligent inventory management assistant for the Sangrahak Logistics Control System.

You have access to the following real-time inventory data retrieved from the database:

---
${context || 'No inventory data available at this time.'}
---

GUIDELINES:
- Answer questions based ONLY on the data provided above.
- Be concise, helpful, and professional.
- Use bullet points or tables when listing multiple items.
- If the data doesn't contain what the user is asking about, say so honestly.
- Always include specific numbers, product names, or depot names from the data when relevant.
- Do not make up data not present in the context.
- For critical issues (low stock, alerts), proactively highlight them.
- Format currency amounts in Indian Rupees (₹).
- Keep responses clear and actionable.`;

/**
 * Process a chat message through the RAG pipeline
 * @param {string} message - User's message
 * @param {string} sessionId - Chat session ID
 * @param {Object} user - Authenticated user object { _id, organizationId }
 * @returns {Object} { reply, sessionId, timestamp }
 */
async function processMessage(message, sessionId, user) {
  const userId = user._id;
  const organizationId = user.organizationId || user._id;

  // 1. Retrieve relevant context from MongoDB
  const { context, errors } = await retrieveContext(message, organizationId);

  if (errors) {
    console.warn('[Chatbot] RAG retrieval warnings:', errors);
  }

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

  // 3. Build conversation history for the LLM (last 10 exchanges for context window)
  const recentMessages = session.messages.slice(-20);
  const conversationHistory = recentMessages.map(m => ({
    role: m.role,
    content: m.content
  }));

  // 4. Call GROQ LLM
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_TEMPLATE(context) },
      ...conversationHistory,
      { role: 'user', content: message }
    ],
    temperature: 0.4,
    max_tokens: 1024,
    top_p: 0.9,
  });

  const reply = completion.choices[0]?.message?.content || 'I could not generate a response. Please try again.';
  const timestamp = new Date();

  // 5. Persist messages to MongoDB
  session.messages.push({ role: 'user', content: message, timestamp });
  session.messages.push({ role: 'assistant', content: reply, timestamp });

  // Keep max 100 messages per session to manage storage
  if (session.messages.length > 100) {
    session.messages = session.messages.slice(-100);
  }

  await session.save();

  return {
    reply,
    sessionId,
    timestamp,
    contextUsed: !!context
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
    createdAt: session.createdAt
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
  getChatHistory,
  listUserSessions,
  clearChatHistory,
  deleteSession
};
