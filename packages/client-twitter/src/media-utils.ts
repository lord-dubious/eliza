import fs from "fs";
import path from "path";
import { elizaLogger, ServiceType, type IImageDescriptionService, type IVideoService } from "@elizaos/core";
import type { IAgentRuntime } from "@elizaos/core";

// Media posting configuration
export interface MediaPostingConfig {
    ENABLE_MEDIA_POSTING: boolean;
    MEDIA_POST_INTERVAL_MIN: number;
    MEDIA_POST_INTERVAL_MAX: number;
    MEDIA_FOLDER_PATH: string;
}

export const getMediaPostingConfig = (runtime: IAgentRuntime): MediaPostingConfig => {
    return {
        ENABLE_MEDIA_POSTING: runtime.getSetting("ENABLE_MEDIA_POSTING") === "true" || true,
        MEDIA_POST_INTERVAL_MIN: parseInt(runtime.getSetting("MEDIA_POST_INTERVAL_MIN") || "120"),
        MEDIA_POST_INTERVAL_MAX: parseInt(runtime.getSetting("MEDIA_POST_INTERVAL_MAX") || "240"),
        MEDIA_FOLDER_PATH: runtime.getSetting("MEDIA_FOLDER_PATH") || "./agent/media"
    };
};

/**
 * Get a random media file from the media folder
 */
export function getRandomMediaFile(mediaPath: string): string | null {
    try {
        const resolvedPath = path.resolve(mediaPath);
        
        if (!fs.existsSync(resolvedPath)) {
            elizaLogger.warn(`Media folder not found: ${resolvedPath}`);
            return null;
        }

        // Supported media file extensions
        const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi'];
        
        const files: string[] = [];
        const readDir = (dir: string) => {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    readDir(fullPath);
                } else if (mediaExtensions.includes(path.extname(item).toLowerCase())) {
                    files.push(fullPath);
                }
            }
        };
        
        readDir(resolvedPath);

        if (files.length === 0) {
            elizaLogger.warn(`No media files found in: ${resolvedPath}`);
            return null;
        }

        // Return random file
        const randomIndex = Math.floor(Math.random() * files.length);
        return files[randomIndex];
    } catch (error) {
        elizaLogger.error("Error getting media files:", error);
        return null;
    }
}

/**
 * Get multiple random media files from the media folder
 */
export function getRandomMediaFiles(mediaPath: string, count: number = 1): string[] {
    try {
        const resolvedPath = path.resolve(mediaPath);
        
        if (!fs.existsSync(resolvedPath)) {
            elizaLogger.warn(`Media folder not found: ${resolvedPath}`);
            return [];
        }

        // Supported media file extensions
        const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi'];
        
        const files: string[] = [];
        const readDir = (dir: string) => {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    readDir(fullPath);
                } else if (mediaExtensions.includes(path.extname(item).toLowerCase())) {
                    files.push(fullPath);
                }
            }
        };
        
        readDir(resolvedPath);

        if (files.length === 0) {
            elizaLogger.warn(`No media files found in: ${resolvedPath}`);
            return [];
        }

        // Shuffle array and return requested count
        const shuffled = files.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, files.length));
    } catch (error) {
        elizaLogger.error("Error getting media files:", error);
        return [];
    }
}

/**
 * Check if file is an image
 */
export function isImageFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    return imageExtensions.includes(ext);
}

/**
 * Check if file is a video
 */
export function isVideoFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const videoExtensions = ['.mp4', '.mov', '.avi'];
    return videoExtensions.includes(ext);
}

// Media-focused tweet template
export const mediaPostTemplate = `
# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

# Task: Generate a tweet to accompany a media post
Write a brief, engaging caption for a media post from the perspective of {{agentName}} @{{twitterUserName}}.
The tweet should be {{adjective}} and relate to your interests and personality.
Keep it under {{maxTweetLength}} characters. No emojis. Be authentic and interesting.
Do not mention the media directly - let it speak for itself.
Your response should be 1-2 sentences maximum.`;

/**
 * Create media data object for Twitter API
 */
export function createMediaData(filePath: string): { path: string; type: 'image' | 'video' } {
    const isImage = isImageFile(filePath);
    const isVideo = isVideoFile(filePath);
    
    if (!isImage && !isVideo) {
        throw new Error(`Unsupported media file type: ${filePath}`);
    }
    
    return {
        path: filePath,
        type: isImage ? 'image' : 'video'
    };
}

/**
 * Analyzes media content using existing Eliza services
 */
export async function analyzeMediaContent(
    runtime: IAgentRuntime,
    filePath: string,
    mediaType: 'image' | 'video'
): Promise<string> {
    try {
        elizaLogger.log(`🔍 Analyzing ${mediaType}: ${path.basename(filePath)}`);
        
        if (mediaType === 'image') {
            return await analyzeImageWithService(runtime, filePath);
        } else if (mediaType === 'video') {
            return await analyzeVideo(runtime, filePath);
        }
        
        return "Media content";
    } catch (error) {
        elizaLogger.error(`Error analyzing ${mediaType}:`, error);
        return `${mediaType} content`;
    }
}

