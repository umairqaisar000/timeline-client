import React, { useEffect, useRef, useState } from 'react';
import { ActiveWindowInfo, TimeBasedAnalysis } from '../../types/interfaces';
import Button from '../Button/Button';
import Timeline from '../Timeline';
import UsageStats from '../UsageStats';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    const [hasMicrophonePermission, setHasMicrophonePermission] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState(false);
    const [isCapturing, setIsCapturing] = useState(false);
    const [view, setView] = useState<'capture' | 'timeline' | 'analytics'>('capture');
    const [timeBasedAnalysis, setTimeBasedAnalysis] = useState<TimeBasedAnalysis[]>([]);
    const [activeWindow, setActiveWindow] = useState<ActiveWindowInfo | null>(null);
    const [windowError, setWindowError] = useState<string | null>(null);
    const activeWindowTimerRef = useRef<NodeJS.Timeout | null>(null);

    const requestPermissions = async () => {
        if (!window.electron) return;
        try {
            const microphoneResult = await window.electron.requestMediaAccess("microphone");
            setHasMicrophonePermission(microphoneResult);
            if (!microphoneResult) {
                alert("Microphone access is required for this application to work properly. Please allow microphone access in your system preferences.");
                const microphoneResultSystemSettings = await window.electron.openSystemPreferences("microphone");
                setHasMicrophonePermission(microphoneResultSystemSettings);
            }

            const cameraResult = await window.electron.requestMediaAccess("camera");
            setHasCameraPermission(cameraResult);
            if (!cameraResult) {
                alert("Camera access is required for this application to work properly. Please allow camera access in your system preferences.");
                const cameraResultSystemSettings = await window.electron.openSystemPreferences("camera");
                setHasCameraPermission(cameraResultSystemSettings);
            }

            const accessibilityGranted = await window.electron?.requestAccessibilityPermission();
            if (!accessibilityGranted) {
                console.warn('Accessibility permission denied');
            }
        } catch (error) {
            console.error("Error requesting permissions:", error);
        }
    };

    const checkActiveWindow = async () => {
        if (!window.electron) return;

        try {
            setWindowError(null);
            const activeWin = await window.electron.getActiveWindow();
            if (activeWin) {
                setActiveWindow(activeWin);
                console.log('Active window:', activeWin);
            }
        } catch (error) {
            console.error('Error getting active window:', error);
            setWindowError('Failed to get active window information. Check permissions.');
            // Stop tracking if there's an error to prevent constant error logs
            stopActiveWindowTracking();
        }
    };

    useEffect(() => {
        // void requestPermissions();
    }, []);

    const startActiveWindowTracking = () => {
        if (activeWindowTimerRef.current) {
            clearInterval(activeWindowTimerRef.current);
        }

        // Try to get the active window immediately
        void checkActiveWindow();

        // Check active window every second
        activeWindowTimerRef.current = setInterval(checkActiveWindow, 1000);
    };

    const stopActiveWindowTracking = () => {
        if (activeWindowTimerRef.current) {
            clearInterval(activeWindowTimerRef.current);
            activeWindowTimerRef.current = null;
        }
    };

    useEffect(() => {
        return () => {
            stopActiveWindowTracking();
        };
    }, []);

    const handleScreenCapture = async () => {
        if (!isCapturing) {
            const started = await window.electron?.startScreenCapture();
            if (started) {
                setIsCapturing(true);
                // startActiveWindowTracking();
                setTimeout(async () => {
                    await window.electron?.stopScreenCapture();
                    setIsCapturing(false);
                    // stopActiveWindowTracking();
                    const analysis = await window.electron?.analyzeAllScreenshots();
                    if (analysis) {
                        setTimeBasedAnalysis(analysis);
                    }
                }, 30000);
            }
        } else {
            await window.electron?.stopScreenCapture();
            setIsCapturing(false);
            // stopActiveWindowTracking();
            const analysis = await window.electron?.analyzeAllScreenshots();
            if (analysis) {
                setTimeBasedAnalysis(analysis);
            }
        }
    };

    const handleViewSwitch = (newView: 'capture' | 'timeline' | 'analytics') => {
        if (isCapturing && (newView === 'timeline' || newView === 'capture')) {
            window.electron?.stopScreenCapture();
            setIsCapturing(false);
            stopActiveWindowTracking();
        }
        setView(newView);
    };

    return (
        <div className="dashboard">
            <header>
                <h1 className='dashboard-title'>AI-Coworking Rewind</h1>
                <div className="view-toggle">
                    <button
                        className={`view-button ${view === 'capture' ? 'active' : ''}`}
                        onClick={() => handleViewSwitch('capture')}
                    >
                        Capture
                    </button>
                    <button
                        className={`view-button ${view === 'timeline' ? 'active' : ''}`}
                        onClick={() => handleViewSwitch('timeline')}
                    >
                        Timeline
                    </button>
                    <button
                        className={`view-button ${view === 'analytics' ? 'active' : ''}`}
                        onClick={() => handleViewSwitch('analytics')}
                    >
                        Analytics
                    </button>
                </div>
            </header>

            <main>
                {view === 'capture' ? (
                    <div className="capture-view">
                        <div className="button-group">
                            <Button
                                isRecording={isCapturing}
                                onClick={handleScreenCapture}
                            >
                                {isCapturing ? 'Stop Capture' : 'Start Capture'}
                            </Button>
                        </div>
                        <div className="capture-instructions">
                            <p>Click &quot;Start Capture&quot; to begin recording your screen activity.</p>
                            <p>Recordings will automatically stop after 30 seconds.</p>
                            <p>Switch to &quot;Timeline&quot; to view and play back your captured screen capture.</p>
                        </div>

                        {/* {windowError ? ( */}
                        {/* <div className="error-message">
                            <p>{windowError}</p>
                            <p>Make sure you have granted accessibility permissions to the application.</p>
                        </div> */}
                        {/* ) : (
                            activeWindow && (
                                <div className="active-window-info">
                                    <h3>Current Active Window:</h3>
                                    <p><strong>Title:</strong> {activeWindow.title}</p>
                                    <p><strong>Application:</strong> {activeWindow.owner.name}</p>
                                    {activeWindow.url && <p><strong>URL:</strong> {activeWindow.url}</p>}
                                </div>
                            )
                        )} */}
                    </div>
                ) : view === 'timeline' ? (
                    <div className="timeline-view">
                        {timeBasedAnalysis.length > 0 && (
                            <div className="analysis-result">
                                <h3>Application Timeline:</h3>
                                <pre>{JSON.stringify(timeBasedAnalysis, null, 2)}</pre>
                            </div>
                        )}
                        <Timeline onScreenshotSelect={() => null} onBackClick={() => handleViewSwitch('capture')} />
                    </div>
                ) : (
                    <div className="analytics-view">
                        <UsageStats />
                    </div>
                )}
            </main>
        </div>
    );
};

export default Dashboard;
