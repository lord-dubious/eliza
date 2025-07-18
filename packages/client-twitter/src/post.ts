import type { Tweet } from "agent-twitter-client";
import {
    composeContext,
    generateText,
    getEmbeddingZeroVector,
    type IAgentRuntime,
    ModelClass,
    stringToUuid,
    type TemplateType,
    type UUID,
    truncateToCompleteSentence,
    parseJSONObjectFromText,
    extractAttributes,
    cleanJsonResponse,
} from "@elizaos/core";
import { elizaLogger } from "@elizaos/core";
import type { ClientBase } from "./base.ts";
import { postActionResponseFooter } from "@elizaos/core";
import { generateTweetActions } from "@elizaos/core";
import { type IImageDescriptionService, ServiceType } from "@elizaos/core";
import { buildConversationThread, fetchMediaData } from "./utils.ts";
import { twitterMessageHandlerTemplate } from "./interactions.ts";
import { DEFAULT_MAX_TWEET_LENGTH } from "./environment.ts";
import {
    Client,
    Events,
    GatewayIntentBits,
    TextChannel,
    Partials,
} from "discord.js";
import type { State } from "@elizaos/core";
import type { ActionResponse } from "@elizaos/core";
import { MediaData } from "./types.ts";
import { getMediaPostingConfig, getRandomMediaFiles, createMediaData, mediaPostTemplate, type MediaPostingConfig } from "./media-utils.ts";
import { MediaPostingManager } from "./media-posting.ts";
import { v4 as uuidv4 } from 'uuid';
import type { Memory } from "@elizaos/core";
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const MAX_TIMELINES_TO_FETCH = 15;

// Media posting configuration
interface MediaPostingConfig {
    ENABLE_MEDIA_POSTING: boolean;
    MEDIA_POST_INTERVAL_MIN: number;
    MEDIA_POST_INTERVAL_MAX: number;
    MEDIA_FOLDER_PATH: string;
}

const getMediaPostingConfig = (runtime: IAgentRuntime): MediaPostingConfig => {
    return {
        ENABLE_MEDIA_POSTING: runtime.getSetting("ENABLE_MEDIA_POSTING") === "true" || true,
        MEDIA_POST_INTERVAL_MIN: parseInt(runtime.getSetting("MEDIA_POST_INTERVAL_MIN") || "120"),
        MEDIA_POST_INTERVAL_MAX: parseInt(runtime.getSetting("MEDIA_POST_INTERVAL_MAX") || "240"),
        MEDIA_FOLDER_PATH: runtime.getSetting("MEDIA_FOLDER_PATH") || "./agent/media"
    };
};

export const twitterPostTemplate = `# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

# Task: Generate a post in the voice and style and perspective of {{agentName}} @{{twitterUserName}}.
Write a post that is {{adjective}} about {{topic}} (without mentioning {{topic}} directly), from the perspective of {{agentName}}. Do not add commentary or acknowledge this request, just write the post.
Your response should be 1, 2, or 3 sentences (choose the length at random).
Your response should not contain any questions. Brief, concise statements only. The total character count MUST be less than {{maxTweetLength}}. No emojis. Use \\n\\n (double spaces) between statements if there are multiple statements in your response.`;

export const twitterActionTemplate =
    `
# INSTRUCTIONS: Determine actions for {{agentName}} (@{{twitterUserName}}) based on:
{{bio}}
{{postDirections}}

Guidelines:
- ONLY engage with content that DIRECTLY relates to character's core interests
- Direct mentions are priority IF they are on-topic
- Skip ALL content that is:
  - Off-topic or tangentially related
  - From high-profile accounts unless explicitly relevant
  - Generic/viral content without specific relevance
  - Political/controversial unless central to character
  - Promotional/marketing unless directly relevant

Actions (respond only with tags):
[LIKE] - Perfect topic match AND aligns with character (9.8/10)
[RETWEET] - Exceptional content that embodies character's expertise (9.5/10)
[QUOTE] - Can add substantial domain expertise (9.5/10)
[REPLY] - Can contribute meaningful, expert-level insight (9.5/10)

Tweet:
{{currentTweet}}

# Respond with qualifying action tags only. Default to NO action unless extremely confident of relevance.` +
    postActionResponseFooter;

interface PendingTweet {
    tweetTextForPosting: string;
    roomId: UUID;
    rawTweetContent: string;
    taskId: string;
    timestamp: number;
}

type PendingTweetApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export class TwitterPostClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    twitterUsername: string;
    private isProcessing = false;
    private lastProcessTime = 0;
    private stopProcessingActions = false;
    private isDryRun: boolean;
    private discordClientForApproval: Client;
    private approvalRequired = false;
    private discordApprovalChannelId: string;
    private approvalCheckInterval: number;
    private raiinmakerService: any | null = null;
    private approvalProvider: string;
    private mediaPostingConfig: MediaPostingConfig;
    private lastMediaPostTime = 0;
    private mediaPostingInterval: NodeJS.Timeout | null = null;
    private mediaPostingManager: MediaPostingManager | null = null;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        elizaLogger.debug("🔍 TwitterPostClient constructor start");
        this.client = client;
        this.runtime = runtime;
        this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;
        this.isDryRun = this.client.twitterConfig.TWITTER_DRY_RUN;
        this.mediaPostingConfig = {
            ENABLE_MEDIA_POSTING: this.client.twitterConfig.ENABLE_MEDIA_POSTING,
            MEDIA_POST_INTERVAL_MIN: this.client.twitterConfig.MEDIA_POST_INTERVAL_MIN,
            MEDIA_POST_INTERVAL_MAX: this.client.twitterConfig.MEDIA_POST_INTERVAL_MAX,
            MEDIA_FOLDER_PATH: this.client.twitterConfig.MEDIA_FOLDER_PATH,
        };
        this.mediaPostingManager = new MediaPostingManager(client, runtime, this.mediaPostingConfig, this.twitterUsername, this.isDryRun);
        
        // Explicit debug for approval provider
        const rawApprovalProvider = process.env.TWITTER_APPROVAL_PROVIDER;
        elizaLogger.debug(`🔍 Raw approval provider from settings: "${rawApprovalProvider}"`);
        
        this.approvalProvider = rawApprovalProvider || "RAIINMAKER";
        elizaLogger.debug(`🔍 Final approval provider set to: "${this.approvalProvider}"`);
        
        // Log configuration on initialization
        elizaLogger.log("Twitter Client Configuration:");
        elizaLogger.log(`- Username: ${this.twitterUsername}`);
        elizaLogger.log(`- Dry Run Mode: ${this.isDryRun ? "enabled" : "disabled"}`);
        elizaLogger.log(`- Enable Post: ${this.client.twitterConfig.ENABLE_TWITTER_POST_GENERATION ? "enabled" : "disabled"}`);
        elizaLogger.log(`- Post Interval: ${this.client.twitterConfig.POST_INTERVAL_MIN}-${this.client.twitterConfig.POST_INTERVAL_MAX} minutes`);
        elizaLogger.log(`- Action Processing: ${this.client.twitterConfig.ENABLE_ACTION_PROCESSING ? "enabled" : "disabled"}`);
        elizaLogger.log(`- Action Interval: ${this.client.twitterConfig.ACTION_INTERVAL} minutes`);
        elizaLogger.log(`- Post Immediately: ${this.client.twitterConfig.POST_IMMEDIATELY ? "enabled" : "disabled"}`);
        elizaLogger.log(`- Search Enabled: ${this.client.twitterConfig.TWITTER_SEARCH_ENABLE ? "enabled" : "disabled"}`);
        elizaLogger.log(`- Approval Provider: ${this.approvalProvider}`);
    
        const targetUsers = this.client.twitterConfig.TWITTER_TARGET_USERS;
        if (targetUsers) {
            elizaLogger.log(`- Target Users: ${targetUsers}`);
        }
    
        if (this.isDryRun) {
            elizaLogger.log("Twitter client initialized in dry run mode - no actual tweets will be posted");
        }
    
        // Initialize verification system
        const approvalEnabledSetting = this.runtime.getSetting("TWITTER_APPROVAL_ENABLED");
        elizaLogger.debug(`🔍 TWITTER_APPROVAL_ENABLED setting: "${approvalEnabledSetting}"`);
        
        const approvalRequired: boolean = approvalEnabledSetting?.toLowerCase() === "true";
        elizaLogger.debug(`🔍 Approval required: ${approvalRequired}`);
        
        if (approvalRequired) {
            elizaLogger.debug(`🔍 Setting this.approvalRequired = true`);
            this.approvalRequired = true;
            
            // Parse interval setting with fallback to 5 minutes (300000ms)
            const approvalCheckIntervalSetting = this.runtime.getSetting("TWITTER_APPROVAL_CHECK_INTERVAL");
            const APPROVAL_CHECK_INTERVAL = approvalCheckIntervalSetting 
                ? Number.parseInt(approvalCheckIntervalSetting) * 1000  // Convert seconds to milliseconds
                : 5 * 60 * 1000; // 5 minutes default
            
            this.approvalCheckInterval = APPROVAL_CHECK_INTERVAL;
            elizaLogger.log(`Twitter approval enabled using ${this.approvalProvider} verification with ${this.approvalCheckInterval/1000}s check interval`);

            elizaLogger.debug(`🔍 Checking provider - current provider: "${this.approvalProvider}"`);
            
            // Initialize only what's needed based on the provider
            if (this.approvalProvider === "RAIINMAKER") {
                elizaLogger.debug(`🔍 Entering Raiinmaker setup branch`);
                // Check if Raiinmaker plugin is available
                const raiinmakerEnabled = this.runtime.actions.some(
                    action => action.name === "VERIFY_GENERATION_CONTENT"
                );
                
                elizaLogger.debug(`🔍 Raiinmaker plugin available: ${raiinmakerEnabled}`);
                
                if (!raiinmakerEnabled) {
                    elizaLogger.warn("Twitter approval is set to use Raiinmaker but the plugin is not available");
                    elizaLogger.debug(`🔍 Setting this.approvalRequired = false due to missing Raiinmaker plugin`);
                    this.approvalRequired = false;
                } else {
                    // Skip Discord setup completely for Raiinmaker provider
                    elizaLogger.debug(`🔍 Skipping Discord setup for Raiinmaker provider`);
                    this.discordApprovalChannelId = "";
                    this.discordClientForApproval = null;
                }
            } else if (this.approvalProvider === "DISCORD") {
                elizaLogger.debug(`🔍 Entering Discord setup branch`);
                // Initialize Discord client
                const discordToken = this.runtime.getSetting("TWITTER_APPROVAL_DISCORD_BOT_TOKEN");
                const channelId = this.runtime.getSetting("TWITTER_APPROVAL_DISCORD_CHANNEL_ID");
                
                
                if (!discordToken || !channelId) {
                    elizaLogger.warn("Twitter approval is set to use Discord but credentials are missing");
                    elizaLogger.debug(`🔍 Setting this.approvalRequired = false due to missing Discord credentials`);
                    this.approvalRequired = false;
                } else {
                    elizaLogger.debug(`🔍 Setting Discord approval channel ID and initializing Discord client`);
                    this.discordApprovalChannelId = channelId;
                    elizaLogger.debug(`🔍 About to call setupDiscordClient()`);
                    this.setupDiscordClient();
                    elizaLogger.log("Discord approval client initialized");
                }
                
                // Skip Raiinmaker setup for Discord provider
                elizaLogger.debug(`🔍 Skipping Raiinmaker setup for Discord provider`);
                this.raiinmakerService = null;
            } else {
                elizaLogger.debug(`🔍 Unknown approval provider: "${this.approvalProvider}"`);
            }
        } else {
            elizaLogger.debug(`🔍 Twitter approval disabled by configuration`);
        }
        
        elizaLogger.debug(`🔍 TwitterPostClient constructor complete. Final approval provider: "${this.approvalProvider}", approval required: ${this.approvalRequired}`);
    }

    private setupDiscordClient() {
        try {
            // Check if required environment variables are set
            const token = this.runtime.getSetting("TWITTER_APPROVAL_DISCORD_BOT_TOKEN");
            this.discordApprovalChannelId = this.runtime.getSetting("TWITTER_APPROVAL_DISCORD_CHANNEL_ID");
            
            if (!token || !this.discordApprovalChannelId) {
                elizaLogger.error("Missing required Discord environment variables for Twitter approval");
                this.discordClientForApproval = null;
                return;
            }
            
            // Create Discord client
            this.discordClientForApproval = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent,
                    GatewayIntentBits.GuildMessageReactions,
                ],
                partials: [Partials.Channel, Partials.Message, Partials.Reaction],
            });
            
            this.discordClientForApproval.once(
                Events.ClientReady,
                (readyClient) => {
                    elizaLogger.log(
                        `Discord bot is ready as ${readyClient.user.tag}!`
                    );
                    
                    // Generate invite link with required permissions
                    const invite = `https://discord.com/api/oauth2/authorize?client_id=${readyClient.user.id}&permissions=274877991936&scope=bot`;
                    // 274877991936 includes permissions for:
                    // - Send Messages
                    // - Read Messages/View Channels
                    // - Read Message History

                    elizaLogger.log(
                        `Use this link to properly invite the Twitter Post Approval Discord bot: ${invite}`
                    );
                }
            );
            
            // Login to Discord with error handling
            this.discordClientForApproval.login(token).catch(error => {
                elizaLogger.error("Error logging in to Discord:", error);
                this.discordClientForApproval = null;
            });
        } catch (error) {
            elizaLogger.error("Exception setting up Discord client:", error);
            this.discordClientForApproval = null;
        }
    }

    /**
     * Sends a tweet for verification through the Raiinmaker system
     * 
     * @param tweetTextForPosting The tweet text to be verified
     * @param roomId The ID of the room associated with this tweet
     * @param rawTweetContent The raw content before processing
     * @returns The task ID of the verification task or null if creation failed
     */
    private async sendForRaiinmakerVerification(
        tweetTextForPosting: string,
        roomId: UUID,
        rawTweetContent: string
    ): Promise<string | null> {
        try {
            // First, explicitly check the provider and ensure Discord client is null for safety
            if (this.approvalProvider === "RAIINMAKER") {
                this.discordClientForApproval = null;
            }
            
            elizaLogger.log(`Sending tweet for Raiinmaker verification: "${tweetTextForPosting.substring(0, 50)}${tweetTextForPosting.length > 50 ? '...' : ''}"`);
            
            // Create a fallback room ID that's stable and reusable
            const verificationRoomId = stringToUuid("twitter_verification_room");
            
            // Try to use the provided room ID first
            try {
                await this.runtime.ensureRoomExists(roomId);
                await this.runtime.ensureParticipantInRoom(this.runtime.agentId, roomId);
            } catch (roomError) {
                elizaLogger.error("Failed to create original room for tweet verification:", roomError);
                
                // Use the fallback room ID instead
                try {
                    await this.runtime.ensureRoomExists(verificationRoomId);
                    await this.runtime.ensureParticipantInRoom(this.runtime.agentId, verificationRoomId);
                    // Update roomId to the fallback one that we know exists
                    roomId = verificationRoomId;
                } catch (fallbackError) {
                    elizaLogger.error("Failed to create fallback room for tweet verification:", fallbackError);
                    // If we can't create a room at all, we shouldn't proceed with verification
                    return null;
                }
            }
            
            // Create a verification task using the Raiinmaker plugin
            const verificationOptions = {
                subject: tweetTextForPosting,
                name: `Tweet Verification from @${this.twitterUsername}`,
                consensusVotes: 3,
                question: "Is this content appropriate for posting on Twitter?",
                roomId: roomId.toString() // Pass the roomId to the action
            };
            
            try {
                // Create a memory object for the action
                let verificationResult: any = null;
                const actionMemory: Memory = {
                    id: uuidv4() as `${string}-${string}-${string}-${string}-${string}`,
                    userId: this.runtime.agentId,
                    agentId: this.runtime.agentId,
                    roomId: roomId,
                    content: {
                        type: 'text',
                        text: `Verify this content: "${tweetTextForPosting}"`,  // Include in text with quotes
                        action: 'VERIFY_GENERATION_CONTENT',
                        options: {
                            content: tweetTextForPosting,  // Also include in options
                            name: `Tweet Verification from @${this.twitterUsername}`,
                            consensusVotes: 3,
                            question: "Is this content appropriate for posting on Twitter?",
                            roomId: roomId.toString()
                        }
                    }
                };

                // Process the action using runtime.processActions
                await this.runtime.processActions(
                    actionMemory,
                    [actionMemory],
                    undefined,
                    async (result) => {
                        if (result) {
                            verificationResult = result;
                        }
                        return [actionMemory];
                    }
                );
                
                // Extract taskId from verificationResult.text if it's not at the top level
                let taskId: string | null = null;
                
                if (verificationResult?.taskId) {
                    // If it's available at the top level, use that
                    taskId = verificationResult.taskId;
                } else if (verificationResult?.text) {
                    // Try to extract taskId from the text field using regex
                    const taskIdMatch = verificationResult.text.match(/Task ID: ([a-f0-9-]{36})/i);
                    if (taskIdMatch && taskIdMatch[1]) {
                        taskId = taskIdMatch[1];
                    }
                }
                
                if (!taskId) {
                    elizaLogger.error("Failed to create verification task: Invalid response from Raiinmaker plugin");
                    
                    // Fallback: If verification fails but we have configured the system to post directly,
                    // skip verification and post immediately
                    if (this.client.twitterConfig.POST_IMMEDIATELY) {
                        elizaLogger.warn("Verification failed, but POST_IMMEDIATELY is enabled - posting tweet directly");
                        
                        // Post the tweet directly
                        await this.postTweet(
                            this.runtime,
                            this.client,
                            tweetTextForPosting,
                            roomId,
                            rawTweetContent,
                            this.twitterUsername
                        );
                        
                        return "direct-posted"; // Special return value to indicate we posted directly
                    }
                    
                    return null;
                }
                
                elizaLogger.log(`Successfully created verification task with ID: ${taskId}`);
                
                // Store the pending tweet with the taskId
                const pendingTweetsKey = `twitter/${this.client.profile.username}/pendingTweets`;
                const currentPendingTweets = (await this.runtime.cacheManager.get<PendingTweet[]>(pendingTweetsKey)) || [];
                
                // Add new pending tweet with Raiinmaker taskId
                currentPendingTweets.push({
                    tweetTextForPosting,
                    roomId,
                    rawTweetContent,
                    taskId: taskId,
                    timestamp: Date.now()
                });
                
                // Store updated array
                await this.runtime.cacheManager.set(pendingTweetsKey, currentPendingTweets);
                
                return taskId;
            } catch (actionError) {
                elizaLogger.error("Error executing VERIFY_GENERATION_CONTENT action:", actionError);
                
                // Fallback: If verification fails but we have configured the system to post directly,
                // skip verification and post immediately
                if (this.client.twitterConfig.POST_IMMEDIATELY) {
                    elizaLogger.warn("Verification failed, but POST_IMMEDIATELY is enabled - posting tweet directly");
                    
                    // Post the tweet directly
                    await this.postTweet(
                        this.runtime,
                        this.client,
                        tweetTextForPosting,
                        roomId,
                        rawTweetContent,
                        this.twitterUsername
                    );
                    
                    return "direct-posted"; // Special return value to indicate we posted directly
                }
                
                return null;
            }
        } catch (error) {
            elizaLogger.error("Error sending tweet for Raiinmaker verification:", error);
            
            // Fallback: If verification completely fails but we have configured the system to post directly,
            // skip verification and post immediately
            if (this.client.twitterConfig.POST_IMMEDIATELY) {
                elizaLogger.warn("Verification process failed, but POST_IMMEDIATELY is enabled - posting tweet directly");
                
                try {
                    // Post the tweet directly
                    await this.postTweet(
                        this.runtime,
                        this.client,
                        tweetTextForPosting,
                        roomId,
                        rawTweetContent,
                        this.twitterUsername
                    );
                    
                    return "direct-posted"; // Special return value to indicate we posted directly
                } catch (postError) {
                    elizaLogger.error("Failed to post tweet in fallback mode:", postError);
                    return null;
                }
            }
            
            return null;
        }
    }
    
    
    /**
     * Checks the verification status of a task in the Raiinmaker system
     * 
     * @param taskId The ID of the verification task
     * @returns The approval status of the task
     */
    private async checkRaiinmakerVerificationStatus(taskId: string): Promise<PendingTweetApprovalStatus> {
        try {
            if (this.approvalProvider !== "RAIINMAKER") {
                return "PENDING";
            }
            
            elizaLogger.log(`Checking verification status for task ID: ${taskId}`);
            
            try {
                let verificationStatus: any = null;
                
                const checkActionMemory: Memory = {
                    id: uuidv4() as `${string}-${string}-${string}-${string}-${string}`,
                    userId: this.runtime.agentId,
                    agentId: this.runtime.agentId,
                    roomId: stringToUuid("verification_status_check"),
                    content: {
                        type: 'text',
                        text: `Check verification status for task: "${taskId}"`,
                        action: 'CHECK_VERIFICATION_STATUS',
                        options: { taskId }
                    }
                };

                await this.runtime.processActions(
                    checkActionMemory,
                    [checkActionMemory],
                    undefined,
                    async (result) => {
                        verificationStatus = result;
                        return [checkActionMemory];
                    }
                );
                
                if (!verificationStatus) {
                    return "PENDING";
                }
                
                // Parse the task status
                const status = typeof verificationStatus.status === 'string' 
                    ? verificationStatus.status.toLowerCase() 
                    : null;
                    
                const answer = typeof verificationStatus.answer === 'string'
                    ? verificationStatus.answer.toLowerCase()
                    : null;
                
                // Check for completed and approved
                if (status === 'completed') {
                    if (answer === 'true' || answer === 'yes') {
                        return "APPROVED";
                    } else {
                        return "REJECTED";
                    }
                }
                
                return "PENDING";
                
            } catch (error: any) {
                if (error?.status === 404) {
                    return "REJECTED";
                }
                throw error;
            }
        } catch (error) {
            elizaLogger.error(`Error checking verification status for task ${taskId}:`, error);
            return "PENDING";
        }
    }

    /**
     * Sends a tweet for verification through the Discord approval system
     * 
     * @param tweetTextForPosting The tweet text to be verified
     * @param roomId The ID of the room associated with this tweet
     * @param rawTweetContent The raw content before processing
     * @returns The message ID or null if sending failed
     */
    private async sendForDiscordApproval(
        tweetTextForPosting: string,
        roomId: UUID,
        rawTweetContent: string
    ): Promise<string | null> {
        try {
            elizaLogger.log(`Sending tweet for Discord approval: "${tweetTextForPosting.substring(0, 50)}${tweetTextForPosting.length > 50 ? '...' : ''}"`);
            
            // Check if Discord client is initialized
            if (!this.discordClientForApproval || !this.discordApprovalChannelId) {
                elizaLogger.error("Discord client or channel ID not configured for approval");
                
                // If Discord approval fails but POST_IMMEDIATELY is enabled, post directly
                if (this.client.twitterConfig.POST_IMMEDIATELY) {
                    elizaLogger.warn("Discord approval failed, but POST_IMMEDIATELY is enabled - posting tweet directly");
                    
                    await this.postTweet(
                        this.runtime,
                        this.client,
                        tweetTextForPosting,
                        roomId,
                        rawTweetContent,
                        this.twitterUsername
                    );
                    
                    return "direct-posted";
                }
                
                return null;
            }
            
            // Create embed for Discord message
            const embed = {
                title: "New Tweet Pending Approval",
                description: tweetTextForPosting,
                fields: [
                    {
                        name: "Character",
                        value: this.client.profile.username,
                        inline: true,
                    },
                    {
                        name: "Length",
                        value: tweetTextForPosting.length.toString(),
                        inline: true,
                    },
                ],
                footer: {
                    text: "React with 👍 to approve or ❌ to reject. This will expire after 24 hours if no response received.",
                },
                timestamp: new Date().toISOString(),
                color: 0x1DA1F2, // Twitter blue color
            };
            
            // Fetch the channel
            try {
                const channel = await this.discordClientForApproval.channels.fetch(this.discordApprovalChannelId);
                
                if (!channel || !(channel instanceof TextChannel)) {
                    throw new Error(`Invalid Discord channel: ${this.discordApprovalChannelId}`);
                }
                
                // Send the approval message
                const message = await channel.send({ embeds: [embed] });
                
                // Add the approval reactions for easy clicking
                await message.react('👍');
                await message.react('❌');
                
                // Store the pending tweet
                const pendingTweetsKey = `twitter/${this.client.profile.username}/pendingTweets`;
                const currentPendingTweets = (await this.runtime.cacheManager.get<PendingTweet[]>(pendingTweetsKey)) || [];
                
                // Add new pending tweet
                currentPendingTweets.push({
                    tweetTextForPosting,
                    roomId,
                    rawTweetContent,
                    taskId: message.id, // Use Discord message ID as task ID
                    timestamp: Date.now()
                });
                
                // Store updated array
                await this.runtime.cacheManager.set(pendingTweetsKey, currentPendingTweets);
                
                elizaLogger.success(`Successfully sent tweet for Discord approval with message ID: ${message.id}`);
                return message.id;
                
            } catch (error) {
                elizaLogger.error("Error sending Discord approval message:", error);
                
                // If Discord approval fails but POST_IMMEDIATELY is enabled, post directly
                if (this.client.twitterConfig.POST_IMMEDIATELY) {
                    elizaLogger.warn("Discord approval failed, but POST_IMMEDIATELY is enabled - posting tweet directly");
                    
                    await this.postTweet(
                        this.runtime,
                        this.client,
                        tweetTextForPosting,
                        roomId,
                        rawTweetContent,
                        this.twitterUsername
                    );
                    
                    return "direct-posted";
                }
                
                return null;
            }
        } catch (error) {
            elizaLogger.error("Error in Discord approval process:", error);
            
            // If verification completely fails but we have configured the system to post directly,
            // skip verification and post immediately
            if (this.client.twitterConfig.POST_IMMEDIATELY) {
                elizaLogger.warn("Discord approval process failed, but POST_IMMEDIATELY is enabled - posting tweet directly");
                
                try {
                    // Post the tweet directly
                    await this.postTweet(
                        this.runtime,
                        this.client,
                        tweetTextForPosting,
                        roomId,
                        rawTweetContent,
                        this.twitterUsername
                    );
                    
                    return "direct-posted"; // Special return value to indicate we posted directly
                } catch (postError) {
                    elizaLogger.error("Failed to post tweet in fallback mode:", postError);
                    return null;
                }
            }
            
            return null;
        }
    }

    /**
     * Starts the Twitter client and sets up all necessary loops and processes
     */
    async start() {
        try {
            // Force Discord client to null for RAIINMAKER provider
            if (this.approvalProvider?.toUpperCase() === "RAIINMAKER") {
                elizaLogger.debug(`🔍 Explicitly ensuring Discord client is null for RAIINMAKER provider during start()`);
                this.discordClientForApproval = null;
            }
            
            if (!this.client.profile) {
                await this.client.init();
            }

            const generateNewTweetLoop = async () => {
                const lastPost = await this.runtime.cacheManager.get<{
                    timestamp: number;
                }>("twitter/" + this.twitterUsername + "/lastPost");

                const lastPostTimestamp = lastPost?.timestamp ?? 0;
                const minMinutes = this.client.twitterConfig.POST_INTERVAL_MIN;
                const maxMinutes = this.client.twitterConfig.POST_INTERVAL_MAX;
                const randomMinutes =
                    Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) +
                    minMinutes;
                const delay = randomMinutes * 60 * 1000;

                if (Date.now() > lastPostTimestamp + delay) {
                    await this.generateNewTweet();
                }

                setTimeout(() => {
                    generateNewTweetLoop(); // Set up next iteration
                }, delay);

                elizaLogger.log(`Next tweet scheduled in ${randomMinutes} minutes`);
            };

            const processActionsLoop = async () => {
                const actionInterval = this.client.twitterConfig.ACTION_INTERVAL; // Defaults to 5 minutes

                while (!this.stopProcessingActions) {
                    try {
                        const results = await this.processTweetActions();
                        if (results) {
                            elizaLogger.log(`Processed ${results.length} tweets`);
                            elizaLogger.log(
                                `Next action processing scheduled in ${actionInterval} minutes`
                            );
                            // Wait for the full interval before next processing
                            await new Promise(
                                (resolve) =>
                                    setTimeout(resolve, actionInterval * 60 * 1000) // now in minutes
                            );
                        }
                    } catch (error) {
                        elizaLogger.error(
                            "Error in action processing loop:",
                            error
                        );
                        // Add exponential backoff on error
                        await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30s on error
                    }
                }
            };

            if (this.client.twitterConfig.POST_IMMEDIATELY) {
                await this.generateNewTweet();
            }

            if (this.client.twitterConfig.ENABLE_TWITTER_POST_GENERATION) {
                generateNewTweetLoop();
                elizaLogger.log("Tweet generation loop started");
            }

            // Start media posting loop
            if (this.mediaPostingConfig.ENABLE_MEDIA_POSTING && this.mediaPostingManager) {
                this.mediaPostingManager.startMediaPostingLoop();
                elizaLogger.log("Media posting loop started");
            }

            if (this.client.twitterConfig.ENABLE_ACTION_PROCESSING) {
                processActionsLoop().catch((error) => {
                    elizaLogger.error(
                        "Fatal error in process actions loop:",
                        error
                    );
                });
            }

            // Start the pending tweet check loop if approval is required
            if (this.approvalRequired) {
                await this.startVerificationPolling();
            }
        } catch (error) {
            elizaLogger.error("Error starting Twitter client:", error);
        }
    }

    private runPendingTweetCheckLoop() {
        setInterval(async () => {
            await this.handlePendingTweet();
        }, this.approvalCheckInterval);
    }

    createTweetObject(
        tweetResult: any,
        client: any,
        twitterUsername: string
    ): Tweet {
        return {
            id: tweetResult.rest_id,
            name: client.profile.screenName,
            username: client.profile.username,
            text: tweetResult.legacy.full_text,
            conversationId: tweetResult.legacy.conversation_id_str,
            createdAt: tweetResult.legacy.created_at,
            timestamp: new Date(tweetResult.legacy.created_at).getTime(),
            userId: client.profile.id,
            inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
            permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
            hashtags: [],
            mentions: [],
            photos: [],
            thread: [],
            urls: [],
            videos: [],
        } as Tweet;
    }

    async processAndCacheTweet(
        runtime: IAgentRuntime,
        client: ClientBase,
        tweet: Tweet,
        roomId: UUID,
        rawTweetContent: string
    ) {
        // Cache the last post details
        await runtime.cacheManager.set(
            `twitter/${client.profile.username}/lastPost`,
            {
                id: tweet.id,
                timestamp: Date.now(),
            }
        );

        // Cache the tweet
        await client.cacheTweet(tweet);

        // Log the posted tweet
        elizaLogger.log(`Tweet posted:\n ${tweet.permanentUrl}`);

        // Ensure the room and participant exist
        await runtime.ensureRoomExists(roomId);
        await runtime.ensureParticipantInRoom(runtime.agentId, roomId);

        // Create a memory for the tweet
        await runtime.messageManager.createMemory({
            id: stringToUuid(tweet.id + "-" + runtime.agentId),
            userId: runtime.agentId,
            agentId: runtime.agentId,
            roomId,
            content: {
                text: rawTweetContent.trim(),
                url: tweet.permanentUrl,
                source: "twitter",
            },
            embedding: getEmbeddingZeroVector(),
            createdAt: tweet.timestamp,
        });
    }

    async handleNoteTweet(
        client: ClientBase,
        content: string,
        tweetId?: string,
        mediaData?: MediaData[]
    ) {
        try {
            const noteTweetResult = await client.requestQueue.add(
                async () =>
                    await client.twitterClient.sendNoteTweet(
                        content,
                        tweetId,
                        mediaData
                    )
            );

            if (noteTweetResult.errors && noteTweetResult.errors.length > 0) {
                // Note Tweet failed due to authorization. Falling back to standard Tweet.
                const truncateContent = truncateToCompleteSentence(
                    content,
                    this.client.twitterConfig.MAX_TWEET_LENGTH
                );
                return await this.sendStandardTweet(
                    client,
                    truncateContent,
                    tweetId
                );
            } else {
                return noteTweetResult.data.notetweet_create.tweet_results
                    .result;
            }
        } catch (error) {
            throw new Error(`Note Tweet failed: ${error}`);
        }
    }

    async sendStandardTweet(
        client: ClientBase,
        content: string,
        tweetId?: string,
        mediaData?: MediaData[]
    ) {
        try {
            const standardTweetResult = await client.requestQueue.add(
                async () =>
                    await client.twitterClient.sendTweet(
                        content,
                        tweetId,
                        mediaData
                    )
            );
            const body = await standardTweetResult.json();
            if (!body?.data?.create_tweet?.tweet_results?.result) {
                elizaLogger.error("Error sending tweet; Bad response:", body);
                return;
            }
            return body.data.create_tweet.tweet_results.result;
        } catch (error) {
            elizaLogger.error("Error sending standard Tweet:", error);
            throw error;
        }
    }

    async postTweet(
        runtime: IAgentRuntime,
        client: ClientBase,
        tweetTextForPosting: string,
        roomId: UUID,
        rawTweetContent: string,
        twitterUsername: string,
        mediaData?: MediaData[]
    ) {
        try {
            elizaLogger.log(`Posting new tweet:\n`);

            let result;

            if (tweetTextForPosting.length > DEFAULT_MAX_TWEET_LENGTH) {
                result = await this.handleNoteTweet(
                    client,
                    tweetTextForPosting,
                    undefined,
                    mediaData
                );
            } else {
                result = await this.sendStandardTweet(
                    client,
                    tweetTextForPosting,
                    undefined,
                    mediaData
                );
            }

            const tweet = this.createTweetObject(
                result,
                client,
                twitterUsername
            );

            await this.processAndCacheTweet(
                runtime,
                client,
                tweet,
                roomId,
                rawTweetContent
            );
        } catch (error) {
            elizaLogger.error("Error sending tweet:", error);
        }
    }

    /**
     * Sends a tweet for verification through the configured provider
     */
    private async sendForVerification(
        tweetTextForPosting: string,
        roomId: UUID,
        rawTweetContent: string
    ): Promise<string | null> {
        // Force provider to uppercase for consistent comparison
        const provider = this.approvalProvider.toUpperCase();
        
        // Add explicit safety measure - if we're using RAIINMAKER, nullify Discord
        if (provider === "RAIINMAKER") {
            this.discordClientForApproval = null;
            return this.sendForRaiinmakerVerification(tweetTextForPosting, roomId, rawTweetContent);
        } else if (provider === "DISCORD") {
            // Only attempt Discord if it's explicitly selected
            return this.sendForDiscordApproval(tweetTextForPosting, roomId, rawTweetContent);
        } else {
            // For any other provider, default to Raiinmaker for safety
            elizaLogger.warn(`Unknown provider "${this.approvalProvider}", defaulting to Raiinmaker`);
            this.discordClientForApproval = null;
            return this.sendForRaiinmakerVerification(tweetTextForPosting, roomId, rawTweetContent);
        }
    }

    /**
     * Generates a new tweet, sends it for verification if required, or posts it directly
     */
    async generateNewTweet() {
        elizaLogger.log("Generating new tweet");

        try {
            const roomId = stringToUuid(
                "twitter_generate_room-" + this.client.profile.username
            );
            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                this.client.profile.username,
                this.runtime.character.name,
                "twitter"
            );

            const topics = this.runtime.character.topics.join(", ");
            const maxTweetLength = this.client.twitterConfig.MAX_TWEET_LENGTH;
            const state = await this.runtime.composeState(
                {
                    userId: this.runtime.agentId,
                    roomId: roomId,
                    agentId: this.runtime.agentId,
                    content: {
                        text: topics || "",
                        action: "TWEET",
                    },
                },
                {
                    twitterUserName: this.client.profile.username,
                    maxTweetLength,
                }
            );

            const context = composeContext({
                state,
                template:
                    this.runtime.character.templates?.twitterPostTemplate ||
                    twitterPostTemplate,
            });

            const response = await generateText({
                runtime: this.runtime,
                context,
                modelClass: ModelClass.SMALL,
            });

            const rawTweetContent = cleanJsonResponse(response);

            // First attempt to clean content
            let tweetTextForPosting = null;
            let mediaData = null;

            // Try parsing as JSON first
            const parsedResponse = parseJSONObjectFromText(rawTweetContent);
            if (parsedResponse?.text) {
                tweetTextForPosting = parsedResponse.text;
            } else {
                // If not JSON, use the raw text directly
                tweetTextForPosting = rawTweetContent.trim();
            }

            if (
                parsedResponse?.attachments &&
                parsedResponse?.attachments.length > 0
            ) {
                mediaData = await fetchMediaData(parsedResponse.attachments);
            }

            // Try extracting text attribute
            if (!tweetTextForPosting) {
                const parsingText = extractAttributes(rawTweetContent, [
                    "text",
                ]).text;
                if (parsingText) {
                    tweetTextForPosting = truncateToCompleteSentence(
                        extractAttributes(rawTweetContent, ["text"]).text,
                        this.client.twitterConfig.MAX_TWEET_LENGTH
                    );
                }
            }

            // Use the raw text
            if (!tweetTextForPosting) {
                tweetTextForPosting = rawTweetContent;
            }

            // Truncate the content to the maximum tweet length specified in the environment settings, ensuring the truncation respects sentence boundaries.
            if (maxTweetLength) {
                tweetTextForPosting = truncateToCompleteSentence(
                    tweetTextForPosting,
                    maxTweetLength
                );
            }

            const removeQuotes = (str: string) =>
                str.replace(/^['"](.*)['"]$/, "$1");

            const fixNewLines = (str: string) => str.replaceAll(/\\n/g, "\n\n"); //ensures double spaces

            // Final cleaning
            tweetTextForPosting = removeQuotes(
                fixNewLines(tweetTextForPosting)
            );

            if (this.isDryRun) {
                elizaLogger.info(
                    `Dry run: would have posted tweet: ${tweetTextForPosting}`
                );
                return;
            }

            try {
                if (this.approvalRequired) {
                    // Send for verification using the configured provider
                    elizaLogger.log(`Sending Tweet for ${this.approvalProvider} verification:\n ${tweetTextForPosting}`);
                    
                    const taskId = await this.sendForVerification(
                        tweetTextForPosting,
                        roomId,
                        rawTweetContent
                    );
                    
                    if (taskId === "direct-posted") {
                        elizaLogger.log("Tweet was posted directly due to verification fallback");
                    } else if (taskId) {
                        elizaLogger.log(`Tweet sent for verification with task ID: ${taskId}`);
                    } else {
                        elizaLogger.error("Failed to send tweet for verification");
                    }
                } else {
                    elizaLogger.log(
                        `Posting new tweet directly (no approval required):\n ${tweetTextForPosting}`
                    );
                    await this.postTweet(
                        this.runtime,
                        this.client,
                        tweetTextForPosting,
                        roomId,
                        rawTweetContent,
                        this.twitterUsername,
                        mediaData
                    );
                }
            } catch (error) {
                elizaLogger.error("Error sending tweet:", error);
            }
        } catch (error) {
            elizaLogger.error("Error generating new tweet:", error);
        }
    }

    private async generateTweetContent(
        tweetState: any,
        options?: {
            template?: TemplateType;
            context?: string;
        }
    ): Promise<string> {
        const context = composeContext({
            state: tweetState,
            template:
                options?.template ||
                this.runtime.character.templates?.twitterPostTemplate ||
                twitterPostTemplate,
        });

        const response = await generateText({
            runtime: this.runtime,
            context: options?.context || context,
            modelClass: ModelClass.SMALL,
        });

        elizaLogger.log("generate tweet content response:\n" + response);

        // First clean up any markdown and newlines
        const cleanedResponse = cleanJsonResponse(response);

        // Try to parse as JSON first
        const jsonResponse = parseJSONObjectFromText(cleanedResponse);
        if (jsonResponse.text) {
            const truncateContent = truncateToCompleteSentence(
                jsonResponse.text,
                this.client.twitterConfig.MAX_TWEET_LENGTH
            );
            return truncateContent;
        }
        if (typeof jsonResponse === "object") {
            const possibleContent =
                jsonResponse.content ||
                jsonResponse.message ||
                jsonResponse.response;
            if (possibleContent) {
                const truncateContent = truncateToCompleteSentence(
                    possibleContent,
                    this.client.twitterConfig.MAX_TWEET_LENGTH
                );
                return truncateContent;
            }
        }

        let truncateContent = null;
        // Try extracting text attribute
        const parsingText = extractAttributes(cleanedResponse, ["text"]).text;
        if (parsingText) {
            truncateContent = truncateToCompleteSentence(
                parsingText,
                this.client.twitterConfig.MAX_TWEET_LENGTH
            );
        }

        if (!truncateContent) {
            // If not JSON or no valid content found, clean the raw text
            truncateContent = truncateToCompleteSentence(
                cleanedResponse,
                this.client.twitterConfig.MAX_TWEET_LENGTH
            );
        }

        return truncateContent;
    }


    /**
     * Processes tweet actions (likes, retweets, quotes, replies). If isDryRun is true,
     * only simulates and logs actions without making API calls.
     */
    private async processTweetActions() {
        if (this.isProcessing) {
            elizaLogger.log("Already processing tweet actions, skipping");
            return null;
        }

        try {
            this.isProcessing = true;
            this.lastProcessTime = Date.now();

            elizaLogger.log("Processing tweet actions");

            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                this.twitterUsername,
                this.runtime.character.name,
                "twitter"
            );

            const timelines = await this.client.fetchTimelineForActions(
                MAX_TIMELINES_TO_FETCH
            );
            const maxActionsProcessing =
                this.client.twitterConfig.MAX_ACTIONS_PROCESSING;
            const processedTimelines = [];

            for (const tweet of timelines) {
                try {
                    // Skip if we've already processed this tweet
                    const memory =
                        await this.runtime.messageManager.getMemoryById(
                            stringToUuid(tweet.id + "-" + this.runtime.agentId)
                        );
                    if (memory) {
                        elizaLogger.log(
                            `Already processed tweet ID: ${tweet.id}`
                        );
                        continue;
                    }

                    const roomId = stringToUuid(
                        tweet.conversationId + "-" + this.runtime.agentId
                    );

                    const tweetState = await this.runtime.composeState(
                        {
                            userId: this.runtime.agentId,
                            roomId,
                            agentId: this.runtime.agentId,
                            content: { text: "", action: "" },
                        },
                        {
                            twitterUserName: this.twitterUsername,
                            currentTweet: `ID: ${tweet.id}\nFrom: ${tweet.name} (@${tweet.username})\nText: ${tweet.text}`,
                        }
                    );

                    const actionContext = composeContext({
                        state: tweetState,
                        template:
                            this.runtime.character.templates
                                ?.twitterActionTemplate ||
                            twitterActionTemplate,
                    });

                    const actionResponse = await generateTweetActions({
                        runtime: this.runtime,
                        context: actionContext,
                        modelClass: ModelClass.SMALL,
                    });

                    if (!actionResponse) {
                        elizaLogger.log(
                            `No valid actions generated for tweet ${tweet.id}`
                        );
                        continue;
                    }
                    processedTimelines.push({
                        tweet: tweet,
                        actionResponse: actionResponse,
                        tweetState: tweetState,
                        roomId: roomId,
                    });
                } catch (error) {
                    elizaLogger.error(
                        `Error processing tweet ${tweet.id}:`,
                        error
                    );
                    continue;
                }
            }

            const sortProcessedTimeline = (arr: typeof processedTimelines) => {
                return arr.sort((a, b) => {
                    // Count the number of true values in the actionResponse object
                    const countTrue = (obj: typeof a.actionResponse) =>
                        Object.values(obj).filter(Boolean).length;

                    const countA = countTrue(a.actionResponse);
                    const countB = countTrue(b.actionResponse);

                    // Primary sort by number of true values
                    if (countA !== countB) {
                        return countB - countA;
                    }

                    // Secondary sort by the "like" property
                    if (a.actionResponse.like !== b.actionResponse.like) {
                        return a.actionResponse.like ? -1 : 1;
                    }

                    // Tertiary sort keeps the remaining objects with equal weight
                    return 0;
                });
            };
            // Sort the timeline based on the action decision score,
            // then slice the results according to the environment variable to limit the number of actions per cycle.
            const sortedTimelines = sortProcessedTimeline(
                processedTimelines
            ).slice(0, maxActionsProcessing);

            return this.processTimelineActions(sortedTimelines); // Return results array to indicate completion
        } catch (error) {
            elizaLogger.error("Error in processTweetActions:", error);
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Processes a list of timelines by executing the corresponding tweet actions.
     * Each timeline includes the tweet, action response, tweet state, and room context.
     * Results are returned for tracking completed actions.
     *
     * @param timelines - Array of objects containing tweet details, action responses, and state information.
     * @returns A promise that resolves to an array of results with details of executed actions.
     */
    private async processTimelineActions(
        timelines: {
            tweet: Tweet;
            actionResponse: ActionResponse;
            tweetState: State;
            roomId: UUID;
        }[]
    ): Promise<
        {
            tweetId: string;
            actionResponse: ActionResponse;
            executedActions: string[];
        }[]
    > {
        const results = [];
        for (const timeline of timelines) {
            const { actionResponse, tweetState, roomId, tweet } = timeline;
            try {
                const executedActions: string[] = [];
                // Execute actions
                if (actionResponse.like) {
                    if (this.isDryRun) {
                        elizaLogger.info(
                            `Dry run: would have liked tweet ${tweet.id}`
                        );
                        executedActions.push("like (dry run)");
                    } else {
                        try {
                            await this.client.twitterClient.likeTweet(tweet.id);
                            executedActions.push("like");
                            elizaLogger.log(`Liked tweet ${tweet.id}`);
                        } catch (error) {
                            elizaLogger.error(
                                `Error liking tweet ${tweet.id}:`,
                                error
                            );
                        }
                    }
                }

                if (actionResponse.retweet) {
                    if (this.isDryRun) {
                        elizaLogger.info(
                            `Dry run: would have retweeted tweet ${tweet.id}`
                        );
                        executedActions.push("retweet (dry run)");
                    } else {
                        try {
                            await this.client.twitterClient.retweet(tweet.id);
                            executedActions.push("retweet");
                            elizaLogger.log(`Retweeted tweet ${tweet.id}`);
                        } catch (error) {
                            elizaLogger.error(
                                `Error retweeting tweet ${tweet.id}:`,
                                error
                            );
                        }
                    }
                }

                if (actionResponse.quote) {
                    try {
                        // Build conversation thread for context
                        const thread = await buildConversationThread(
                            tweet,
                            this.client
                        );
                        const formattedConversation = thread
                            .map(
                                (t) =>
                                    `@${t.username} (${new Date(
                                        t.timestamp * 1000
                                    ).toLocaleString()}): ${t.text}`
                            )
                            .join("\n\n");

                        // Generate image descriptions if present
                        const imageDescriptions = [];
                        if (tweet.photos?.length > 0) {
                            elizaLogger.log(
                                "Processing images in tweet for context"
                            );
                            for (const photo of tweet.photos) {
                                const description = await this.runtime
                                    .getService<IImageDescriptionService>(
                                        ServiceType.IMAGE_DESCRIPTION
                                    )
                                    .describeImage(photo.url);
                                imageDescriptions.push(description);
                            }
                        }

                        // Handle quoted tweet if present
                        let quotedContent = "";
                        if (tweet.quotedStatusId) {
                            try {
                                const quotedTweet =
                                    await this.client.twitterClient.getTweet(
                                        tweet.quotedStatusId
                                    );
                                if (quotedTweet) {
                                    quotedContent = `\nQuoted Tweet from @${quotedTweet.username}:\n${quotedTweet.text}`;
                                }
                            } catch (error) {
                                elizaLogger.error(
                                    "Error fetching quoted tweet:",
                                    error
                                );
                            }
                        }

                        // Compose rich state with all context
                        const enrichedState = await this.runtime.composeState(
                            {
                                userId: this.runtime.agentId,
                                roomId: stringToUuid(
                                    tweet.conversationId +
                                        "-" +
                                        this.runtime.agentId
                                ),
                                agentId: this.runtime.agentId,
                                content: {
                                    text: tweet.text,
                                    action: "QUOTE",
                                },
                            },
                            {
                                twitterUserName: this.twitterUsername,
                                currentPost: `From @${tweet.username}: ${tweet.text}`,
                                formattedConversation,
                                imageContext:
                                    imageDescriptions.length > 0
                                        ? `\nImages in Tweet:\n${imageDescriptions
                                              .map(
                                                  (desc, i) =>
                                                      `Image ${i + 1}: ${desc}`
                                              )
                                              .join("\n")}`
                                        : "",
                                quotedContent,
                            }
                        );

                        const quoteContent = await this.generateTweetContent(
                            enrichedState,
                            {
                                template:
                                    this.runtime.character.templates
                                        ?.twitterMessageHandlerTemplate ||
                                    twitterMessageHandlerTemplate,
                            }
                        );

                        if (!quoteContent) {
                            elizaLogger.error(
                                "Failed to generate valid quote tweet content"
                            );
                            return;
                        }

                        elizaLogger.log(
                            "Generated quote tweet content:",
                            quoteContent
                        );
                        // Check for dry run mode
                        if (this.isDryRun) {
                            elizaLogger.info(
                                `Dry run: A quote tweet for tweet ID ${tweet.id} would have been posted with the following content: "${quoteContent}".`
                            );
                            executedActions.push("quote (dry run)");
                        } else {
                            // Send the tweet through request queue
                            const result = await this.client.requestQueue.add(
                                async () =>
                                    await this.client.twitterClient.sendQuoteTweet(
                                        quoteContent,
                                        tweet.id
                                    )
                            );

                            const body = await result.json();

                            if (
                                body?.data?.create_tweet?.tweet_results?.result
                            ) {
                                elizaLogger.log(
                                    "Successfully posted quote tweet"
                                );
                                executedActions.push("quote");

                                // Cache generation context for debugging
                                await this.runtime.cacheManager.set(
                                    `twitter/quote_generation_${tweet.id}.txt`,
                                    `Context:\n${enrichedState}\n\nGenerated Quote:\n${quoteContent}`
                                );
                            } else {
                                elizaLogger.error(
                                    "Quote tweet creation failed:",
                                    body
                                );
                            }
                        }
                    } catch (error) {
                        elizaLogger.error(
                            "Error in quote tweet generation:",
                            error
                        );
                    }
                }

                if (actionResponse.reply) {
                    try {
                        await this.handleTextOnlyReply(
                            tweet,
                            tweetState,
                            executedActions
                        );
                    } catch (error) {
                        elizaLogger.error(
                            `Error replying to tweet ${tweet.id}:`,
                            error
                        );
                    }
                }

                // Add these checks before creating memory
                await this.runtime.ensureRoomExists(roomId);
                await this.runtime.ensureUserExists(
                    stringToUuid(tweet.userId),
                    tweet.username,
                    tweet.name,
                    "twitter"
                );
                await this.runtime.ensureParticipantInRoom(
                    this.runtime.agentId,
                    roomId
                );

                if (!this.isDryRun) {
                    // Then create the memory
                    await this.runtime.messageManager.createMemory({
                        id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
                        userId: stringToUuid(tweet.userId),
                        content: {
                            text: tweet.text,
                            url: tweet.permanentUrl,
                            source: "twitter",
                            action: executedActions.join(","),
                        },
                        agentId: this.runtime.agentId,
                        roomId,
                        embedding: getEmbeddingZeroVector(),
                        createdAt: tweet.timestamp * 1000,
                    });
                }

                results.push({
                    tweetId: tweet.id,
                    actionResponse: actionResponse,
                    executedActions,
                });
            } catch (error) {
                elizaLogger.error(`Error processing tweet ${tweet.id}:`, error);
                continue;
            }
        }

        return results;
    }

    /**
     * Handles text-only replies to tweets. If isDryRun is true, only logs what would
     * have been replied without making API calls.
     */
    private async handleTextOnlyReply(
        tweet: Tweet,
        tweetState: any,
        executedActions: string[]
    ) {
        try {
            // Build conversation thread for context
            const thread = await buildConversationThread(tweet, this.client);
            const formattedConversation = thread
                .map(
                    (t) =>
                        `@${t.username} (${new Date(
                            t.timestamp * 1000
                        ).toLocaleString()}): ${t.text}`
                )
                .join("\n\n");

            // Generate image descriptions if present
            const imageDescriptions = [];
            if (tweet.photos?.length > 0) {
                elizaLogger.log("Processing images in tweet for context");
                for (const photo of tweet.photos) {
                    const description = await this.runtime
                        .getService<IImageDescriptionService>(
                            ServiceType.IMAGE_DESCRIPTION
                        )
                        .describeImage(photo.url);
                    imageDescriptions.push(description);
                }
            }

            // Handle quoted tweet if present
            let quotedContent = "";
            if (tweet.quotedStatusId) {
                try {
                    const quotedTweet =
                        await this.client.twitterClient.getTweet(
                            tweet.quotedStatusId
                        );
                    if (quotedTweet) {
                        quotedContent = `\nQuoted Tweet from @${quotedTweet.username}:\n${quotedTweet.text}`;
                    }
                } catch (error) {
                    elizaLogger.error("Error fetching quoted tweet:", error);
                }
            }

            // Compose rich state with all context
            const enrichedState = await this.runtime.composeState(
                {
                    userId: this.runtime.agentId,
                    roomId: stringToUuid(
                        tweet.conversationId + "-" + this.runtime.agentId
                    ),
                    agentId: this.runtime.agentId,
                    content: { text: tweet.text, action: "" },
                },
                {
                    twitterUserName: this.twitterUsername,
                    currentPost: `From @${tweet.username}: ${tweet.text}`,
                    formattedConversation,
                    imageContext:
                        imageDescriptions.length > 0
                            ? `\nImages in Tweet:\n${imageDescriptions
                                  .map(
                                      (desc, i) =>
                                          `Image ${i + 1}: ${desc}`
                                  )
                                  .join("\n")}`
                            : "",
                    quotedContent,
                }
            );

            // Generate and clean the reply content
            const replyText = await this.generateTweetContent(enrichedState, {
                template:
                    this.runtime.character.templates
                        ?.twitterMessageHandlerTemplate ||
                    twitterMessageHandlerTemplate,
            });

            if (!replyText) {
                elizaLogger.error("Failed to generate valid reply content");
                return;
            }

            if (this.isDryRun) {
                elizaLogger.info(
                    `Dry run: reply to tweet ${tweet.id} would have been: ${replyText}`
                );
                executedActions.push("reply (dry run)");
                return;
            }

            let result;

            if (replyText.length > DEFAULT_MAX_TWEET_LENGTH) {
                result = await this.handleNoteTweet(
                    this.client,
                    replyText,
                    tweet.id
                );
            } else {
                result = await this.sendStandardTweet(
                    this.client,
                    replyText,
                    tweet.id
                );
            }

            if (result) {
                elizaLogger.log("Successfully posted reply tweet");
                executedActions.push("reply");

                // Cache generation context for debugging
                await this.runtime.cacheManager.set(
                    `twitter/reply_generation_${tweet.id}.txt`,
                    `Context:\n${enrichedState}\n\nGenerated Reply:\n${replyText}`
                );
            } else {
                elizaLogger.error("Tweet reply creation failed");
            }
        } catch (error) {
            elizaLogger.error("Error in handleTextOnlyReply:", error);
        }
    }

    /**
     * Stops all client processes
     */
    async stop() {
        this.stopProcessingActions = true;
        
        // Disconnect Discord client if it was initialized
        if (this.discordClientForApproval) {
            elizaLogger.log("Disconnecting Discord client");
            this.discordClientForApproval.destroy();
        }
        
        elizaLogger.log("Twitter post client stopped");
    }

    private async checkVerificationStatus(taskId: string): Promise<PendingTweetApprovalStatus> {
        if (this.approvalProvider === "DISCORD") {
            return this.checkApprovalStatus(taskId);
        } else if (this.approvalProvider === "RAIINMAKER") {
            return this.checkRaiinmakerVerificationStatus(taskId);
        } else {
            elizaLogger.warn(`Unknown provider "${this.approvalProvider}", defaulting to PENDING status`);
            return "PENDING";
        }
    }

    private async checkApprovalStatus(
        discordMessageId: string
    ): Promise<PendingTweetApprovalStatus> {
        try {
            // Guard to prevent Discord checks when not using Discord provider
            if (this.approvalProvider !== "DISCORD") {
                return "PENDING";
            }
            
            // Fetch message and its replies from Discord
            if (!this.discordClientForApproval) {
                elizaLogger.error("Discord client not initialized for approval check");
                return "PENDING";
            }
            
            const channel = await this.discordClientForApproval.channels.fetch(
                this.discordApprovalChannelId
            );

            if (!(channel instanceof TextChannel)) {
                elizaLogger.error("Invalid approval channel");
                return "PENDING";
            }

            // Fetch the original message and its replies
            const message = await channel.messages.fetch(discordMessageId);

            // Look for thumbs up reaction ('👍')
            const thumbsUpReaction = message.reactions.cache.find(
                (reaction) => reaction.emoji.name === "👍"
            );

            // Look for reject reaction ('❌')
            const rejectReaction = message.reactions.cache.find(
                (reaction) => reaction.emoji.name === "❌"
            );

            // Check if the reaction exists and has reactions
            if (rejectReaction) {
                const reactionCount = rejectReaction.count;
                if (reactionCount > 1) { // More than just the bot's reaction
                    elizaLogger.log(`Tweet rejected via Discord reaction`);
                    return "REJECTED";
                }
            }

            // Check thumbs up for approval
            if (thumbsUpReaction) {
                const reactionCount = thumbsUpReaction.count;
                if (reactionCount > 1) { // More than just the bot's reaction
                    elizaLogger.log(`Tweet approved via Discord reaction`);
                    return "APPROVED";
                }
            }

            // If we reach here, no valid approval or rejection found
            return "PENDING";
        } catch (error) {
            elizaLogger.error(`Error checking approval status: ${error}`);
            return "PENDING";
        }
    }

    /**
     * Cleans up a pending tweet from the cache
     * 
     * @param taskId The ID of the verification task to clean up
     */
    private async cleanupPendingTweet(taskId: string) {
        try {
            const pendingTweetsKey = `twitter/${this.client.profile.username}/pendingTweets`;
            const currentPendingTweets = (await this.runtime.cacheManager.get<PendingTweet[]>(pendingTweetsKey)) || [];
    
            // Remove the specific tweet
            const updatedPendingTweets = currentPendingTweets.filter(
                (tweet) => tweet.taskId !== taskId
            );
    
            if (updatedPendingTweets.length === 0) {
                await this.runtime.cacheManager.delete(pendingTweetsKey);
                elizaLogger.debug("All pending tweets processed, clearing cache");
            } else {
                await this.runtime.cacheManager.set(pendingTweetsKey, updatedPendingTweets);
                elizaLogger.debug(`Updated pending tweets cache, ${updatedPendingTweets.length} tweets remaining`);
            }
            
            // Create a consistent room ID for tweet verification tracking
            const roomId = stringToUuid("twitter_verification_room");
            
            // Ensure the room exists before creating a memory
            try {
                await this.runtime.ensureRoomExists(roomId);
                await this.runtime.ensureParticipantInRoom(this.runtime.agentId, roomId);
                
                // Add a memory to track the resolution of this verification
                await this.runtime.messageManager.createMemory({
                    id: stringToUuid(`tweet-verification-cleanup-${Date.now()}`),
                    userId: this.runtime.agentId,
                    agentId: this.runtime.agentId,
                    content: {
                        text: `Verification task ${taskId} processed and removed from pending queue`,
                        metadata: {
                            taskType: "tweetVerificationCleanup",
                            taskId: taskId,
                            timestamp: Date.now()
                        }
                    },
                    roomId: roomId,
                    createdAt: Date.now()
                });
            } catch (roomError) {
                // If we can't create the room or memory, just log it but don't fail
                elizaLogger.error("Error creating verification tracking memory:", roomError);
                // Don't rethrow - we should still consider the task cleaned up even if we can't save a memory
            }
        } catch (error) {
            // Log the error but don't let it crash the process
            elizaLogger.error("Error cleaning up pending tweet:", error);
        }
    }

     /**
     * Handles pending tweets by checking their verification status and processing them accordingly
     */
     private async handlePendingTweet() {
        elizaLogger.log(`Checking pending tweets using ${this.approvalProvider} verification...`);
        elizaLogger.debug(`🔍 handlePendingTweet called with approval provider: "${this.approvalProvider}"`);
        
        // Additional safeguard to prevent Discord initialization for RAIINMAKER
        if (this.approvalProvider.toUpperCase() === "RAIINMAKER") {
            elizaLogger.debug(`🔍 Explicitly ensuring Discord client is null for RAIINMAKER provider`);
            this.discordClientForApproval = null;
        }
        
        const pendingTweetsKey = `twitter/${this.client.profile.username}/pendingTweets`;
        const pendingTweets = (await this.runtime.cacheManager.get<PendingTweet[]>(pendingTweetsKey)) || [];
    
        if (pendingTweets.length === 0) {
            elizaLogger.log("No pending tweets to check");
            return;
        }
    
        elizaLogger.log(`Found ${pendingTweets.length} pending tweets to check`);
        elizaLogger.debug(`🔍 Processing ${pendingTweets.length} pending tweets`);
        
        for (const pendingTweet of pendingTweets) {
            elizaLogger.log(`Processing pending tweet with taskId: ${pendingTweet.taskId}`);
            elizaLogger.debug(`🔍 Checking tweet with taskId: ${pendingTweet.taskId}`);
            
            // Check if tweet is older than 24 hours
            const isExpired = Date.now() - pendingTweet.timestamp > 24 * 60 * 60 * 1000;
    
            if (isExpired) {
                elizaLogger.warn(`Pending tweet with task ID ${pendingTweet.taskId} expired after 24 hours`);
                elizaLogger.debug(`🔍 Tweet expired, cleaning up`);
                await this.cleanupPendingTweet(pendingTweet.taskId);
                continue;
            }
    
            // Check approval status using the configured provider
            elizaLogger.log(`Checking verification status for task: ${pendingTweet.taskId}`);
            elizaLogger.debug(`🔍 About to call checkVerificationStatus for task: ${pendingTweet.taskId}`);
            const approvalStatus = await this.checkVerificationStatus(pendingTweet.taskId);
            elizaLogger.log(`Approval status for task ${pendingTweet.taskId}: ${approvalStatus}`);
            elizaLogger.debug(`🔍 Received approval status: ${approvalStatus}`);
    
            if (approvalStatus === "APPROVED") {
                elizaLogger.log(`Tweet with task ID ${pendingTweet.taskId} approved, posting now...`);
                elizaLogger.debug(`🔍 Tweet approved, proceeding to post`);
                
                try {
                    await this.postTweet(
                        this.runtime,
                        this.client,
                        pendingTweet.tweetTextForPosting,
                        pendingTweet.roomId,
                        pendingTweet.rawTweetContent,
                        this.twitterUsername
                    );
                    
                    elizaLogger.success(`Successfully posted verified tweet`);
                } catch (error) {
                    elizaLogger.error(`Error posting approved tweet:`, error);
                }
    
                await this.cleanupPendingTweet(pendingTweet.taskId);
                
            } else if (approvalStatus === "REJECTED") {
                elizaLogger.warn(`Tweet with task ID ${pendingTweet.taskId} rejected by ${this.approvalProvider} verification`);
                elizaLogger.debug(`🔍 Tweet rejected, cleaning up`);
                await this.cleanupPendingTweet(pendingTweet.taskId);
            } else {
                elizaLogger.log(`Tweet with task ID ${pendingTweet.taskId} still pending verification`);
                elizaLogger.debug(`🔍 Tweet still pending verification`);
            }
        }
    }
    
    private async startVerificationPolling() {
        try {
            // Set up the regular interval check
            setInterval(async () => {
                try {
                    // Extra safeguard to ensure Discord is null for RAIINMAKER on each check
                    if (this.approvalProvider.toUpperCase() === "RAIINMAKER") {
                        this.discordClientForApproval = null;
                    }
                    
                    await this.handlePendingTweet();
                } catch (error) {
                    elizaLogger.error("Error in tweet verification check loop:", error);
                }
            }, 5 * 60 * 1000); // Check every 5 minutes
            
            elizaLogger.log(`Started ${this.approvalProvider} verification check loop`);
        } catch (error) {
            elizaLogger.error("Error starting verification polling:", error);
        }
    }
}
