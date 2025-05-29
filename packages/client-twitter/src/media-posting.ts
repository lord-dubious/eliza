import { elizaLogger, composeContext, generateText, ModelClass, stringToUuid } from "@elizaos/core";
import type { IAgentRuntime } from "@elizaos/core";
import type { ClientBase } from "./base.ts";
import { getRandomMediaFiles, createMediaData, mediaPostTemplate, type MediaPostingConfig } from "./media-utils.ts";
import * as path from 'path';

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
}

