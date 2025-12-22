import { Component } from 'react';

/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays fallback UI
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console (could be sent to error reporting service)
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div className="p-4 m-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg
                className="w-6 h-6 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-red-800 dark:text-red-200 font-semibold">
                Something went wrong
              </h3>
              <p className="mt-1 text-red-700 dark:text-red-300 text-sm">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              {import.meta.env.DEV && this.state.errorInfo && (
                <details className="mt-2">
                  <summary className="text-red-600 dark:text-red-400 text-xs cursor-pointer">
                    Stack trace
                  </summary>
                  <pre className="mt-2 p-2 bg-red-100 dark:bg-red-900/40 rounded text-xs overflow-auto max-h-32">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
              <button
                onClick={this.handleRetry}
                className="mt-3 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
