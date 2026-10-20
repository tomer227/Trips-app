import { Component, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** Last line of defence: a page that crashes shows a friendly message, and the menu keeps working. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('page crashed', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="card" role="alert">
        <h2>אופס, משהו השתבש בעמוד הזה 😕</h2>
        <p className="muted">המידע שלכם שמור. נסו לטעון מחדש, או לעבור לעמוד אחר בתפריט למטה.</p>
        <button className="btn" onClick={() => window.location.reload()}>
          טעינה מחדש
        </button>
      </div>
    );
  }
}
