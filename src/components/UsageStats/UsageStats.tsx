import React, { useEffect, useState } from 'react';
import { UsageStats as UsageStatsType } from '../../types/interfaces';
import './UsageStats.css';

const UsageStats: React.FC = () => {
    const [usageStats, setUsageStats] = useState<UsageStatsType | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const loadUsageStats = async () => {
        if (!window.electron) return;
        
        try {
            setLoading(true);
            setError(null);
            const stats = await window.electron.calculateUsageStats();
            setUsageStats(stats);
        } catch (err) {
            setError('Failed to load usage statistics');
            console.error('Error loading usage stats:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsageStats();
    }, []);

    const formatTime = (ms: number): string => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    };

    if (loading) {
        return <div className="usage-stats-loading">Loading statistics...</div>;
    }

    if (error) {
        return <div className="usage-stats-error">{error}</div>;
    }

    if (!usageStats || usageStats.appStats.length === 0) {
        return <div className="usage-stats-empty">No usage data available. Start a screen capture session to collect data.</div>;
    }

    return (
        <div className="usage-stats">
            <h3>Application Usage Statistics</h3>
            
            <div className="stats-summary">
                <div className="stat-item">
                    <span className="stat-label">Total Session Time:</span>
                    <span className="stat-value">{formatTime(usageStats.totalTimeMs)}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Active Time:</span>
                    <span className="stat-value">{formatTime(usageStats.totalTimeMs - usageStats.idleTimeMs)}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Idle Time:</span>
                    <span className="stat-value">{formatTime(usageStats.idleTimeMs)}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Idle Percentage:</span>
                    <span className="stat-value">
                        {usageStats.totalTimeMs > 0 
                            ? `${(usageStats.idleTimeMs / usageStats.totalTimeMs * 100).toFixed(1)}%` 
                            : '0%'}
                    </span>
                </div>
            </div>
            
            <table className="usage-table">
                <thead>
                    <tr>
                        <th>Application</th>
                        <th>Time Spent</th>
                        <th>Percentage</th>
                        <th>Screenshots</th>
                    </tr>
                </thead>
                <tbody>
                    {usageStats.appStats.map((app, index) => (
                        <tr key={index}>
                            <td>{app.applicationName}</td>
                            <td>{formatTime(app.totalTimeMs)}</td>
                            <td>{app.percentage.toFixed(1)}%</td>
                            <td>{app.screenshotCount}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="refresh-button-container">
                <button 
                    className="refresh-button"
                    onClick={loadUsageStats}
                >
                    Refresh Statistics
                </button>
            </div>
        </div>
    );
};

export default UsageStats;