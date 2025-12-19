import express from 'express';

const router = express.Router();

// Runtime settings state (overrides environment variables)
const runtimeSettings = {
  llmMode: null  // null = use env var, 'primary' or 'fallback' = override
};

/**
 * Get current LLM mode
 * Returns the effective mode (runtime override or env var)
 */
export function getLLMMode() {
  if (runtimeSettings.llmMode !== null) {
    return runtimeSettings.llmMode;
  }
  return process.env.LLM_MODE || 'fallback';
}

/**
 * GET /api/settings
 * Returns current settings
 */
router.get('/settings', (req, res) => {
  const llmMode = getLLMMode();
  res.json({
    llmMode,
    llmModeSource: runtimeSettings.llmMode !== null ? 'runtime' : 'environment',
    claudeModel: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307'
  });
});

/**
 * POST /api/settings/llm-mode
 * Toggle or set LLM mode
 * Body: { mode: 'primary' | 'fallback' | 'toggle' }
 */
router.post('/settings/llm-mode', (req, res) => {
  const { mode } = req.body;
  const currentMode = getLLMMode();

  if (mode === 'toggle') {
    // Toggle between primary and fallback
    runtimeSettings.llmMode = currentMode === 'primary' ? 'fallback' : 'primary';
  } else if (mode === 'primary' || mode === 'fallback') {
    runtimeSettings.llmMode = mode;
  } else if (mode === 'reset') {
    // Reset to use environment variable
    runtimeSettings.llmMode = null;
  } else {
    return res.status(400).json({
      error: 'Invalid mode',
      details: "Mode must be 'primary', 'fallback', 'toggle', or 'reset'"
    });
  }

  const newMode = getLLMMode();
  console.log(`LLM mode changed: ${currentMode} → ${newMode}`);

  res.json({
    llmMode: newMode,
    llmModeSource: runtimeSettings.llmMode !== null ? 'runtime' : 'environment',
    message: `LLM mode set to ${newMode}`
  });
});

export default router;
