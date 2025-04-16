import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApplicationSegment, InterpolatedFrame, Screenshot, TimelineProps } from '../../types/interfaces';
import './Timeline.css';



const Timeline: React.FC<TimelineProps> = ({ onScreenshotSelect, onBackClick }) => {
    const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
    const [applicationSegments, setApplicationSegments] = useState<ApplicationSegment[]>([]);
    const [currentScreenshot, setCurrentScreenshot] = useState<{ data: string; filename: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentPosition, setCurrentPosition] = useState(0); // Precise position including interpolation
    const [isPlaying, setIsPlaying] = useState(false); const [isInterpolating, setIsInterpolating] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [wheelTimeout, setWheelTimeout] = useState<NodeJS.Timeout | null>(null);
    const [tooltipContent, setTooltipContent] = useState<string>('');
    const [tooltipPosition, setTooltipPosition] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
    const [showTooltip, setShowTooltip] = useState<boolean>(false);
    const [backgroundApplications, setBackgroundApplications] = useState<string[]>([]);
    const [showSidebar, setShowSidebar] = useState(false);
    const [isSidebarClosing, setIsSidebarClosing] = useState(false);

    const timelineRef = useRef<HTMLDivElement>(null);
    const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const screenshotCache = useRef<Map<string, string>>(new Map());
    const lastWheelEventRef = useRef<number>(0);
    const previousIndexRef = useRef<number>(0);
    const lastWheelDirection = useRef<number>(0);
    const wheelAccumulator = useRef<number>(0);
    const isDraggingRef = useRef<boolean>(false);
    const previousPositionRef = useRef<number>(0);
    const dragStartX = useRef<number>(0);

    useEffect(() => {
        loadScreenshots();

        // Clean up on unmount
        return () => {
            if (playIntervalRef.current) {
                clearInterval(playIntervalRef.current);
            }
            if (wheelTimeout) {
                clearTimeout(wheelTimeout);
            }
        };
    }, []);

    // Store previous index for interpolation
    useEffect(() => {
        previousIndexRef.current = currentIndex;
    }, [currentIndex]);

    // Generate a consistent color for each application
    const getApplicationColor = (appName: string) => {
        const colors = [
            '#4a6fff', '#ff5e5e', '#50C878', '#FFD700',
            '#9370DB', '#FF8C00', '#20B2AA', '#FF69B4'
        ];

        // Use a simple hash function to consistently map app names to colors
        const hash = appName.split('').reduce((acc, char) => {
            return char.charCodeAt(0) + ((acc << 5) - acc);
        }, 0);

        return colors[Math.abs(hash) % colors.length];
    };

    const loadScreenshots = async () => {
        if (!window.electron) return;

        setIsLoading(true);
        try {
            const files = await window.electron.getScreenshots();

            // Load application names from JSON files
            const screenshotsWithApps = await Promise.all(files.map(async (file) => {
                try {
                    const analysis = await window.electron.getScreenshotAnalysis(file.filename);
                    return {
                        ...file,
                        applicationName: analysis?.applicationName || 'Unknown'
                    };
                } catch (error) {
                    console.error('Error reading analysis:', error);
                    return {
                        ...file,
                        applicationName: 'Unknown'
                    };
                }
            }));

            setScreenshots(screenshotsWithApps);

            // Create application segments by consolidating consecutive same apps
            const segments: ApplicationSegment[] = [];
            let currentSegment: ApplicationSegment | null = null;

            for (let i = 0; i < screenshotsWithApps.length; i++) {
                const current = screenshotsWithApps[i];
                const next = screenshotsWithApps[i + 1];
                const appName = current.applicationName || 'Unknown';

                if (!currentSegment || currentSegment.applicationName !== appName) {
                    // If we have a previous segment, add it to the list
                    if (currentSegment) {
                        segments.push(currentSegment);
                    }

                    // Start a new segment
                    currentSegment = {
                        applicationName: appName,
                        startTime: current.timestamp,
                        endTime: next ? next.timestamp : current.timestamp + 2000,
                        color: getApplicationColor(appName)
                    };
                } else {
                    // Update the end time of the current segment
                    currentSegment.endTime = next ? next.timestamp : current.timestamp + 2000;
                }
            }

            // Add the last segment if it exists
            if (currentSegment) {
                segments.push(currentSegment);
            }

            setApplicationSegments(segments);

            if (screenshotsWithApps.length > 0) {
                await loadScreenshot(screenshotsWithApps[0].filename);
                setCurrentPosition(0);
            }
        } catch (error) {
            console.error('Error loading screenshots:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper to preload adjacent screenshots for smoother experience
    const preloadAdjacentScreenshots = async (currentIndex: number) => {
        if (screenshots.length <= 1) return;

        const preloadIndices = [
            Math.max(0, currentIndex - 1),
            Math.min(screenshots.length - 1, currentIndex + 1)
        ];

        for (const idx of preloadIndices) {
            const filename = screenshots[idx].filename;
            if (!screenshotCache.current.has(filename)) {
                try {
                    const data = await window.electron?.getScreenshot(filename);
                    if (data) {
                        screenshotCache.current.set(filename, data.data);
                    }
                } catch (error) {
                    console.error('Error preloading screenshot:', error);
                }
            }
        }
    };

    const loadScreenshot = async (filename: string, isUserInteraction = false) => {
        if (!window.electron) return;

        try {
            // Check if we have it cached
            let screenshotData: { data: string; filename: string } | null = null;

            if (screenshotCache.current.has(filename)) {
                screenshotData = {
                    data: screenshotCache.current.get(filename)!,
                    filename
                };
            } else {
                const data = await window.electron.getScreenshot(filename);
                if (data) {
                    screenshotCache.current.set(filename, data.data);
                    screenshotData = data;
                }
            }

            if (screenshotData) {
                setCurrentScreenshot(screenshotData);

                // Find index of current screenshot
                const index = screenshots.findIndex(s => s.filename === filename);
                if (index !== -1) {
                    setCurrentIndex(index);
                    setCurrentPosition(index);

                    // Only load background applications and show sidebar if this is a user interaction
                    if (isUserInteraction) {
                        const jsonPath = filename.replace('.png', '.json');
                        try {
                            const analysis = await window.electron.getScreenshotAnalysis(jsonPath);
                            if (analysis) {
                                setBackgroundApplications(analysis.backgroundApplications || []);
                                setShowSidebar(true);
                            }
                        } catch (error) {
                            console.error('Error loading background applications:', error);
                            setBackgroundApplications([]);
                        }
                    }

                    // Call the callback if provided
                    if (onScreenshotSelect) {
                        onScreenshotSelect(screenshotData);
                    }

                    // Scroll timeline
                    if (timelineRef.current) {
                        const timelineElement = timelineRef.current;
                        const items = timelineElement.querySelectorAll('.timeline-item');
                        if (items[index]) {
                            const itemOffsetLeft = (items[index] as HTMLElement).offsetLeft;
                            timelineElement.scrollLeft = itemOffsetLeft - timelineElement.clientWidth / 2;
                        }
                    }

                    // Preload adjacent screenshots for smoother scrubbing
                    preloadAdjacentScreenshots(index);
                }
            }
        } catch (error) {
            console.error('Error loading screenshot:', error);
        }
    };

    // Function to generate interpolated frame between two screenshots
    const generateInterpolatedFrame = async (fromIndex: number, toIndex: number, position: number) => {
        if (!window.electron || fromIndex < 0 || toIndex >= screenshots.length || fromIndex === toIndex) {
            return null;
        }

        setIsInterpolating(true);

        try {
            // Load the two screenshots we need to interpolate between
            const fromFilename = screenshots[fromIndex].filename;
            const toFilename = screenshots[toIndex].filename;

            let fromData: string;
            let toData: string;

            // Check cache first
            if (screenshotCache.current.has(fromFilename)) {
                fromData = screenshotCache.current.get(fromFilename)!;
            } else {
                const data = await window.electron.getScreenshot(fromFilename);
                if (data) {
                    fromData = data.data;
                    screenshotCache.current.set(fromFilename, fromData);
                } else {
                    throw new Error("Failed to load source frame");
                }
            }

            if (screenshotCache.current.has(toFilename)) {
                toData = screenshotCache.current.get(toFilename)!;
            } else {
                const data = await window.electron.getScreenshot(toFilename);
                if (data) {
                    toData = data.data;
                    screenshotCache.current.set(toFilename, toData);
                } else {
                    throw new Error("Failed to load target frame");
                }
            }

            // Advanced interpolation: we select the frame based on position
            // but cache the current frame to make it feel more responsive
            let chosenData;

            // For smoother transitions, create more interpolation steps
            if (position < 0.33) {
                chosenData = fromData;
            } else if (position < 0.67) {
                // For real implementation, you would use a proper frame interpolation algorithm here
                // such as optical flow or pixel-wise blending
                // Simple crossfade for demonstration purposes
                const cacheKey = `interp-${fromIndex}-${toIndex}-mid`;

                if (screenshotCache.current.has(cacheKey)) {
                    chosenData = screenshotCache.current.get(cacheKey)!;
                } else {
                    // In a real implementation, this would be a more advanced blend
                    chosenData = position <= 0.5 ? fromData : toData;
                    screenshotCache.current.set(cacheKey, chosenData);
                }
            } else {
                chosenData = toData;
            }

            const interpolated: InterpolatedFrame = {
                data: chosenData,
                position
            };

            // Show the interpolated frame
            setCurrentScreenshot({
                data: interpolated.data,
                filename: `interpolated-${fromIndex}-${toIndex}-${position.toFixed(2)}`
            });

            return interpolated;
        } catch (error) {
            console.error('Error generating interpolated frame:', error);
            return null;
        } finally {
            setIsInterpolating(false);
        }
    };

    // Handle trackpad scrolling for precise scrubbing
    const handleWheelEvent = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
        event.preventDefault();

        if (screenshots.length === 0) return;

        // Determine if this is likely a trackpad or mouse wheel
        const isTrackpad = Math.abs(event.deltaX) > 0 || Math.abs(event.deltaY) < 40;
        const sensitivity = isTrackpad ? 0.3 : 0.8; // Lower sensitivity for trackpad

        // Use deltaX for horizontal trackpad gestures, deltaY otherwise
        const primaryDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

        // Accumulate wheel deltas to handle trackpad sensitivity
        wheelAccumulator.current += primaryDelta;
        const direction = primaryDelta > 0 ? 1 : -1;

        // Only trigger a change if we've accumulated enough movement
        // or direction changed (for responsive feel)
        const threshold = isTrackpad ? 10 : 25;
        if (Math.abs(wheelAccumulator.current) > threshold ||
            (direction !== lastWheelDirection.current && lastWheelDirection.current !== 0)) {

            // Reset accumulator if direction changed
            if (direction !== lastWheelDirection.current) {
                wheelAccumulator.current = direction * threshold;
            }

            lastWheelDirection.current = direction;

            // Calculate movement amount based on accumulated delta
            const moveAmount = Math.min(
                2.0,
                Math.abs(wheelAccumulator.current / (isTrackpad ? 100 : 50))
            ) * sensitivity * direction;

            // Calculate new position with fractional movement for smooth scrubbing
            const newPosition = Math.max(0, Math.min(
                screenshots.length - 1,
                currentPosition + moveAmount
            ));

            setCurrentPosition(newPosition);

            // Update the visual timeline position
            const integerPosition = Math.floor(newPosition);
            if (integerPosition !== currentIndex) {
                loadScreenshot(screenshots[integerPosition].filename);
            }

            // Calculate the fractional part for interpolation
            const fractionalPart = newPosition - integerPosition;
            if (fractionalPart > 0 && integerPosition < screenshots.length - 1) {
                generateInterpolatedFrame(integerPosition, integerPosition + 1, fractionalPart);
            }

            // Reset wheel accumulator partially, not completely (for momentum feel)
            wheelAccumulator.current = direction * (wheelAccumulator.current * 0.4);

            // Update last wheel timestamp for inertia calculation
            lastWheelEventRef.current = Date.now();

            // Clear any existing timeout and set a new one
            if (wheelTimeout) {
                clearTimeout(wheelTimeout);
            }

            // Reset timeline after wheel movement stops
            const timeout = setTimeout(() => {
                const intPosition = Math.round(currentPosition);
                if (intPosition !== currentIndex && intPosition >= 0 && intPosition < screenshots.length) {
                    loadScreenshot(screenshots[intPosition].filename);
                }
                lastWheelDirection.current = 0;
            }, isTrackpad ? 200 : 100);

            setWheelTimeout(timeout);
        }
    }, [screenshots, currentIndex, currentPosition, wheelTimeout]);

    // Handle mouse/touch dragging for mobile-friendly scrubbing
    const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (screenshots.length === 0) return;

        setIsDragging(true);
        isDraggingRef.current = true;
        dragStartX.current = event.clientX;
        previousPositionRef.current = currentPosition;

        // Add document-level event listeners for drag tracking
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (event: MouseEvent) => {
        if (!isDraggingRef.current || !timelineRef.current) return;

        const timelineWidth = timelineRef.current.clientWidth;
        const deltaX = event.clientX - dragStartX.current;
        const movePercent = deltaX / timelineWidth;

        // Calculate new position with more precision for smoother scrubbing
        const totalRange = screenshots.length - 1;
        const newPosition = Math.max(0, Math.min(
            totalRange,
            previousPositionRef.current - (movePercent * totalRange * 2) // Adjust multiplier for sensitivity
        ));

        setCurrentPosition(newPosition);

        // Update the visual timeline position
        const integerPosition = Math.floor(newPosition);
        if (integerPosition !== currentIndex) {
            loadScreenshot(screenshots[integerPosition].filename);
        }

        // Calculate the fractional part for interpolation
        const fractionalPart = newPosition - integerPosition;
        if (fractionalPart > 0 && integerPosition < screenshots.length - 1) {
            generateInterpolatedFrame(integerPosition, integerPosition + 1, fractionalPart);
        }
    };

    const handleMouseUp = () => {
        if (!isDraggingRef.current) return;

        setIsDragging(false);
        isDraggingRef.current = false;

        // Snap to nearest frame
        const intPosition = Math.round(currentPosition);
        if (intPosition !== currentIndex && intPosition >= 0 && intPosition < screenshots.length) {
            loadScreenshot(screenshots[intPosition].filename);
        }

        // Remove document-level event listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    // Handle click on timeline
    const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineRef.current || screenshots.length === 0 || isDragging) return;

        const rect = timelineRef.current.getBoundingClientRect();
        const timelineWidth = rect.width;
        const clickX = event.clientX - rect.left;
        const clickPosition = clickX / timelineWidth;

        // Calculate the exact position based on percentage
        const exactPosition = clickPosition * (screenshots.length - 1);

        // Set the current position first for immediate visual feedback
        setCurrentPosition(exactPosition);

        // Then load the nearest screenshot
        const newIndex = Math.round(exactPosition);
        const boundedIndex = Math.max(0, Math.min(screenshots.length - 1, newIndex));

        loadScreenshot(screenshots[boundedIndex].filename, true); // Pass true for user interaction
    };

    const handlePrevious = () => {
        if (currentIndex > 0) {
            const newIndex = currentIndex - 1;
            loadScreenshot(screenshots[newIndex].filename, true); // Pass true for user interaction
            setCurrentPosition(newIndex);
        }
    };

    const handleNext = () => {
        if (currentIndex < screenshots.length - 1) {
            const newIndex = currentIndex + 1;
            loadScreenshot(screenshots[newIndex].filename, true); // Pass true for user interaction
            setCurrentPosition(newIndex);
        } else {
            // If we're at the end, stop playing
            if (isPlaying) {
                handlePlayPause();
            }
        }
    };

    const handlePlayPause = () => {
        if (isPlaying) {
            // Stop playing
            if (playIntervalRef.current) {
                clearInterval(playIntervalRef.current);
                playIntervalRef.current = null;
            }
            setIsPlaying(false);
        } else {
            // Start playing - if at the end, start from beginning
            if (currentIndex >= screenshots.length - 1) {
                loadScreenshot(screenshots[0].filename);
                setCurrentPosition(0);
            }

            // Setup interval for playback with interpolation
            const interval = setInterval(() => {
                setCurrentPosition(prevPosition => {
                    const nextPosition = prevPosition + (0.1 * playbackSpeed); // Reduced increment for smoother movement

                    if (nextPosition >= screenshots.length - 1) {
                        // Stop playing when reached the end
                        if (playIntervalRef.current) {
                            clearInterval(playIntervalRef.current);
                            playIntervalRef.current = null;
                        }
                        setIsPlaying(false);
                        return screenshots.length - 1;
                    }

                    // Update actual frame when crossing integer boundary
                    const prevIntegerIndex = Math.floor(prevPosition);
                    const nextIntegerIndex = Math.floor(nextPosition);

                    if (prevIntegerIndex !== nextIntegerIndex) {
                        loadScreenshot(screenshots[nextIntegerIndex].filename, false); // Pass false for animation
                    }

                    // Generate interpolated frame for fractional positions
                    const fractionalPart = nextPosition - nextIntegerIndex;
                    if (fractionalPart > 0 && nextIntegerIndex < screenshots.length - 1) {
                        generateInterpolatedFrame(nextIntegerIndex, nextIntegerIndex + 1, fractionalPart);
                    }

                    return nextPosition;
                });
            }, 100); // Increased interval time from 50ms to 100ms for slower playback

            playIntervalRef.current = interval;
            setIsPlaying(true);
        }
    };

    // Toggle playback speed
    const toggleSpeed = () => {
        const speeds = [0.25, 0.5, 1, 2]; // Added slower speed options
        const currentSpeedIndex = speeds.indexOf(playbackSpeed);
        const nextSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
        setPlaybackSpeed(speeds[nextSpeedIndex]);

        // If currently playing, restart playback with new speed
        if (isPlaying && playIntervalRef.current) {
            clearInterval(playIntervalRef.current);
            handlePlayPause();
        }
    };

    // Format timestamp for display in the timeline
    const formatTimelineTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    // Format timestamp for detailed display at the top
    const formatDetailedTime = (timestamp: number) => {
        const date = new Date(timestamp);
        // Get formatted date string
        const dateStr = date.toLocaleString([], {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        // Convert "am"/"pm" to uppercase "AM"/"PM" if needed
        return dateStr.replace(/\b(am|pm)\b/i, (match) => match.toUpperCase());
    };

    const handleCloseSidebar = () => {
        setIsSidebarClosing(true);
        setTimeout(() => {
            setShowSidebar(false);
            setIsSidebarClosing(false);
        }, 300); // Match the animation duration
    };

    if (isLoading) {
        return <div className="timeline-loading">Loading timeline...</div>;
    }

    if (screenshots.length === 0) {
        return <div className="timeline-empty">No screenshots available. Start capturing to create a timeline.</div>;
    }

    // Get current screenshot timestamp if available
    const currentTimestamp = currentIndex >= 0 && currentIndex < screenshots.length
        ? screenshots[currentIndex].timestamp
        : null;

    // Calculate position marker for the current position (including interpolation)
    const positionMarkerStyle = {
        left: `${(currentPosition / (screenshots.length - 1)) * 100}%`
    };

    return (
        <div className="timeline-container">
            {/* Back button */}
            <button className="back-button" onClick={onBackClick}>
                <svg viewBox="0 0 24 24">
                    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                </svg>
            </button>

            {/* Sidebar for background applications */}
            {showSidebar && (
                <div className={`background-apps-sidebar ${isSidebarClosing ? 'closing' : ''}`}>
                    <div className="sidebar-header">
                        <h3>Background Applications</h3>
                        <button className="close-sidebar" onClick={handleCloseSidebar}>
                            <svg viewBox="0 0 24 24">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                            </svg>
                        </button>
                    </div>
                    <div className="background-apps-list">
                        {backgroundApplications.length > 0 ? (
                            backgroundApplications.map((app, index) => (
                                <div key={index} className="background-app-item">
                                    <span className="app-name">{app}</span>
                                </div>
                            ))
                        ) : (
                            <div className="no-background-apps">No background applications</div>
                        )}
                    </div>
                </div>
            )}

            {currentScreenshot && (
                <div className={`screenshot-display ${isInterpolating ? 'interpolating' : ''}`}>
                    <img
                        src={`data:image/png;base64,${currentScreenshot.data}`}
                        alt="Screenshot"
                        className="current-screenshot"
                    />
                </div>
            )}

            {currentTimestamp && (
                <div className="current-time">
                    <span>{formatDetailedTime(currentTimestamp)}</span>
                    {isInterpolating && <span className="interpolation-badge">Interpolating</span>}
                </div>
            )}

            {/* Timeline tooltip - moved outside other containers for better visibility */}
            {showTooltip && (
                <div
                    className="timeline-tooltip"
                    style={{
                        left: `${tooltipPosition.x}px`,
                        top: `${tooltipPosition.y - 30}px`
                    }}
                >
                    {tooltipContent}
                </div>
            )}

            <div className="timeline-controls">
                <button
                    className="control-button"
                    onClick={handlePrevious}
                    disabled={currentIndex === 0}
                >
                    <svg viewBox="0 0 24 24">
                        <path d="M18.41 16.59L13.82 12l4.59-4.59L17 6l-6 6 6 6 1.41-1.41zM6 6h2v12H6z" />
                    </svg>
                </button>
                <button
                    className="control-button play-pause"
                    onClick={handlePlayPause}
                >
                    {isPlaying ? (
                        <svg viewBox="0 0 24 24">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    )}
                </button>
                <button
                    className="control-button"
                    onClick={handleNext}
                    disabled={currentIndex === screenshots.length - 1}
                >
                    <svg viewBox="0 0 24 24">
                        <path d="M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6-1.41 1.41zM16 6h2v12h-2z" />
                    </svg>
                </button>
                <button
                    className="control-button speed"
                    onClick={toggleSpeed}
                >
                    {playbackSpeed}x
                </button>
            </div>

            <div
                className={`timeline ${isDragging ? 'dragging' : ''}`}
                ref={timelineRef}
                onClick={handleTimelineClick}
                onWheel={handleWheelEvent}
                onMouseDown={handleMouseDown}
            >
                <div className="timeline-inner" style={{ width: '100%' }}>
                    {/* Application segments */}
                    <div className="application-segments">
                        {applicationSegments.map((segment, index) => {
                            const startPercent = (segment.startTime - screenshots[0].timestamp) /
                                (screenshots[screenshots.length - 1].timestamp - screenshots[0].timestamp) * 100;
                            const endPercent = (segment.endTime - screenshots[0].timestamp) /
                                (screenshots[screenshots.length - 1].timestamp - screenshots[0].timestamp) * 100;

                            return (
                                <div
                                    key={`${segment.applicationName}-${index}`}
                                    className="application-segment"
                                    style={{
                                        left: `${startPercent}%`,
                                        width: `${endPercent - startPercent}%`,
                                        backgroundColor: segment.color
                                    }}
                                    onMouseEnter={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setTooltipContent(segment.applicationName);
                                        setTooltipPosition({
                                            x: rect.left + rect.width / 2,
                                            y: rect.top
                                        });
                                        setShowTooltip(true);
                                    }}
                                    onMouseLeave={() => setShowTooltip(false)}
                                >
                                    <span className="segment-label">{segment.applicationName}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Existing timeline markers */}
                    {screenshots.map((screenshot, index) => (
                        <div
                            key={screenshot.filename}
                            className={`timeline-item ${currentIndex === index ? 'active' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                loadScreenshot(screenshot.filename);
                                setCurrentPosition(index);
                            }}
                            style={{ width: `${100 / screenshots.length}%` }}
                        >
                            <div className="timeline-marker"></div>
                            {/* <div className="timeline-time">{formatTimelineTime(screenshot.timestamp)}</div> */}
                        </div>
                    ))}
                    <div
                        className="position-indicator"
                        style={{ left: `${(currentPosition / (screenshots.length - 1)) * 100}%` }}
                    ></div>
                </div>
                <div className="timeline-current-marker"></div>
            </div>
        </div>
    );
};

export default Timeline; 