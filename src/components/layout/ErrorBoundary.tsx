import { Component, type ErrorInfo, type ReactNode } from 'react'

import { reportError } from '@/lib/analytics/events'
import { isDevelopmentMode } from '@/utils/env'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ParkPilot crashed', error, info)
    reportError(error, { source: 'react', component_stack: info.componentStack })
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex min-h-full items-center justify-center p-6"
        >
          <div className="w-full max-w-sm space-y-3 text-center">
            <h1 className="text-lg font-bold">Something went wrong</h1>
            <p className="text-sm text-ink-muted">
              ParkPilot hit an unexpected error. Your bookings and wallet are
              unaffected.
            </p>
            {isDevelopmentMode ? (
              <pre
                data-testid="error-stack"
                className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-surface p-3 text-left text-[10px] text-ink-muted"
              >
                {this.state.error.stack}
              </pre>
            ) : null}
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-on-ink"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="w-full rounded-xl bg-surface px-4 py-3 text-sm font-semibold text-ink"
            >
              Back to home
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
