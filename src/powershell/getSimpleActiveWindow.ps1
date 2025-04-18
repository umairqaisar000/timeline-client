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