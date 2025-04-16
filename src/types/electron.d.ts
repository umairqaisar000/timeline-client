import 'electron';
import { ActiveWindowInfo, TimeBasedAnalysis } from './interfaces';

declare module 'electron' {
    interface App {
        openAccessibilitySettings(): Promise<void>;
    }
}

interface Screenshot {
    filename: string;
    path: string;
    timestamp: number;
    applicationName?: string;
}

interface ScreenshotAnalysis {
    applicationName: string;
}

declare global {
    interface Window {
        electron?: {
            requestAccessibilityPermission: () => Promise<boolean>;
            requestMediaAccess: (mediaType: 'microphone' | 'camera') => Promise<boolean>;
            openSystemPreferences: (mediaType: 'microphone' | 'camera') => Promise<boolean>;
            startScreenCapture: () => Promise<boolean>;
            stopScreenCapture: () => Promise<boolean>;
            getScreenshots: () => Promise<Screenshot[]>;
            getScreenshot: (filename: string) => Promise<{ data: string; filename: string } | null>;
            analyzeAllScreenshots: () => Promise<TimeBasedAnalysis[]>;
            getScreenshotAnalysis: (filename: string) => Promise<ScreenshotAnalysis | null>;
            getActiveWindow: () => Promise<ActiveWindowInfo | null>;
        };
    }
}

declare module 'electron-squirrel-startup' {
    const started: boolean;
    export default started;
} 