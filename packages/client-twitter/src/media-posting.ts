import { elizaLogger, stringToUuid, composeContext, generateText, ModelClass } from "@elizaos/core";
import type { IAgentRuntime } from "@elizaos/core";
import type { TwitterApi } from "twitter-api-v2";
import fs from "fs";
import path from "path";
import { 
    MediaPostingConfig, 
    getRandomMediaFiles, 
    isImageFile, 
    isVideoFile,
    analyzeMediaContent,
    mediaPostTemplate,
    createMediaData
} from "./media-utils.ts";
import type { ClientBase } from "./base.ts";

export class MediaPostingManager {
    private client: ClientBase;
    private runtime: IAgentRuntime;
    private config: MediaPostingConfig;
    private twitterUsername: string;
    private isDryRun: boolean;
    private isProcessing = false;
    private lastMediaPostTime = 0;
    private mediaPostingInterval: NodeJS.Timeout | null = null;

    constructor(
        client: ClientBase, 
        runtime: IAgentRuntime, 
        config: MediaPostingConfig, 
        twitterUsername: string, 
        isDryRun: boolean
    ) {
        this.client = client;
        this.runtime = runtime;
        this.config = config;
        this.twitterUsername = twitterUsername;
        this.isDryRun = isDryRun;
    }

    /**
     * Start the media posting loop
     */
    startMediaPostingLoop() {
        if (!this.config.ENABLE_MEDIA_POSTING) {
            elizaLogger.log("Media posting is disabled");
            return;
        }

        elizaLogger.log(`📸 Starting media posting loop with interval ${this.config.MEDIA_POST_INTERVAL_MIN}-${this.config.MEDIA_POST_INTERVAL_MAX} minutes`);

        const scheduleNextMediaPost = () => {
            const minInterval = this.config.MEDIA_POST_INTERVAL_MIN * 60 * 1000; // Convert to milliseconds
            const maxInterval = this.config.MEDIA_POST_INTERVAL_MAX * 60 * 1000;
            const randomInterval = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
            
            elizaLogger.log(`📅 Next media post scheduled in ${Math.round(randomInterval / 60000)} minutes`);
            
            this.mediaPostingInterval = setTimeout(async () => {
                await this.generateAndPostMediaTweet();
                scheduleNextMediaPost();
            }, randomInterval);
        };

        // Start the first media post after a short delay
        setTimeout(() => {
            scheduleNextMediaPost();
        }, 30000); // 30 seconds initial delay
    }

    /**
     * Stop the media posting loop
     */
    stopMediaPostingLoop() {
        if (this.mediaPostingInterval) {
            clearTimeout(this.mediaPostingInterval);
            this.mediaPostingInterval = null;
            elizaLogger.log("📸 Media posting loop stopped");
        }
    }

