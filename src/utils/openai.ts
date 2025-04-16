import dotenv from 'dotenv';
import fs from 'fs';
import OpenAI from 'openai';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Path to store analysis results
const analysisDir = path.join(__dirname, '..', '..', 'analysis');
const screenshotsDir = path.join(__dirname, '..', '..', 'screenshots');

// Ensure analysis directory exists
if (!fs.existsSync(analysisDir)) {
    fs.mkdirSync(analysisDir, { recursive: true });
}

export interface ApplicationAnalysis {
    imageURL: string;
    applicationName: string;
}

export interface TimeBasedAnalysis {
    applicationName: string;
    timeFrom: string;
    timeEnd: string;
}

// Rate limiting configuration
const RATE_LIMIT = {
    tokensPerMinute: 200000,
    requestsPerMinute: 10000,
    delayBetweenRequests: 1000, // 1 second delay between requests
    maxRetries: 3
};

// Helper function to handle rate limits
async function handleRateLimit(error: any, retryCount: number): Promise<boolean> {
    if (error.status === 429 && retryCount < RATE_LIMIT.maxRetries) {
        const retryAfter = error.headers?.['retry-after-ms'] || RATE_LIMIT.delayBetweenRequests;
        console.log(`Rate limit hit. Retrying after ${retryAfter}ms (attempt ${retryCount + 1}/${RATE_LIMIT.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter)));
        return true;
    }
    return false;
}

export async function analyzeScreenshot(imagePath: string, retryCount = 0): Promise<ApplicationAnalysis | null> {
    try {
        // Read the image file
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');

        // Call OpenAI API to analyze the image
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini-2024-07-18",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Analyze the screenshot and identify the main active application window. Return only the application name in the following JSON format: { applicationName: string, } Do not include any additional text or explanation."
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/png;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 300
        });

        // Extract and parse the analysis from the response
        const analysis = response.choices[0].message.content;
        let parsedAnalysis;
        try {
            // Remove any markdown code block formatting if present
            const cleanAnalysis = analysis?.replace(/```json\n|\n```/g, '').trim() || '{"applicationName": "Unknown Application"}';
            parsedAnalysis = JSON.parse(cleanAnalysis);
        } catch (e) {
            console.error('Error parsing analysis:', e);
            parsedAnalysis = { applicationName: 'Unknown Application' };
        }

        // Create the analysis object
        const result: ApplicationAnalysis = {
            imageURL: imagePath,
            applicationName: parsedAnalysis.applicationName
        };

        // Save analysis data alongside the screenshot
        const analysisPath = imagePath.replace('.png', '.json');
        fs.writeFileSync(analysisPath, JSON.stringify(result, null, 2));

        return result;
    } catch (error: any) {
        console.error('Error analyzing screenshot:', error);

        // Handle rate limits
        if (await handleRateLimit(error, retryCount)) {
            return analyzeScreenshot(imagePath, retryCount + 1);
        }

        return null;
    }
}

export async function analyzeAllScreenshots(): Promise<TimeBasedAnalysis[]> {
    try {
        // Get all screenshot files
        const screenshotFiles = fs.readdirSync(screenshotsDir)
            .filter(file => file.endsWith('.png'))
            .sort(); // Sort to ensure chronological order

        if (screenshotFiles.length === 0) {
            console.log('No screenshots found to analyze');
            return [];
        }

        const timeBasedAnalysis: TimeBasedAnalysis[] = [];
        let currentApp: string | null = null;
        let startTime: string | null = null;

        // Process screenshots in smaller batches to avoid rate limits
        const BATCH_SIZE = 5;
        for (let i = 0; i < screenshotFiles.length; i += BATCH_SIZE) {
            const batch = screenshotFiles.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(async (file) => {
                const filePath = path.join(screenshotsDir, file);
                const analysis = await analyzeScreenshot(filePath);

                // Extract timestamp from filename (screenshot-2023-04-10T09-54-45-006Z.png)
                const timestamp = file.replace('screenshot-', '').replace('.png', '');
                const dateTime = timestamp.replace(/-/g, (match, index) => {
                    if (index === 13 || index === 16) return ':';
                    if (index === 19) return '.';
                    return match;
                });

                return {
                    appName: analysis?.applicationName || 'Unknown',
                    time: dateTime
                };
            });

            const results = await Promise.all(batchPromises);

            // Process results and create time-based analysis
            for (const result of results) {
                if (currentApp === null) {
                    // First app
                    currentApp = result.appName;
                    startTime = result.time;
                } else if (currentApp !== result.appName) {
                    // App changed, save previous period
                    timeBasedAnalysis.push({
                        applicationName: currentApp,
                        timeFrom: startTime!,
                        timeEnd: result.time
                    });
                    // Start new period
                    currentApp = result.appName;
                    startTime = result.time;
                }
            }

            // Add delay between batches to avoid rate limits
            if (i + BATCH_SIZE < screenshotFiles.length) {
                await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.delayBetweenRequests));
            }
        }

        // Add the last period
        if (currentApp !== null && startTime !== null) {
            timeBasedAnalysis.push({
                applicationName: currentApp,
                timeFrom: startTime,
                timeEnd: new Date().toISOString()
            });
        }

        // Save the time-based analysis
        const analysisPath = path.join(analysisDir, 'time-based-analysis.json');
        fs.writeFileSync(analysisPath, JSON.stringify(timeBasedAnalysis, null, 2));

        return timeBasedAnalysis;
    } catch (error) {
        console.error('Error analyzing all screenshots:', error);
        return [];
    }
} 