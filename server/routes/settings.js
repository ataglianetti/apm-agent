import express from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// Runtime settings state (overrides environment variables)
const runtimeSettings = {
  llmMode: null,  // null = use env var, 'primary' or 'fallback' = override
  businessRulesEnabled: null,  // null = use config file, true/false = override
  taxonomyParserEnabled: null  // null = enabled (default), true/false = override
};

// Path to business rules config
const BUSINESS_RULES_PATH = join(__dirname, '../config/businessRules.json');

/**
 * Get business rules config (with caching for performance)
 */
let businessRulesCache = null;
let businessRulesCacheTime = 0;
const CACHE_TTL = 5000; // 5 seconds

function getBusinessRulesConfig() {
  const now = Date.now();
  if (!businessRulesCache || now - businessRulesCacheTime > CACHE_TTL) {
    try {
      const content = readFileSync(BUSINESS_RULES_PATH, 'utf-8');
      businessRulesCache = JSON.parse(content);
      businessRulesCacheTime = now;
    } catch (error) {
      console.error('Failed to read business rules config:', error);
      return null;
    }
  }
  return businessRulesCache;
}

/**
 * Get effective business rules enabled state
 */
export function getBusinessRulesEnabled() {
  if (runtimeSettings.businessRulesEnabled !== null) {
    return runtimeSettings.businessRulesEnabled;
  }
  const config = getBusinessRulesConfig();
  return config?.globalEnabled ?? true;
}

/**
 * Invalidate business rules cache (call after updates)
 */
export function invalidateBusinessRulesCache() {
  businessRulesCache = null;
  businessRulesCacheTime = 0;
}

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
 * Get taxonomy parser enabled state
 * Returns true by default (enabled)
 */
export function getTaxonomyParserEnabled() {
  if (runtimeSettings.taxonomyParserEnabled !== null) {
    return runtimeSettings.taxonomyParserEnabled;
  }
  return true; // Enabled by default
}

/**
 * GET /api/settings
 * Returns current settings
 */
router.get('/settings', (req, res) => {
  const llmMode = getLLMMode();
  const businessRulesEnabled = getBusinessRulesEnabled();
  const taxonomyParserEnabled = getTaxonomyParserEnabled();
  const config = getBusinessRulesConfig();

  // Count active rules
  const activeRules = config?.rules?.filter(r => r.enabled) || [];

  res.json({
    llmMode,
    llmModeSource: runtimeSettings.llmMode !== null ? 'runtime' : 'environment',
    claudeModel: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
    taxonomyParserEnabled,
    taxonomyParserSource: runtimeSettings.taxonomyParserEnabled !== null ? 'runtime' : 'default',
    businessRules: {
      globalEnabled: businessRulesEnabled,
      source: runtimeSettings.businessRulesEnabled !== null ? 'runtime' : 'config',
      activeRuleCount: activeRules.length,
      activeRules: activeRules.map(r => ({ id: r.id, type: r.type, description: r.description }))
    }
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

/**
 * POST /api/settings/business-rules
 * Toggle or set business rules enabled state
 * Body: { enabled: true | false | 'toggle' }
 */
router.post('/settings/business-rules', (req, res) => {
  const { enabled } = req.body;
  const currentEnabled = getBusinessRulesEnabled();

  if (enabled === 'toggle') {
    runtimeSettings.businessRulesEnabled = !currentEnabled;
  } else if (typeof enabled === 'boolean') {
    runtimeSettings.businessRulesEnabled = enabled;
  } else if (enabled === 'reset') {
    // Reset to use config file value
    runtimeSettings.businessRulesEnabled = null;
    invalidateBusinessRulesCache();
  } else {
    return res.status(400).json({
      error: 'Invalid value',
      details: "enabled must be true, false, 'toggle', or 'reset'"
    });
  }

  const newEnabled = getBusinessRulesEnabled();
  const config = getBusinessRulesConfig();
  const activeRules = config?.rules?.filter(r => r.enabled) || [];

  console.log(`Business rules ${newEnabled ? 'ENABLED' : 'DISABLED'} (${activeRules.length} active rules)`);

  res.json({
    globalEnabled: newEnabled,
    source: runtimeSettings.businessRulesEnabled !== null ? 'runtime' : 'config',
    activeRuleCount: activeRules.length,
    activeRules: activeRules.map(r => ({ id: r.id, type: r.type })),
    message: `Business rules ${newEnabled ? 'enabled' : 'disabled'}`
  });
});

/**
 * GET /api/settings/business-rules
 * Get detailed business rules configuration
 */
router.get('/settings/business-rules', (req, res) => {
  const config = getBusinessRulesConfig();
  if (!config) {
    return res.status(500).json({ error: 'Failed to load business rules config' });
  }

  const globalEnabled = getBusinessRulesEnabled();
  const activeRules = config.rules?.filter(r => r.enabled) || [];
  const disabledRules = config.disabled_rules || [];

  res.json({
    version: config.version,
    globalEnabled,
    source: runtimeSettings.businessRulesEnabled !== null ? 'runtime' : 'config',
    rules: {
      active: activeRules,
      activeCount: activeRules.length
    },
    templates: Object.keys(config.templates || {}),
    disabledRulesCount: disabledRules.length
  });
});

/**
 * POST /api/settings/taxonomy-parser
 * Toggle or set taxonomy parser enabled state
 * Body: { enabled: true | false | 'toggle' | 'reset' }
 */
router.post('/settings/taxonomy-parser', (req, res) => {
  const { enabled } = req.body;
  const currentEnabled = getTaxonomyParserEnabled();

  if (enabled === 'toggle') {
    runtimeSettings.taxonomyParserEnabled = !currentEnabled;
  } else if (typeof enabled === 'boolean') {
    runtimeSettings.taxonomyParserEnabled = enabled;
  } else if (enabled === 'reset') {
    // Reset to default (enabled)
    runtimeSettings.taxonomyParserEnabled = null;
  } else {
    return res.status(400).json({
      error: 'Invalid value',
      details: "enabled must be true, false, 'toggle', or 'reset'"
    });
  }

  const newEnabled = getTaxonomyParserEnabled();
  console.log(`Taxonomy parser ${newEnabled ? 'ENABLED' : 'DISABLED'}`);

  res.json({
    taxonomyParserEnabled: newEnabled,
    source: runtimeSettings.taxonomyParserEnabled !== null ? 'runtime' : 'default',
    message: `Taxonomy parser ${newEnabled ? 'enabled' : 'disabled'}`
  });
});

export default router;
