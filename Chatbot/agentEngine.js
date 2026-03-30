/**
 * Agent Engine — Agentic Loop Orchestrator
 *
 * Implements a multi-step agentic loop using Groq's function-calling API:
 *
 * 1. Build system prompt with RAG context
 * 2. Call LLM with tool schemas
 * 3. If LLM requests tools → execute them → feed results back → re-call LLM
 * 4. If tool requires confirmation → return pendingAction instead of executing
 * 5. Return final { reply, actionsLog, pendingAction }
 *
 * Max 3 iterations to prevent infinite loops.
 */

const Groq = require('groq-sdk');
const { TOOLS, TOOL_SCHEMAS } = require('./agentTools');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MAX_ITERATIONS = 3;

// ─────────────────────────────────────────────
// System Prompt Builder
// ─────────────────────────────────────────────
function buildSystemPrompt(ragContext) {
  return `You are Sangrahak AI — an intelligent, agentic inventory management assistant for the Sangrahak Logistics Control System.

You have two capabilities:
1. **Answer questions** based on real-time inventory data retrieved from the database
2. **Take actions** by calling tools to automate inventory tasks

## Real-Time Inventory Data:
---
${ragContext || 'No inventory data available at this time.'}
---

## Behavior Guidelines:
- Use tools when the user wants to DO something (reorder, update, acknowledge, report)
- Answer directly when the user wants to KNOW something (questions, queries)
- Before calling any write-action tool (create_stock_request, update_reorder_point, acknowledge_alerts), always tell the user what you're about to do
- Present tool results in a clear, structured format with emojis for readability
- When showing lists, use bullet points or tables
- Format numbers with Indian context (₹ for currency, units clearly labeled)
- If a user request is ambiguous, ask a clarifying question rather than guessing
- Always be proactive — if you see critical issues in the data, flag them
- Keep responses concise but complete

## Available Actions (via tools):
- get_low_stock_products → Find items needing reorder
- get_depot_utilization → Analyze warehouse capacity
- calculate_reorder_quantity → Suggest optimal order quantities
- create_stock_request → Create reorder/transfer requests ⚡ (requires confirmation)
- update_reorder_point → Change minimum stock thresholds ⚡ (requires confirmation)
- acknowledge_alerts → Dismiss/resolve alerts ⚡ (requires confirmation)
- generate_inventory_report → Full inventory summary
- transfer_stock_recommendation → Find best depot to transfer from`;
}

// ─────────────────────────────────────────────
// Format tool result for LLM consumption
// ─────────────────────────────────────────────
function formatToolResult(toolName, result) {
  if (!result.success) {
    return `Tool "${toolName}" failed: ${result.message}`;
  }
  return JSON.stringify({ status: 'success', message: result.message, data: result.data }, null, 2);
}

// ─────────────────────────────────────────────
// Parse tool calls from LLM response
// ─────────────────────────────────────────────
function extractToolCalls(response) {
  const choice = response.choices?.[0];
  if (!choice) return [];
  if (choice.finish_reason !== 'tool_calls') return [];
  return choice.message?.tool_calls || [];
}

// ─────────────────────────────────────────────
// Check if tool requires user confirmation
// ─────────────────────────────────────────────
function requiresConfirmation(toolName) {
  return TOOLS[toolName]?.requiresConfirmation === true;
}

// ─────────────────────────────────────────────
// Execute a single tool call
// ─────────────────────────────────────────────
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
  try {
    params = JSON.parse(toolCall.function?.arguments || '{}');
  } catch (e) {
    return {
      toolCallId: toolCall.id,
      toolName,
      result: { success: false, data: null, message: 'Invalid tool parameters.' }
    };
  }

  const result = await tool.execute(params, agentContext);
  return { toolCallId: toolCall.id, toolName, params, result };
}

// ─────────────────────────────────────────────
// Main Agentic Run Function
// ─────────────────────────────────────────────
/**
 * @param {string} userMessage
 * @param {string} ragContext - retrieved context from ragPipeline
 * @param {Array}  conversationHistory - recent messages [{role, content}]
 * @param {Object} agentContext - { organizationId, userId }
 * @returns {Object} { reply, actionsLog, pendingAction, iterationsUsed }
 */
