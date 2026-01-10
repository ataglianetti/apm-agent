import { useState, useEffect, useCallback } from 'react';
import { HelpTooltip } from '../ui/Tooltip';
import { FIELD_HELP } from './help/fieldDescriptions';
import { RULE_TYPE_HELP } from './help/ruleTypeDescriptions';

/**
 * Rule types with their display names
 */
const RULE_TYPES = [
  { value: 'genre_simplification', label: 'Genre Simplification' },
  { value: 'library_boost', label: 'Library Boost' },
  { value: 'recency_interleaving', label: 'Recency Interleaving' },
  { value: 'feature_boost', label: 'Feature Boost' },
  { value: 'recency_decay', label: 'Recency Decay' },
  { value: 'filter_optimization', label: 'Filter Optimization' },
  { value: 'subgenre_interleaving', label: 'Subgenre Interleaving' },
];

/**
 * Default action templates for each rule type
 */
const DEFAULT_ACTIONS = {
  genre_simplification: {
    auto_apply_facets: [],
    mode: 'expand',
  },
  library_boost: {
    boost_libraries: [{ library_name: '', boost_factor: 1.5 }],
  },
  recency_interleaving: {
    recent_threshold_months: 12,
    vintage_max_months: 60,
    pattern: 'RRRR VRRR VRRR',
    repeat_count: 3,
  },
  feature_boost: {
    boost_field: '',
    boost_value: '',
    boost_factor: 2,
  },
  recency_decay: {
    horizon_months: 24,
    horizon_threshold: 0.9,
    min_factor: 0.65,
    date_field: 'apm_release_date',
  },
  filter_optimization: {
    auto_apply_filter: {
      field: '',
      value: '',
      operator: 'contains',
    },
  },
  subgenre_interleaving: {
    attribute: 'genre',
    values: { A: '', B: '', C: '', D: '' },
    pattern: 'ABCD ABCD ABCD',
    fallback: 'relevance',
  },
};

/**
 * RuleEditor - Form modal for creating/editing rules
 */
