import express from 'express';
import { chat as claudeChat } from '../services/claude.js';

const router = express.Router();

// Main chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    // Validate request
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Invalid request format',
        details: 'Messages array is required'
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'Messages array cannot be empty'
      });
    }

    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return res.status(400).json({
        error: 'Invalid message format',
        details: 'Last message must be from user'
      });
    }

    console.log(`Processing query: ${lastMessage.content}`);

    // Call Claude with the message history
    const startTime = Date.now();
    let reply = await claudeChat(messages);
    const elapsed = Date.now() - startTime;

    console.log(`Response generated in ${elapsed}ms`);

    // Check if the reply has been double-encoded (common issue with JSON responses)
    // This happens when markdown text gets JSON.stringify'd multiple times
    if (typeof reply === 'string' && (reply.includes('\\n') || reply.includes('\\"'))) {
      try {
        // Try to parse as JSON string to unescape it
        const unescaped = JSON.parse(`"${reply}"`);
        reply = unescaped;
      } catch (e) {
        // If parsing fails, use the original reply
        // This is fine - it just means it wasn't double-encoded
      }
    }

    // Return the response
    res.json({ reply });

  } catch (error) {
    console.error('Chat error:', error);

    // Handle specific error cases
    if (error.message?.includes('API key')) {
      return res.status(500).json({
        error: 'Configuration error',
        details: 'API key not configured. Please check your .env file.'
      });
    }

    if (error.status === 401) {
      return res.status(500).json({
        error: 'Authentication error',
        details: 'Invalid API key. Please check your .env file.'
      });
    }

    // Generic error response
    res.status(500).json({
      error: 'Failed to process chat message',
      details: process.env.NODE_ENV === 'development' ? error.message : 'An internal error occurred'
    });
  }
});

// Health check endpoint
router.get('/chat/health', (req, res) => {
  res.json({
    status: 'healthy',
    model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
    hasApiKey: !!process.env.ANTHROPIC_API_KEY
  });
});

export default router;