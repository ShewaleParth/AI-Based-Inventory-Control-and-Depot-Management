import { Component } from 'react';

export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 40, textAlign: 'center' }}>
                    <h2>Something went wrong in Supplier Risk Radar</h2>
                    <pre style={{ color: 'red', fontSize: 12 }}>
                        {this.state.error?.message}
                    </pre>
                    <button onClick={() => this.setState({ hasError: false })}>
                        Retry
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
