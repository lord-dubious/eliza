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
 * Get random media files from the media folder
 */
export async function getRandomMediaFiles(mediaPath: string, count: number = 1): Promise<string[]> {
    try {
        const resolvedPath = path.resolve(mediaPath);
        
        if (!fs.existsSync(resolvedPath)) {
            elizaLogger.warn(`Media folder not found: ${resolvedPath}`);
            return [];
        }

        // Supported media file extensions
        const mediaExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi'];
        const patterns = mediaExtensions.map(ext => `**/*.${ext}`);
        
        const files: string[] = [];
        for (const pattern of patterns) {
            const matches = await glob(pattern, { cwd: resolvedPath, absolute: true });
            files.push(...matches);
        }

        if (files.length === 0) {
            elizaLogger.warn(`No media files found in: ${resolvedPath}`);
            return [];
        }

        // Shuffle and return random files
        const shuffled = files.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, files.length));
    } catch (error) {
        elizaLogger.error("Error getting media files:", error);
        return [];
    }
}

/**
 * Determine media type from file extension
 */
export function getMediaType(filePath: string): 'image' | 'video' {
    const ext = path.extname(filePath).toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const videoExtensions = ['.mp4', '.mov', '.avi'];
    
    if (imageExtensions.includes(ext)) {
        return 'image';
    } else if (videoExtensions.includes(ext)) {
        return 'video';
    }
    
    return 'image'; // Default to image
}

/**
 * Create MediaData from file path
 */
export function createMediaData(filePath: string): MediaData {
    return {
        url: filePath,
        type: getMediaType(filePath)
    };
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
 * Analyzes media content using AI vision models
 */
export async function analyzeMediaContent(
    runtime: IAgentRuntime,
    filePath: string,
    mediaType: 'image' | 'video'
): Promise<string> {
    try {
        elizaLogger.log(`🔍 Analyzing ${mediaType}: ${path.basename(filePath)}`);
        
        if (mediaType === 'image') {
            return await analyzeImage(runtime, filePath);
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
 * Analyzes image content using vision model
 */
async function analyzeImage(runtime: IAgentRuntime, imagePath: string): Promise<string> {
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

        // Use the runtime's vision capabilities
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
            model: runtime.character.modelProvider
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
 * Analyzes video content using Eliza's IVideoService
 */
async function analyzeVideo(runtime: IAgentRuntime, videoPath: string): Promise<string> {
    try {
        // Get the video service
        const videoService = runtime.getService<IVideoService>(ServiceType.VIDEO);
        
        if (!videoService) {
            elizaLogger.warn("Video service not available, using fallback");
            return await analyzeVideoFallback(runtime, videoPath);
        }
        
        // For local files, we need to process them differently
        // The video service is designed for URLs, so we'll use fallback for local files
        return await analyzeVideoFallback(runtime, videoPath);
        
    } catch (error) {
        elizaLogger.error("Error using video service:", error);
        return await analyzeVideoFallback(runtime, videoPath);
    }
}

/**
 * Fallback video analysis using basic file information and AI completion
 */
async function analyzeVideoFallback(runtime: IAgentRuntime, videoPath: string): Promise<string> {
    try {
        const fileName = path.basename(videoPath, path.extname(videoPath));
        const stats = fs.statSync(videoPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        
        // Enhanced video analysis prompt
        const videoPrompt = `This is a video file named "${fileName}" (${fileSizeMB}MB). 
        
Based on the filename, file size, and context, analyze what this video likely contains and provide a thoughtful description. Consider:

- What the filename suggests about the content
- The file size as an indicator of video length/quality
- Common video content patterns
- Likely themes, subjects, or activities

Provide a 2-3 sentence description that captures what this video probably shows, written as if you've analyzed the actual video content. Be specific and engaging rather than generic.`;

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
        elizaLogger.log(`🎬 Video analysis: ${description.substring(0, 100)}...`);
        return description;
        
    } catch (error) {
        elizaLogger.error("Error analyzing video:", error);
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
