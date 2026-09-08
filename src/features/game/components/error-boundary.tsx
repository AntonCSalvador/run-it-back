"use client";

import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode; onRestart: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(): void {}
  private restart = (): void => { this.setState({ failed: false }); this.props.onRestart(); };
  render(): ReactNode {
    if (this.state.failed) return <section role="alert"><p>Something went wrong with this run.</p><p>If a saved checkpoint is available, recover it. Otherwise, you’ll return to mode selection.</p><button type="button" onClick={this.restart}>Recover run</button></section>;
    return this.props.children;
  }
}
