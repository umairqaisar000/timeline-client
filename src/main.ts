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

// Path to screenshots directory
const screenshotsDir = path.join(__dirname, '..', '..', 'screenshots');

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

  captureCount = 0;
  previousImageBuffer = null;
  lastAnalysisTime = 0;

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
          const script = `
            on extractPrimaryDomain(fullURL)
              -- Remove protocol
              set tid to AppleScript's text item delimiters
              set AppleScript's text item delimiters to {"://"}
              set urlParts to text items of fullURL
              if (count of urlParts) > 1 then
                set domainWithPath to item 2 of urlParts
              else
                set domainWithPath to item 1 of urlParts
              end if
              
              -- Remove path
              set AppleScript's text item delimiters to {"/"}
              set domainParts to text items of domainWithPath
              set fullDomain to item 1 of domainParts
              
              -- Remove www prefix
              if fullDomain begins with "www." then
                set cleanDomain to text 5 thru -1 of fullDomain
              else
                set cleanDomain to fullDomain
              end if
              
              -- Extract primary domain
              set AppleScript's text item delimiters to {"."}
              set domainNameParts to text items of cleanDomain
              set partsCount to count of domainNameParts
              
              -- Get appropriate domain part
              if partsCount ≥ 3 then
                set primaryDomain to item (partsCount - 1) of domainNameParts
              else if partsCount = 2 then
                set primaryDomain to item 1 of domainNameParts
              else
                set primaryDomain to cleanDomain
              end if
              
              set AppleScript's text item delimiters to tid
              return primaryDomain
            end extractPrimaryDomain

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
              
              -- Check if the active app is a browser and get URL
              set isBrowser to false
              set browserURL to ""
              
              if frontApp is "Safari" then
                try
                  tell application "Safari"
                    set browserURL to URL of current tab of front window
                    set isBrowser to true
                  end tell
                end try
              else if frontApp is "Google Chrome" then
                try
                  tell application "Google Chrome"
                    set browserURL to URL of active tab of front window
                    set isBrowser to true
                  end tell
                end try
              end if
              
              -- If it's a browser, extract the domain from the actual URL
              if isBrowser and browserURL is not "" then
                set frontApp to my extractPrimaryDomain(browserURL)
              end if
              
              -- Get list of all running applications
              set appList to {}
              set runningApps to every application process whose visible is true
              repeat with appProcess in runningApps
                set appName to name of appProcess
                set end of appList to appName
              end repeat
              
              return {frontApp, windowTitle, appList}
            end tell`;

          const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
          const result = stdout.trim().split(', ');

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
          const script = `
            Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class Win32 {
              [DllImport("user32.dll")]
              public static extern IntPtr GetForegroundWindow();
              [DllImport("user32.dll")]
              public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
              [DllImport("user32.dll")]
              public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);
            }
            "@

            function Extract-PrimaryDomain {
                param([string]$fullURL)
                
                # Remove protocol
                if ($fullURL -match "://") {
                    $domainWithPath = $fullURL.Split("://")[1]
                } else {
                    $domainWithPath = $fullURL
                }
                
                # Remove path
                $fullDomain = $domainWithPath.Split("/")[0]
                
                # Remove www prefix
                if ($fullDomain.StartsWith("www.")) {
                    $cleanDomain = $fullDomain.Substring(4)
                } else {
                    $cleanDomain = $fullDomain
                }
                
                # Extract primary domain
                $domainNameParts = $cleanDomain.Split(".")
                $partsCount = $domainNameParts.Count
                
                # Get appropriate domain part
                if ($partsCount -ge 3) {
                    $primaryDomain = $domainNameParts[$partsCount - 2]
                } elseif ($partsCount -eq 2) {
                    $primaryDomain = $domainNameParts[0]
                } else {
                    $primaryDomain = $cleanDomain
                }
                
                return $primaryDomain
            }

            # Get current window info
            $window = [Win32]::GetForegroundWindow()
            $processID = 0
            [Win32]::GetWindowThreadProcessId($window, [ref]$processID)
            $process = Get-Process -Id $processID
            $title = New-Object System.Text.StringBuilder 256
            [Win32]::GetWindowText($window, $title, 256)
            $windowTitle = $title.ToString()

            # Check if the active app is a browser and get URL
            $isBrowser = $false
            $browserURL = ""
            $frontApp = $process.ProcessName

            # Chrome browser detection
            if ($frontApp -eq "chrome") {
                try {
                    # This requires the installation of the Chrome extension with native messaging
                    # This is a placeholder - actual implementation would require Chrome automation
                    # You might need to use external tools like selenium or browser automation
                    $isBrowser = $true
                    
                    # This is where you would get the URL - this is just an example approach
                    # Parsing window title as URLs are often in browser titles
                    if ($windowTitle -match '(https?://[^\\s]+)') {
                        $browserURL = $matches[1]
                    }
                } catch {
                    Write-Host "Error getting Chrome URL: $_"
                }
            }
            # Edge browser detection
            elseif ($frontApp -eq "msedge") {
                try {
                    # Similar placeholder for Microsoft Edge
                    $isBrowser = $true
                    if ($windowTitle -match '(https?://[^\\s]+)') {
                        $browserURL = $matches[1]
                    }
                } catch {
                    Write-Host "Error getting Edge URL: $_"
                }
            }
            # Firefox browser detection
            elseif ($frontApp -eq "firefox") {
                try {
                    # Similar placeholder for Firefox
                    $isBrowser = $true
                    if ($windowTitle -match '(https?://[^\\s]+)') {
                        $browserURL = $matches[1]
                    }
                } catch {
                    Write-Host "Error getting Firefox URL: $_"
                }
            }

            # If it's a browser, extract the domain from the actual URL
            if ($isBrowser -and $browserURL -ne "") {
                $frontApp = Extract-PrimaryDomain -fullURL $browserURL
            }

            # Get list of all running applications
            $runningApps = Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -ExpandProperty ProcessName

            $obj = @{
                frontApp = $frontApp
                windowTitle = $windowTitle
                runningApps = $runningApps
            }

            ConvertTo-Json $obj
          `;

          const { stdout } = await execAsync('powershell -command "' + script + '"');
          const result = JSON.parse(stdout.trim());

          activeWindow = {
            title: result.title,
            applicationName: result.name
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

        // Always save first and last image
        if (previousImageBuffer && captureCount > 0 && captureCount < MAX_CAPTURES - 1) {
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
            openApplications: openApplications
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
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
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
        timestamp: jsonData.timestamp || new Date().toISOString()
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
      const script = `
        on extractPrimaryDomain(fullURL)
          -- Remove protocol
          set tid to AppleScript's text item delimiters
          set AppleScript's text item delimiters to {"://"}
          set urlParts to text items of fullURL
          if (count of urlParts) > 1 then
            set domainWithPath to item 2 of urlParts
          else
            set domainWithPath to item 1 of urlParts
          end if
          
          -- Remove path
          set AppleScript's text item delimiters to {"/"}
          set domainParts to text items of domainWithPath
          set fullDomain to item 1 of domainParts
          
          -- Remove www prefix
          if fullDomain begins with "www." then
            set cleanDomain to text 5 thru -1 of fullDomain
          else
            set cleanDomain to fullDomain
          end if
          
          -- Extract primary domain
          set AppleScript's text item delimiters to {"."}
          set domainNameParts to text items of cleanDomain
          set partsCount to count of domainNameParts
          
          -- Get appropriate domain part
          if partsCount ≥ 3 then
            set primaryDomain to item (partsCount - 1) of domainNameParts
          else if partsCount = 2 then
            set primaryDomain to item 1 of domainNameParts
          else
            set primaryDomain to cleanDomain
          end if
          
          set AppleScript's text item delimiters to tid
          return primaryDomain
        end extractPrimaryDomain

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
          
          -- Check if the active app is a browser and get URL
          set isBrowser to false
          set browserURL to ""
          
          if frontApp is "Safari" then
            try
              tell application "Safari"
                set browserURL to URL of current tab of front window
                set isBrowser to true
              end tell
            end try
          else if frontApp is "Google Chrome" then
            try
              tell application "Google Chrome"
                set browserURL to URL of active tab of front window
                set isBrowser to true
              end tell
            end try
          else if frontApp is "Firefox" then
            try
              tell application "Firefox"
                set browserURL to URL of active tab of front window
                set isBrowser to true
              end tell
            end try
          else if frontApp is "Microsoft Edge" then
            try
              tell application "Microsoft Edge"
                set browserURL to URL of active tab of front window
                set isBrowser to true
              end tell
            end try
          else if frontApp is "Brave Browser" then
            try
              tell application "Brave Browser"
                set browserURL to URL of active tab of front window
                set isBrowser to true
              end tell
            end try
          else if frontApp is "Opera" then
            try
              tell application "Opera"
                set browserURL to URL of active tab of front window
                set isBrowser to true
              end tell
            end try
          end if
          
          -- If it's a browser, extract the domain from the actual URL
          if isBrowser and browserURL is not "" then
            set frontApp to my extractPrimaryDomain(browserURL)
          end if
          
          -- Get list of all running applications
          set appList to {}
          set runningApps to every application process whose visible is true
          repeat with appProcess in runningApps
            set appName to name of appProcess
            set end of appList to appName
          end repeat
          
          return {frontApp, windowTitle, appList}
        end tell`;

      const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
      const result = stdout.trim().split(', ');

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
      const script = `
        Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
          [DllImport("user32.dll")]
          public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")]
          public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
          [DllImport("user32.dll")]
          public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);
        }
"@
        $window = [Win32]::GetForegroundWindow()
        $processID = 0
        [Win32]::GetWindowThreadProcessId($window, [ref]$processID)
        $process = Get-Process -Id $processID
        $title = New-Object System.Text.StringBuilder 256
        [Win32]::GetWindowText($window, $title, 256)
        
        $obj = @{
          title = $title.ToString()
          name = $process.ProcessName
          path = $process.Path
        }
        
        ConvertTo-Json $obj
      `;

      const { stdout } = await execAsync('powershell -command "' + script + '"');
      const result = JSON.parse(stdout.trim());

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