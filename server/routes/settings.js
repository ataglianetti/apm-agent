import express from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getAllRules,
  getRuleById,
  createRule,
  updateRule,
  toggleRule,
  deleteRule,
  restoreRule,
  hardDeleteRule,
  validateRuleData,
  getTemplates,
  getRuleTypeRequirements,
} from '../services/businessRulesManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// Runtime settings state (overrides environment variables)
const runtimeSettings = {
  llmMode: null, // null = use env var, 'primary' or 'fallback' = override
  businessRulesEnabled: null, // null = use config file, true/false = override
  taxonomyParserEnabled: null, // null = enabled (default), true/false = override
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
 * Returns false by default (disabled)
 */
export function getTaxonomyParserEnabled() {
  if (runtimeSettings.taxonomyParserEnabled !== null) {
    return runtimeSettings.taxonomyParserEnabled;
  }
  return false; // Disabled by default
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
      activeRules: activeRules.map(r => ({ id: r.id, type: r.type, description: r.description })),
    },
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
      details: "Mode must be 'primary', 'fallback', 'toggle', or 'reset'",
    });
  }

  const newMode = getLLMMode();
  console.log(`LLM mode changed: ${currentMode} → ${newMode}`);

  res.json({
    llmMode: newMode,
    llmModeSource: runtimeSettings.llmMode !== null ? 'runtime' : 'environment',
    message: `LLM mode set to ${newMode}`,
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
      details: "enabled must be true, false, 'toggle', or 'reset'",
    });
  }

  const newEnabled = getBusinessRulesEnabled();
  const config = getBusinessRulesConfig();
  const activeRules = config?.rules?.filter(r => r.enabled) || [];

  console.log(
    `Business rules ${newEnabled ? 'ENABLED' : 'DISABLED'} (${activeRules.length} active rules)`
  );

  res.json({
    globalEnabled: newEnabled,
    source: runtimeSettings.businessRulesEnabled !== null ? 'runtime' : 'config',
    activeRuleCount: activeRules.length,
    activeRules: activeRules.map(r => ({ id: r.id, type: r.type })),
    message: `Business rules ${newEnabled ? 'enabled' : 'disabled'}`,
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
      activeCount: activeRules.length,
    },
    templates: Object.keys(config.templates || {}),
    disabledRulesCount: disabledRules.length,
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
      details: "enabled must be true, false, 'toggle', or 'reset'",
    });
  }

  const newEnabled = getTaxonomyParserEnabled();
  console.log(`Taxonomy parser ${newEnabled ? 'ENABLED' : 'DISABLED'}`);

  res.json({
    taxonomyParserEnabled: newEnabled,
    source: runtimeSettings.taxonomyParserEnabled !== null ? 'runtime' : 'default',
    message: `Taxonomy parser ${newEnabled ? 'enabled' : 'disabled'}`,
  });
});

// ============================================================================
// Business Rules CRUD Endpoints
// ============================================================================

/**
 * GET /api/settings/business-rules/rules
 * List all rules (active and disabled)
 */
router.get('/settings/business-rules/rules', (req, res) => {
  try {
    const result = getAllRules();
    res.json({
      success: true,
      rules: result.rules,
      disabled_rules: result.disabled_rules,
      total: result.rules.length + result.disabled_rules.length,
      version: result.version,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rules',
      details: error.message,
    });
  }
});

/**
 * GET /api/settings/business-rules/rules/:id
 * Get a single rule by ID
 */
router.get('/settings/business-rules/rules/:id', (req, res) => {
  try {
    const result = getRuleById(req.params.id);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found',
        details: `No rule with ID '${req.params.id}'`,
      });
    }
    res.json({
      success: true,
      rule: result.rule,
      source: result.source,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rule',
      details: error.message,
    });
  }
});

/**
 * POST /api/settings/business-rules/rules
 * Create a new rule
 */
router.post('/settings/business-rules/rules', async (req, res) => {
  try {
    const result = await createRule(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: result.errors,
      });
    }
    res.status(201).json({
      success: true,
      rule: result.rule,
      message: 'Rule created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create rule',
      details: error.message,
    });
  }
});

/**
 * PUT /api/settings/business-rules/rules/:id
 * Update an existing rule
 */
router.put('/settings/business-rules/rules/:id', async (req, res) => {
  try {
    const result = await updateRule(req.params.id, req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Update failed',
        details: result.errors,
      });
    }
    res.json({
      success: true,
      rule: result.rule,
      message: 'Rule updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update rule',
      details: error.message,
    });
  }
});

/**
 * PATCH /api/settings/business-rules/rules/:id/toggle
 * Toggle a rule's enabled state
 */
router.patch('/settings/business-rules/rules/:id/toggle', async (req, res) => {
  try {
    const result = await toggleRule(req.params.id);
    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: 'Toggle failed',
        details: result.errors,
      });
    }
    res.json({
      success: true,
      rule: result.rule,
      message: `Rule ${result.rule.enabled ? 'enabled' : 'disabled'}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to toggle rule',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/settings/business-rules/rules/:id
 * Soft delete a rule (move to disabled_rules)
 */
router.delete('/settings/business-rules/rules/:id', async (req, res) => {
  try {
    const result = await deleteRule(req.params.id);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Delete failed',
        details: result.errors,
      });
    }
    res.json({
      success: true,
      rule: result.rule,
      message: 'Rule moved to disabled_rules',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete rule',
      details: error.message,
    });
  }
});

/**
 * POST /api/settings/business-rules/rules/:id/restore
 * Restore a rule from disabled_rules
 */
router.post('/settings/business-rules/rules/:id/restore', async (req, res) => {
  try {
    const result = await restoreRule(req.params.id);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Restore failed',
        details: result.errors,
      });
    }
    res.json({
      success: true,
      rule: result.rule,
      message: 'Rule restored and enabled',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to restore rule',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/settings/business-rules/rules/:id/permanent
 * Permanently delete a rule from disabled_rules
 */
router.delete('/settings/business-rules/rules/:id/permanent', async (req, res) => {
  try {
    const result = await hardDeleteRule(req.params.id);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Permanent delete failed',
        details: result.errors,
      });
    }
    res.json({
      success: true,
      message: 'Rule permanently deleted',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to permanently delete rule',
      details: error.message,
    });
  }
});

/**
 * POST /api/settings/business-rules/validate
 * Validate a rule without saving
 */
router.post('/settings/business-rules/validate', (req, res) => {
  try {
    const result = validateRuleData(req.body);
    res.json({
      success: true,
      valid: result.valid,
      errors: result.errors,
      patternInfo: result.patternInfo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Validation failed',
      details: error.message,
    });
  }
});

/**
 * GET /api/settings/business-rules/templates
 * Get rule type templates
 */
router.get('/settings/business-rules/templates', (req, res) => {
  try {
    const templates = getTemplates();
    const requirements = getRuleTypeRequirements();
    res.json({
      success: true,
      templates,
      requirements,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
      details: error.message,
    });
  }
});

export default router;
