/**
 * Business Rules Manager
 * CRUD operations for managing business rules with atomic file I/O
 */

import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validateRule,
  validatePattern,
  reloadRules,
  RULE_TYPE_REQUIREMENTS,
} from './businessRulesEngine.js';
import { invalidateBusinessRulesCache } from '../routes/settings.js';
import { createLogger } from './logger.js';

const logger = createLogger('RulesManager');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'businessRules.json');
const BACKUP_PATH = path.join(__dirname, '..', 'config', 'businessRules.backup.json');

/**
 * Read the current rules configuration from disk
 * @returns {object} - The parsed rules configuration
 */
function readConfig() {
  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    logger.error('Failed to read rules config:', error.message);
    throw new Error('Failed to read rules configuration');
  }
}

/**
 * Save rules configuration atomically with backup
 * @param {object} config - The configuration to save
 */
async function saveConfig(config) {
  const tempPath = CONFIG_PATH + '.tmp';

  try {
    // 1. Create backup of current file
    if (existsSync(CONFIG_PATH)) {
      await fs.copyFile(CONFIG_PATH, BACKUP_PATH);
    }

    // 2. Write to temp file
    await fs.writeFile(tempPath, JSON.stringify(config, null, 2), 'utf-8');

    // 3. Atomic rename
    await fs.rename(tempPath, CONFIG_PATH);

    // 4. Invalidate caches
    invalidateBusinessRulesCache();
    reloadRules();

    logger.info('Rules configuration saved successfully');
  } catch (error) {
    // Clean up temp file if it exists
    try {
      if (existsSync(tempPath)) {
        await fs.unlink(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    logger.error('Failed to save rules config:', error.message);
    throw new Error('Failed to save rules configuration');
  }
}

/**
 * Generate a unique rule ID
 * @param {string} type - The rule type
 * @returns {string} - Generated ID
 */
function generateRuleId(type) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 6);
  return `${type}_${timestamp}_${random}`;
}

/**
 * Get all rules (active and disabled)
 * @returns {object} - { rules, disabled_rules, templates, version }
 */
export function getAllRules() {
  const config = readConfig();
  return {
    rules: config.rules || [],
    disabled_rules: config.disabled_rules || [],
    templates: config.templates || {},
    version: config.version || '1.0',
  };
}

/**
 * Get a rule by ID (searches both active and disabled)
 * @param {string} id - The rule ID
 * @returns {object|null} - { rule, source: 'rules' | 'disabled_rules' } or null
 */
export function getRuleById(id) {
  const config = readConfig();

  // Search active rules
  const activeRule = (config.rules || []).find(r => r.id === id);
  if (activeRule) {
    return { rule: activeRule, source: 'rules' };
  }

  // Search disabled rules
  const disabledRule = (config.disabled_rules || []).find(r => r.id === id);
  if (disabledRule) {
    return { rule: disabledRule, source: 'disabled_rules' };
  }

  return null;
}

/**
 * Create a new rule
 * @param {object} ruleData - The rule data
 * @returns {object} - { success, rule, errors }
 */
export async function createRule(ruleData) {
  // Generate ID if not provided
  if (!ruleData.id) {
    if (!ruleData.type) {
      return { success: false, errors: ['Rule type is required to generate ID'] };
    }
    ruleData.id = generateRuleId(ruleData.type);
  }

  // Set defaults
  const rule = {
    enabled: true,
    priority: 50,
    ...ruleData,
  };

  // Validate rule structure
  const ruleValidation = validateRule(rule);
  if (!ruleValidation.valid) {
    return { success: false, errors: ruleValidation.errors };
  }

  // Validate pattern safety
  const patternValidation = validatePattern(rule.pattern);
  if (!patternValidation.safe) {
    return {
      success: false,
      errors: [`Unsafe pattern: ${patternValidation.reason}`],
    };
  }

  // Check for duplicate ID
  const config = readConfig();
  const existingInRules = (config.rules || []).some(r => r.id === rule.id);
  const existingInDisabled = (config.disabled_rules || []).some(r => r.id === rule.id);

  if (existingInRules || existingInDisabled) {
    return { success: false, errors: [`Rule with ID '${rule.id}' already exists`] };
  }

  // Add to rules array
  if (!config.rules) {
    config.rules = [];
  }
  config.rules.push(rule);

  // Save
  await saveConfig(config);

  logger.info(`Created rule: ${rule.id} (type: ${rule.type})`);

  return { success: true, rule };
}

/**
 * Update an existing rule
 * @param {string} id - The rule ID
 * @param {object} updates - The fields to update
 * @returns {object} - { success, rule, errors }
 */
export async function updateRule(id, updates) {
  const config = readConfig();

  // Find the rule
  let ruleIndex = (config.rules || []).findIndex(r => r.id === id);
  let source = 'rules';

  if (ruleIndex === -1) {
    ruleIndex = (config.disabled_rules || []).findIndex(r => r.id === id);
    source = 'disabled_rules';
  }

  if (ruleIndex === -1) {
    return { success: false, errors: [`Rule '${id}' not found`] };
  }

  const targetArray = source === 'rules' ? config.rules : config.disabled_rules;
  const existingRule = targetArray[ruleIndex];

  // Merge updates (don't allow changing ID)
  const updatedRule = {
    ...existingRule,
    ...updates,
    id: existingRule.id, // Preserve original ID
  };

  // Validate updated rule
  const ruleValidation = validateRule(updatedRule);
  if (!ruleValidation.valid) {
    return { success: false, errors: ruleValidation.errors };
  }

  // Validate pattern if changed
  if (updates.pattern && updates.pattern !== existingRule.pattern) {
    const patternValidation = validatePattern(updates.pattern);
    if (!patternValidation.safe) {
      return {
        success: false,
        errors: [`Unsafe pattern: ${patternValidation.reason}`],
      };
    }
  }

  // Update the rule
  targetArray[ruleIndex] = updatedRule;

  // Save
  await saveConfig(config);

  logger.info(`Updated rule: ${id}`);

  return { success: true, rule: updatedRule };
}

/**
 * Toggle a rule's enabled state
 * @param {string} id - The rule ID
 * @returns {object} - { success, rule, errors }
 */
export async function toggleRule(id) {
  const config = readConfig();

  // Find the rule in active rules
  let ruleIndex = (config.rules || []).findIndex(r => r.id === id);
  let source = 'rules';

  if (ruleIndex === -1) {
    ruleIndex = (config.disabled_rules || []).findIndex(r => r.id === id);
    source = 'disabled_rules';
  }

  if (ruleIndex === -1) {
    return { success: false, errors: [`Rule '${id}' not found`] };
  }

  const targetArray = source === 'rules' ? config.rules : config.disabled_rules;
  targetArray[ruleIndex].enabled = !targetArray[ruleIndex].enabled;

  // Save
  await saveConfig(config);

  const newState = targetArray[ruleIndex].enabled ? 'enabled' : 'disabled';
  logger.info(`Toggled rule: ${id} (now ${newState})`);

  return { success: true, rule: targetArray[ruleIndex] };
}

/**
 * Soft delete a rule (move to disabled_rules)
 * @param {string} id - The rule ID
 * @returns {object} - { success, rule, errors }
 */
export async function deleteRule(id) {
  const config = readConfig();

  // Find in active rules
  const ruleIndex = (config.rules || []).findIndex(r => r.id === id);

  if (ruleIndex === -1) {
    // Check if already in disabled
    const inDisabled = (config.disabled_rules || []).some(r => r.id === id);
    if (inDisabled) {
      return { success: false, errors: [`Rule '${id}' is already in disabled_rules`] };
    }
    return { success: false, errors: [`Rule '${id}' not found`] };
  }

  // Remove from rules
  const [rule] = config.rules.splice(ruleIndex, 1);

  // Mark as disabled and add to disabled_rules
  rule.enabled = false;

  if (!config.disabled_rules) {
    config.disabled_rules = [];
  }
  config.disabled_rules.push(rule);

  // Save
  await saveConfig(config);

  logger.info(`Soft deleted rule: ${id} (moved to disabled_rules)`);

  return { success: true, rule };
}

/**
 * Restore a rule from disabled_rules
 * @param {string} id - The rule ID
 * @returns {object} - { success, rule, errors }
 */
export async function restoreRule(id) {
  const config = readConfig();

  // Find in disabled rules
  const ruleIndex = (config.disabled_rules || []).findIndex(r => r.id === id);

  if (ruleIndex === -1) {
    return { success: false, errors: [`Rule '${id}' not found in disabled_rules`] };
  }

  // Remove from disabled_rules
  const [rule] = config.disabled_rules.splice(ruleIndex, 1);

  // Mark as enabled and add to rules
  rule.enabled = true;

  if (!config.rules) {
    config.rules = [];
  }
  config.rules.push(rule);

  // Save
  await saveConfig(config);

  logger.info(`Restored rule: ${id} (moved to rules, enabled)`);

  return { success: true, rule };
}

/**
 * Permanently delete a rule from disabled_rules
 * @param {string} id - The rule ID
 * @returns {object} - { success, errors }
 */
export async function hardDeleteRule(id) {
  const config = readConfig();

  // Find in disabled rules
  const ruleIndex = (config.disabled_rules || []).findIndex(r => r.id === id);

  if (ruleIndex === -1) {
    // Check if in active rules
    const inActive = (config.rules || []).some(r => r.id === id);
    if (inActive) {
      return {
        success: false,
        errors: [`Rule '${id}' is active. Use soft delete first.`],
      };
    }
    return { success: false, errors: [`Rule '${id}' not found in disabled_rules`] };
  }

  // Remove permanently
  config.disabled_rules.splice(ruleIndex, 1);

  // Save
  await saveConfig(config);

  logger.info(`Permanently deleted rule: ${id}`);

  return { success: true };
}

/**
 * Validate a rule without saving
 * @param {object} ruleData - The rule data to validate
 * @returns {object} - { valid, errors, patternInfo }
 */
export function validateRuleData(ruleData) {
  const errors = [];

  // Validate rule structure
  const ruleValidation = validateRule(ruleData);
  if (!ruleValidation.valid) {
    errors.push(...ruleValidation.errors);
  }

  // Validate pattern
  let patternInfo = null;
  if (ruleData.pattern) {
    const patternValidation = validatePattern(ruleData.pattern);
    patternInfo = {
      safe: patternValidation.safe,
      reason: patternValidation.reason || null,
    };
    if (!patternValidation.safe) {
      errors.push(`Unsafe pattern: ${patternValidation.reason}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    patternInfo,
  };
}

/**
 * Get rule type templates
 * @returns {object} - Templates for each rule type
 */
export function getTemplates() {
  const config = readConfig();
  return config.templates || {};
}

/**
 * Get rule type requirements
 * @returns {object} - Required fields for each rule type
 */
export function getRuleTypeRequirements() {
  return RULE_TYPE_REQUIREMENTS;
}
