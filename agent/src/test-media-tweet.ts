/**
 * Test Media Tweet Script
 *
 * This script posts a test media tweet using the Twitter client.
 * Run it directly to test the media tweet functionality.
 */

import { elizaLogger } from "@elizaos/core";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the Twitter client
async function main() {
    try {
        elizaLogger.info("Starting media tweet test script...");

        // Import the Twitter client
        elizaLogger.info("Importing Twitter client...");
        const TwitterModule = await import("@elizaos-plugins/client-twitter");
        const twitterPlugin = TwitterModule.default || TwitterModule;

        if (!twitterPlugin || !twitterPlugin.clients || !Array.isArray(twitterPlugin.clients)) {
            elizaLogger.error("Twitter plugin does not have a valid clients array");
            return;
        }

        elizaLogger.info(`Twitter plugin found with ${twitterPlugin.clients.length} clients`);

        // Get the Twitter client
        const clientDef = twitterPlugin.clients[0];
        if (typeof clientDef.start !== "function") {
            elizaLogger.error("Twitter client does not have a start method");
            return;
        }

        // Load environment variables from .env file
        const dotenv = await import('dotenv');
        dotenv.config();

        // Create a minimal runtime for the Twitter client
        const minimalRuntime = {
            agentId: "test-media-tweet",
            character: {
                name: "Test Media Tweet",
                persona: "A test script for posting media tweets",
            },
            getSetting: (key: string) => process.env[key],
            ensureUserExists: async () => {},
            ensureRoomExists: async () => {},
            ensureParticipantInRoom: async () => {},
            messageManager: {
                createMemory: async () => {},
            },
            // Add any other required properties
            clients: [],
            providers: [],
            plugins: [],
            registerAction: () => {},
        };

        // Start the Twitter client
        elizaLogger.info("Starting Twitter client...");
        const twitterClient = await clientDef.start(minimalRuntime);

        if (!twitterClient) {
            elizaLogger.error("Failed to start Twitter client");
            return;
        }

        elizaLogger.info("Twitter client started successfully");
        elizaLogger.info("Twitter client type:", typeof twitterClient);
        elizaLogger.info("Twitter client structure:", JSON.stringify(Object.keys(twitterClient), null, 2));

        // Check if the client has a post property
        if (twitterClient.post) {
            elizaLogger.info("Twitter client has a post property");
            elizaLogger.info("Post property structure:", JSON.stringify(Object.keys(twitterClient.post), null, 2));
        }


        // Get media folder path
        const mediaFolder = path.join(process.cwd(), "eliza", "media");

        if (!fs.existsSync(mediaFolder)) {
            elizaLogger.error(`Media folder not found at ${mediaFolder}`);
            return;
        }

        // Get all image files
        const files = fs.readdirSync(mediaFolder);
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return [".jpg", ".jpeg", ".png", ".gif"].includes(ext);
        });

        if (imageFiles.length === 0) {
            elizaLogger.error("No image files found in media folder");
            return;
        }

        // Select a random image
        const randomImage = imageFiles[Math.floor(Math.random() * imageFiles.length)];
        const imagePath = path.join(mediaFolder, randomImage);

        elizaLogger.info(`Selected image: ${imagePath}`);

        // Generate tweet content
        const tweetText = `Testing media tweet functionality with this image: ${randomImage}. Posted by test script at ${new Date().toISOString()}`;

        // Read the image file
        const imageBuffer = fs.readFileSync(imagePath);
        const imageType = path.extname(imagePath).substring(1);

        // Create media data object
        const mediaData = [{
            data: imageBuffer,
            mediaType: `image/${imageType === "jpg" ? "jpeg" : imageType}`
        }];

        // Create attachments for the Twitter client
        const attachments = mediaData.map((media: any) => ({
            data: media.data,
            contentType: media.mediaType
        }));

        // Print Twitter client information
        elizaLogger.info("Twitter client methods:", Object.keys(twitterClient));

        // Post tweet with media
        elizaLogger.info(`Posting test media tweet: ${tweetText}`);
        elizaLogger.info(`Using image: ${imagePath}`);
        elizaLogger.info(`Image type: ${imageType}`);
        elizaLogger.info(`Attachments: ${JSON.stringify(attachments.map(a => ({ contentType: a.contentType })))}`);

        if (typeof twitterClient.postTweet !== "function") {
            elizaLogger.error("Twitter client does not have a postTweet method");
            elizaLogger.info("Available methods:", Object.keys(twitterClient));
            return;
        }

        try {
            const result = await twitterClient.postTweet({
                text: tweetText,
                attachments: attachments
            });

            elizaLogger.info("Test media tweet posted successfully");
            elizaLogger.info("Result:", JSON.stringify(result, null, 2));
        } catch (error) {
            elizaLogger.error(`Error posting tweet: ${error.message}`);
            console.error(error);

            // Try alternative method if available
            if (typeof twitterClient.post?.postTweet === "function") {
                elizaLogger.info("Trying alternative postTweet method...");
                try {
                    const result = await twitterClient.post.postTweet(
                        minimalRuntime,
                        twitterClient,
                        tweetText,
                        "test-room-id",
                        tweetText,
                        process.env.TWITTER_USERNAME || "",
                        mediaData
                    );
                    elizaLogger.info("Alternative method succeeded!");
                    elizaLogger.info("Result:", JSON.stringify(result, null, 2));
                } catch (altError) {
                    elizaLogger.error(`Alternative method also failed: ${altError.message}`);
                    console.error(altError);
                }
            }
        }

    } catch (error) {
        elizaLogger.error(`Error in test media tweet script: ${error.message}`);
        console.error(error);
    }
}

main().catch(error => {
    elizaLogger.error("Unhandled error in main:", error);
    process.exit(1);
});
