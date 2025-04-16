import React from 'react';
import ReactDOM from 'react-dom/client';
import Dashboard from './components/Dashboard';
import './index.css';
import { ThemeProvider } from './providers/ThemeProvider';
const App: React.FC = () => {
    return (
        <ThemeProvider>
            <Dashboard />
        </ThemeProvider>
    );
};

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);

root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
); 