export default function RuleEditor({
  rule,
  isCreating,
  templates: _templates,
  requirements: _requirements,
  onSave,
  onClose,
  onValidate,
  isDark,
}) {
  // Form state
  const [formData, setFormData] = useState({
    id: '',
    type: 'library_boost',
    pattern: '',
    description: '',
    priority: 50,
    enabled: true,
    action: {},
  });

  const [errors, setErrors] = useState([]);
  const [patternError, setPatternError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  // Initialize form with existing rule or defaults
  useEffect(() => {
    if (rule) {
      setFormData({
        id: rule.id,
        type: rule.type,
        pattern: rule.pattern || '',
        description: rule.description || '',
        priority: rule.priority || 50,
        enabled: rule.enabled ?? true,
        action: { ...rule.action },
      });
    } else if (isCreating) {
      setFormData({
        id: '',
        type: 'library_boost',
        pattern: '',
        description: '',
        priority: 50,
        enabled: true,
        action: { ...DEFAULT_ACTIONS.library_boost },
      });
    }
  }, [rule, isCreating]);

  // Update action when type changes
  const handleTypeChange = newType => {
    setFormData(prev => ({
      ...prev,
      type: newType,
      action: { ...DEFAULT_ACTIONS[newType] },
    }));
    setErrors([]);
    setPatternError(null);
  };

  // Validate pattern as user types
  const validatePattern = useCallback(
    async pattern => {
      if (!pattern) {
        setPatternError(null);
        return;
      }
      setIsValidating(true);
      const result = await onValidate({ ...formData, pattern });
      if (result.patternInfo && !result.patternInfo.safe) {
        setPatternError(result.patternInfo.reason);
      } else {
        setPatternError(null);
      }
      setIsValidating(false);
    },
    [formData, onValidate]
  );

  // Debounce pattern validation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.pattern) {
        validatePattern(formData.pattern);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.pattern, validatePattern]);

  const handleSubmit = async e => {
    e.preventDefault();
    setIsSaving(true);
    setErrors([]);

    const result = await onSave(formData);
    if (!result.success) {
      setErrors(result.errors || ['Save failed']);
    }
    setIsSaving(false);
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateAction = (field, value) => {
    setFormData(prev => ({
      ...prev,
      action: { ...prev.action, [field]: value },
    }));
  };

  // Input class helper
  const inputClass = `w-full px-3 py-2 rounded-lg border ${
    isDark
      ? 'bg-apm-dark border-apm-gray/30 text-white placeholder-gray-500'
      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
  } focus:outline-none focus:ring-2 focus:ring-apm-purple focus:border-transparent`;

  // Select class with custom arrow styling
  const selectClass = `${inputClass} appearance-none cursor-pointer bg-no-repeat bg-right pr-10`;

  // Select style with custom chevron
  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='${isDark ? '%239ca3af' : '%236b7280'}'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
    backgroundPosition: 'right 0.75rem center',
    backgroundSize: '1.25rem',
  };

  const labelClass = `block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`relative w-full max-w-2xl max-h-[85vh] rounded-xl shadow-2xl overflow-hidden flex flex-col ${
          isDark ? 'bg-apm-navy' : 'bg-white'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDark ? 'border-apm-gray/20' : 'border-gray-200'
          }`}
        >
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {isCreating ? 'Create New Rule' : 'Edit Rule'}
          </h3>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-apm-gray/20 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Errors */}
          {errors.length > 0 && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <ul className="text-sm text-red-500 space-y-1">
                {errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Type */}
          <div>
            <label className={`${labelClass} flex items-center gap-1`}>
              Rule Type
              <HelpTooltip content={FIELD_HELP.type} isDark={isDark} />
            </label>
            <select
              value={formData.type}
              onChange={e => handleTypeChange(e.target.value)}
              disabled={!isCreating}
              className={selectClass}
              style={selectStyle}
            >
              {RULE_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {/* Type-specific help hint */}
            {formData.type && RULE_TYPE_HELP[formData.type] && (
              <div
                className={`mt-2 p-3 rounded-lg text-sm ${
                  isDark ? 'bg-apm-gray/10 text-gray-300' : 'bg-blue-50 text-blue-800'
                }`}
              >
                <strong>{RULE_TYPE_HELP[formData.type].title}:</strong>{' '}
                {RULE_TYPE_HELP[formData.type].summary}
              </div>
            )}
          </div>

          {/* ID */}
          <div>
            <label className={`${labelClass} flex items-center gap-1`}>
              Rule ID
              <HelpTooltip content={FIELD_HELP.id} isDark={isDark} />
              {isCreating && <span className="text-gray-500 ml-1">(auto-generated if empty)</span>}
            </label>
            <input
              type="text"
              value={formData.id}
              onChange={e => updateField('id', e.target.value)}
              disabled={!isCreating}
              placeholder={isCreating ? `${formData.type}_...` : ''}
              className={inputClass}
            />
          </div>

          {/* Pattern */}
          <div>
            <label className={`${labelClass} flex items-center gap-1`}>
              Pattern (Regex)
              <HelpTooltip content={FIELD_HELP.pattern} isDark={isDark} />
              {isValidating && <span className="text-gray-500 ml-1">validating...</span>}
            </label>
            <input
              type="text"
              value={formData.pattern}
              onChange={e => updateField('pattern', e.target.value)}
              placeholder="\\b(keyword1|keyword2)\\b"
              className={`${inputClass} font-mono ${patternError ? 'border-red-500' : ''}`}
            />
            {patternError && <p className="text-sm text-red-500 mt-1">{patternError}</p>}
            <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Use word boundaries (\b) to match whole words. Pattern is case-insensitive.
            </p>
          </div>

          {/* Description */}
          <div>
            <label className={`${labelClass} flex items-center gap-1`}>
              Description
              <HelpTooltip content={FIELD_HELP.description} isDark={isDark} />
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={e => updateField('description', e.target.value)}
              placeholder="Brief description of what this rule does"
              className={inputClass}
            />
          </div>

          {/* Priority & Enabled */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`${labelClass} flex items-center gap-1`}>
                Priority (0-100)
                <HelpTooltip content={FIELD_HELP.priority} isDark={isDark} />
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.priority}
                onChange={e => updateField('priority', parseInt(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={e => updateField('enabled', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-apm-purple focus:ring-apm-purple"
                />
                <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>Enabled</span>
                <HelpTooltip content={FIELD_HELP.enabled} isDark={isDark} />
              </label>
            </div>
          </div>

          {/* Type-specific action fields */}
          <div
            className={`border-t pt-4 mt-4 ${isDark ? 'border-apm-gray/20' : 'border-gray-200'}`}
          >
            <h4 className={`font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Action Configuration
            </h4>

            {formData.type === 'library_boost' && (
              <LibraryBoostFields
                action={formData.action}
                onUpdate={updateAction}
                inputClass={inputClass}
                labelClass={labelClass}
                isDark={isDark}
              />
            )}

            {formData.type === 'genre_simplification' && (
              <GenreSimplificationFields
                action={formData.action}
                onUpdate={updateAction}
                inputClass={inputClass}
                selectClass={selectClass}
                selectStyle={selectStyle}
                labelClass={labelClass}
                isDark={isDark}
              />
            )}

            {formData.type === 'recency_interleaving' && (
              <RecencyInterleavingFields
                action={formData.action}
                onUpdate={updateAction}
                inputClass={inputClass}
                labelClass={labelClass}
                isDark={isDark}
              />
            )}

            {formData.type === 'feature_boost' && (
              <FeatureBoostFields
                action={formData.action}
                onUpdate={updateAction}
                inputClass={inputClass}
                labelClass={labelClass}
                isDark={isDark}
              />
            )}

            {formData.type === 'recency_decay' && (
              <RecencyDecayFields
                action={formData.action}
                onUpdate={updateAction}
                inputClass={inputClass}
                labelClass={labelClass}
                isDark={isDark}
              />
            )}

            {formData.type === 'filter_optimization' && (
              <FilterOptimizationFields
                action={formData.action}
                onUpdate={updateAction}
                inputClass={inputClass}
                selectClass={selectClass}
                selectStyle={selectStyle}
                labelClass={labelClass}
                isDark={isDark}
              />
            )}

            {formData.type === 'subgenre_interleaving' && (
              <SubgenreInterleavingFields
                action={formData.action}
                onUpdate={updateAction}
                inputClass={inputClass}
                selectClass={selectClass}
                selectStyle={selectStyle}
                labelClass={labelClass}
                isDark={isDark}
              />
            )}
          </div>
        </form>

        {/* Footer */}
        <div
          className={`flex items-center justify-end gap-3 px-6 py-4 border-t ${
            isDark ? 'border-apm-gray/20' : 'border-gray-200'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              isDark
                ? 'bg-apm-gray/20 text-gray-300 hover:bg-apm-gray/30'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving || !!patternError}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              isDark
                ? 'bg-apm-purple hover:bg-apm-purple-dark text-white'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            } ${isSaving || patternError ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isSaving ? 'Saving...' : isCreating ? 'Create Rule' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Library Boost action fields
function LibraryBoostFields({ action, onUpdate, inputClass, labelClass, isDark }) {
  const libraryNameHelp = FIELD_HELP.library_name;
  const boostFactorHelp = FIELD_HELP.boost_factor;
  const libraries = action.boost_libraries || [];

  const addLibrary = () => {
    onUpdate('boost_libraries', [...libraries, { library_name: '', boost_factor: 1.5 }]);
  };

  const updateLibrary = (index, field, value) => {
    const updated = libraries.map((lib, i) =>
      i === index
        ? { ...lib, [field]: field === 'boost_factor' ? parseFloat(value) || 1 : value }
        : lib
    );
    onUpdate('boost_libraries', updated);
  };

  const removeLibrary = index => {
    onUpdate(
      'boost_libraries',
      libraries.filter((_, i) => i !== index)
    );
  };

  return (
    <div className="space-y-3">
      {libraries.map((lib, index) => (
        <div key={index} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className={`${labelClass} flex items-center gap-1`}>
              Library Name
              {index === 0 && <HelpTooltip content={libraryNameHelp} isDark={isDark} />}
            </label>
            <input
              type="text"
              value={lib.library_name}
              onChange={e => updateLibrary(index, 'library_name', e.target.value)}
              placeholder="e.g., MLB Music"
              className={inputClass}
            />
          </div>
          <div className="w-28">
            <label className={`${labelClass} flex items-center gap-1`}>
              Boost
              {index === 0 && <HelpTooltip content={boostFactorHelp} isDark={isDark} />}
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              value={lib.boost_factor}
              onChange={e => updateLibrary(index, 'boost_factor', e.target.value)}
              className={inputClass}
            />
          </div>
          {libraries.length > 1 && (
            <button
              type="button"
              onClick={() => removeLibrary(index)}
              className="p-2 text-red-500 hover:bg-red-500/10 rounded"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addLibrary}
        className={`text-sm ${isDark ? 'text-apm-purple-light' : 'text-purple-600'} hover:underline`}
      >
        + Add Library
      </button>
    </div>
  );
}

// Genre Simplification action fields
function GenreSimplificationFields({
  action,
  onUpdate,
  inputClass,
  selectClass,
  selectStyle,
  labelClass,
  isDark,
}) {
  const facets = (action.auto_apply_facets || []).join(', ');

  return (
    <div className="space-y-3">
      <div>
        <label className={`${labelClass} flex items-center gap-1`}>
          Facets to Apply (comma-separated)
          <HelpTooltip content={FIELD_HELP.auto_apply_facets} isDark={isDark} />
        </label>
        <textarea
          value={facets}
          onChange={e =>
            onUpdate(
              'auto_apply_facets',
              e.target.value
                .split(',')
                .map(f => f.trim())
                .filter(Boolean)
            )
          }
          placeholder="Classic Rock, Alternative Rock, Indie Rock"
          rows={3}
          className={inputClass}
        />
      </div>
      <div>
        <label className={`${labelClass} flex items-center gap-1`}>
          Mode
          <HelpTooltip content={FIELD_HELP.mode} isDark={isDark} />
        </label>
        <select
          value={action.mode || 'expand'}
          onChange={e => onUpdate('mode', e.target.value)}
          className={selectClass}
          style={selectStyle}
        >
          <option value="expand">Expand (OR logic)</option>
          <option value="restrict">Restrict (AND logic)</option>
        </select>
      </div>
    </div>
  );
}

// Recency Interleaving action fields
function RecencyInterleavingFields({ action, onUpdate, inputClass, labelClass, isDark }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`${labelClass} flex items-center gap-1`}>
            Recent Threshold (months)
            <HelpTooltip content={FIELD_HELP.recent_threshold_months} isDark={isDark} />
          </label>
          <input
            type="number"
            min="1"
            value={action.recent_threshold_months || 12}
            onChange={e => onUpdate('recent_threshold_months', parseInt(e.target.value) || 12)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={`${labelClass} flex items-center gap-1`}>
            Vintage Max (months)
            <HelpTooltip content={FIELD_HELP.vintage_max_months} isDark={isDark} />
          </label>
          <input
            type="number"
            min="1"
            value={action.vintage_max_months || 60}
            onChange={e => onUpdate('vintage_max_months', parseInt(e.target.value) || 60)}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className={`${labelClass} flex items-center gap-1`}>
          Pattern (R=Recent, V=Vintage)
          <HelpTooltip content={FIELD_HELP.interleave_pattern} isDark={isDark} />
        </label>
        <input
          type="text"
          value={action.pattern || ''}
          onChange={e => onUpdate('pattern', e.target.value)}
          placeholder="RRRR VRRR VRRR"
          className={inputClass}
        />
      </div>
      <div>
        <label className={`${labelClass} flex items-center gap-1`}>
          Repeat Count
          <HelpTooltip content={FIELD_HELP.repeat_count} isDark={isDark} />
        </label>
        <input
          type="number"
          min="1"
          max="10"
          value={action.repeat_count || 1}
          onChange={e => onUpdate('repeat_count', parseInt(e.target.value) || 1)}
          className={inputClass}
        />
      </div>
    </div>
  );
}

// Feature Boost action fields
function FeatureBoostFields({ action, onUpdate, inputClass, labelClass, isDark }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`${labelClass} flex items-center gap-1`}>
            Field Name
            <HelpTooltip content={FIELD_HELP.boost_field} isDark={isDark} />
          </label>
          <input
            type="text"
            value={action.boost_field || ''}
            onChange={e => onUpdate('boost_field', e.target.value)}
            placeholder="e.g., has_stems"
            className={inputClass}
          />
        </div>
        <div>
          <label className={`${labelClass} flex items-center gap-1`}>
            Field Value
            <HelpTooltip content={FIELD_HELP.boost_value} isDark={isDark} />
          </label>
          <input
            type="text"
            value={action.boost_value || ''}
            onChange={e => onUpdate('boost_value', e.target.value)}
            placeholder="e.g., true"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className={`${labelClass} flex items-center gap-1`}>
          Boost Factor
          <HelpTooltip content={FIELD_HELP.boost_factor} isDark={isDark} />
        </label>
        <input
          type="number"
          step="0.1"
          min="0.1"
          max="10"
          value={action.boost_factor || 2}
          onChange={e => onUpdate('boost_factor', parseFloat(e.target.value) || 2)}
          className={inputClass}
        />
      </div>
    </div>
  );
}

// Recency Decay action fields
function RecencyDecayFields({ action, onUpdate, inputClass, labelClass, isDark }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`${labelClass} flex items-center gap-1`}>
            Horizon (months)
            <HelpTooltip content={FIELD_HELP.horizon_months} isDark={isDark} />
          </label>
          <input
            type="number"
            min="1"
            value={action.horizon_months || 24}
            onChange={e => onUpdate('horizon_months', parseInt(e.target.value) || 24)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={`${labelClass} flex items-center gap-1`}>
            Horizon Threshold (0-1)
            <HelpTooltip content={FIELD_HELP.horizon_threshold} isDark={isDark} />
          </label>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={action.horizon_threshold || 0.9}
            onChange={e => onUpdate('horizon_threshold', parseFloat(e.target.value) || 0.9)}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`${labelClass} flex items-center gap-1`}>
            Min Factor (floor)
            <HelpTooltip content={FIELD_HELP.min_factor} isDark={isDark} />
          </label>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={action.min_factor || 0.65}
            onChange={e => onUpdate('min_factor', parseFloat(e.target.value) || 0.65)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={`${labelClass} flex items-center gap-1`}>
            Date Field
            <HelpTooltip content={FIELD_HELP.date_field} isDark={isDark} />
          </label>
          <input
            type="text"
            value={action.date_field || 'apm_release_date'}
            onChange={e => onUpdate('date_field', e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}

// Filter Optimization action fields
function FilterOptimizationFields({
  action,
  onUpdate,
  inputClass,
  selectClass,
  selectStyle,
  labelClass,
  isDark,
}) {
  const filter = action.auto_apply_filter || { field: '', value: '', operator: 'contains' };

  const updateFilter = (field, value) => {
    onUpdate('auto_apply_filter', { ...filter, [field]: value });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`${labelClass} flex items-center gap-1`}>
            Field
            <HelpTooltip content={FIELD_HELP.filter_field} isDark={isDark} />
          </label>
          <input
            type="text"
            value={filter.field || ''}
            onChange={e => updateFilter('field', e.target.value)}
            placeholder="e.g., vocals"
            className={inputClass}
          />
        </div>
        <div>
          <label className={`${labelClass} flex items-center gap-1`}>
            Operator
            <HelpTooltip content={FIELD_HELP.filter_operator} isDark={isDark} />
          </label>
          <select
            value={filter.operator || 'contains'}
            onChange={e => updateFilter('operator', e.target.value)}
            className={selectClass}
            style={selectStyle}
          >
            <option value="contains">Contains</option>
            <option value="contains_any">Contains Any</option>
            <option value="equals">Equals</option>
            <option value="not_equals">Not Equals</option>
          </select>
        </div>
      </div>
      <div>
        <label className={`${labelClass} flex items-center gap-1`}>
          Value
          <HelpTooltip content={FIELD_HELP.filter_value} isDark={isDark} />
        </label>
        <input
          type="text"
          value={filter.value || ''}
          onChange={e => updateFilter('value', e.target.value)}
          placeholder="e.g., No Vocals"
          className={inputClass}
        />
      </div>
    </div>
  );
}

// Subgenre Interleaving action fields
function SubgenreInterleavingFields({
  action,
  onUpdate,
  inputClass,
  selectClass,
  selectStyle,
  labelClass,
  isDark,
}) {
  const values = action.values || {};
  const letters = Object.keys(values);

  const updateValue = (letter, value) => {
    onUpdate('values', { ...values, [letter]: value });
  };

  const addLetter = () => {
    const nextLetter = String.fromCharCode(65 + letters.length); // A, B, C, D...
    if (nextLetter <= 'Z') {
      onUpdate('values', { ...values, [nextLetter]: '' });
    }
  };

  const removeLetter = letter => {
    const updated = { ...values };
    delete updated[letter];
    onUpdate('values', updated);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={`${labelClass} flex items-center gap-1`}>
          Attribute
          <HelpTooltip content={FIELD_HELP.attribute} isDark={isDark} />
        </label>
        <select
          value={action.attribute || 'genre'}
          onChange={e => onUpdate('attribute', e.target.value)}
          className={selectClass}
          style={selectStyle}
        >
          <option value="genre">Genre</option>
          <option value="mood">Mood</option>
          <option value="library">Library</option>
        </select>
      </div>

      <div>
        <label className={`${labelClass} flex items-center gap-1`}>
          Subgenre Values
          <HelpTooltip content={FIELD_HELP.subgenre_values} isDark={isDark} />
        </label>
        <div className="space-y-2">
          {letters.map(letter => (
            <div key={letter} className="flex gap-2 items-center">
              <span
                className={`w-8 h-8 flex items-center justify-center rounded font-medium ${
                  isDark ? 'bg-apm-gray/20 text-gray-300' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {letter}
              </span>
              <input
                type="text"
                value={values[letter] || ''}
                onChange={e => updateValue(letter, e.target.value)}
                placeholder={`Subgenre for ${letter}`}
                className={`flex-1 ${inputClass}`}
              />
              {letters.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeLetter(letter)}
                  className="p-1 text-red-500 hover:bg-red-500/10 rounded"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {letters.length < 8 && (
          <button
            type="button"
            onClick={addLetter}
            className={`text-sm mt-2 ${isDark ? 'text-apm-purple-light' : 'text-purple-600'} hover:underline`}
          >
            + Add Subgenre
          </button>
        )}
      </div>

      <div>
        <label className={`${labelClass} flex items-center gap-1`}>
          Pattern
          <HelpTooltip content={FIELD_HELP.subgenre_pattern} isDark={isDark} />
        </label>
        <input
          type="text"
          value={action.pattern || ''}
          onChange={e => onUpdate('pattern', e.target.value)}
          placeholder="ABCD ABCD ABCD"
          className={inputClass}
        />
        <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          Use letters to represent subgenres. Spaces are ignored.
        </p>
      </div>

      <div>
        <label className={`${labelClass} flex items-center gap-1`}>
          Fallback
          <HelpTooltip content={FIELD_HELP.fallback} isDark={isDark} />
        </label>
        <select
          value={action.fallback || 'relevance'}
          onChange={e => onUpdate('fallback', e.target.value)}
          className={selectClass}
          style={selectStyle}
        >
          <option value="relevance">Relevance (fill from other subgenres)</option>
          <option value="skip">Skip (leave slot empty)</option>
        </select>
      </div>
    </div>
  );
}
