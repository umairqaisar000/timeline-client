import { exec } from 'child_process';
import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, nativeImage, shell, systemPreferences, Tray } from 'electron';
import started from 'electron-squirrel-startup';
import fs from 'fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs/browser';
import { promisify } from 'util';

// Promisify exec
const execAsync = promisify(exec);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let isQuitting = false;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Add screen capture functionality
let captureInterval: NodeJS.Timeout | null = null;
let captureCount = 0;
const MAX_CAPTURES = 30; // 30 seconds * 1 fps = 30 captures
const ANALYSIS_INTERVAL = 5; // Analyze every 5th screenshot

let previousImageBuffer: Buffer<ArrayBufferLike> | null = null;
let lastAnalysisTime = 0;
const MIN_ANALYSIS_INTERVAL = 10000; // Minimum 10 seconds between analyses

// Create a recording session tracker
let isFirstFrame = true;

// Path to screenshots directory
const screenshotsDir = path.join(__dirname, '..', '..', 'screenshots');

// Path to script files - create the proper path
// These paths need to work both in dev and production
// In production, the script files are copied to the build directory alongside main.js
const getActiveWindowExtendedScript = path.join(__dirname, 'applescripts', 'getActiveWindowExtended.applescript');
const getActiveWindowPSScript = path.join(__dirname, 'powershell', 'getActiveWindow.ps1');
const getSimpleActiveWindowPSScript = path.join(__dirname, 'powershell', 'getSimpleActiveWindow.ps1');

console.log(`Script path: ${getActiveWindowExtendedScript}`);

// Function to execute AppleScript file with error handling
async function executeAppleScript(scriptPath: string): Promise<string> {
  try {
    // Instead of trying to run the file which has encoding issues,
    // use a simpler inline script that performs the same function
    const inlineScript = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        set windowTitle to ""
        
        try
          tell process frontApp
            if exists (1st window whose value of attribute "AXMain" is true) then
              set windowTitle to name of 1st window whose value of attribute "AXMain" is true
            end if
          end tell
        end try
        
        -- Get all processes
        set appList to {}
        set runningApps to application processes
        repeat with appProcess in runningApps
          try
            set appName to name of appProcess
            set end of appList to appName
          end try
        end repeat
        
        return {frontApp, windowTitle, appList}
      end tell
    `;

    try {
      return (await execAsync(`osascript -e '${inlineScript.replace(/'/g, "'\\''")}'`)).stdout.trim();
    } catch (scriptError) {
      console.error('Error executing inline AppleScript:', scriptError);

      // If inline script fails, return a default value
      return '"Unknown", "Unknown", {}';
    }
  } catch (error) {
    console.error('Error in executeAppleScript:', error);
    return '"Unknown", "Unknown", {}';
  }
}

