import { exec } from 'child_process';
import { promisify } from 'util';
import { defineConfig } from 'vite';

const execAsync = promisify(exec);

// Custom plugin to copy scripts
const copyScriptsPlugin = () => {
    return {
        name: 'copy-scripts',
        closeBundle: async () => {
            // Run the script using ts-node instead of requiring it directly
            try {
                await execAsync('npx ts-node src/script-copy.ts');
                console.log('Scripts copied successfully.');
            } catch (error) {
                console.error('Error copying scripts:', error);
            }
        }
    };
};

// https://vitejs.dev/config
export default defineConfig({
    plugins: [copyScriptsPlugin()]
});
