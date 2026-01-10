import { useState, useCallback, useEffect } from 'react';

/**
 * useBusinessRules hook - Manages business rules CRUD operations
 * Provides state and methods for the BusinessRulesPanel component
 */
export function useBusinessRules() {
  const [rules, setRules] = useState([]);
  const [disabledRules, setDisabledRules] = useState([]);
  const [templates, setTemplates] = useState({});
  const [requirements, setRequirements] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  /**
   * Fetch all rules from the API
   */
  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/business-rules/rules');
      if (!response.ok) {
        throw new Error(`Failed to fetch rules: ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        setRules(data.rules || []);
        setDisabledRules(data.disabled_rules || []);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch templates and requirements
   */
  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/business-rules/templates');
      if (!response.ok) {
        throw new Error(`Failed to fetch templates: ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        setTemplates(data.templates || {});
        setRequirements(data.requirements || {});
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    }
  }, []);

  /**
   * Toggle a rule's enabled state (optimistic update)
   */
  const toggleRule = useCallback(
    async id => {
      // Optimistic update
      const updateRules = ruleList =>
        ruleList.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r));

      const isInRules = rules.some(r => r.id === id);
      const originalRules = [...rules];
      const originalDisabled = [...disabledRules];

      if (isInRules) {
        setRules(updateRules(rules));
      } else {
        setDisabledRules(updateRules(disabledRules));
      }

      try {
        const response = await fetch(`/api/settings/business-rules/rules/${id}/toggle`, {
          method: 'PATCH',
        });
        const data = await response.json();

        if (!data.success) {
          // Revert on failure
          setRules(originalRules);
          setDisabledRules(originalDisabled);
          throw new Error(data.error || 'Toggle failed');
        }

        return { success: true, rule: data.rule };
      } catch (err) {
        // Revert on error
        setRules(originalRules);
        setDisabledRules(originalDisabled);
        return { success: false, error: err.message };
      }
    },
    [rules, disabledRules]
  );

  /**
   * Create a new rule
   */
  const createRule = useCallback(async ruleData => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/business-rules/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleData),
      });
      const data = await response.json();

      if (!data.success) {
        return { success: false, errors: data.details || [data.error] };
      }

      // Add new rule to state
      setRules(prev => [...prev, data.rule]);
      return { success: true, rule: data.rule };
    } catch (err) {
      return { success: false, errors: [err.message] };
    } finally {
      setSaving(false);
    }
  }, []);

  /**
   * Update an existing rule
   */
  const updateRule = useCallback(async (id, updates) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/settings/business-rules/rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await response.json();

      if (!data.success) {
        return { success: false, errors: data.details || [data.error] };
      }

      // Update rule in state
      const updateInList = list => list.map(r => (r.id === id ? data.rule : r));

      setRules(prev => updateInList(prev));
      setDisabledRules(prev => updateInList(prev));

      return { success: true, rule: data.rule };
    } catch (err) {
      return { success: false, errors: [err.message] };
    } finally {
      setSaving(false);
    }
  }, []);

  /**
   * Soft delete a rule (move to disabled_rules)
   */
  const deleteRule = useCallback(async id => {
    setSaving(true);
    try {
      const response = await fetch(`/api/settings/business-rules/rules/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (!data.success) {
        return { success: false, errors: data.details || [data.error] };
      }

      // Move from rules to disabled_rules
      setRules(prev => prev.filter(r => r.id !== id));
      setDisabledRules(prev => [...prev, data.rule]);

      return { success: true };
    } catch (err) {
      return { success: false, errors: [err.message] };
    } finally {
      setSaving(false);
    }
  }, []);

  /**
   * Restore a rule from disabled_rules
   */
  const restoreRule = useCallback(async id => {
    setSaving(true);
    try {
      const response = await fetch(`/api/settings/business-rules/rules/${id}/restore`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!data.success) {
        return { success: false, errors: data.details || [data.error] };
      }

      // Move from disabled_rules to rules
      setDisabledRules(prev => prev.filter(r => r.id !== id));
      setRules(prev => [...prev, data.rule]);

      return { success: true, rule: data.rule };
    } catch (err) {
      return { success: false, errors: [err.message] };
    } finally {
      setSaving(false);
    }
  }, []);

  /**
   * Permanently delete a rule
   */
  const hardDeleteRule = useCallback(async id => {
    setSaving(true);
    try {
      const response = await fetch(`/api/settings/business-rules/rules/${id}/permanent`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (!data.success) {
        return { success: false, errors: data.details || [data.error] };
      }

      // Remove from disabled_rules
      setDisabledRules(prev => prev.filter(r => r.id !== id));

      return { success: true };
    } catch (err) {
      return { success: false, errors: [err.message] };
    } finally {
      setSaving(false);
    }
  }, []);

  /**
   * Validate a rule without saving
   */
  const validateRule = useCallback(async ruleData => {
    try {
      const response = await fetch('/api/settings/business-rules/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleData),
      });
      const data = await response.json();

      return {
        valid: data.valid,
        errors: data.errors || [],
        patternInfo: data.patternInfo,
      };
    } catch (err) {
      return { valid: false, errors: [err.message] };
    }
  }, []);

  /**
   * Get a rule by ID
   */
  const getRuleById = useCallback(
    id => {
      return rules.find(r => r.id === id) || disabledRules.find(r => r.id === id);
    },
    [rules, disabledRules]
  );

  // Fetch rules and templates on mount
  useEffect(() => {
    fetchRules();
    fetchTemplates();
  }, [fetchRules, fetchTemplates]);

  return {
    // State
    rules,
    disabledRules,
    templates,
    requirements,
    loading,
    error,
    saving,

    // Actions
    fetchRules,
    toggleRule,
    createRule,
    updateRule,
    deleteRule,
    restoreRule,
    hardDeleteRule,
    validateRule,
    getRuleById,
  };
}
