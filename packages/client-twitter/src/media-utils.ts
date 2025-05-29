import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { elizaLogger } from "@elizaos/core";
import type { IAgentRuntime } from "@elizaos/core";
import { MediaData } from "./types.ts";

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

