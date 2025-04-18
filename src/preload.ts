// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'electron',
    {
        requestAccessibilityPermission: () =>
            ipcRenderer.invoke('request-accessibility-permission'),
        requestMediaAccess: (mediaType: 'microphone' | 'camera') =>
            ipcRenderer.invoke('request-media-access', mediaType),
        openSystemPreferences: (mediaType: "microphone" | "camera") =>
            ipcRenderer.invoke("open-system-preferences", mediaType),
        startScreenCapture: () =>
            ipcRenderer.invoke("start-screen-capture"),
        stopScreenCapture: () =>
            ipcRenderer.invoke("stop-screen-capture"),
        getScreenshots: () =>
            ipcRenderer.invoke("get-screenshots"),
        getScreenshot: (filename: string) =>
            ipcRenderer.invoke("get-screenshot", filename),
        analyzeAllScreenshots: () =>
            ipcRenderer.invoke("analyze-all-screenshots"),
        getScreenshotAnalysis: (filename: string) =>
            ipcRenderer.invoke("get-screenshot-analysis", filename),
        getActiveWindow: () =>
            ipcRenderer.invoke("get-active-window"),
        calculateUsageStats: () =>
            ipcRenderer.invoke("calculate-usage-stats"),
    }
);
