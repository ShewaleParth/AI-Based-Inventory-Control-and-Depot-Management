import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, Send, Trash2, MessageSquare, Loader2, AlertCircle,
  ChevronDown, Zap, CheckCircle2, XCircle, Package,
  Warehouse, BarChart3, AlertTriangle, RefreshCw, ArrowRightLeft,
  ClipboardList, Check, X, Activity, ChevronRight
} from 'lucide-react';
import axios from 'axios';
import './Chatbot.css';

// Axios instance scoped to chatbot
const chatApi = axios.create({ baseURL: '/api/v1/chatbot', withCredentials: true });
let _inMemoryToken = null;
export const setChatbotToken = (t) => { _inMemoryToken = t; };
chatApi.interceptors.request.use((config) => {
  if (_inMemoryToken) config.headers.Authorization = `Bearer ${_inMemoryToken}`;
  return config;
});

// ─── Tool metadata for UI display ───
const TOOL_META = {
  get_low_stock_products:      { icon: '📦', label: 'Low Stock Analysis',       color: '#f59e0b' },
  get_depot_utilization:       { icon: '🏭', label: 'Depot Utilization Check',   color: '#6366f1' },
  calculate_reorder_quantity:  { icon: '🔢', label: 'Reorder Calculation',       color: '#10b981' },
  create_stock_request:        { icon: '📋', label: 'Stock Request Created',     color: '#3b82f6' },
  update_reorder_point:        { icon: '⚙️', label: 'Reorder Point Updated',    color: '#8b5cf6' },
  acknowledge_alerts:          { icon: '✅', label: 'Alerts Acknowledged',       color: '#10b981' },
  generate_inventory_report:   { icon: '📊', label: 'Report Generated',          color: '#ec4899' },
  transfer_stock_recommendation:{ icon: '🔄', label: 'Transfer Analysis',        color: '#06b6d4' }
};

// ─── Quick command presets ───
const QUICK_COMMANDS = [
  { icon: <Package size={14} />,       label: 'Low stock items',          prompt: 'Which products are low on stock and need reordering?' },
  { icon: <RefreshCw size={14} />,     label: 'Suggest reorders',         prompt: 'What should I reorder this week? Give me a prioritized list.' },
  { icon: <BarChart3 size={14} />,     label: 'Inventory report',         prompt: 'Generate a full inventory summary report.' },
  { icon: <Warehouse size={14} />,     label: 'Depot capacity',           prompt: 'Which depots have the most free capacity?' },
  { icon: <AlertTriangle size={14} />, label: 'Active alerts',            prompt: 'Show me all active critical alerts.' },
  { icon: <ArrowRightLeft size={14} />,label: 'Transfer options',         prompt: 'Which depot has surplus stock I can transfer?' },
  { icon: <ClipboardList size={14} />, label: 'Recent transactions',      prompt: 'Show me the latest inventory transactions.' },
  { icon: <Activity size={14} />,      label: 'Overall health',           prompt: 'What is the overall health of my inventory right now?' }
];

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: `👋 **Hello! I'm Sangrahak AI** — your intelligent inventory management assistant.

I now have **agentic capabilities** — I can not only answer your questions but also **take action** on your behalf:

• 📦 **Query** stock levels, depot info, transactions & alerts
• 🔄 **Create** stock reorder requests automatically
• ⚙️ **Update** reorder thresholds with a command
• ✅ **Acknowledge** alerts in bulk
• 📊 **Generate** instant inventory reports
• 🏭 **Analyze** depot utilization and transfer options

Try a quick command below or ask me anything!`,
  timestamp: new Date().toISOString(),
  isWelcome: true
};

