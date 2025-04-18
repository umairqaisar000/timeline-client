/**
 * Interface for application timeline analysis
 */
export interface TimeBasedAnalysis {
    applicationName: string;
    backgroundApplications: string[];
    timeFrom: string;
    timeEnd: string;
}

/**
 * Interface for active window information
 */
export interface ActiveWindowInfo {
    title: string;
    owner: {
        name: string;
        path: string;
    };
    url?: string;
}

// Import the Screenshot interface type
export interface Screenshot {
    filename: string;
    path: string;
    timestamp: number;
    applicationName?: string;
    isFirstFrameOfSession?: boolean;
}

export interface ApplicationSegment {
    applicationName: string;
    startTime: number;
    endTime: number;
    color: string;
    bufferFactor?: number;
    screenshotIndex?: number; // Index of the screenshot this segment represents
    startIndex?: number; // Start index of the segment in the screenshots array
    endIndex?: number; // End index of the segment in the screenshots array
    screenshotIndices?: number[]; // Array of indices of screenshots in this segment
}

export interface TimelineProps {
    onScreenshotSelect?: (screenshot: { data: string; filename: string }) => void;
    onBackClick?: () => void;
}

// Interface for interpolated frame
export interface InterpolatedFrame {
    data: string;
    position: number; // between 0 and 1, representing position between two real frames
}

export interface ScreenshotAnalysis {
    applicationName: string;
    windowTitle: string;
    timestamp: string;
    backgroundApplications: string[];
    isFirstFrameOfSession: boolean;
}

export interface AppUsageStats {
    applicationName: string;
    totalTimeMs: number;
    percentage: number;
    screenshotCount: number;
}

export interface UsageStats {
    appStats: AppUsageStats[];
    totalTimeMs: number;
    idleTimeMs: number;
}