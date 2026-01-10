import { useState, useEffect } from 'react';
import { RULE_TYPE_HELP, getRuleTypeColor } from './help/ruleTypeDescriptions';
import { FIELD_HELP } from './help/fieldDescriptions';

/**
 * RulesHelpModal - Comprehensive help documentation for business rules
 * 4 tabs: Overview, Rule Types, Field Reference, Examples
 */
export default function RulesHelpModal({ onClose, isDark }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedType, setExpandedType] = useState(null);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'types', label: 'Rule Types' },
    { id: 'fields', label: 'Field Reference' },
    { id: 'examples', label: 'Examples' },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className={`relative w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col ${
          isDark ? 'bg-apm-darker' : 'bg-white'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDark ? 'border-apm-gray/20' : 'border-gray-200'
          }`}
        >
          <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Business Rules Help
          </h2>
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

        {/* Tabs */}
        <div className={`flex border-b ${isDark ? 'border-apm-gray/20' : 'border-gray-200'}`}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? isDark
                    ? 'text-apm-purple'
                    : 'text-apm-purple'
                  : isDark
                    ? 'text-gray-400 hover:text-gray-300'
                    : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-apm-purple" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && <OverviewTab isDark={isDark} />}
          {activeTab === 'types' && (
            <RuleTypesTab
              isDark={isDark}
              expandedType={expandedType}
              setExpandedType={setExpandedType}
            />
          )}
          {activeTab === 'fields' && <FieldReferenceTab isDark={isDark} />}
          {activeTab === 'examples' && <ExamplesTab isDark={isDark} />}
        </div>
      </div>
    </div>
  );
}

/**
 * Overview Tab - What are business rules and how do they work
 */