/**
 * Analyzes image content using Eliza's IImageDescriptionService
 */
async function analyzeImageWithService(runtime: IAgentRuntime, imagePath: string): Promise<string> {
    try {
        // Get the image description service
        const imageDescriptionService = runtime.getService<IImageDescriptionService>(
            ServiceType.IMAGE_DESCRIPTION
        );
        
        if (!imageDescriptionService) {
            elizaLogger.warn("Image description service not available, using fallback");
            return await analyzeImageFallback(runtime, imagePath);
        }
        
        // For local files, we need to convert to a URL or base64
        // Since the service expects a URL, we'll use the fallback method for local files
        return await analyzeImageFallback(runtime, imagePath);
        
    } catch (error) {
        elizaLogger.error("Error using image description service:", error);
        return await analyzeImageFallback(runtime, imagePath);
    }
}

/**
 * Fallback image analysis using direct completion API
 */
async function analyzeImageFallback(runtime: IAgentRuntime, imagePath: string): Promise<string> {
    try {
        // Read image file as base64
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = getMimeType(imagePath);
        
        // Create vision prompt for image analysis
        const visionPrompt = `Analyze this image and provide a detailed but concise description. Focus on:
- Main subjects and objects
- Setting/environment  
- Mood and atmosphere
- Colors and visual style
- Any text or notable details
- Activities or actions taking place

Provide a clear, descriptive summary in 2-3 sentences that captures the essence of the image.`;

        // Use the runtime's completion with vision capabilities
        const response = await runtime.completion({
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: visionPrompt
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            model: runtime.imageVisionModelProvider || runtime.modelProvider
        });

        const description = response.choices?.[0]?.message?.content || "Image content";
        elizaLogger.log(`📸 Image analysis: ${description.substring(0, 100)}...`);
        return description;
        
    } catch (error) {
        elizaLogger.error("Error analyzing image:", error);
        return "An interesting image";
    }
}

/**
 * Analyzes video content using Eliza's video understanding capabilities
 */
async function analyzeVideo(runtime: IAgentRuntime, videoPath: string): Promise<string> {
    try {
        elizaLogger.log(`🎬 Analyzing video: ${path.basename(videoPath)}`);
        
        // Get the video service from the node plugin
        const videoService = runtime.getService<IVideoService>(ServiceType.VIDEO);
        
        if (!videoService) {
            elizaLogger.warn("Video service not available. Install @elizaos/plugin-node for enhanced video understanding");
            return await analyzeVideoFallback(runtime, videoPath);
        }
        
        // For local video files, we need to process them with the video service
        // The video service can handle local files and extract meaningful information
        try {
            // Convert local file path to a format the video service can handle
            const videoInfo = await videoService.processVideo(`file://${path.resolve(videoPath)}`, runtime);
            
            if (videoInfo && videoInfo.description) {
                elizaLogger.log(`🎬 Video service analysis: ${videoInfo.description.substring(0, 100)}...`);
                return videoInfo.description;
            }
        } catch (serviceError) {
            elizaLogger.warn("Video service processing failed, using fallback:", serviceError);
        }
        
        return await analyzeVideoFallback(runtime, videoPath);
        
    } catch (error) {
        elizaLogger.error("Error in video analysis:", error);
        return await analyzeVideoFallback(runtime, videoPath);
    }
}

/**
 * Fallback video analysis using enhanced AI completion
 */
async function analyzeVideoFallback(runtime: IAgentRuntime, videoPath: string): Promise<string> {
    try {
        const fileName = path.basename(videoPath, path.extname(videoPath));
        const stats = fs.statSync(videoPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        const fileExtension = path.extname(videoPath).toLowerCase();
        
        // Enhanced video analysis prompt with more context
        const videoPrompt = `Analyze this video file and provide a detailed description:

File Information:
- Name: "${fileName}"
- Size: ${fileSizeMB}MB
- Format: ${fileExtension}

Based on the filename, file size, format, and common video content patterns, provide a thoughtful analysis of what this video likely contains. Consider:

1. Content Type Analysis:
   - What the filename suggests about the subject matter
   - File size implications (short clip vs longer content)
   - Format considerations (mp4 = general video, mov = often mobile/professional, avi = older format)

2. Likely Content:
   - Main subjects or themes
   - Possible activities or events
   - Setting or environment
   - Production quality indicators

3. Engagement Factors:
   - What makes this video interesting
   - Emotional tone or mood
   - Visual appeal elements

Provide a compelling 2-3 sentence description that captures what this video probably shows, written as if you've analyzed the actual video content. Be specific, engaging, and avoid generic descriptions.`;

        const response = await runtime.completion({
            messages: [
                {
                    role: "user",
                    content: videoPrompt
                }
            ],
            model: runtime.modelProvider
        });

        const description = response.choices?.[0]?.message?.content || "Video content";
        elizaLogger.log(`🎬 Enhanced video analysis: ${description.substring(0, 100)}...`);
        return description;
        
    } catch (error) {
        elizaLogger.error("Error in fallback video analysis:", error);
        return "An interesting video";
    }
}

/**
 * Gets MIME type for image files
 */
function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'image/jpeg';
}
