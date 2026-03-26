const Groq = require('groq-sdk');
const mongoose = require('mongoose');
const { retrieveContext } = require('./ragPipeline');
const ChatSession = require('./chatHistory');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = (context) => `You are Sangrahak AI — an intelligent inventory management assistant for the Sangrahak Logistics Control System.

You have access to the following real-time inventory data:

---
${context || 'No inventory data available at this time.'}
---

GUIDELINES:
- Answer ONLY based on the data above.
- Be concise, professional, and use bullet points for lists.
- If data is missing, say so honestly.
- Include specific numbers, names, and ₹ currency.
- Highlight critical issues (low stock, alerts) proactively.`;

async function processMessage(message, sessionId, user) {
  const userId = user._id;
  // Cast to ObjectId so MongoDB equality checks work against the userId field
  const organizationId = mongoose.Types.ObjectId.isValid(user.organizationId)
    ? new mongoose.Types.ObjectId(user.organizationId)
    : new mongoose.Types.ObjectId(userId);


  const { context, errors } = await retrieveContext(message, organizationId);
  if (errors) console.warn('[Chatbot] RAG retrieval warnings:', errors);

  let session = await ChatSession.findOne({ sessionId, userId });
  if (!session) {
    session = new ChatSession({
      sessionId, userId, organizationId, messages: [],
      title: message.slice(0, 50) + (message.length > 50 ? '…' : '')
    });
  }

  const conversationHistory = session.messages.slice(-20).map(m => ({ role: m.role, content: m.content }));

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT(context) },
      ...conversationHistory,
      { role: 'user', content: message }
    ],
    temperature: 0.4,
    max_tokens: 1024,
    top_p: 0.9,
  });

  const reply = completion.choices[0]?.message?.content || 'Could not generate a response. Please try again.';
  const timestamp = new Date();

  session.messages.push({ role: 'user', content: message, timestamp });
  session.messages.push({ role: 'assistant', content: reply, timestamp });
  if (session.messages.length > 100) session.messages = session.messages.slice(-100);

  await session.save();
  return { reply, sessionId, timestamp };
}

async function getChatHistory(sessionId, userId, limit = 50) {
  const session = await ChatSession.findOne({ sessionId, userId });
  if (!session) return { messages: [], sessionId };
  return { messages: session.messages.slice(-limit), sessionId, title: session.title, createdAt: session.createdAt };
}

async function listUserSessions(userId) {
  return ChatSession.find({ userId })
    .select('sessionId title createdAt updatedAt')
    .sort({ updatedAt: -1 }).limit(20).lean();
}

async function clearChatHistory(sessionId, userId) {
  const session = await ChatSession.findOne({ sessionId, userId });
  if (!session) return false;
  session.messages = [];
  session.title = 'New Chat';
  await session.save();
  return true;
}

async function deleteSession(sessionId, userId) {
  const result = await ChatSession.deleteOne({ sessionId, userId });
  return result.deletedCount > 0;
}

module.exports = { processMessage, getChatHistory, listUserSessions, clearChatHistory, deleteSession };
