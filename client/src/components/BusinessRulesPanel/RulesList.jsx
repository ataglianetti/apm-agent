import { useState } from 'react';
import RuleItem from './RuleItem';

/**
 * Color mapping for rule types
 */
const TYPE_COLORS = {
  genre_simplification: { bg: 'bg-blue-500', text: 'text-blue-500', light: 'bg-blue-500/10' },
  library_boost: { bg: 'bg-green-500', text: 'text-green-500', light: 'bg-green-500/10' },
  recency_interleaving: { bg: 'bg-yellow-500', text: 'text-yellow-500', light: 'bg-yellow-500/10' },
  feature_boost: { bg: 'bg-purple-500', text: 'text-purple-500', light: 'bg-purple-500/10' },
  recency_decay: { bg: 'bg-orange-500', text: 'text-orange-500', light: 'bg-orange-500/10' },
  filter_optimization: { bg: 'bg-pink-500', text: 'text-pink-500', light: 'bg-pink-500/10' },
  subgenre_interleaving: { bg: 'bg-cyan-500', text: 'text-cyan-500', light: 'bg-cyan-500/10' },
};

/**
 * Get display name for rule type
 */
function getTypeDisplayName(type) {
  const names = {
    genre_simplification: 'Genre',
    library_boost: 'Library',
    recency_interleaving: 'Recency',
    feature_boost: 'Feature',
    recency_decay: 'Decay',
    filter_optimization: 'Filter',
    subgenre_interleaving: 'Subgenre',
  };
  return names[type] || type;
}

/**
 * RulesList - Table of rules with filtering and sorting
 */
export default function RulesList({
  rules,
  isDisabledTab,
  onToggle,
  onEdit,
  onDelete,
  onRestore,
  onHardDelete,
  isDark,
}) {
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('priority');

  // Get unique types for filter dropdown
  const types = [...new Set(rules.map(r => r.type))];

  // Filter and sort rules
  let filteredRules = filterType === 'all' ? rules : rules.filter(r => r.type === filterType);

  filteredRules = [...filteredRules].sort((a, b) => {
    switch (sortBy) {
      case 'priority':
        return (b.priority || 0) - (a.priority || 0);
      case 'type':
        return a.type.localeCompare(b.type);
      case 'id':
        return a.id.localeCompare(b.id);
      case 'enabled':
        return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
      default:
        return 0;
    }
  });

  if (rules.length === 0) {
    return (
      <div className="text-center py-12">
        <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
          {isDisabledTab ? 'No archived rules' : 'No rules configured'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Type:</label>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className={`px-3 py-1.5 text-sm rounded-lg border appearance-none cursor-pointer pr-8 ${
              isDark
                ? 'bg-apm-dark border-apm-gray/30 text-white'
                : 'bg-white border-gray-200 text-gray-900'
            }`}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='${isDark ? '%239ca3af' : '%236b7280'}'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 0.5rem center',
              backgroundSize: '1rem',
              backgroundRepeat: 'no-repeat',
            }}
          >
            <option value="all">All Types</option>
            {types.map(type => (
              <option key={type} value={type}>
                {getTypeDisplayName(type)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Sort:</label>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className={`px-3 py-1.5 text-sm rounded-lg border appearance-none cursor-pointer pr-8 ${
              isDark
                ? 'bg-apm-dark border-apm-gray/30 text-white'
                : 'bg-white border-gray-200 text-gray-900'
            }`}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='${isDark ? '%239ca3af' : '%236b7280'}'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 0.5rem center',
              backgroundSize: '1rem',
              backgroundRepeat: 'no-repeat',
            }}
          >
            <option value="priority">Priority</option>
            <option value="type">Type</option>
            <option value="id">ID</option>
            <option value="enabled">Enabled</option>
          </select>
        </div>

        <span className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Rules Table */}
      <div
        className={`rounded-lg border overflow-hidden ${
          isDark ? 'border-apm-gray/20' : 'border-gray-200'
        }`}
      >
        {/* Header */}
        <div
          className={`grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium uppercase tracking-wider ${
            isDark ? 'bg-apm-dark text-gray-400' : 'bg-gray-50 text-gray-500'
          }`}
        >
          <div className="col-span-1">Active</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-3">ID</div>
          <div className="col-span-3">Description</div>
          <div className="col-span-1 text-center">Priority</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-200/10">
          {filteredRules.map(rule => (
            <RuleItem
              key={rule.id}
              rule={rule}
              isDisabledTab={isDisabledTab}
              typeColors={TYPE_COLORS[rule.type] || TYPE_COLORS.genre_simplification}
              typeDisplayName={getTypeDisplayName(rule.type)}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onRestore={onRestore}
              onHardDelete={onHardDelete}
              isDark={isDark}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