async function runAgentLoop(userMessage, ragContext, conversationHistory, agentContext) {
  const actionsLog = [];
  let pendingAction = null;
  let iterationsUsed = 0;

  // Build the messages array for the LLM
  const messages = [
    { role: 'system', content: buildSystemPrompt(ragContext) },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  // ── Agentic Loop ──
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    iterationsUsed++;

    // Call GROQ with tool schemas
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

    // ── No tool calls → direct answer ──
    if (finishReason === 'stop' || finishReason === 'length') {
      return {
        reply: assistantMessage.content || 'I was unable to generate a response.',
        actionsLog,
        pendingAction: null,
        iterationsUsed
      };
    }

    // ── Tool calls requested ──
    if (finishReason === 'tool_calls') {
      const toolCalls = assistantMessage.tool_calls || [];

      // Check if ANY of the requested tools require confirmation
      const confirmationRequired = toolCalls.some(tc => requiresConfirmation(tc.function?.name));

      if (confirmationRequired) {
        // Build a plain English description of what's about to happen
        const actionDescriptions = toolCalls.map(tc => {
          const params = JSON.parse(tc.function?.arguments || '{}');
          return { toolName: tc.function?.name, params, toolCallId: tc.id };
        });

        // Ask LLM to generate a confirmation message for the user
        const confirmMsgResponse = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            ...messages,
            assistantMessage,
            {
              role: 'user',
              content: `Before executing the action, ask the user to confirm in a friendly, clear way. Describe exactly what will happen: ${JSON.stringify(actionDescriptions)}. End with "Shall I proceed? (yes/no)"`
            }
          ],
          temperature: 0.4,
          max_tokens: 400
        });

        const confirmMessage = confirmMsgResponse.choices?.[0]?.message?.content ||
          `I'm about to perform: ${actionDescriptions.map(a => a.toolName).join(', ')}. Shall I proceed?`;

        return {
          reply: confirmMessage,
          actionsLog,
          pendingAction: {
            toolCalls: actionDescriptions,
            originalMessages: [...messages, assistantMessage]
          },
          iterationsUsed
        };
      }

      // ── Execute all tool calls (no confirmation needed) ──
      // Add the assistant's tool-call message to context
      messages.push(assistantMessage);

      const toolResults = await Promise.all(
        toolCalls.map(tc => executeToolCall(tc, agentContext))
      );

      // Record each action in the log
      toolResults.forEach(({ toolName, params, result }) => {
        actionsLog.push({
          toolName,
          params,
          success: result.success,
          message: result.message,
          timestamp: new Date().toISOString()
        });
      });

      // Feed tool results back into the conversation
      toolResults.forEach(({ toolCallId, toolName, result }) => {
        messages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: formatToolResult(toolName, result)
        });
      });

      // Continue loop — LLM will now generate a final answer
      continue;
    }

    // Unknown finish reason → break
    break;
  }

  // If we exhausted iterations, make one final call without tools
  const finalResponse = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.4,
    max_tokens: 1200
  });

  return {
    reply: finalResponse.choices?.[0]?.message?.content || 'I completed the requested actions. Please check the results above.',
    actionsLog,
    pendingAction: null,
    iterationsUsed
  };
}

// ─────────────────────────────────────────────
// Execute a previously pending confirmed action
// ─────────────────────────────────────────────
/**
 * Called when user confirms a pending action.
 * @param {Object} pendingAction - { toolCalls, originalMessages }
 * @param {Object} agentContext - { organizationId, userId }
 */
async function executePendingAction(pendingAction, agentContext) {
  const actionsLog = [];
  const { toolCalls, originalMessages } = pendingAction;

  const messages = [...originalMessages];

  // Execute each pending tool call
  const toolResults = await Promise.all(
    toolCalls.map(async ({ toolName, params, toolCallId }) => {
      const tool = TOOLS[toolName];
      if (!tool) {
        return { toolCallId, toolName, params, result: { success: false, data: null, message: `Unknown tool: ${toolName}` } };
      }
      const result = await tool.execute(params, agentContext);
      return { toolCallId, toolName, params, result };
    })
  );

  // Log actions
  toolResults.forEach(({ toolName, params, result }) => {
    actionsLog.push({
      toolName,
      params,
      success: result.success,
      message: result.message,
      timestamp: new Date().toISOString()
    });

    // Feed results into messages
    messages.push({
      role: 'tool',
      tool_call_id: toolResults.find(r => r.toolName === toolName)?.toolCallId,
      content: formatToolResult(toolName, result)
    });
  });

  // Get final LLM summary
  const finalResponse = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.4,
    max_tokens: 800
  });

  return {
    reply: finalResponse.choices?.[0]?.message?.content || 'Actions completed successfully.',
    actionsLog,
    pendingAction: null
  };
}

module.exports = { runAgentLoop, executePendingAction };
