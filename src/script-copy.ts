import fs from 'fs';
import path from 'path';

// Get the root directory of the app
const rootDir = process.cwd();
console.log(`Root directory: ${rootDir}`);

// Paths
const srcDir = path.join(rootDir, 'src');
const applescriptsDir = path.join(srcDir, 'applescripts');
const powershellDir = path.join(srcDir, 'powershell');

// Build output directory
const outDir = path.join(rootDir, '.vite', 'build');
const targetApplescriptsDir = path.join(outDir, 'applescripts');
const targetPowershellDir = path.join(outDir, 'powershell');

console.log(`Source AppleScripts: ${applescriptsDir}`);
console.log(`Target AppleScripts: ${targetApplescriptsDir}`);

// Create directories if they don't exist
if (!fs.existsSync(targetApplescriptsDir)) {
    fs.mkdirSync(targetApplescriptsDir, { recursive: true });
    console.log(`Created directory: ${targetApplescriptsDir}`);
}

if (!fs.existsSync(targetPowershellDir)) {
    fs.mkdirSync(targetPowershellDir, { recursive: true });
    console.log(`Created directory: ${targetPowershellDir}`);
}

// Helper function to clean up AppleScript file content
function cleanAppleScriptContent(content: string): string {
    // Replace all potential problematic endings with a clean one
    // First trim any whitespace at the end
    let cleanedContent = content.trim();

    // If it ends with "end tell" followed by any characters, clean it up
    if (cleanedContent.match(/end tell.*$/)) {
        cleanedContent = cleanedContent.replace(/end tell.*$/s, 'end tell');
    }

    // Ensure proper newline at the end
    if (!cleanedContent.endsWith('\n')) {
        cleanedContent += '\n';
    }

    // Remove any byte order marks or special characters
    cleanedContent = cleanedContent.replace(/^\ufeff/, '');

    return cleanedContent;
}

// Copy AppleScript files
if (fs.existsSync(applescriptsDir)) {
    console.log(`AppleScripts directory exists: ${applescriptsDir}`);
    const files = fs.readdirSync(applescriptsDir);
    console.log(`Found ${files.length} files in AppleScripts directory`);

    for (const file of files) {
        if (file.endsWith('.applescript')) {
            const sourcePath = path.join(applescriptsDir, file);
            const targetPath = path.join(targetApplescriptsDir, file);

            // Read the source file
            const content = fs.readFileSync(sourcePath, 'utf8');

            // Clean up the content
            const cleanedContent = cleanAppleScriptContent(content);

            // Write to the target file
            fs.writeFileSync(targetPath, cleanedContent);
            console.log(`Copied and cleaned ${file} to ${targetPath}`);
        }
    }
}

// Copy PowerShell files
if (fs.existsSync(powershellDir)) {
    console.log(`PowerShell directory exists: ${powershellDir}`);
    const files = fs.readdirSync(powershellDir);
    console.log(`Found ${files.length} files in PowerShell directory`);

    for (const file of files) {
        if (file.endsWith('.ps1')) {
            const sourcePath = path.join(powershellDir, file);
            const targetPath = path.join(targetPowershellDir, file);

            fs.copyFileSync(sourcePath, targetPath);
            console.log(`Copied ${file} to ${targetPath}`);
        }
    }
}

console.log('All script files copied to build directory.');

// List the contents of the target directories to verify
if (fs.existsSync(targetApplescriptsDir)) {
    console.log(`Contents of ${targetApplescriptsDir}:`);
    const files = fs.readdirSync(targetApplescriptsDir);
    files.forEach(file => console.log(`- ${file}`));
}

if (fs.existsSync(targetPowershellDir)) {
    console.log(`Contents of ${targetPowershellDir}:`);
    const files = fs.readdirSync(targetPowershellDir);
    files.forEach(file => console.log(`- ${file}`));
} 