    /**
     * Generate and post a tweet with media
     */
    async generateAndPostMediaTweet() {
        if (this.isProcessing) {
            elizaLogger.log("Already processing, skipping media post generation");
            return;
        }

        try {
            this.isProcessing = true;
            elizaLogger.log("🎬 Generating media tweet...");

            // Get random media file(s)
            const mediaFiles = await getRandomMediaFiles(this.config.MEDIA_FOLDER_PATH, 1);
            
            if (mediaFiles.length === 0) {
                elizaLogger.warn("No media files available for posting");
                return;
            }

            const selectedFile = mediaFiles[0];
            elizaLogger.log(`📸 Selected media file: ${path.basename(selectedFile)}`);

            // Prepare media data
            const mediaData = [createMediaData(selectedFile)];

            // Generate tweet content
            const roomId = stringToUuid("twitter-media-" + this.runtime.agentId);
            const userId = stringToUuid("twitter-user-" + this.twitterUsername);

            const state = await this.runtime.composeState({
                userId,
                roomId,
                agentId: this.runtime.agentId,
                content: { text: "", action: "GENERATE_MEDIA_TWEET" },
            });

            const context = composeContext({
                state,
                template: mediaPostTemplate,
            });

            const response = await generateText({
                runtime: this.runtime,
                context,
                modelClass: ModelClass.SMALL,
            });

            const tweetContent = response.trim();
            
            if (this.isDryRun) {
                elizaLogger.log(`🧪 DRY RUN - Would post media tweet: "${tweetContent}" with media: ${path.basename(selectedFile)}`);
                return;
            }

            // Post the tweet with media using the client's postTweet method
            // We need to access the parent class method, so we'll return the data for the parent to handle
            return {
                tweetContent,
                mediaData,
                roomId,
                selectedFile
            };

        } catch (error) {
            elizaLogger.error("Error generating media tweet:", error);
            return null;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Mark that a media post was successfully posted
     */
    markMediaPostSuccess() {
        this.lastMediaPostTime = Date.now();
    }

    /**
     * Generates a contextual tweet with media analysis
     */
    private async generateMediaTweet(mediaPath: string): Promise<string> {
        try {
            elizaLogger.log(`🎨 Generating contextual tweet for: ${mediaPath}`);
            
            // Determine media type
            const mediaType = isImageFile(mediaPath) ? 'image' : 'video';
            
            // Analyze media content using AI
            const mediaDescription = await analyzeMediaContent(
                this.runtime, 
                mediaPath, 
                mediaType
            );
            
            elizaLogger.log(`🔍 Media analysis complete: ${mediaDescription.substring(0, 100)}...`);
            
            // Generate persona-aware caption based on media analysis
            const contextualPrompt = this.createContextualPrompt(mediaDescription, mediaType);
            
            const response = await this.runtime.completion({
                messages: [
                    {
                        role: "system",
                        content: this.getPersonaContext()
                    },
                    {
                        role: "user", 
                        content: contextualPrompt
                    }
                ],
                model: this.runtime.character.modelProvider
            });

            const tweet = response.choices?.[0]?.message?.content || this.getFallbackTweet(mediaType);
            
            // Ensure tweet length is appropriate
            const maxLength = 280 - 50; // Reserve space for media URL
            const finalTweet = tweet.length > maxLength ? 
                tweet.substring(0, maxLength - 3) + "..." : 
                tweet;
                
            elizaLogger.log(`✨ Generated contextual tweet: ${finalTweet}`);
            return finalTweet;
            
        } catch (error) {
            elizaLogger.error("Error generating media tweet:", error);
            const mediaType = isImageFile(mediaPath) ? 'image' : 'video';
            return this.getFallbackTweet(mediaType);
        }
    }
    
    /**
     * Creates a contextual prompt that combines media analysis with persona
     */
    private createContextualPrompt(mediaDescription: string, mediaType: 'image' | 'video'): string {
        const characterName = this.runtime.character.name || "the character";
        const characterTraits = this.getCharacterTraits();
        
        return `Based on this ${mediaType} analysis: "${mediaDescription}"

Create a tweet that:
1. Reflects ${characterName}'s personality and voice: ${characterTraits}
2. Responds naturally to what's shown in the ${mediaType}
3. Connects the visual content to ${characterName}'s interests and perspective
4. Feels authentic and conversational, not like a description
5. Is under 230 characters to leave room for the media

The tweet should feel like ${characterName} is naturally sharing this ${mediaType} with their followers, incorporating their unique viewpoint and style. Don't just describe what's in the ${mediaType} - react to it, comment on it, or relate it to something meaningful from ${characterName}'s perspective.

Examples of good approaches:
- Share a personal reaction or emotion
- Connect it to a broader theme or interest
- Make an observation that reflects the character's worldview
- Ask a thoughtful question inspired by the content
- Share a brief story or memory it evokes

Write the tweet now:`;
    }
    
    /**
     * Gets character traits for contextual prompting
     */
    private getCharacterTraits(): string {
        const character = this.runtime.character;
        const traits = [];
        
        if (character.bio) {
            traits.push(character.bio);
        }
        
        if (character.style?.all) {
            traits.push(...character.style.all.slice(0, 3));
        }
        
        if (character.style?.post) {
            traits.push(...character.style.post.slice(0, 2));
        }
        
        if (character.adjectives) {
            traits.push(...character.adjectives.slice(0, 3));
        }
        
        return traits.length > 0 ? traits.join(", ") : "thoughtful and engaging";
    }
    
    /**
     * Gets persona context for system prompt
     */
    private getPersonaContext(): string {
        const character = this.runtime.character;
        return `You are ${character.name || "an AI character"}. 
        
${character.bio || "You are a thoughtful and engaging personality."}

Your communication style: ${this.getCharacterTraits()}

When sharing media, you respond authentically from your unique perspective, making genuine connections between what you see and your worldview. You don't just describe - you react, reflect, and engage meaningfully with the content.`;
    }
    
    /**
     * Provides fallback tweets for different media types
     */
    private getFallbackTweet(mediaType: 'image' | 'video'): string {
        const fallbacks = {
            image: [
                "Sometimes a moment just captures everything perfectly.",
                "Found this and had to share.",
                "Visual storytelling at its finest.",
                "This speaks to me on so many levels.",
                "When images say more than words ever could."
            ],
            video: [
                "Motion tells the story better than words.",
                "Had to capture this moment in time.",
                "Some things you just have to see in action.",
                "This is exactly what I needed to see today.",
                "When life gives you perfect timing."
            ]
        };
        
        const options = fallbacks[mediaType];
        return options[Math.floor(Math.random() * options.length)];
    }
    
    /**
     * Posts a media tweet with AI-generated contextual caption
     */
    async postMediaTweet(): Promise<boolean> {
        try {
            elizaLogger.log("🎬 Generating media tweet...");
            
            // Get random media file
            const mediaFile = getRandomMediaFile(this.config.MEDIA_FOLDER_PATH);
            if (!mediaFile) {
                elizaLogger.warn("No media files found for posting");
                return false;
            }
            
            elizaLogger.log(`📁 Selected media: ${mediaFile}`);
            
            // Generate contextual tweet using AI analysis
            const tweetText = await this.generateMediaTweet(mediaFile);
            
            if (this.isDryRun) {
                elizaLogger.log(`🧪 DRY RUN - Would post media tweet: "${tweetText}" with media: ${mediaFile}`);
                return true;
            }
            
            // Upload media and post tweet
            const success = await this.uploadAndPostMedia(tweetText, mediaFile);
            
            if (success) {
                elizaLogger.log(`✅ Posted media tweet: "${tweetText}"`);
                this.markMediaPostSuccess();
                return true;
            } else {
                elizaLogger.error("Failed to post media tweet");
                return false;
            }
            
        } catch (error) {
            elizaLogger.error("Error posting media tweet:", error);
            return false;
        }
    }
    
    /**
     * Uploads media and posts tweet
     */
    private async uploadAndPostMedia(tweetText: string, mediaPath: string): Promise<boolean> {
        try {
            elizaLogger.log(`📤 Uploading and posting media: ${path.basename(mediaPath)}`);
            
            // Read media file
            const mediaBuffer = fs.readFileSync(mediaPath);
            
            // Create media data for the sendTweet function
            const mediaData = [{
                data: mediaBuffer,
                mediaType: this.getMediaMimeType(mediaPath)
            }];
            
            // Post tweet with media using the client's sendTweet method
            const result = await this.client.twitterClient.sendTweet(
                tweetText,
                undefined, // no reply
                mediaData
            );
            
            if (result) {
                elizaLogger.log(`✅ Tweet posted successfully with media`);
                return true;
            } else {
                elizaLogger.error("Failed to post tweet with media");
                return false;
            }
            
        } catch (error) {
            elizaLogger.error("Error uploading and posting media:", error);
            return false;
        }
    }
    
    /**
     * Gets MIME type for media files
     */
    private getMediaMimeType(filePath: string): string {
        const ext = filePath.toLowerCase().split('.').pop();
        const mimeTypes: { [key: string]: string } = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'mp4': 'video/mp4',
            'mov': 'video/quicktime',
            'avi': 'video/x-msvideo'
        };
        return mimeTypes[ext || ''] || 'application/octet-stream';
    }
}
