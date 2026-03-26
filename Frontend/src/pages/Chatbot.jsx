import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, Send, Trash2, MessageSquare, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import axios from 'axios';
import './Chatbot.css';

// Axios instance scoped to the chatbot — uses Vite proxy, credentials included
const chatApi = axios.create({ baseURL: '/api/v1/chatbot', withCredentials: true });
// Sync the in-memory token into each request via a shared ref populated from AuthContext
let _inMemoryToken = null;
export const setChatbotToken = (t) => { _inMemoryToken = t; };
chatApi.interceptors.request.use((config) => {
  if (_inMemoryToken) config.headers.Authorization = `Bearer ${_inMemoryToken}`;
  return config;
});

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: `👋 **Hello! I'm Sangrahak AI** — your intelligent inventory management assistant.

I have real-time access to your inventory data and can help you with:

• 📦 **Stock levels** — low stock, out-of-stock products
• 🏭 **Depot information** — capacity, locations, status
• 📊 **Transaction history** — recent movements & transfers
• ⚠️ **Active alerts** — critical warnings & shortages
• 📈 **Inventory analytics** — totals, trends, summaries

Try asking:
- *"Which products are low on stock?"*
- *"Show me recent transactions"*
- *"What depots are active?"*`,
  timestamp: new Date().toISOString(),
  isWelcome: true
};

// Generate a session ID (UUID-like)
function generateSessionId() {
  return 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

// Simple markdown renderer (bold, bullets, inline code)
function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/^• (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const time = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`chat-message ${isUser ? 'user-message' : 'ai-message'}`}>
      {!isUser && (
        <div className="message-avatar ai-avatar">
          <Bot size={16} />
        </div>
      )}
      <div className="message-content-wrapper">
        <div
          className={`message-bubble ${isUser ? 'bubble-user' : 'bubble-ai'}`}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
        />
        {time && <span className="message-time">{time}</span>}
      </div>
      {isUser && (
        <div className="message-avatar user-avatar">
          <span>U</span>
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="chat-message ai-message">
      <div className="message-avatar ai-avatar">
        <Bot size={16} />
      </div>
      <div className="typing-indicator">
        <span /><span /><span />
      </div>
    </div>
  );
}

export default function Chatbot() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => {
    // Persist sessionId across page reloads
    const saved = localStorage.getItem('chatbot_session_id');
    if (saved) return saved;
    const newId = generateSessionId();
    localStorage.setItem('chatbot_session_id', newId);
    return newId;
  });
  const [error, setError] = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const { data } = await chatApi.get(`/history?sessionId=${sessionId}&limit=50`);
        if (data.messages && data.messages.length > 0) {
          setMessages([WELCOME_MESSAGE, ...data.messages]);
        }
      } catch (e) {
        // History not available yet — that's fine for new sessions
      }
    };
    loadHistory();
  }, [sessionId]);

  // Track scroll position
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 150);
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const { data } = await chatApi.post('/chat', { message: trimmed, sessionId });

      const aiMsg = {
        role: 'assistant',
        content: data.reply,
        timestamp: data.timestamp || new Date().toISOString()
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to get response. Please try again.';
      setError(msg);
      // Remove the optimistic user message on failure
      setMessages(prev => prev.filter(m => m !== userMsg));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = async () => {
    try {
      await chatApi.delete('/history', { data: { sessionId } });
    } catch (e) { /* ignore */ }
    
    // Generate new session ID after clearing
    const newId = generateSessionId();
    localStorage.setItem('chatbot_session_id', newId);
    setSessionId(newId);
    setMessages([WELCOME_MESSAGE]);
    setError(null);
  };

  const suggestions = [
    'Which products are low on stock?',
    'Show recent transactions',
    'List all active depots',
    'What are the current alerts?'
  ];

  const showSuggestions = messages.length === 1;

  return (
    <div className="chatbot-page">
      {/* Header */}
      <div className="chatbot-header">
        <div className="chatbot-header-left">
          <div className="chatbot-avatar-large">
            <Bot size={24} />
            <div className="avatar-pulse" />
          </div>
          <div className="chatbot-header-info">
            <h2>Sangrahak AI</h2>
            <span className="ai-status">
              <span className="status-dot" />
              Powered by GROQ · RAG Pipeline Active
            </span>
          </div>
        </div>
        <div className="chatbot-header-actions">
          <button className="chat-action-btn" onClick={clearChat} title="Clear chat">
            <Trash2 size={16} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chatbot-messages" ref={messagesContainerRef}>
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {isLoading && <TypingIndicator />}

        {/* Error banner */}
        {error && (
          <div className="chat-error-banner">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Suggested questions */}
        {showSuggestions && (
          <div className="chat-suggestions">
            <p className="suggestions-label">Quick starts</p>
            <div className="suggestions-grid">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="suggestion-chip"
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                >
                  <MessageSquare size={14} />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button className="scroll-to-bottom" onClick={scrollToBottom}>
          <ChevronDown size={18} />
        </button>
      )}

      {/* Input Area */}
      <div className="chatbot-input-area">
        <div className="chatbot-input-wrapper">
          <textarea
            ref={inputRef}
            className="chatbot-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about inventory, stock levels, depots, transactions…"
            rows={1}
            disabled={isLoading}
            maxLength={2000}
          />
          <button
            className={`chat-send-btn ${(!input.trim() || isLoading) ? 'disabled' : ''}`}
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            title="Send message"
          >
            {isLoading ? <Loader2 size={20} className="spin" /> : <Send size={20} />}
          </button>
        </div>
        <p className="input-hint">Press Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
