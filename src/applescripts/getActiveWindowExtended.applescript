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
  if partsCount >= 3 then
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
  
  -- Simple approach: just get a list of running applications
  set appList to {}
  
  -- Get all processes instead of filtering by background
  set runningApps to application processes
  repeat with appProcess in runningApps
    try
      set appName to name of appProcess
      set end of appList to appName
    end try
  end repeat
  
  return {frontApp, windowTitle, appList}
end tell 