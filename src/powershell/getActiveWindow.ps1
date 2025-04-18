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
        if ($windowTitle -match '(https?://[^\s]+)') {
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
        if ($windowTitle -match '(https?://[^\s]+)') {
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
        if ($windowTitle -match '(https?://[^\s]+)') {
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
$runningApps = Get-Process | Where-Object { $_.ProcessName -ne $frontApp } | Select-Object -ExpandProperty ProcessName

$obj = @{
    frontApp = $frontApp
    windowTitle = $windowTitle
    runningApps = $runningApps
}

ConvertTo-Json $obj 