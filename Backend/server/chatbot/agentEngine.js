/**
 * Agent Engine — Agentic Loop Orchestrator
 * Multi-step tool-calling loop using Groq's function-calling API.
 *
 * Loop:
 *   1. Build prompt with RAG context
 *   2. Call LLM with tool schemas
 *   3. If tool requested → check if it needs confirmation
 *      - Yes: return pendingAction (don't execute yet)
 *      - No:  execute → feed result back → repeat up to MAX_ITERATIONS
 *   4. Return { reply, actionsLog, pendingAction }
 */

const Groq = require('groq-sdk');
const { TOOLS, TOOL_SCHEMAS } = require('./agentTools');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MAX_ITERATIONS = 3;

// ─── System Prompt ────────────────────────────────────────────────────────────
function buildSystemPrompt(ragContext) {
  return `You are Sangrahak AI — an intelligent, agentic inventory management assistant for the Sangrahak Logistics Control System.

You have two capabilities:
1. **Answer questions** using real-time inventory data below
2. **Take actions** by calling tools to automate inventory tasks

## Real-Time Inventory Data:
---
${ragContext || 'No inventory data available at this time.'}
---

## Guidelines:
- Use tools when the user wants to DO something (reorder, update, report, acknowledge)
- Answer directly when the user wants to KNOW something
- Before calling WRITE tools (create_stock_request, update_reorder_point, acknowledge_alerts), explain what you're about to do
- Show tool results in a clear format with emojis for readability
- Format currency in Indian Rupees (₹)
- Be proactive — if you notice critical issues in the data, flag them
- If a request is ambiguous, ask a clarifying question`;
}

// ─── Format tool result for LLM ───────────────────────────────────────────────
function formatToolResult(toolName, result) {
  if (!result.success) return `Tool "${toolName}" failed: ${result.message}`;
  return JSON.stringify({ status: 'success', message: result.message, data: result.data }, null, 2);
}

// ─── Check if tool needs user confirmation ────────────────────────────────────
function requiresConfirmation(toolName) {
  return TOOLS[toolName]?.requiresConfirmation === true;
}

// ─── Execute a single tool call ───────────────────────────────────────────────
async function executeToolCall(toolCall, agentContext) {
  const toolName = toolCall.function?.name;
  const tool = TOOLS[toolName];

  if (!tool) {
    return {
      toolCallId: toolCall.id,
      toolName,
      result: { success: false, data: null, message: `Unknown tool: ${toolName}` }
    };
  }

  let params = {};
  try { params = JSON.parse(toolCall.function?.arguments || '{}'); } catch (e) {
    return { toolCallId: toolCall.id, toolName, result: { success: false, data: null, message: 'Invalid tool parameters.' } };
  }

  const result = await tool.execute(params, agentContext);
  return { toolCallId: toolCall.id, toolName, params, result };
}

// ─── Main Agentic Loop ────────────────────────────────────────────────────────
/**
 * @param {string} userMessage
 * @param {string} ragContext
 * @param {Array}  conversationHistory — [{role, content}]
 * @param {Object} agentContext — { organizationId, userId }
 * @returns {{ reply, actionsLog, pendingAction, iterationsUsed }}
 */
async function runAgentLoop(userMessage, ragContext, conversationHistory, agentContext) {
  const actionsLog = [];
  let iterationsUsed = 0;

  const messages = [
    { role: 'system', content: buildSystemPrompt(ragContext) },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterationsUsed++;

    let response;
    try {
      response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools: TOOL_SCHEMAS,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 1500,
        top_p: 0.9
      });
    } catch (e) {
      console.error('[AgentEngine] LLM call failed:', e.message);
      throw e;
    }

    const choice = response.choices?.[0];
    if (!choice) break;

    const finishReason = choice.finish_reason;
    const assistantMessage = choice.message;

    // Direct answer — no tool calls
    if (finishReason === 'stop' || finishReason === 'length') {
      return { reply: assistantMessage.content || 'No response generated.', actionsLog, pendingAction: null, iterationsUsed };
    }

    // Tool calls requested
    if (finishReason === 'tool_calls') {
      const toolCalls = assistantMessage.tool_calls || [];

      // Check if any tool needs confirmation
      const needsConfirm = toolCalls.some(tc => requiresConfirmation(tc.function?.name));

      if (needsConfirm) {
        // Ask LLM to phrase a confirmation request
        const actionDescriptions = toolCalls.map(tc => ({
          toolName: tc.function?.name,
          params: (() => { try { return JSON.parse(tc.function?.arguments || '{}'); } catch { return {}; } })(),
          toolCallId: tc.id
        }));

        const confirmResponse = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            ...messages,
            assistantMessage,
            {
              role: 'user',
              content: `Before executing, describe clearly what you're about to do based on these actions: ${JSON.stringify(actionDescriptions)}. Be specific about what will change. Ask: "Shall I proceed? (yes/no)"`
            }
          ],
          temperature: 0.4,
          max_tokens: 400
        });

        const confirmMessage = confirmResponse.choices?.[0]?.message?.content ||
          `I'm about to perform: ${actionDescriptions.map(a => a.toolName).join(', ')}. Shall I proceed?`;

        return {
          reply: confirmMessage,
          actionsLog,
          pendingAction: { toolCalls: actionDescriptions, originalMessages: [...messages, assistantMessage] },
          iterationsUsed
        };
      }

      // No confirmation needed — execute tools
      messages.push(assistantMessage);

      const toolResults = await Promise.all(toolCalls.map(tc => executeToolCall(tc, agentContext)));

      toolResults.forEach(({ toolName, params, result }) => {
        actionsLog.push({ toolName, params, success: result.success, message: result.message, timestamp: new Date().toISOString() });
      });

      toolResults.forEach(({ toolCallId, toolName, result }) => {
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: formatToolResult(toolName, result) });
      });

      continue; // Let LLM produce final answer
    }

    break;
  }

  // Final answer after exhausting iterations
  const finalResponse = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.4,
    max_tokens: 1200
  });

  return {
    reply: finalResponse.choices?.[0]?.message?.content || 'Actions completed.',
    actionsLog,
    pendingAction: null,
    iterationsUsed
  };
}

// ─── Execute confirmed pending action ─────────────────────────────────────────
async function executePendingAction(pendingAction, agentContext) {
  const actionsLog = [];
  const { toolCalls, originalMessages } = pendingAction;
  const messages = [...originalMessages];

  const toolResults = await Promise.all(
    toolCalls.map(async ({ toolName, params, toolCallId }) => {
      const tool = TOOLS[toolName];
      if (!tool) return { toolCallId, toolName, params, result: { success: false, data: null, message: `Unknown tool: ${toolName}` } };
      const result = await tool.execute(params, agentContext);
      return { toolCallId, toolName, params, result };
    })
  );

  toolResults.forEach(({ toolName, params, result, toolCallId }) => {
    actionsLog.push({ toolName, params, success: result.success, message: result.message, timestamp: new Date().toISOString() });
    messages.push({ role: 'tool', tool_call_id: toolCallId, content: formatToolResult(toolName, result) });
  });

  const finalResponse = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.4,
    max_tokens: 800
  });

  return {
    reply: finalResponse.choices?.[0]?.message?.content || 'Action completed successfully.',
    actionsLog,
    pendingAction: null
  };
}

module.exports = { runAgentLoop, executePendingAction };
