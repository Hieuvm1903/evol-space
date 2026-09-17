import React from "react";

interface Props {
  children: React.ReactNode;
  onError?: (error: Error) => void;
}
interface State {
  hasError: boolean;
}

/** useLoader throws on malformed/corrupt files — this catches that so one
 * bad upload doesn't crash the whole viewer. Remount via `key={model.id}`
 * at the call site to clear the error state when a new model is picked. */
export default class ModelErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}