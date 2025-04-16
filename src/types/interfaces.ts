/**
 * Interface for application timeline analysis
 */
export interface TimeBasedAnalysis {
    applicationName: string;
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
}

export interface ApplicationSegment {
    applicationName: string;
    startTime: number;
    endTime: number;
    color: string;
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