function generateSessionId() {
  return 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

// ─── Markdown renderer ───
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

// ─── Action Card Component ───
function ActionCard({ action }) {
  const meta = TOOL_META[action.toolName] || { icon: '⚡', label: action.toolName, color: '#6b7280' };
  return (
    <div className={`action-card ${action.success ? 'action-success' : 'action-failed'}`}>
      <div className="action-card-header">
        <span className="action-icon" style={{ color: meta.color }}>{meta.icon}</span>
        <span className="action-label">{meta.label}</span>
        {action.success
          ? <CheckCircle2 size={14} className="action-status-icon success" />
          : <XCircle size={14} className="action-status-icon failed" />
        }
      </div>
      <p className="action-message">{action.message}</p>
    </div>
  );
}

// ─── Confirmation Dialog ───
function ConfirmationDialog({ onConfirm, onCancel, isLoading }) {
  return (
    <div className="confirmation-dialog">
      <div className="confirm-dialog-icon">
        <Zap size={20} />
      </div>
      <div className="confirm-dialog-body">
        <p className="confirm-dialog-title">Action requires your approval</p>
        <p className="confirm-dialog-subtitle">The AI wants to make changes to your inventory. Review the message above and confirm.</p>
      </div>
      <div className="confirm-dialog-actions">
        <button
          className="confirm-btn confirm-yes"
          onClick={onConfirm}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
          Yes, proceed
        </button>
        <button
          className="confirm-btn confirm-no"
          onClick={onCancel}
          disabled={isLoading}
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Message Bubble Component ───
function MessageBubble({ message, sessionId, onActionComplete, onActionCancel }) {
  const isUser = message.role === 'user';
  const time = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const actionsLog = message.metadata?.actionsLog || [];
  const hasPendingAction = message.metadata?.hasPendingAction;
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const { data } = await chatApi.post('/action/confirm', { sessionId });
      onActionComplete?.(data);
    } catch (e) {
      onActionComplete?.({ reply: 'Failed to execute action. Please try again.', actionsLog: [] });
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    setConfirming(true);
    try {
      const { data } = await chatApi.post('/action/cancel', { sessionId });
      onActionCancel?.(data);
    } catch (e) {
      onActionCancel?.({ reply: '❌ Action cancelled.' });
    } finally {
      setConfirming(false);
    }
  };

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

        {/* Action execution cards */}
        {actionsLog.length > 0 && (
          <div className="action-cards-container">
            <div className="action-cards-label">
              <Activity size={12} />
              <span>Actions Executed</span>
            </div>
            {actionsLog.map((action, i) => (
              <ActionCard key={i} action={action} />
            ))}
          </div>
        )}

        {/* Confirmation dialog for pending actions */}
        {hasPendingAction && (
          <ConfirmationDialog
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            isLoading={confirming}
          />
        )}

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

// ─── Typing Indicator ───
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

// ─── Main Chatbot Component ───
export default function Chatbot() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => {
    const saved = localStorage.getItem('chatbot_session_id');
    if (saved) return saved;
    const newId = generateSessionId();
    localStorage.setItem('chatbot_session_id', newId);
    return newId;
  });
  const [error, setError] = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showQuickCommands, setShowQuickCommands] = useState(false);
  const [hasPendingAction, setHasPendingAction] = useState(false);
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
          setHasPendingAction(data.hasPendingAction || false);
        }
      } catch (e) {
        // New session — that's fine
      }
    };
    loadHistory();
  }, [sessionId]);

  // Scroll tracker
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

  const sendMessage = async (overrideMsg) => {
    const trimmed = (overrideMsg || input).trim();
    if (!trimmed || isLoading) return;

    const userMsg = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setError(null);
    setShowQuickCommands(false);

    try {
      const { data } = await chatApi.post('/chat', { message: trimmed, sessionId });

      const aiMsg = {
        role: 'assistant',
        content: data.reply,
        timestamp: data.timestamp || new Date().toISOString(),
        metadata: {
          actionsLog: data.actionsLog || [],
          hasPendingAction: data.hasPendingAction || false
        }
      };
      setMessages(prev => [...prev, aiMsg]);
      setHasPendingAction(data.hasPendingAction || false);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to get response. Please try again.';
      setError(msg);
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

  // Called when user confirms a pending action
  const handleActionComplete = (data) => {
    const aiMsg = {
      role: 'assistant',
      content: data.reply || 'Action completed.',
      timestamp: data.timestamp || new Date().toISOString(),
      metadata: { actionsLog: data.actionsLog || [], confirmed: true }
    };
    // Replace the last message's pending flag
    setMessages(prev => {
      const updated = prev.map((m, i) => {
        if (i === prev.length - 1 && m.metadata?.hasPendingAction) {
          return { ...m, metadata: { ...m.metadata, hasPendingAction: false } };
        }
        return m;
      });
      return [...updated, aiMsg];
    });
    setHasPendingAction(false);
  };

  const handleActionCancel = (data) => {
    const aiMsg = {
      role: 'assistant',
      content: data.reply || '❌ Action cancelled.',
      timestamp: new Date().toISOString(),
      metadata: { actionsLog: [] }
    };
    setMessages(prev => {
      const updated = prev.map((m, i) => {
        if (i === prev.length - 1 && m.metadata?.hasPendingAction) {
          return { ...m, metadata: { ...m.metadata, hasPendingAction: false } };
        }
        return m;
      });
      return [...updated, aiMsg];
    });
    setHasPendingAction(false);
  };

  const clearChat = async () => {
    try {
      await chatApi.delete('/history', { data: { sessionId } });
    } catch (e) { /* ignore */ }
    const newId = generateSessionId();
    localStorage.setItem('chatbot_session_id', newId);
    setSessionId(newId);
    setMessages([WELCOME_MESSAGE]);
    setError(null);
    setHasPendingAction(false);
  };

  const showSuggestions = messages.length === 1;

  return (
    <div className="chatbot-page">
      {/* ── Header ── */}
      <div className="chatbot-header">
        <div className="chatbot-header-left">
          <div className="chatbot-avatar-large">
            <Bot size={24} />
            <div className="avatar-pulse" />
          </div>
          <div className="chatbot-header-info">
            <h2>Sangrahak AI <span className="agentic-badge">Agentic</span></h2>
            <span className="ai-status">
              <span className="status-dot" />
              GROQ · RAG + Tool Engine Active
              {hasPendingAction && (
                <span className="pending-badge">
                  <Zap size={10} /> Action Pending
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="chatbot-header-actions">
          <button
            className="chat-action-btn"
            onClick={() => setShowQuickCommands(v => !v)}
            title="Quick commands"
          >
            <Zap size={16} />
            <span>Commands</span>
            <ChevronRight size={12} className={`chevron-icon ${showQuickCommands ? 'rotated' : ''}`} />
          </button>
          <button className="chat-action-btn" onClick={clearChat} title="Clear chat">
            <Trash2 size={16} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* ── Quick Commands Panel ── */}
      {showQuickCommands && (
        <div className="quick-commands-panel">
          <p className="quick-commands-title">
            <Zap size={13} /> Quick Actions
          </p>
          <div className="quick-commands-grid">
            {QUICK_COMMANDS.map((cmd, i) => (
              <button
                key={i}
                className="quick-command-btn"
                onClick={() => {
                  setShowQuickCommands(false);
                  sendMessage(cmd.prompt);
                }}
                disabled={isLoading}
              >
                {cmd.icon}
                <span>{cmd.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      <div className="chatbot-messages" ref={messagesContainerRef}>
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            message={msg}
            sessionId={sessionId}
            onActionComplete={handleActionComplete}
            onActionCancel={handleActionCancel}
          />
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

        {/* Initial suggestion chips */}
        {showSuggestions && (
          <div className="chat-suggestions">
            <p className="suggestions-label">Quick starts</p>
            <div className="suggestions-grid">
              {QUICK_COMMANDS.slice(0, 4).map((cmd, i) => (
                <button
                  key={i}
                  className="suggestion-chip"
                  onClick={() => sendMessage(cmd.prompt)}
                >
                  {cmd.icon}
                  {cmd.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Scroll to bottom ── */}
      {showScrollBtn && (
        <button className="scroll-to-bottom" onClick={scrollToBottom}>
          <ChevronDown size={18} />
        </button>
      )}

      {/* ── Input Area ── */}
      <div className="chatbot-input-area">
        <div className="chatbot-input-wrapper">
          <textarea
            ref={inputRef}
            className="chatbot-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasPendingAction
              ? 'Action pending — confirm or cancel above, or ask something else…'
              : 'Ask anything or give a command — e.g. "Reorder rice, qty 500"…'
            }
            rows={1}
            disabled={isLoading}
            maxLength={2000}
          />
          <button
            className={`chat-send-btn ${(!input.trim() || isLoading) ? 'disabled' : ''}`}
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            title="Send message"
          >
            {isLoading ? <Loader2 size={20} className="spin" /> : <Send size={20} />}
          </button>
        </div>
        <p className="input-hint">
          Enter to send · Shift+Enter for new line · <Zap size={10} style={{display:'inline'}} /> Agentic AI — can take actions on your behalf
        </p>
      </div>
    </div>
  );
}