// Function to execute PowerShell script with error handling
async function executePowerShellScript(scriptPath: string): Promise<string> {
  try {
    // First, check if the file exists
    if (!fs.existsSync(scriptPath)) {
      console.error(`Script file not found: ${scriptPath}`);
      throw new Error(`Script file not found: ${scriptPath}`);
    }

    return (await execAsync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`)).stdout.trim();
  } catch (error) {
    console.error('Error executing PowerShell script:', error);
    throw error;
  }
}

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // devTools: false
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // Create tray icon - using a relative path from the app root
  const icon = nativeImage.createFromDataURL('data:image/png;base64,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')
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow?.show() },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setToolTip('Co-working App');
  tray.setContextMenu(contextMenu);

  // Handle window close event
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // Handle tray click
  tray.on('click', () => {
    mainWindow?.show();
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle app quit
app.on('before-quit', () => {
  isQuitting = true;
});

// Handle accessibility permission request
ipcMain.handle('request-accessibility-permission', async () => {
  if (process.platform === 'darwin') {
    // macOS
    const hasPermission = systemPreferences.isTrustedAccessibilityClient(false);
    if (!hasPermission) {
      // Open System Preferences > Security & Privacy > Privacy > Accessibility
      // await app.openAccessibilitySettings();
      return false;
    }
    return true;
  } else if (process.platform === 'win32') {
    // Windows
    try {
      // On Windows, we need to check if the app has accessibility permissions
      // This is typically done through the Windows API
      return new Promise((resolve) => {
        exec('reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Accessibility\\ATs"', (error: Error | null) => {
          if (error) {
            // If the registry key doesn't exist or we can't access it,
            // we need to request permissions
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    } catch (error) {
      console.error('Error checking Windows accessibility permissions:', error);
      return false;
    }
  }
  return false;
});

ipcMain.handle(
  "request-media-access",
  async (_, mediaType: "microphone" | "camera") => {
    console.log(`Requesting ${mediaType} permission...`);
    try {
      // For macOS, use the system dialog
      if (process.platform === "darwin") {
        const status = systemPreferences.getMediaAccessStatus(mediaType);
        console.log(`Current ${mediaType} status:`, status);

        // Only ask if not already granted or denied
        if (status !== "granted") {
          const result = await systemPreferences.askForMediaAccess(mediaType);
          console.log(`${mediaType} permission result:`, result);
          return result;
        }
        return status === "granted";
      }
      // For Windows/Linux, we can't programmatically request permissions
      // Just return true and handle permission errors when accessing the device
      return true;
    } catch (error) {
      console.error(`Error requesting ${mediaType} access:`, error);
      return false;
    }
  },
);


ipcMain.handle(
  "open-system-preferences",
  async (_, mediaType: "microphone" | "camera") => {
    if (process.platform === "darwin") {
      // macOS path
      let prefSection = "";
      if (mediaType === "microphone") {
        prefSection = "Privacy_Microphone";
      } else if (mediaType === "camera") {
        prefSection = "Privacy_Camera";
      }

      if (prefSection) {
        await shell.openExternal(
          `x-apple.systempreferences:com.apple.preference.security?${prefSection}`,
        );
        return true;
      }
    } else if (process.platform === "win32") {
      // Windows path
      const settingsPage =
        mediaType === "camera" ? "privacy-webcam" : "privacy-microphone";
      await shell.openExternal(`ms-settings:${settingsPage}`);
      return true;
    }

    return false;
  },
);

// Add screen capture functionality
ipcMain.handle('start-screen-capture', async () => {
  if (captureInterval) {
    clearInterval(captureInterval);
  }

  console.log('Starting new screen capture');

  captureCount = 0;
  previousImageBuffer = null;
  lastAnalysisTime = 0;
  isFirstFrame = true; // Mark this as the first frame of a new session

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  captureInterval = setInterval(async () => {
    if (captureCount >= MAX_CAPTURES) {
      clearInterval(captureInterval);
      captureInterval = null;
      return;
    }

    try {
      // Get active window info and list of open applications
      let activeWindow = null;
      let openApplications = [];
      try {
        if (process.platform === 'darwin') {
          // macOS approach using AppleScript
          const script = await executeAppleScript(getActiveWindowExtendedScript);
          const result = script.split(', ');

          if (result.length >= 2) {
            const name = result[0].replace(/"/g, '');
            const title = result[1].replace(/"/g, '');
            openApplications = result.slice(2).map(app => app.replace(/"/g, ''));

            activeWindow = {
              title: title || name,
              applicationName: name
            };
          }
        } else if (process.platform === 'win32') {
          // Windows approach using PowerShell
          const script = await executePowerShellScript(getActiveWindowPSScript);
          const result = JSON.parse(script);

          activeWindow = {
            title: result.windowTitle,
            applicationName: result.frontApp
          };
          openApplications = result.runningApps;
        }
      } catch (error) {
        console.error('Error getting active window for screenshot:', error);
        activeWindow = {
          title: "Unknown",
          applicationName: "Unknown"
        };
        openApplications = [];
      }

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 1080 }
      });

      if (sources.length > 0) {
        const currentBuffer = sources[0].thumbnail.toPNG();
        let shouldSave = true;

        // Track if this is the first frame of the session for metadata
        const isFirstFrameOfSession = captureCount === 0;

        // If this is the first frame, always save it without comparison
        if (!isFirstFrame && previousImageBuffer && captureCount > 0 && captureCount < MAX_CAPTURES - 1) {
          const img1 = PNG.sync.read(previousImageBuffer);
          const img2 = PNG.sync.read(currentBuffer);

          if (
            img1.width === img2.width &&
            img1.height === img2.height
          ) {
            const diff = pixelmatch(
              img1.data,
              img2.data,
              null,
              img1.width,
              img1.height,
              { threshold: 0.3 }
            );

            const totalPixels = img1.width * img1.height;
            const similarity = 1 - diff / totalPixels;

            console.log(`Similarity: ${similarity}`);

            if (similarity > 0.98) {
              shouldSave = false;
              console.log('Skipping similar screenshot.');
            }
          } else {
            console.warn('Image dimensions mismatch. Saving image just in case.');
          }
        } else if (isFirstFrame) {
          console.log('Saving first frame of new recording session.');
          isFirstFrame = false; // After first frame, reset the flag
        }

        if (shouldSave) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const screenshotPath = path.join(screenshotsDir, `screenshot-${timestamp}.png`);
          const jsonPath = screenshotPath.replace('.png', '.json');

          fs.writeFileSync(screenshotPath, currentBuffer);
          previousImageBuffer = currentBuffer;
          console.log('Screenshot saved:', screenshotPath);

          // Save active window info and open applications to JSON
          const jsonData = {
            imageURL: screenshotPath,
            applicationName: activeWindow?.applicationName || "Unknown",
            windowTitle: activeWindow?.title || "Unknown",
            timestamp: new Date().toISOString(),
            openApplications: openApplications,
            isFirstFrameOfSession: isFirstFrameOfSession
          };

          fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
          console.log('Window info and open applications saved:', jsonPath);
        }

        captureCount++;
      }
    } catch (error) {
      console.error('Error capturing screen:', error);
    }
  }, 1000); // 1000ms interval = 1 fps

  return true;
});

ipcMain.handle('stop-screen-capture', () => {
  console.log('Stopping screen capture');

  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
    previousImageBuffer = null; // Reset for the next session
    isFirstFrame = true; // Reset for the next session
  }
  return true;
});

// Add these handlers for timeline features
ipcMain.handle('get-screenshots', async () => {
  try {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(screenshotsDir)
      .filter(file => file.endsWith('.png'))
      .map(file => {
        // Extract timestamp from filename (screenshot-2023-04-10T09-54-45-006Z.png)
        const timestamp = file.replace('screenshot-', '').replace('.png', '');
        // Convert back to ISO format for sorting
        const isoTimestamp = timestamp.replace(/-/g, (match, index) => {
          if (index === 13 || index === 16) return ':';
          if (index === 19) return '.';
          return match;
        });

        return {
          filename: file,
          path: path.join(screenshotsDir, file),
          timestamp: new Date(isoTimestamp).getTime(),
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    return files;
  } catch (error) {
    console.error('Error getting screenshots:', error);
    return [];
  }
});

ipcMain.handle('get-screenshot', async (_, filename) => {
  try {
    const filePath = path.join(screenshotsDir, filename);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      return {
        data: data.toString('base64'),
        filename
      };
    }
    return null;
  } catch (error) {
    console.error('Error reading screenshot:', error);
    return null;
  }
});

// Add handler for getting screenshot analysis
ipcMain.handle('get-screenshot-analysis', async (_, filename) => {
  try {
    const jsonPath = path.join(screenshotsDir, filename.replace('.png', '.json'));
    if (fs.existsSync(jsonPath)) {
      const data = fs.readFileSync(jsonPath, 'utf-8');
      const jsonData = JSON.parse(data);
      return {
        applicationName: jsonData.applicationName,
        windowTitle: jsonData.windowTitle || '',
        timestamp: jsonData.timestamp || new Date().toISOString(),
        backgroundApplications: jsonData.openApplications || [],
        isFirstFrameOfSession: jsonData.isFirstFrameOfSession || false
      };
    }
    return null;
  } catch (error) {
    console.error('Error reading screenshot analysis:', error);
    return null;
  }
});

// Add handler for analyzing all screenshots
ipcMain.handle('analyze-all-screenshots', async () => {
  try {
    // Get all JSON files
    const files = fs.readdirSync(screenshotsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(screenshotsDir, file);
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return {
          applicationName: jsonData.applicationName,
          windowTitle: jsonData.windowTitle || '',
          backgroundApplications: jsonData.openApplications || [],
          timestamp: jsonData.timestamp || file.replace('screenshot-', '').replace('.json', ''),
          file
        };
      })
      .sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
      });

    // Group by application
    const appGroups = {};
    let currentApp = null;
    let startTime = null;

    const timelineData = [];

    for (let i = 0; i < files.length; i++) {
      const current = files[i];

      // First entry or app changed
      if (!currentApp || currentApp !== current.applicationName) {
        // Save previous app session if it exists
        if (currentApp && startTime) {
          timelineData.push({
            applicationName: currentApp,
            backgroundApplications: current.backgroundApplications,
            timeFrom: startTime,
            timeEnd: current.timestamp
          });
        }

        // Start new session
        currentApp = current.applicationName;
        startTime = current.timestamp;
      }

      // Last entry
      if (i === files.length - 1) {
        timelineData.push({
          applicationName: currentApp,
          backgroundApplications: current.backgroundApplications,
          timeFrom: startTime,
          timeEnd: current.timestamp
        });
      }
    }

    return timelineData;
  } catch (error) {
    console.error('Error analyzing all screenshots:', error);
    return [];
  }
});

ipcMain.handle('get-active-window', async () => {
  try {
    let activeWindow = null;

    if (process.platform === 'darwin') {
      // macOS approach using AppleScript
      const script = await executeAppleScript(getActiveWindowExtendedScript);
      const result = script.split(', ');

      if (result.length >= 2) {
        const name = result[0].replace(/"/g, '');
        const title = result[1].replace(/"/g, '');

        activeWindow = {
          title: title || name,
          owner: {
            name,
            path: "unknown"
          }
        };
      }
    } else if (process.platform === 'win32') {
      // Windows approach using PowerShell
      const script = await executePowerShellScript(getSimpleActiveWindowPSScript);
      const result = JSON.parse(script);

      activeWindow = {
        title: result.title,
        owner: {
          name: result.name,
          path: result.path || ''
        }
      };
    }

    return activeWindow;
  } catch (error) {
    console.error('Error getting active window:', error);
    return {
      title: "Unable to get window info",
      owner: {
        name: "Unknown",
        path: "Unknown"
      }
    };
  }
});

// Add handler for calculating usage statistics from screenshots
ipcMain.handle('calculate-usage-stats', async () => {
  try {
    // Get all JSON files
    const files = fs.readdirSync(screenshotsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(screenshotsDir, file);
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return {
          applicationName: jsonData.applicationName,
          windowTitle: jsonData.windowTitle || '',
          backgroundApplications: jsonData.openApplications || [],
          timestamp: jsonData.timestamp || file.replace('screenshot-', '').replace('.json', ''),
          file
        };
      })
      .sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
      });

    // Skip this calculation if no screenshots
    if (files.length === 0) {
      return {
        appStats: [],
        totalTimeMs: 0,
        idleTimeMs: 0
      };
    }

    // Calculate time differences between screenshots
    const timeDiffs = [];

    // Define interface for app usage statistics
    interface AppUsageStats {
      totalTimeMs: number;
      screenshotCount: number;
    }

    const appUsage: Record<string, AppUsageStats> = {};
    let totalTimeMs = 0;
    let idleTimeMs = 0;

    // Initialize all application counts
    for (const file of files) {
      if (!appUsage[file.applicationName]) {
        appUsage[file.applicationName] = {
          totalTimeMs: 0,
          screenshotCount: 0
        };
      }
    }

    // Calculate time differences and app usage
    for (let i = 0; i < files.length - 1; i++) {
      const current = files[i];
      const next = files[i + 1];

      const currentTime = new Date(current.timestamp).getTime();
      const nextTime = new Date(next.timestamp).getTime();
      const diffMs = nextTime - currentTime;

      // Detect idle time (if time difference is more than 5 seconds)
      const isIdle = diffMs > 5000;

      if (isIdle) {
        idleTimeMs += diffMs;
      } else {
        // Add time to current application
        appUsage[current.applicationName].totalTimeMs += diffMs;
        appUsage[current.applicationName].screenshotCount++;
      }

      totalTimeMs += diffMs;

      timeDiffs.push({
        from: current.timestamp,
        to: next.timestamp,
        diffMs,
        isIdle
      });
    }

    // Add count for the last screenshot
    if (files.length > 0) {
      const last = files[files.length - 1];
      appUsage[last.applicationName].screenshotCount++;
    }

    // Convert to array and calculate percentages
    const appStats = Object.entries(appUsage).map(([applicationName, stats]) => {
      const { totalTimeMs, screenshotCount } = stats;
      return {
        applicationName,
        totalTimeMs,
        percentage: totalTimeMs > 0 ? (totalTimeMs / (totalTimeMs - idleTimeMs)) * 100 : 0,
        screenshotCount
      };
    }).sort((a, b) => b.totalTimeMs - a.totalTimeMs);

    return {
      appStats,
      totalTimeMs,
      idleTimeMs
    };
  } catch (error) {
    console.error('Error calculating usage statistics:', error);
    return {
      appStats: [],
      totalTimeMs: 0,
      idleTimeMs: 0
    };
  }
});