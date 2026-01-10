import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useBusinessRules } from '../../hooks/useBusinessRules';
import RulesList from './RulesList';
import RuleEditor from './RuleEditor';

/**
 * BusinessRulesPanel - Modal for managing business rules
 */
export default function BusinessRulesPanel({ onClose }) {
  const { isDark } = useTheme();
  const {
    rules,
    disabledRules,
    templates,
    requirements,
    loading,
    error,
    saving,
    toggleRule,
    createRule,
    updateRule,
    deleteRule,
    restoreRule,
    hardDeleteRule,
    validateRule,
    fetchRules,
  } = useBusinessRules();

  const [activeTab, setActiveTab] = useState('active');
  const [editingRule, setEditingRule] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const modalRef = useRef(null);

  // Close on escape key
  useEffect(() => {
    const handleEscape = e => {
      if (e.key === 'Escape') {
        if (editingRule || isCreating) {
          setEditingRule(null);
          setIsCreating(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, editingRule, isCreating]);

  // Close on click outside
  const handleBackdropClick = e => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleEditRule = rule => {
    setEditingRule(rule);
    setIsCreating(false);
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setEditingRule(null);
  };

  const handleEditorClose = () => {
    setEditingRule(null);
    setIsCreating(false);
  };

  const handleSaveRule = async ruleData => {
    let result;
    if (isCreating) {
      result = await createRule(ruleData);
    } else if (editingRule) {
      result = await updateRule(editingRule.id, ruleData);
    }

    if (result.success) {
      handleEditorClose();
    }
    return result;
  };

  const activeRules = rules.filter(r => r.enabled);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className={`relative w-full max-w-5xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col ${
          isDark ? 'bg-apm-navy' : 'bg-white'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDark ? 'border-apm-gray/20' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center gap-4">
            <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Business Rules
            </h2>
            <span
              className={`text-sm px-2 py-0.5 rounded ${
                isDark ? 'bg-apm-purple/20 text-apm-purple-light' : 'bg-purple-100 text-purple-700'
              }`}
            >
              {activeRules.length} active
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateNew}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isDark
                  ? 'bg-apm-purple hover:bg-apm-purple-dark text-white'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              + Add Rule
            </button>
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
        </div>

        {/* Tabs */}
        <div className={`flex border-b ${isDark ? 'border-apm-gray/20' : 'border-gray-200'}`}>
          <button
            onClick={() => setActiveTab('active')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'active'
                ? isDark
                  ? 'border-apm-purple text-apm-purple-light'
                  : 'border-purple-600 text-purple-600'
                : isDark
                  ? 'border-transparent text-gray-400 hover:text-gray-300'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Active Rules ({rules.length})
          </button>
          <button
            onClick={() => setActiveTab('disabled')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'disabled'
                ? isDark
                  ? 'border-apm-purple text-apm-purple-light'
                  : 'border-purple-600 text-purple-600'
                : isDark
                  ? 'border-transparent text-gray-400 hover:text-gray-300'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Archived ({disabledRules.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apm-purple"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className={`text-red-500 mb-4`}>{error}</p>
              <button
                onClick={fetchRules}
                className="px-4 py-2 bg-apm-purple text-white rounded-lg hover:bg-apm-purple-dark"
              >
                Retry
              </button>
            </div>
          ) : (
            <RulesList
              rules={activeTab === 'active' ? rules : disabledRules}
              isDisabledTab={activeTab === 'disabled'}
              onToggle={toggleRule}
              onEdit={handleEditRule}
              onDelete={deleteRule}
              onRestore={restoreRule}
              onHardDelete={hardDeleteRule}
              isDark={isDark}
            />
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-6 py-3 border-t text-sm ${
            isDark ? 'border-apm-gray/20 text-gray-400' : 'border-gray-200 text-gray-500'
          }`}
        >
          {saving ? 'Saving...' : 'Changes are saved automatically'}
        </div>
      </div>

      {/* Rule Editor Modal */}
      {(editingRule || isCreating) && (
        <RuleEditor
          rule={editingRule}
          isCreating={isCreating}
          templates={templates}
          requirements={requirements}
          onSave={handleSaveRule}
          onClose={handleEditorClose}
          onValidate={validateRule}
          isDark={isDark}
        />
      )}
    </div>
  );
}