function OverviewTab({ isDark }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          What are Business Rules?
        </h3>
        <p className={`${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
          Business rules let you control how search results are ordered and filtered without writing
          any code. When a user searches for music, matching rules automatically adjust results:
          boosting certain libraries, mixing recent and classic tracks, expanding genres, and more.
        </p>
      </section>

      <section>
        <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          How Rules Work
        </h3>
        <ol
          className={`list-decimal list-inside space-y-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
        >
          <li>
            <strong>Pattern Matching:</strong> Each rule has a pattern (regex) that matches against
            search queries
          </li>
          <li>
            <strong>Priority Order:</strong> When multiple rules match, higher priority rules run
            first
          </li>
          <li>
            <strong>Action Execution:</strong> Matching rules modify search results (boost scores,
            apply filters, reorder tracks)
          </li>
          <li>
            <strong>Transparency:</strong> Results include metadata showing which rules fired
          </li>
        </ol>
      </section>

      <section>
        <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Quick Start Guide
        </h3>
        <div className={`p-4 rounded-lg ${isDark ? 'bg-apm-gray/10' : 'bg-gray-50'}`}>
          <ol
            className={`list-decimal list-inside space-y-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
          >
            <li>Click "+ Add Rule" to create a new rule</li>
            <li>Choose a rule type based on what you want to achieve</li>
            <li>Write a pattern that matches the search queries you want to affect</li>
            <li>Configure the action (what should happen when the pattern matches)</li>
            <li>Set a priority (higher = runs first)</li>
            <li>Save and test with a matching search query</li>
          </ol>
        </div>
      </section>

      <section>
        <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Tips for Success
        </h3>
        <ul className={`space-y-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-1">*</span>
            <span>Start with simple patterns and test before making them complex</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-1">*</span>
            <span>Use the toggle to quickly enable/disable rules for A/B testing</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-1">*</span>
            <span>Archive rules instead of deleting them so you can restore later</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-1">*</span>
            <span>Check the search results metadata to see which rules fired</span>
          </li>
        </ul>
      </section>
    </div>
  );
}

/**
 * Rule Types Tab - Detailed explanation of each rule type
 */
function RuleTypesTab({ isDark, expandedType, setExpandedType }) {
  const types = Object.entries(RULE_TYPE_HELP);

  return (
    <div className="space-y-4">
      <p className={`mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
        Click on a rule type to see detailed information and field descriptions.
      </p>

      {types.map(([typeId, type]) => {
        const colors = getRuleTypeColor(typeId);
        const isExpanded = expandedType === typeId;

        return (
          <div
            key={typeId}
            className={`rounded-lg border overflow-hidden ${
              isDark ? 'border-apm-gray/20' : 'border-gray-200'
            }`}
          >
            {/* Header */}
            <button
              onClick={() => setExpandedType(isExpanded ? null : typeId)}
              className={`w-full flex items-center justify-between p-4 text-left transition-colors ${
                isDark ? 'hover:bg-apm-gray/10' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${colors.light} ${colors.text}`}
                >
                  {type.title}
                </span>
                <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {type.summary}
                </span>
              </div>
              <svg
                className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''} ${
                  isDark ? 'text-gray-400' : 'text-gray-500'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div
                className={`p-4 border-t ${
                  isDark ? 'border-apm-gray/20 bg-apm-gray/5' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="space-y-4">
                  <div>
                    <h4
                      className={`text-sm font-medium mb-1 ${
                        isDark ? 'text-gray-200' : 'text-gray-700'
                      }`}
                    >
                      When to Use
                    </h4>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {type.whenToUse}
                    </p>
                  </div>

                  <div>
                    <h4
                      className={`text-sm font-medium mb-1 ${
                        isDark ? 'text-gray-200' : 'text-gray-700'
                      }`}
                    >
                      Example
                    </h4>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {type.example}
                    </p>
                  </div>

                  <div>
                    <h4
                      className={`text-sm font-medium mb-1 ${
                        isDark ? 'text-gray-200' : 'text-gray-700'
                      }`}
                    >
                      How It Works
                    </h4>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {type.howItWorks}
                    </p>
                  </div>

                  <div>
                    <h4
                      className={`text-sm font-medium mb-2 ${
                        isDark ? 'text-gray-200' : 'text-gray-700'
                      }`}
                    >
                      Fields
                    </h4>
                    <dl className="space-y-2">
                      {Object.entries(type.fields).map(([field, desc]) => (
                        <div key={field} className="flex gap-2">
                          <dt
                            className={`text-sm font-mono ${
                              isDark ? 'text-apm-purple' : 'text-purple-600'
                            }`}
                          >
                            {field}:
                          </dt>
                          <dd className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {desc}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Field Reference Tab - All field descriptions
 */
function FieldReferenceTab({ isDark }) {
  const commonFields = ['id', 'type', 'pattern', 'description', 'priority', 'enabled'];
  const actionFields = Object.keys(FIELD_HELP).filter(f => !commonFields.includes(f));

  return (
    <div className="space-y-8">
      {/* Common Fields */}
      <section>
        <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Common Fields (All Rule Types)
        </h3>
        <div className="space-y-4">
          {commonFields.map(fieldId => {
            const field = FIELD_HELP[fieldId];
            if (!field) return null;
            return <FieldCard key={fieldId} fieldId={fieldId} field={field} isDark={isDark} />;
          })}
        </div>
      </section>

      {/* Action Fields */}
      <section>
        <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Action Fields (Type-Specific)
        </h3>
        <div className="space-y-4">
          {actionFields.map(fieldId => {
            const field = FIELD_HELP[fieldId];
            if (!field) return null;
            return <FieldCard key={fieldId} fieldId={fieldId} field={field} isDark={isDark} />;
          })}
        </div>
      </section>
    </div>
  );
}

/**
 * Field Card - Individual field documentation
 */
function FieldCard({ fieldId, field, isDark }) {
  return (
    <div
      className={`p-4 rounded-lg border ${
        isDark ? 'border-apm-gray/20 bg-apm-gray/5' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{field.label}</h4>
        <code
          className={`text-xs px-2 py-0.5 rounded ${
            isDark ? 'bg-apm-gray/20 text-gray-400' : 'bg-gray-200 text-gray-600'
          }`}
        >
          {fieldId}
        </code>
      </div>
      <p className={`text-sm mb-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
        {field.description}
      </p>
      {field.tips && field.tips.length > 0 && (
        <ul className={`text-xs space-y-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {field.tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-apm-purple mt-0.5">*</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      )}
      {field.example && (
        <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          Example:{' '}
          <code
            className={`font-mono px-1 py-0.5 rounded ${isDark ? 'bg-apm-gray/20' : 'bg-gray-200'}`}
          >
            {field.example}
          </code>
        </p>
      )}
    </div>
  );
}

/**
 * Examples Tab - Step-by-step walkthroughs
 */
function ExamplesTab({ isDark }) {
  return (
    <div className="space-y-8">
      {/* Example 1: Library Boost */}
      <section>
        <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Example 1: Boost MLB Music for Sports Queries
        </h3>
        <div
          className={`p-4 rounded-lg border ${
            isDark ? 'border-apm-gray/20 bg-apm-gray/5' : 'border-gray-200 bg-gray-50'
          }`}
        >
          <ol
            className={`list-decimal list-inside space-y-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
          >
            <li>Click "+ Add Rule"</li>
            <li>
              Select <strong>library_boost</strong> as the rule type
            </li>
            <li>
              Enter pattern:{' '}
              <code className="font-mono bg-black/10 px-1 rounded">
                \b(sports?|baseball|stadium|game)\b
              </code>
            </li>
            <li>Enter description: "Boost MLB Music for sports-related queries"</li>
            <li>Set priority: 90</li>
            <li>In Action Configuration, add a library: "MLB Music" with boost factor 1.5</li>
            <li>Click Save</li>
            <li>Test by searching "baseball music" - MLB Music tracks should appear higher</li>
          </ol>
        </div>
      </section>

      {/* Example 2: Recency Interleaving */}
      <section>
        <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Example 2: Mix Recent and Vintage Pop
        </h3>
        <div
          className={`p-4 rounded-lg border ${
            isDark ? 'border-apm-gray/20 bg-apm-gray/5' : 'border-gray-200 bg-gray-50'
          }`}
        >
          <ol
            className={`list-decimal list-inside space-y-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
          >
            <li>Click "+ Add Rule"</li>
            <li>
              Select <strong>recency_interleaving</strong> as the rule type
            </li>
            <li>
              Enter pattern:{' '}
              <code className="font-mono bg-black/10 px-1 rounded">\b(pop|contemporary)\b</code>
            </li>
            <li>Enter description: "Mix recent and vintage pop tracks (favor recent)"</li>
            <li>Set priority: 80</li>
            <li>
              Configure action:
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                <li>Recent Threshold: 12 months</li>
                <li>Vintage Max: 60 months</li>
                <li>Pattern: RRRR VRRR VRRR (4:1 ratio favoring recent)</li>
                <li>Repeat Count: 3</li>
              </ul>
            </li>
            <li>Click Save</li>
            <li>Test by searching "pop music" - results should alternate recent/vintage</li>
          </ol>
        </div>
      </section>

      {/* Pattern Cheat Sheet */}
      <section>
        <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Common Pattern Cheat Sheet
        </h3>
        <div
          className={`overflow-x-auto rounded-lg border ${
            isDark ? 'border-apm-gray/20' : 'border-gray-200'
          }`}
        >
          <table className="w-full text-sm">
            <thead className={isDark ? 'bg-apm-gray/10' : 'bg-gray-50'}>
              <tr>
                <th
                  className={`px-4 py-2 text-left font-medium ${
                    isDark ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  Pattern
                </th>
                <th
                  className={`px-4 py-2 text-left font-medium ${
                    isDark ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  Matches
                </th>
                <th
                  className={`px-4 py-2 text-left font-medium ${
                    isDark ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  Does Not Match
                </th>
              </tr>
            </thead>
            <tbody className={isDark ? 'text-gray-400' : 'text-gray-600'}>
              <tr className={isDark ? 'border-t border-apm-gray/20' : 'border-t border-gray-200'}>
                <td className="px-4 py-2 font-mono">\b(rock)\b</td>
                <td className="px-4 py-2">rock, Rock, ROCK</td>
                <td className="px-4 py-2">rocky, bedrock</td>
              </tr>
              <tr className={isDark ? 'border-t border-apm-gray/20' : 'border-t border-gray-200'}>
                <td className="px-4 py-2 font-mono">\b(rock|jazz)\b</td>
                <td className="px-4 py-2">rock, jazz</td>
                <td className="px-4 py-2">rocky, jazzy</td>
              </tr>
              <tr className={isDark ? 'border-t border-apm-gray/20' : 'border-t border-gray-200'}>
                <td className="px-4 py-2 font-mono">\b(sports?)\b</td>
                <td className="px-4 py-2">sport, sports</td>
                <td className="px-4 py-2">sporty, sportsman</td>
              </tr>
              <tr className={isDark ? 'border-t border-apm-gray/20' : 'border-t border-gray-200'}>
                <td className="px-4 py-2 font-mono">\b(hip[- ]?hop)\b</td>
                <td className="px-4 py-2">hip hop, hip-hop, hiphop</td>
                <td className="px-4 py-2">hippopotamus</td>
              </tr>
              <tr className={isDark ? 'border-t border-apm-gray/20' : 'border-t border-gray-200'}>
                <td className="px-4 py-2 font-mono">\b(stem|stems|multitrack)\b</td>
                <td className="px-4 py-2">stem, stems, multitrack</td>
                <td className="px-4 py-2">system, stemware</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
