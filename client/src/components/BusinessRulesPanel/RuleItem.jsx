import { useState } from 'react';

/**
 * RuleItem - Single rule row with toggle, edit, and delete actions
 */
export default function RuleItem({
  rule,
  isDisabledTab,
  typeColors,
  typeDisplayName,
  onToggle,
  onEdit,
  onDelete,
  onRestore,
  onHardDelete,
  isDark,
}) {
  const [isToggling, setIsToggling] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showHardDeleteConfirm, setShowHardDeleteConfirm] = useState(false);

  const handleToggle = async () => {
    setIsToggling(true);
    await onToggle(rule.id);
    setIsToggling(false);
  };

  const handleDelete = async () => {
    await onDelete(rule.id);
    setShowDeleteConfirm(false);
  };

  const handleHardDelete = async () => {
    await onHardDelete(rule.id);
    setShowHardDeleteConfirm(false);
  };

  return (
    <div
      className={`grid grid-cols-12 gap-4 px-4 py-3 items-center transition-colors ${
        isDark ? 'hover:bg-apm-gray/10' : 'hover:bg-gray-50'
      } ${!rule.enabled ? 'opacity-60' : ''}`}
    >
      {/* Toggle */}
      <div className="col-span-1">
        <button
          onClick={handleToggle}
          disabled={isToggling}
          className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
            rule.enabled ? 'bg-apm-purple' : isDark ? 'bg-gray-600' : 'bg-gray-300'
          } ${isToggling ? 'opacity-50' : ''}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
              rule.enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Type Badge */}
      <div className="col-span-2">
        <span
          className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${typeColors.light} ${typeColors.text}`}
        >
          {typeDisplayName}
        </span>
      </div>

      {/* ID */}
      <div className="col-span-3">
        <span
          className={`text-sm font-mono truncate block ${
            isDark ? 'text-gray-300' : 'text-gray-700'
          }`}
          title={rule.id}
        >
          {rule.id}
        </span>
      </div>

      {/* Description */}
      <div className="col-span-3">
        <span
          className={`text-sm truncate block ${isDark ? 'text-gray-400' : 'text-gray-600'}`}
          title={rule.description}
        >
          {rule.description || '-'}
        </span>
      </div>

      {/* Priority */}
      <div className="col-span-1 text-center">
        <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {rule.priority || 0}
        </span>
      </div>

      {/* Actions */}
      <div className="col-span-2 flex items-center justify-end gap-2">
        {isDisabledTab ? (
          <>
            {/* Restore button */}
            <button
              onClick={() => onRestore(rule.id)}
              className={`p-1.5 rounded transition-colors ${
                isDark
                  ? 'hover:bg-green-500/20 text-green-400'
                  : 'hover:bg-green-100 text-green-600'
              }`}
              title="Restore rule"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>

            {/* Hard Delete button */}
            {showHardDeleteConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleHardDelete}
                  className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowHardDeleteConfirm(false)}
                  className={`px-2 py-1 text-xs rounded ${
                    isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowHardDeleteConfirm(true)}
                className={`p-1.5 rounded transition-colors ${
                  isDark ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-100 text-red-600'
                }`}
                title="Delete permanently"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
          </>
        ) : (
          <>
            {/* Edit button */}
            <button
              onClick={() => onEdit(rule)}
              className={`p-1.5 rounded transition-colors ${
                isDark
                  ? 'hover:bg-apm-gray/20 text-gray-400 hover:text-gray-300'
                  : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
              }`}
              title="Edit rule"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>

            {/* Delete button */}
            {showDeleteConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Archive
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className={`px-2 py-1 text-xs rounded ${
                    isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className={`p-1.5 rounded transition-colors ${
                  isDark ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-100 text-red-600'
                }`}
                title="Archive rule"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                  />
                </svg>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
