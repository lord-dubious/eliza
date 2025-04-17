import { DirectClient } from "@elizaos/client-direct";
import {
    type Adapter,
    AgentRuntime,
    CacheManager,
    CacheStore,
    type Plugin,
    type Character,
    type ClientInstance,
    DbCacheAdapter,
    elizaLogger,
    FsCacheAdapter,
    type IAgentRuntime,
    type IDatabaseAdapter,
    type IDatabaseCacheAdapter,
    ModelProviderName,
    parseBooleanFromText,
    settings,
    stringToUuid,
    validateCharacterConfig,
    RAGKnowledgeManager,
    // KnowledgeScope, // Not needed anymore
    ServiceType, // Import ServiceType for Twitter service type
} from "@elizaos/core";
import { defaultCharacter } from "./defaultCharacter.ts";

import { bootstrapPlugin } from "@elizaos/plugin-bootstrap";
import JSON5 from 'json5';

// Import Twitter client plugin
// We'll use dynamic import in the initializeClients function to avoid TypeScript errors
let twitterPlugin: any;

import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import yargs from "yargs";

// Declare global variable for tracking tweet types
declare global {
    var lastTweetWasMedia: boolean | undefined;
}

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

interface ActionExample {
    user: string;
    content: {
        text: string;
        action: string;
        mediaPath?: string;
    };
}

export const wait = (minTime = 1000, maxTime = 3000) => {
    const waitTime =
        Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
    return new Promise((resolve) => setTimeout(resolve, waitTime));
};

const logFetch = async (url: string, options: any) => {
    elizaLogger.debug(`Fetching ${url}`);
    // Disabled to avoid disclosure of sensitive information such as API keys
    // elizaLogger.debug(JSON.stringify(options, null, 2));
    return fetch(url, options);
};

export function parseArguments(): {
    character?: string;
    characters?: string;
    testMediaTweet?: boolean;
} {
    try {
        return yargs(process.argv.slice(3))
            .option("character", {
                type: "string",
                description: "Path to the character JSON file",
            })
            .option("characters", {
                type: "string",
                description:
                    "Comma separated list of paths to character JSON files",
            })
            .option("test-media-tweet", {
                type: "boolean",
                description: "Post a test media tweet on startup",
                default: false,
            })
            .parseSync();
    } catch (error) {
        console.error("Error parsing arguments:", error);
        return {};
    }
}

function tryLoadFile(filePath: string): string | null {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch (e) {
        return null;
    }
}
function mergeCharacters(base: Character, child: Character): Character {
    const mergeObjects = (baseObj: any, childObj: any) => {
        const result: any = {};
        const keys = new Set([
            ...Object.keys(baseObj || {}),
            ...Object.keys(childObj || {}),
        ]);
        keys.forEach((key) => {
            if (
                typeof baseObj[key] === "object" &&
                typeof childObj[key] === "object" &&
                !Array.isArray(baseObj[key]) &&
                !Array.isArray(childObj[key])
            ) {
                result[key] = mergeObjects(baseObj[key], childObj[key]);
            } else if (
                Array.isArray(baseObj[key]) ||
                Array.isArray(childObj[key])
            ) {
                result[key] = [
                    ...(baseObj[key] || []),
                    ...(childObj[key] || []),
                ];
            } else {
                result[key] =
                    childObj[key] !== undefined ? childObj[key] : baseObj[key];
            }
        });
        return result;
    };
    return mergeObjects(base, child);
}

async function loadCharactersFromUrl(url: string): Promise<Character[]> {
    try {
        const response = await fetch(url);
        const responseJson = await response.json();

        let characters: Character[] = [];
        if (Array.isArray(responseJson)) {
            characters = await Promise.all(
                responseJson.map((character) => jsonToCharacter(url, character))
            );
        } else {
            const character = await jsonToCharacter(url, responseJson);
            characters.push(character);
        }
        return characters;
    } catch (e) {
        console.error(`Error loading character(s) from ${url}: `, e);
        process.exit(1);
    }
}

async function jsonToCharacter(
    filePath: string,
    character: any
): Promise<Character> {
    validateCharacterConfig(character);

    // .id isn't really valid
    const characterId = character.id || character.name;
    const characterPrefix = `CHARACTER.${characterId
        .toUpperCase()
        .replace(/ /g, "_")}.`;
    const characterSettings = Object.entries(process.env)
        .filter(([key]) => key.startsWith(characterPrefix))
        .reduce((settings, [key, value]) => {
            const settingKey = key.slice(characterPrefix.length);
            return { ...settings, [settingKey]: value };
        }, {});
    if (Object.keys(characterSettings).length > 0) {
        character.settings = character.settings || {};
        character.settings.secrets = {
            ...characterSettings,
            ...character.settings.secrets,
        };
    }
    // Handle plugins
    character.plugins = await handlePluginImporting(character.plugins);
    elizaLogger.info(character.name, 'loaded plugins:', "[\n    " + character.plugins.map((p: any) => `"${p.npmName}"`).join(", \n    ") + "\n]");

    // Handle Post Processors plugins
    if (character.postProcessors?.length > 0) {
        elizaLogger.info(character.name, 'loading postProcessors', character.postProcessors);
        character.postProcessors = await handlePluginImporting(character.postProcessors);
    }

    // Handle extends
    if (character.extends) {
        elizaLogger.info(
            `Merging  ${character.name} character with parent characters`
        );
        for (const extendPath of character.extends) {
            const baseCharacter = await loadCharacter(
                path.resolve(path.dirname(filePath), extendPath)
            );
            character = mergeCharacters(baseCharacter, character);
            elizaLogger.info(
                `Merged ${character.name} with ${baseCharacter.name}`
            );
        }
    }
    return character;
}

async function loadCharacter(filePath: string): Promise<Character> {
    const content = tryLoadFile(filePath);
    if (!content) {
        throw new Error(`Character file not found: ${filePath}`);
    }
    const character = JSON5.parse(content);
    return jsonToCharacter(filePath, character);
}

async function loadCharacterTryPath(characterPath: string): Promise<Character> {
    let content: string | null = null;
    let resolvedPath = "";

    // Try different path resolutions in order
    const pathsToTry = [
        characterPath, // exact path as specified
        path.resolve(process.cwd(), characterPath), // relative to cwd
        path.resolve(process.cwd(), "agent", characterPath), // Add this
        path.resolve(__dirname, characterPath), // relative to current script
        path.resolve(__dirname, "characters", path.basename(characterPath)), // relative to agent/characters
        path.resolve(__dirname, "../characters", path.basename(characterPath)), // relative to characters dir from agent
        path.resolve(
            __dirname,
            "../../characters",
            path.basename(characterPath)
        ), // relative to project root characters dir
    ];

    elizaLogger.debug(
        "Trying paths:",
        pathsToTry.map((p) => ({
            path: p,
            exists: fs.existsSync(p),
        }))
    );

    for (const tryPath of pathsToTry) {
        content = tryLoadFile(tryPath);
        if (content !== null) {
            resolvedPath = tryPath;
            break;
        }
    }

    if (content === null) {
        elizaLogger.error(
            `Error loading character from ${characterPath}: File not found in any of the expected locations`
        );
        elizaLogger.error("Tried the following paths:");
        pathsToTry.forEach((p) => elizaLogger.error(` - ${p}`));
        throw new Error(
            `Error loading character from ${characterPath}: File not found in any of the expected locations`
        );
    }
    try {
        const character: Character = await loadCharacter(resolvedPath);
        elizaLogger.success(`Successfully loaded character from: ${resolvedPath}`);
        return character;
    } catch (e) {
        console.error(`Error parsing character from ${resolvedPath}: `, e);
        throw new Error(`Error parsing character from ${resolvedPath}: ${e}`);
    }
}

function commaSeparatedStringToArray(commaSeparated: string): string[] {
    return commaSeparated?.split(",").map((value) => value.trim());
}

async function readCharactersFromStorage(
    characterPaths: string[]
): Promise<string[]> {
    try {
        const uploadDir = path.join(process.cwd(), "data", "characters");
        await fs.promises.mkdir(uploadDir, { recursive: true });
        const fileNames = await fs.promises.readdir(uploadDir);
        fileNames.forEach((fileName) => {
            characterPaths.push(path.join(uploadDir, fileName));
        });
    } catch (err) {
        elizaLogger.error(`Error reading directory: ${err.message}`);
    }

    return characterPaths;
}

export async function loadCharacters(
    charactersArg: string
): Promise<Character[]> {
    let characterPaths = commaSeparatedStringToArray(charactersArg);

    if (process.env.USE_CHARACTER_STORAGE === "true") {
        characterPaths = await readCharactersFromStorage(characterPaths);
    }

    const loadedCharacters: Character[] = [];

    if (characterPaths?.length > 0) {
        for (const characterPath of characterPaths) {
            try {
                const character: Character = await loadCharacterTryPath(
                    characterPath
                );
                loadedCharacters.push(character);
            } catch (e) {
                process.exit(1);
            }
        }
    }

    if (hasValidRemoteUrls()) {
        elizaLogger.info("Loading characters from remote URLs");
        const characterUrls = commaSeparatedStringToArray(
            process.env.REMOTE_CHARACTER_URLS
        );
        for (const characterUrl of characterUrls) {
            const characters = await loadCharactersFromUrl(characterUrl);
            loadedCharacters.push(...characters);
        }
    }

    if (loadedCharacters.length === 0) {
        elizaLogger.info("No characters found, using default character");
        loadedCharacters.push(defaultCharacter);
    }

    return loadedCharacters;
}

async function handlePluginImporting(plugins: string[]) {
    if (plugins.length > 0) {
        // this logging should happen before calling, so we can include important context
        //elizaLogger.info("Plugins are: ", plugins);
        const importedPlugins = await Promise.all(
            plugins.map(async (plugin) => {
                try {
                    const importedPlugin:Plugin = await import(plugin);
                    const functionName =
                        plugin
                            .replace("@elizaos/plugin-", "")
                            .replace("@elizaos-plugins/plugin-", "")
                            .replace(/-./g, (x) => x[1].toUpperCase()) +
                        "Plugin"; // Assumes plugin function is camelCased with Plugin suffix
                    if (!importedPlugin[functionName] && !(importedPlugin as any).default) {
                      elizaLogger.warn(plugin, 'does not have an default export or', functionName)
                    }
                    return {...(
                        (importedPlugin as any).default || importedPlugin[functionName]
                    ), npmName: plugin };
                } catch (importError) {
                    console.error(
                        `Failed to import plugin: ${plugin}`,
                        importError
                    );
                    return false; // Return null for failed imports
                }
            })
        )
        // remove plugins that failed to load, so agent can try to start
        return importedPlugins.filter(p => !!p);
    } else {
        return [];
    }
}

export function getTokenForProvider(
    provider: ModelProviderName,
    character: Character
): string | undefined {
    switch (provider) {
        // no key needed for llama_local, ollama, lmstudio, gaianet or bedrock
        case ModelProviderName.LLAMALOCAL:
            return "";
        case ModelProviderName.OLLAMA:
            return "";
        case ModelProviderName.LMSTUDIO:
            return "";
        case ModelProviderName.GAIANET:
            return (
                character.settings?.secrets?.GAIA_API_KEY ||
                settings.GAIA_API_KEY
            );
        case ModelProviderName.BEDROCK:
            return "";
        case ModelProviderName.OPENAI:
            return (
                character.settings?.secrets?.OPENAI_API_KEY ||
                settings.OPENAI_API_KEY
            );
        case ModelProviderName.ETERNALAI:
            return (
                character.settings?.secrets?.ETERNALAI_API_KEY ||
                settings.ETERNALAI_API_KEY
            );
        case ModelProviderName.NINETEEN_AI:
            return (
                character.settings?.secrets?.NINETEEN_AI_API_KEY ||
                settings.NINETEEN_AI_API_KEY
            );
        case ModelProviderName.LLAMACLOUD:
        case ModelProviderName.TOGETHER:
            return (
                character.settings?.secrets?.LLAMACLOUD_API_KEY ||
                settings.LLAMACLOUD_API_KEY ||
                character.settings?.secrets?.TOGETHER_API_KEY ||
                settings.TOGETHER_API_KEY ||
                character.settings?.secrets?.OPENAI_API_KEY ||
                settings.OPENAI_API_KEY
            );
        case ModelProviderName.CLAUDE_VERTEX:
        case ModelProviderName.ANTHROPIC:
            return (
                character.settings?.secrets?.ANTHROPIC_API_KEY ||
                character.settings?.secrets?.CLAUDE_API_KEY ||
                settings.ANTHROPIC_API_KEY ||
                settings.CLAUDE_API_KEY
            );
        case ModelProviderName.REDPILL:
            return (
                character.settings?.secrets?.REDPILL_API_KEY ||
                settings.REDPILL_API_KEY
            );
        case ModelProviderName.OPENROUTER:
            return (
                character.settings?.secrets?.OPENROUTER_API_KEY ||
                settings.OPENROUTER_API_KEY
            );
        case ModelProviderName.GROK:
            return (
                character.settings?.secrets?.GROK_API_KEY ||
                settings.GROK_API_KEY
            );
        case ModelProviderName.HEURIST:
            return (
                character.settings?.secrets?.HEURIST_API_KEY ||
                settings.HEURIST_API_KEY
            );
        case ModelProviderName.GROQ:
            return (
                character.settings?.secrets?.GROQ_API_KEY ||
                settings.GROQ_API_KEY
            );
        case ModelProviderName.GALADRIEL:
            return (
                character.settings?.secrets?.GALADRIEL_API_KEY ||
                settings.GALADRIEL_API_KEY
            );
        case ModelProviderName.FAL:
            return (
                character.settings?.secrets?.FAL_API_KEY || settings.FAL_API_KEY
            );
        case ModelProviderName.ALI_BAILIAN:
            return (
                character.settings?.secrets?.ALI_BAILIAN_API_KEY ||
                settings.ALI_BAILIAN_API_KEY
            );
        case ModelProviderName.VOLENGINE:
            return (
                character.settings?.secrets?.VOLENGINE_API_KEY ||
                settings.VOLENGINE_API_KEY
            );
        case ModelProviderName.NANOGPT:
            return (
                character.settings?.secrets?.NANOGPT_API_KEY ||
                settings.NANOGPT_API_KEY
            );
        case ModelProviderName.HYPERBOLIC:
            return (
                character.settings?.secrets?.HYPERBOLIC_API_KEY ||
                settings.HYPERBOLIC_API_KEY
            );

        case ModelProviderName.VENICE:
            return (
                character.settings?.secrets?.VENICE_API_KEY ||
                settings.VENICE_API_KEY
            );
        case ModelProviderName.ATOMA:
            return (
                character.settings?.secrets?.ATOMASDK_BEARER_AUTH ||
                settings.ATOMASDK_BEARER_AUTH
            );
        case ModelProviderName.NVIDIA:
            return (
                character.settings?.secrets?.NVIDIA_API_KEY ||
                settings.NVIDIA_API_KEY
            );
        case ModelProviderName.AKASH_CHAT_API:
            return (
                character.settings?.secrets?.AKASH_CHAT_API_KEY ||
                settings.AKASH_CHAT_API_KEY
            );
        case ModelProviderName.GOOGLE:
            return (
                character.settings?.secrets?.GOOGLE_GENERATIVE_AI_API_KEY ||
                settings.GOOGLE_GENERATIVE_AI_API_KEY
            );
        case ModelProviderName.MISTRAL:
            return (
                character.settings?.secrets?.MISTRAL_API_KEY ||
                settings.MISTRAL_API_KEY
            );
        case ModelProviderName.LETZAI:
            return (
                character.settings?.secrets?.LETZAI_API_KEY ||
                settings.LETZAI_API_KEY
            );
        case ModelProviderName.INFERA:
            return (
                character.settings?.secrets?.INFERA_API_KEY ||
                settings.INFERA_API_KEY
            );
        case ModelProviderName.DEEPSEEK:
            return (
                character.settings?.secrets?.DEEPSEEK_API_KEY ||
                settings.DEEPSEEK_API_KEY
            );
        case ModelProviderName.LIVEPEER:
            return (
                character.settings?.secrets?.LIVEPEER_GATEWAY_URL ||
                settings.LIVEPEER_GATEWAY_URL
            );
        case ModelProviderName.SECRETAI:
            return (
                character.settings?.secrets?.SECRET_AI_API_KEY ||
                settings.SECRET_AI_API_KEY
            );
        case ModelProviderName.NEARAI:
            try {
                const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.nearai/config.json'), 'utf8'));
                return JSON.stringify(config?.auth);
            } catch (e) {
                elizaLogger.warn(`Error loading NEAR AI config: ${e}`);
            }
            return (
                character.settings?.secrets?.NEARAI_API_KEY ||
                settings.NEARAI_API_KEY
            );

        default:
            const errorMessage = `Failed to get token - unsupported model provider: ${provider}`;
            elizaLogger.error(errorMessage);
            throw new Error(errorMessage);
    }
}

// also adds plugins from character file into the runtime
export async function initializeClients(
    character: Character,
    runtime: IAgentRuntime
): Promise<ClientInstance[]> {
    // each client can only register once
    // and if we want two we can explicitly support it
    const clientsList: ClientInstance[] = [];

    // Check if Twitter client is needed based on character configuration
    // Check if Twitter client is needed based on character plugins
    const hasTwitterPlugin = character.plugins?.some((plugin: any) =>
        typeof plugin === 'string' && plugin.includes('client-twitter'));

    // Create client types array based on plugins
    const clientTypes: string[] = [];
    if (hasTwitterPlugin) {
        clientTypes.push('twitter');
    }

    elizaLogger.info(`Using client types: ${clientTypes.join(', ') || 'none'}`);



    if (clientTypes.includes("twitter")) {
        try {
            // Dynamically import the Twitter client plugin
            if (!twitterPlugin) {
                try {
                    elizaLogger.info('Importing Twitter client plugin...');
                    const TwitterModule = await import('@elizaos-plugins/client-twitter');
                    twitterPlugin = TwitterModule.default || TwitterModule;
                    elizaLogger.info('Twitter client plugin loaded successfully');
                } catch (importError) {
                    elizaLogger.error(`Error importing Twitter client plugin: ${importError.message}`);
                    return clientsList;
                }
            }

            // Check if the plugin has clients array
            if (!twitterPlugin || !twitterPlugin.clients || !Array.isArray(twitterPlugin.clients)) {
                elizaLogger.error('Twitter plugin does not have a valid clients array');
                return clientsList;
            }

            elizaLogger.info(`Twitter plugin found with ${twitterPlugin.clients.length} clients`);

            // Initialize each Twitter client from the plugin
            for (const clientDef of twitterPlugin.clients) {
                try {
                    if (typeof clientDef.start !== 'function') {
                        elizaLogger.error('Twitter client does not have a start method');
                        continue;
                    }

                    // Configure Twitter search if enabled in environment variables
                    if (process.env.TWITTER_SEARCH_ENABLE && typeof clientDef.enableSearch !== 'undefined') {
                        clientDef.enableSearch = process.env.TWITTER_SEARCH_ENABLE !== 'false';
                        elizaLogger.info(`Twitter search ${clientDef.enableSearch ? 'enabled' : 'disabled'}`);
                    }

                    // Start the Twitter client
                    elizaLogger.info('Starting Twitter client...');
                    const twitterClient = await clientDef.start(runtime);

                    if (twitterClient) {
                        // Add client to the list
                        clientsList.push(twitterClient);
                        elizaLogger.info('Twitter client initialized successfully');

                        // Register tweet action
                        if (twitterClient.postTweet && runtime.registerAction) {
                            // Define the tweet handler function
                            const tweetHandler = async (rt: any, action: any, _context: any) => {
                                try {
                                    let tweetContent = action.content || action.text || '';
                                    const needsContent = !tweetContent && !action.generateContent;
                                    if (needsContent) {
                                        return { success: false, error: 'No content provided for tweet and generateContent is not enabled' };
                                    }

                                    // We don't need to check for database connection, as we'll let the system handle it naturally

                                    // Check if we should use media from the images folder if no specific path is provided
                                    if (!action.mediaPath && !action.noMedia) {
                                        try {
                                            const fs = await import('fs/promises');
                                            const path = await import('path');
                                            const defaultImagesPath = path.join(process.cwd(), '..', 'images');

                                            // Check if the default images folder exists
                                            try {
                                                await fs.access(defaultImagesPath);
                                                const stats = await fs.stat(defaultImagesPath);

                                                if (stats.isDirectory()) {
                                                    elizaLogger.info(`No media path provided, using default images folder: ${defaultImagesPath}`);
                                                    action.mediaPath = defaultImagesPath;
                                                }
                                            } catch (accessError) {
                                                elizaLogger.debug(`Default images folder not accessible: ${accessError.message}`);
                                            }
                                        } catch (error) {
                                            elizaLogger.debug(`Error checking default images folder: ${error.message}`);
                                        }
                                    }

                                    // Check if media is provided
                                    let mediaData = null;
                                    let selectedImagePath = null;
                                    let imageDescription = null;

                                    if (action.mediaPath) {
                                        try {
                                            const fs = await import('fs/promises');
                                            const path = await import('path');

                                            // If mediaPath is a directory, get a random image from it
                                            const stats = await fs.stat(action.mediaPath);

                                            if (stats.isDirectory()) {
                                                elizaLogger.info(`Looking for images in directory: ${action.mediaPath}`);
                                                const files = await fs.readdir(action.mediaPath);
                                                const imageFiles = files.filter(file => {
                                                    const ext = path.extname(file).toLowerCase();
                                                    return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
                                                });

                                                if (imageFiles.length > 0) {
                                                    // Select a random image from the directory
                                                    const randomImage = imageFiles[Math.floor(Math.random() * imageFiles.length)];
                                                    selectedImagePath = path.join(action.mediaPath, randomImage);
                                                    elizaLogger.info(`Selected image: ${selectedImagePath}`);

                                                    // Read the image file
                                                    const imageBuffer = await fs.readFile(selectedImagePath);
                                                    const imageType = path.extname(selectedImagePath).substring(1);

                                                    // Create media data object
                                                    mediaData = [{
                                                        data: imageBuffer,
                                                        mediaType: `image/${imageType === 'jpg' ? 'jpeg' : imageType}`
                                                    }];
                                                }
                                            } else if (stats.isFile()) {
                                                // It's a single file
                                                const ext = path.extname(action.mediaPath).toLowerCase();
                                                if (['.jpg','.jpeg','.png','.gif'].includes(ext)) {
                                                    selectedImagePath = action.mediaPath;
                                                    const imageBuffer = await fs.readFile(selectedImagePath);
                                                    const imageType = ext.substring(1);

                                                    // Create media data object
                                                    mediaData = [{
                                                        data: imageBuffer,
                                                        mediaType: `image/${imageType === 'jpg' ? 'jpeg' : imageType}`
                                                    }];
                                                }
                                            }

                                            // If we have an image, use the provider to describe it
                                            if (selectedImagePath && rt.provider) {
                                                try {
                                                    // Get image description from LLM with character context
                                                    const description = await rt.provider.describeImage({
                                                        imagePath: selectedImagePath,
                                                        context: {
                                                            character: rt.character,
                                                            styleGuide: rt.character?.styleGuide,
                                                            messageExamples: rt.character?.messageExamples
                                                        }
                                                    });
                                                    imageDescription = description || `Check out this image! ${selectedImagePath}`;
                                                } catch (error) {
                                                    elizaLogger.warn(`Image description failed: ${error.message}`);
                                                    imageDescription = `Check out this image! ${selectedImagePath}`;
                                                }
                                            }

                                            // If we have an image description and no specific content was provided,
                                            // generate tweet content based on the image and character's personality
                                            if ((imageDescription || selectedImagePath) && (!tweetContent || action.generateContent)) {
                                                const character = rt.character || {};
                                                const prompt = `
                                                    You are ${character.name || 'a social media user'}, with the following persona:
                                                    ${character.persona || 'A friendly and engaging social media user.'}

                                                    Create a short, engaging tweet (max 280 characters) about an image ${imageDescription ? 'described as: ' + JSON.stringify(imageDescription) : 'I am about to share'}.
                                                    ${tweetContent ? 'Use the following as inspiration: ' + tweetContent : ''}

                                                    The tweet should reflect your unique personality and voice.
                                                    Do not use hashtags unless they're very relevant.
                                                    Do not include quotes or any formatting in your response.
                                                    Just provide the exact text for the tweet.
                                                `;

                                                elizaLogger.info('Generating tweet content based on image and character personality');
                                                const generatedContent = await rt.provider.complete(prompt, {
                                                    max_tokens: 280,
                                                    temperature: 0.7
                                                });

                                                if (generatedContent && generatedContent.trim()) {
                                                    tweetContent = generatedContent.trim();
                                                    elizaLogger.info(`Generated tweet content: ${tweetContent}`);
                                                }
                                            }
                                        } catch (descriptionError: any) {
                                            elizaLogger.error(`Error getting image description: ${descriptionError.message}`);
                                        }
                                    }

                                    // Post tweet with or without media
                                    let result: any;
                                    if (mediaData) {
                                        // Create attachments object for the Twitter client
                                        const attachments = mediaData.map((media: any) => ({
                                            data: media.data,
                                            contentType: media.mediaType
                                        }));

                                        // Post tweet with media
                                        elizaLogger.info(`Posting tweet with media: ${tweetContent}`);
                                        result = await twitterClient.postTweet({
                                            text: tweetContent,
                                            attachments: attachments
                                        });
                                    } else {
                                        // Post tweet without media
                                        elizaLogger.info(`Posting tweet without media: ${tweetContent}`);
                                        result = await twitterClient.postTweet(tweetContent);
                                    }

                                    return { success: true, result };
                                } catch (error: any) {
                                    // Improved error logging with more details
                                    const errorMessage = error.message || 'Unknown error';
                                    const errorCode = error.code || 'UNKNOWN';
                                    const errorStack = error.stack || '';

                                    elizaLogger.error(`Error posting tweet: ${errorMessage} (Code: ${errorCode})`);
                                    // We're not handling database-specific errors, letting the system use its configured database

                                    // Only log stack trace in debug mode to avoid cluttering logs
                                    elizaLogger.debug(`Error stack trace: ${errorStack}`);

                                    return {
                                        success: false,
                                        error: errorMessage,
                                        code: errorCode
                                    };
                                }
                            };

                            // Register the action with the runtime
                            runtime.registerAction({
                                name: 'tweet',
                                handler: tweetHandler,
                                description: 'Post a tweet, optionally with media',
                                similes: ['post', 'send tweet', 'publish tweet', 'tweet with image', 'share photo'],
                                examples: [
                                    [
                                        {
                                            user: 'user',
                                            content: {
                                                text: 'Can you tweet something cheerful for me?',
                                                action: 'tweet'
                                            }
                                        }
                                    ],
                                    [
                                        {
                                            user: 'user',
                                            content: {
                                                text: 'Post a tweet saying "Having a wonderful day!"',
                                                action: 'tweet'
                                            }
                                        }
                                    ],
                                    [
                                        {
                                            user: 'user',
                                            content: {
                                                text: 'Share this sunset photo with the caption "Nature\'s beauty"',
                                                action: 'tweet_with_media',
                                                mediaPath: '/path/to/image.jpg'
                                            }
                                        }
                                    ]
                                ] as ActionExample[][],
                                validate: async (action: any) => {
                                    // Allow tweets with generateContent enabled even without specific content
                                    const hasContentOrGenerateOption = (action.content || action.text || action.generateContent);
                                    if (!hasContentOrGenerateOption) {
                                        return false;
                                    }

                                    // If mediaPath is provided, validate that it exists
                                    if (action.mediaPath) {
                                        try {
                                            const fs = await import('fs/promises');
                                            await fs.access(action.mediaPath);
                                        } catch (error) {
                                            return false;
                                        }
                                    }

                                    return true;
                                }
                            });
                            elizaLogger.info('Tweet action registered successfully');
                        }
                    } else {
                        elizaLogger.warn('Twitter client start returned null or undefined');
                    }
                } catch (startError: any) {
                    elizaLogger.error(`Error starting Twitter client: ${startError.message}`);
                }
            }
        } catch (error) {
            elizaLogger.error(`Error initializing Twitter client: ${error.message}`);
        }
    }

    // Process plugins with clients
    if (character.plugins?.length > 0) {
        for (const plugin of character.plugins) {
            if (typeof plugin !== 'string' && plugin.clients) {
                for (const client of plugin.clients) {
                    try {
                        const startedClient = await client.start(runtime);
                        if (startedClient) {
                            clientsList.push(startedClient);
                        }
                    } catch (error) {
                        elizaLogger.error(`Error starting client from plugin: ${error.message}`);
                    }
                }
            }
        }
    }

    elizaLogger.log('Initialized clients:', clientsList.length);
    return clientsList;
}

export async function createAgent(
    character: Character,
    token: string
): Promise<AgentRuntime> {
    elizaLogger.log(`Creating runtime for character ${character.name}`);
    return new AgentRuntime({
        token,
        modelProvider: character.modelProvider,
        evaluators: [],
        character,
        // character.plugins are handled when clients are added
        plugins: [
            bootstrapPlugin,
        ]
            .flat()
            .filter(Boolean),
        providers: [],
        managers: [],
        fetch: logFetch,
    });
}

function initializeFsCache(baseDir: string, character: Character) {
    if (!character?.id) {
        throw new Error(
            "initializeFsCache requires id to be set in character definition"
        );
    }
    const cacheDir = path.resolve(baseDir, character.id, "cache");

    const cache = new CacheManager(new FsCacheAdapter(cacheDir));
    return cache;
}

function initializeDbCache(character: Character, db: IDatabaseCacheAdapter) {
    if (!character?.id) {
        throw new Error(
            "initializeFsCache requires id to be set in character definition"
        );
    }
    const cache = new CacheManager(new DbCacheAdapter(db, character.id));
    return cache;
}

function initializeCache(
    cacheStore: string,
    character: Character,
    baseDir?: string,
    db?: IDatabaseCacheAdapter
) {
    switch (cacheStore) {
        // case CacheStore.REDIS:
        //     if (process.env.REDIS_URL) {
        //         elizaLogger.info("Connecting to Redis...");
        //         const redisClient = new RedisClient(process.env.REDIS_URL);
        //         if (!character?.id) {
        //             throw new Error(
        //                 "CacheStore.REDIS requires id to be set in character definition"
        //             );
        //         }
        //         return new CacheManager(
        //             new DbCacheAdapter(redisClient, character.id) // Using DbCacheAdapter since RedisClient also implements IDatabaseCacheAdapter
        //         );
        //     } else {
        //         throw new Error("REDIS_URL environment variable is not set.");
        //     }

        case CacheStore.DATABASE:
            if (db) {
                elizaLogger.info("Using Database Cache...");
                return initializeDbCache(character, db);
            } else {
                throw new Error(
                    "Database adapter is not provided for CacheStore.Database."
                );
            }

        case CacheStore.FILESYSTEM:
            elizaLogger.info("Using File System Cache...");
            if (!baseDir) {
                throw new Error(
                    "baseDir must be provided for CacheStore.FILESYSTEM."
                );
            }
            return initializeFsCache(baseDir, character);

        default:
            throw new Error(
                `Invalid cache store: ${cacheStore} or required configuration missing.`
            );
    }
}

async function findDatabaseAdapter(runtime: AgentRuntime): Promise<IDatabaseAdapter & IDatabaseCacheAdapter> {
  const { adapters } = runtime;
  let adapter: Adapter | undefined;

  elizaLogger.debug('Available database adapters:', adapters.map(a => a.constructor.name));

  // if not found, default to sqlite
  if (adapters.length === 0) {
    elizaLogger.info('No database adapters found, defaulting to SQLite');
    try {
      const sqliteAdapterPlugin = await import('@elizaos-plugins/adapter-sqlite');
      const sqliteAdapterPluginDefault = sqliteAdapterPlugin.default;
      adapter = sqliteAdapterPluginDefault.adapters[0];
      if (!adapter) {
        throw new Error("Internal error: No database adapter found for default adapter-sqlite");
      }
    } catch (error) {
      elizaLogger.error('SQLite adapter initialization failed:', error);
      throw error;
    }
  } else if (adapters.length === 1) {
    adapter = adapters[0];
  } else {
    throw new Error("Multiple database adapters found. You must have no more than one. Adjust your plugins configuration.");
  }

  try {
    const adapterInterface = adapter?.init(runtime);
    elizaLogger.debug('Database adapter initialized successfully');
    return adapterInterface;
  } catch (error) {
    elizaLogger.error('Database adapter initialization failed:', error);
    throw error;
  }
}

async function startAgent(
    character: Character,
    directClient: DirectClient
): Promise<AgentRuntime> {
    let db: IDatabaseAdapter & IDatabaseCacheAdapter;
    try {
        character.id ??= stringToUuid(character.name);
        character.username ??= character.name;

        const token = getTokenForProvider(character.modelProvider, character);

        const runtime: AgentRuntime = await createAgent(
            character,
            token
        );

        // initialize database
        db = await findDatabaseAdapter(runtime);
        runtime.databaseAdapter = db;

        // initialize cache
        const cache = initializeCache(
            process.env.CACHE_STORE ?? CacheStore.DATABASE,
            character,
            process.env.CACHE_DIR ?? "",
            db
        );
        runtime.cacheManager = cache;

        // Initialize RAG Knowledge Manager if database adapter is available
        if (db) {
            try {
                const ragManager = new RAGKnowledgeManager({
                    tableName: 'knowledge',
                    runtime,
                    knowledgeRoot: path.resolve('./data/knowledge')
                });

                // Store the knowledge manager in a custom property
                runtime.ragKnowledgeManager = ragManager;

                // Load knowledge if ragKnowledge is enabled in character settings
                if (character.settings?.ragKnowledge) {
                    elizaLogger.info(`Loading RAG knowledge for ${character.name}...`);
                    try {
                        // Import modules
                        const fs = await import('fs/promises');
                        const fsSync = await import('fs');
                        const path = await import('path');

                        // Create knowledge directory if it doesn't exist
                        const knowledgeDir = path.resolve('./data/knowledge');
                        if (!fsSync.existsSync(knowledgeDir)) {
                            await fs.mkdir(knowledgeDir, { recursive: true });
                            elizaLogger.info(`Created knowledge directory at ${knowledgeDir}`);
                        }

                        // Process knowledge files from directory

                        // Get all files in the knowledge directory
                        const files = await fs.readdir(knowledgeDir);

                        // Process each file
                        for (const file of files) {
                            const filePath = path.join(knowledgeDir, file);
                            const fileStats = await fs.stat(filePath);

                            // Skip directories
                            if (fileStats.isDirectory()) continue;

                            // Get file extension
                            const fileExt = path.extname(file).toLowerCase().substring(1);

                            // Only process supported file types
                            if (['md', 'txt', 'json'].includes(fileExt)) {
                                try {
                                    // Read file content
                                    const content = await fs.readFile(filePath, 'utf8');

                                    // Process the file
                                    await ragManager.processFile({
                                        path: file,
                                        content: content,
                                        type: fileExt as 'md' | 'txt' | 'pdf',
                                        isShared: false
                                    });

                                    elizaLogger.info(`Processed knowledge file: ${file}`);
                                } catch (fileError) {
                                    elizaLogger.error(`Error processing knowledge file ${file}: ${fileError.message}`);
                                }
                            }
                        }
                        elizaLogger.info(`RAG knowledge loaded successfully for ${character.name}`);
                    } catch (loadError) {
                        elizaLogger.error(`Error loading RAG knowledge: ${loadError}`);
                    }
                }

                elizaLogger.info(`RAG Knowledge Manager initialized for ${character.name}`);
            } catch (error) {
                elizaLogger.error(`Error initializing RAG Knowledge Manager: ${error}`);
            }
        }

        // start services/plugins/process knowledge
        await runtime.initialize();

        // start assigned clients
        runtime.clients = await initializeClients(character, runtime);

        // Register Twitter actions if Twitter client is available
        const twitterClient = runtime.clients.find(client =>
            client && typeof client === 'object' && 'postTweet' in client
        );

        // Set up automatic tweet scheduling if enabled
        if (twitterClient && process.env.ENABLE_TWITTER_POST_GENERATION === 'true') {
            const minInterval = parseInt(process.env.POST_INTERVAL_MIN || '90', 10) * 60 * 1000; // Default 90 minutes
            const maxInterval = parseInt(process.env.POST_INTERVAL_MAX || '180', 10) * 60 * 1000; // Default 180 minutes

            elizaLogger.info(`Setting up automatic tweet scheduling (${minInterval/60000}-${maxInterval/60000} minutes interval)`);

            // Function to post a tweet automatically
            const postAutomaticTweet = async () => {
                try {
                    // Check if we should post with media based on last tweet
                    let useMedia = true;

                    // Use the global variable to determine if the last tweet had media
                    if (typeof global.lastTweetWasMedia !== 'undefined') {
                        // If the last tweet had media, post a text-only tweet
                        useMedia = !global.lastTweetWasMedia;
                        elizaLogger.info(`Last tweet ${useMedia ? 'was text-only' : 'had media'}, so this automatic tweet will ${useMedia ? 'include media' : 'be text-only'}`);
                    } else {
                        elizaLogger.info('No previous tweet type recorded, defaulting to media tweet');
                    }

                    if (useMedia) {
                        // Post with media
                        elizaLogger.info('Posting automatic tweet with media');

                        // Import modules
                        const fs = await import('fs/promises');
                        const fsSync = await import('fs');
                        const path = await import('path');

                        // Get media folder
                        const mediaFolder = path.join(process.cwd(), 'eliza', 'media');

                        if (fsSync.existsSync(mediaFolder)) {
                            // Get all image files
                            const files = await fs.readdir(mediaFolder);
                            const imageFiles = files.filter(file => {
                                const ext = path.extname(file).toLowerCase();
                                return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
                            });

                            if (imageFiles.length > 0) {
                                // Select a random image
                                const randomImage = imageFiles[Math.floor(Math.random() * imageFiles.length)];
                                const imagePath = path.join(mediaFolder, randomImage);

                                // Generate tweet content with the image
                                const character = (runtime.character || {}) as any;
                                let description = 'an interesting image';

                                // Try to get image description using vision model if available
                                // Try to use the provider for image captioning
                                if (runtime.providers && runtime.providers.length > 0 && typeof (runtime.providers[0] as any).generateImageCaption === 'function') {
                                    try {
                                        description = await (runtime.providers[0] as any).generateImageCaption({
                                            imagePath: imagePath,
                                            prompt: `Describe this image in detail as ${character.name || 'a social media user'} with the following persona: ${character.persona || 'A friendly and engaging social media user.'}`
                                        }) || description;
                                    } catch (descError) {
                                        elizaLogger.warn(`Error getting image description: ${descError.message}`);
                                    }
                                }

                                // Generate tweet text
                                const prompt = `
                                    You are ${character.name || 'a social media user'}, with the following persona:
                                    ${character.persona || 'A friendly and engaging social media user.'}

                                    Create a short, engaging tweet (max 280 characters) about an image described as: ${JSON.stringify(description)}.

                                    The tweet should reflect your unique personality and voice.
                                    Do not use hashtags unless they're very relevant.
                                    Do not include quotes or any formatting in your response.
                                    Just provide the exact text for the tweet.
                                `;

                                const tweetText = await (runtime.providers[0] as any).complete(prompt, {
                                    max_tokens: 280,
                                    temperature: 0.7
                                });

                                // Read the image file
                                const imageBuffer = await fs.readFile(imagePath);
                                const imageType = path.extname(imagePath).substring(1);

                                // Create media data object
                                const mediaData = [{
                                    data: imageBuffer,
                                    mediaType: `image/${imageType === 'jpg' ? 'jpeg' : imageType}`
                                }];

                                // Create attachments for the Twitter client
                                const attachments = mediaData.map((media: any) => ({
                                    data: media.data,
                                    contentType: media.mediaType
                                }));

                                // Post tweet with media
                                elizaLogger.info(`Posting automatic tweet with media: ${tweetText}`);
                                await (twitterClient as any).postTweet({
                                    text: tweetText,
                                    attachments: attachments
                                });

                                // Update the global variable to track that this was a media tweet
                                global.lastTweetWasMedia = true;
                                elizaLogger.info('Automatic media tweet posted successfully');
                            } else {
                                elizaLogger.warn('No image files found in media folder, posting text-only tweet');
                                // Fall back to text-only tweet
                                useMedia = false;
                            }
                        } else {
                            elizaLogger.warn('Media folder not found, posting text-only tweet');
                            // Fall back to text-only tweet
                            useMedia = false;
                        }
                    }

                    if (!useMedia) {
                        // Post text-only tweet
                        elizaLogger.info('Posting automatic text-only tweet');

                        // Generate tweet text
                        const character = (runtime.character || {}) as any;
                        const prompt = `
                            You are ${character.name || 'a social media user'}, with the following persona:
                            ${character.persona || 'A friendly and engaging social media user.'}

                            Create a short, engaging tweet (max 280 characters) about something interesting, timely, or thought-provoking.
                            It could be an observation, a question, a quote, or a reflection.

                            The tweet should reflect your unique personality and voice.
                            Do not use hashtags unless they're very relevant.
                            Do not include quotes or any formatting in your response.
                            Just provide the exact text for the tweet.
                        `;

                        const tweetText = await (runtime.providers[0] as any).complete(prompt, {
                            max_tokens: 280,
                            temperature: 0.7
                        });

                        // Post tweet
                        elizaLogger.info(`Posting automatic text-only tweet: ${tweetText}`);
                        await (twitterClient as any).postTweet(tweetText);

                        // Update the global variable to track that this was a text-only tweet
                        global.lastTweetWasMedia = false;
                        elizaLogger.info('Automatic text-only tweet posted successfully');
                    }

                    // Schedule next tweet
                    const nextInterval = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
                    elizaLogger.info(`Next automatic tweet scheduled in ${nextInterval/60000} minutes`);
                    setTimeout(postAutomaticTweet, nextInterval);
                } catch (error) {
                    elizaLogger.error(`Error posting automatic tweet: ${error.message}`);
                    // Schedule next attempt even if this one failed
                    const retryInterval = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
                    elizaLogger.info(`Will retry automatic tweet in ${retryInterval/60000} minutes`);
                    setTimeout(postAutomaticTweet, retryInterval);
                }
            };

            // Start the automatic tweet posting if POST_IMMEDIATELY is true
            if (process.env.POST_IMMEDIATELY === 'true') {
                elizaLogger.info('Posting first automatic tweet immediately');
                postAutomaticTweet();
            } else {
                // Otherwise, schedule the first tweet after a random interval
                const initialInterval = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
                elizaLogger.info(`First automatic tweet scheduled in ${initialInterval/60000} minutes`);
                setTimeout(postAutomaticTweet, initialInterval);
            }
        }

        if (twitterClient) {
            elizaLogger.info('Twitter client found in runtime, registering actions');

            // Register tweet action if not already registered
            if (runtime.registerAction) {
                // Define the tweet handler function
                const tweetHandler = async (_rt: any, action: any, _context: any) => {
                    try {
                        const content = action.content || action.text || '';
                        if (!content) {
                            return { success: false, error: 'No content provided for tweet' };
                        }

                        // Check if we have a valid Twitter client with the right methods
                        if (!twitterClient || typeof (twitterClient as any).postTweet !== 'function') {
                            elizaLogger.error('Twitter client not properly configured');
                            return { success: false, error: 'Twitter client not properly configured' };
                        }

                        // Log the tweet being posted
                        elizaLogger.info(`Posting text-only tweet: ${content}`);

                        // Use type assertion to access postTweet method
                        const result = await (twitterClient as any).postTweet(content);

                        // Update the last tweet type in memory
                        try {
                            // Store a flag in a global variable to track the last tweet type
                            global.lastTweetWasMedia = false;
                            elizaLogger.info('Text-only tweet posted successfully');
                        } catch (memoryError) {
                            elizaLogger.warn(`Error updating tweet type memory: ${memoryError.message}`);
                        }

                        return { success: true, result };
                    } catch (error: any) {
                        elizaLogger.error(`Error posting tweet: ${error.message}`);
                        return { success: false, error: error.message };
                    }
                };

                // Register the action with the runtime
                runtime.registerAction({
                    name: 'tweet',
                    handler: tweetHandler,
                    description: 'Post a tweet',
                    similes: ['post', 'send tweet', 'publish tweet'],
                    examples: [
                        [
                            {
                                user: 'user',
                                content: {
                                    text: 'Can you tweet something cheerful for me?',
                                    action: 'tweet'
                                }
                            }
                        ],
                        [
                            {
                                user: 'user',
                                content: {
                                    text: 'Post a tweet saying "Having a wonderful day!"',
                                    action: 'tweet'
                                }
                            }
                        ],
                        [
                            {
                                user: 'user',
                                content: {
                                    text: 'Tweet with an image from the folder /path/to/images saying "Check out this cool photo"',
                                    action: 'tweet_with_media'
                                }
                            }
                        ]
                    ] as ActionExample[][],
                    validate: async (action: any) => !!action.content?.text
                });
                elizaLogger.info('Tweet action registered successfully');
            }

            // Register alternating media tweet action
            const mediaTweetHandler = async (rt: any, action: any, _context: any) => {
                try {
                    // Extract content from action
                    let tweetText = action.content?.text || action.text || '';
                    let mediaPath = action.content?.mediaPath || action.mediaPath;

                    // Check if we should use the default media folder if no path is provided
                    if (!mediaPath) {
                        try {
                            const fs = await import('fs/promises');
                            const path = await import('path');
                            const defaultImagesPath = path.join(process.cwd(), 'eliza', 'media');

                            // Check if the default media folder exists
                            try {
                                await fs.access(defaultImagesPath);
                                const stats = await fs.stat(defaultImagesPath);

                                if (stats.isDirectory()) {
                                    elizaLogger.info(`No media path provided, using default media folder: ${defaultImagesPath}`);
                                    mediaPath = defaultImagesPath;
                                }
                            } catch (accessError) {
                                elizaLogger.debug(`Default media folder not accessible: ${accessError.message}`);
                            }
                        } catch (error) {
                            elizaLogger.debug(`Error checking default media folder: ${error.message}`);
                        }
                    }

                    // Check if we have a valid Twitter client
                    if (!twitterClient || typeof (twitterClient as any).postTweet !== 'function') {
                        elizaLogger.error('Twitter client not properly configured');
                        return { success: false, error: 'Twitter client not properly configured' };
                    }

                    // Check if previous tweet was a text-only tweet using the global variable
                    // Default to true (post with media) if the variable is not set
                    let previousWasTextTweet = true;

                    // Check the global variable that tracks the last tweet type
                    if (typeof global.lastTweetWasMedia !== 'undefined') {
                        previousWasTextTweet = !global.lastTweetWasMedia;
                        elizaLogger.info(`Using global variable: Previous tweet was ${previousWasTextTweet ? 'text-only' : 'with media'}`);
                    } else {
                        elizaLogger.info('No previous tweet type recorded, defaulting to media tweet');
                    }

                    // If previous was text-only tweet, post with media
                    if (previousWasTextTweet && mediaPath) {
                        // Process media
                        let selectedImagePath = null;
                        let mediaData = null;

                        try {
                            const fs = await import('fs/promises');
                            const path = await import('path');

                            // Check if mediaPath is a directory or file
                            const stats = await fs.stat(mediaPath);

                            if (stats.isDirectory()) {
                                // Get all image files from directory
                                const files = await fs.readdir(mediaPath);
                                const imageFiles = files.filter(file => {
                                    const ext = path.extname(file).toLowerCase();
                                    return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
                                });

                                if (imageFiles.length > 0) {
                                    // Select a random image
                                    const randomImage = imageFiles[Math.floor(Math.random() * imageFiles.length)];
                                    selectedImagePath = path.join(mediaPath, randomImage);
                                    elizaLogger.info(`Selected image: ${selectedImagePath}`);

                                    // Read the image file
                                    const imageBuffer = await fs.readFile(selectedImagePath);
                                    const imageType = path.extname(selectedImagePath).substring(1);

                                    // Create media data object
                                    mediaData = [{
                                        data: imageBuffer,
                                        mediaType: `image/${imageType === 'jpg' ? 'jpeg' : imageType}`
                                    }];
                                } else {
                                    elizaLogger.warn(`No image files found in directory: ${mediaPath}`);
                                }
                            } else if (stats.isFile()) {
                                // It's a single file
                                const ext = path.extname(mediaPath).toLowerCase();
                                if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
                                    selectedImagePath = mediaPath;
                                    const imageBuffer = await fs.readFile(selectedImagePath);
                                    const imageType = ext.substring(1);

                                    // Create media data object
                                    mediaData = [{
                                        data: imageBuffer,
                                        mediaType: `image/${imageType === 'jpg' ? 'jpeg' : imageType}`
                                    }];
                                } else {
                                    elizaLogger.warn(`File is not a supported image type: ${mediaPath}`);
                                }
                            }

                            // If we have an image and the provider is available, generate a description
                            if (selectedImagePath && rt.provider) {
                                try {
                                    // Get image description from LLM
                                    const description = await rt.provider.describeImage({
                                        imagePath: selectedImagePath,
                                        context: {
                                            character: rt.character,
                                            styleGuide: rt.character?.styleGuide,
                                            messageExamples: rt.character?.messageExamples
                                        }
                                    });

                                    // If we don't have specific tweet text or generateContent is enabled, create tweet text
                                    if (!tweetText || action.generateContent) {
                                        const character = rt.character || {};

                                        // Enhanced prompt that uses the vision model if available
                                        let prompt: string;
                                        if (rt.provider && typeof rt.provider.generateImageCaption === 'function' && selectedImagePath) {
                                            try {
                                                // Try to use the vision model to generate a more detailed description
                                                const visionDescription = await rt.provider.generateImageCaption({
                                                    imagePath: selectedImagePath,
                                                    prompt: `Describe this image in detail as ${character.name || 'a social media user'} with the following persona: ${character.persona || 'A friendly and engaging social media user.'}`
                                                });

                                                // Use the vision-generated description for a better tweet
                                                prompt = `
                                                    You are ${character.name || 'a social media user'}, with the following persona:
                                                    ${character.persona || 'A friendly and engaging social media user.'}

                                                    Create a short, engaging tweet (max 280 characters) about this image: ${JSON.stringify(visionDescription || description || 'an interesting image')}.
                                                    ${tweetText ? 'Use the following as inspiration: ' + tweetText : ''}

                                                    The tweet should reflect your unique personality and voice.
                                                    Do not use hashtags unless they're very relevant.
                                                    Do not include quotes or any formatting in your response.
                                                    Just provide the exact text for the tweet.
                                                `;

                                                elizaLogger.info('Using vision model for enhanced image description');
                                            } catch (visionError) {
                                                elizaLogger.warn(`Vision model failed, falling back to standard description: ${visionError.message}`);
                                                // Fall back to standard prompt if vision model fails
                                                prompt = `
                                                    You are ${character.name || 'a social media user'}, with the following persona:
                                                    ${character.persona || 'A friendly and engaging social media user.'}

                                                    Create a short, engaging tweet (max 280 characters) about an image described as: ${JSON.stringify(description || 'an interesting image')}.
                                                    ${tweetText ? 'Use the following as inspiration: ' + tweetText : ''}

                                                    The tweet should reflect your unique personality and voice.
                                                    Do not use hashtags unless they're very relevant.
                                                    Do not include quotes or any formatting in your response.
                                                    Just provide the exact text for the tweet.
                                                `;
                                            }
                                        } else {
                                            // Standard prompt if vision model is not available
                                            prompt = `
                                                You are ${character.name || 'a social media user'}, with the following persona:
                                                ${character.persona || 'A friendly and engaging social media user.'}

                                                Create a short, engaging tweet (max 280 characters) about an image described as: ${JSON.stringify(description || 'an interesting image')}.
                                                ${tweetText ? 'Use the following as inspiration: ' + tweetText : ''}

                                                The tweet should reflect your unique personality and voice.
                                                Do not use hashtags unless they're very relevant.
                                                Do not include quotes or any formatting in your response.
                                                Just provide the exact text for the tweet.
                                            `;
                                        }

                                        elizaLogger.info('Generating tweet content based on image and character personality');
                                        const generatedContent = await rt.provider.complete(prompt, {
                                            max_tokens: 280,
                                            temperature: 0.7
                                        });

                                        if (generatedContent && generatedContent.trim()) {
                                            tweetText = generatedContent.trim();
                                            elizaLogger.info(`Generated tweet content: ${tweetText}`);
                                        }
                                    }
                                } catch (descriptionError) {
                                    elizaLogger.error(`Error generating image description: ${descriptionError.message}`);
                                }
                            }

                            // Post tweet with media
                            if (mediaData) {
                                // Create attachments for the Twitter client
                                const attachments = mediaData.map((media: any) => ({
                                    data: media.data,
                                    contentType: media.mediaType
                                }));

                                // If we still don't have tweet text, use a default
                                if (!tweetText) {
                                    tweetText = 'Check out this image!';
                                }

                                // Post tweet with media
                                elizaLogger.info(`Posting tweet with media: ${tweetText}`);
                                const result = await (twitterClient as any).postTweet({
                                    text: tweetText,
                                    attachments: attachments
                                });

                                // Update the global variable to track that this was a media tweet
                                global.lastTweetWasMedia = true;
                                elizaLogger.info('Media tweet posted successfully');

                                return { success: true, result, mediaUsed: true };
                            } else {
                                elizaLogger.warn('No valid media found, posting text-only tweet');
                                const result = await (twitterClient as any).postTweet(tweetText);

                                // Update the global variable to track that this was a text-only tweet
                                global.lastTweetWasMedia = false;
                                elizaLogger.info('Text-only tweet posted as fallback');

                                return { success: true, result, mediaUsed: false };
                            }
                        } catch (mediaError) {
                            elizaLogger.error(`Error processing media: ${mediaError.message}`);
                            // Fall back to text-only tweet
                            if (tweetText) {
                                const result = await (twitterClient as any).postTweet(tweetText);

                                // Update the global variable to track that this was a text-only tweet
                                global.lastTweetWasMedia = false;
                                elizaLogger.info('Text-only tweet posted as fallback due to media error');

                                return { success: true, result, mediaUsed: false };
                            } else {
                                return { success: false, error: 'Failed to process media and no text provided' };
                            }
                        }
                    } else {
                        // Post text-only tweet
                        if (!tweetText) {
                            return { success: false, error: 'No content provided for tweet' };
                        }

                        elizaLogger.info(`Posting text-only tweet: ${tweetText}`);
                        const result = await (twitterClient as any).postTweet(tweetText);

                        // Update the global variable to track that this was a text-only tweet
                        global.lastTweetWasMedia = false;
                        elizaLogger.info('Text-only tweet posted successfully');

                        return { success: true, result, mediaUsed: false };
                    }
                } catch (error) {
                    elizaLogger.error(`Error in media tweet handler: ${error.message}`);
                    return { success: false, error: error.message };
                }
            };

            // Register the action with the runtime
            runtime.registerAction({
                name: 'media_tweet',
                description: 'Post a tweet with media, alternating between text-only and media tweets',
                similes: ['post with media', 'tweet with image', 'share photo', 'alternating tweet'],
                examples: [
                    [
                        {
                            user: 'user',
                            content: {
                                text: 'Check out this amazing photo!',
                                mediaPath: '/path/to/image.jpg',
                                action: 'media_tweet'
                            }
                        }
                    ],
                    [
                        {
                            user: 'user',
                            content: {
                                text: 'Share a random image from our media folder',
                                action: 'media_tweet'
                            }
                        }
                    ]
                ],
                handler: mediaTweetHandler,
                validate: async (action: any) => {
                    // Allow action if it has text or if we can generate content
                    const hasTextOrGenerateOption = !!(action.content?.text || action.text || action.generateContent);

                    // If mediaPath is provided, validate that it exists
                    if (action.content?.mediaPath || action.mediaPath) {
                        const mediaPath = action.content?.mediaPath || action.mediaPath;
                        try {
                            const fs = await import('fs/promises');
                            await fs.access(mediaPath);
                            return true;
                        } catch {
                            // If media path doesn't exist but we have text, still allow the action
                            return hasTextOrGenerateOption;
                        }
                    }

                    // Check if default media folder exists
                    try {
                        const fs = await import('fs/promises');
                        const path = await import('path');
                        const defaultImagesPath = path.join(process.cwd(), 'eliza', 'media');
                        await fs.access(defaultImagesPath);
                        return true;
                    } catch {
                        // If no default media folder, require text
                        return hasTextOrGenerateOption;
                    }
                }
            });
            elizaLogger.info('Media tweet action registered successfully');
        }

        // End of Twitter client integration

        // add to container
        directClient.registerAgent(runtime);

        // Test media tweet functionality if enabled via env var or command-line argument
        const args = parseArguments();
        if ((process.env.TEST_MEDIA_TWEET_ON_STARTUP === 'true' || args.testMediaTweet) && twitterClient) {
            try {
                elizaLogger.info('Posting test media tweet on startup...');

                // Import required modules
                const fs = await import('fs/promises');
                const fsSync = await import('fs');
                const path = await import('path');

                // Get media folder path
                const mediaFolder = path.join(process.cwd(), 'eliza', 'media');

                if (fsSync.existsSync(mediaFolder)) {
                    // Get all image files
                    const files = await fs.readdir(mediaFolder);
                    const imageFiles = files.filter(file => {
                        const ext = path.extname(file).toLowerCase();
                        return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
                    });

                    if (imageFiles.length > 0) {
                        // Select a random image
                        const randomImage = imageFiles[Math.floor(Math.random() * imageFiles.length)];
                        const imagePath = path.join(mediaFolder, randomImage);

                        // Generate tweet content
                        const tweetText = `Testing media tweet functionality with this image from ${imagePath}. Posted automatically on agent startup. #${character.name} #ElizaOS`;

                        // Read the image file
                        const imageBuffer = await fs.readFile(imagePath);
                        const imageType = path.extname(imagePath).substring(1);

                        // Create media data object
                        const mediaData = [{
                            data: imageBuffer,
                            mediaType: `image/${imageType === 'jpg' ? 'jpeg' : imageType}`
                        }];

                        // Create attachments for the Twitter client
                        const attachments = mediaData.map((media: any) => ({
                            data: media.data,
                            contentType: media.mediaType
                        }));

                        // Post tweet with media
                        elizaLogger.info(`Posting test media tweet: ${tweetText}`);
                        await (twitterClient as any).postTweet({
                            text: tweetText,
                            attachments: attachments
                        });

                        // Update the global variable to track that this was a media tweet
                        global.lastTweetWasMedia = true;
                        elizaLogger.info('Test media tweet posted successfully');
                    } else {
                        elizaLogger.warn('No image files found in media folder, cannot post test media tweet');
                    }
                } else {
                    elizaLogger.warn(`Media folder not found at ${mediaFolder}, cannot post test media tweet`);
                }
            } catch (error) {
                elizaLogger.error(`Error posting test media tweet: ${error.message}`);
            }
        }

        // report to console
        elizaLogger.debug(`Started ${character.name} as ${runtime.agentId}`);

        return runtime;
    } catch (error) {
        elizaLogger.error(
            `Error starting agent for character ${character.name}:`,
            error
        );
        if (db) {
            await db.close();
        }
        throw error;
    }
}

const checkPortAvailable = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE") {
                resolve(false);
            }
        });

        server.once("listening", () => {
            server.close();
            resolve(true);
        });

        server.listen(port);
    });
};

const hasValidRemoteUrls = () =>
    process.env.REMOTE_CHARACTER_URLS &&
    process.env.REMOTE_CHARACTER_URLS !== "" &&
    process.env.REMOTE_CHARACTER_URLS.startsWith("http");

/**
 * Post processing of character after loading
 * @param character
 */
const handlePostCharacterLoaded = async (character: Character): Promise<Character> => {
    let processedCharacter = character;
    // Filtering the plugins with the method of handlePostCharacterLoaded
    const processors = character?.postProcessors?.filter(p => typeof p.handlePostCharacterLoaded === 'function');
    if (processors?.length > 0) {
        processedCharacter = Object.assign({}, character, { postProcessors: undefined });
        // process the character with each processor
        // the order is important, so we loop through the processors
        for (let i = 0; i < processors.length; i++) {
            const processor = processors[i];
            processedCharacter = await processor.handlePostCharacterLoaded(processedCharacter);
        }
    }
    return processedCharacter;
}

const startAgents = async () => {
    const directClient = new DirectClient();
    let serverPort = Number.parseInt(settings.SERVER_PORT || "3000");
    const args = parseArguments();
    const charactersArg = args.characters || args.character;
    let characters = [defaultCharacter];

    if ((charactersArg) || hasValidRemoteUrls()) {
        characters = await loadCharacters(charactersArg);
    }

    try {
        for (const character of characters) {
            const processedCharacter = await handlePostCharacterLoaded(character);
            await startAgent(processedCharacter, directClient);
        }
    } catch (error) {
        elizaLogger.error("Error starting agents:", error);
    }

    // Find available port
    while (!(await checkPortAvailable(serverPort))) {
        elizaLogger.warn(
            `Port ${serverPort} is in use, trying ${serverPort + 1}`
        );
        serverPort++;
    }

    // upload some agent functionality into directClient
    // This is used in client-direct/api.ts at "/agents/:agentId/set" route to restart an agent
    directClient.startAgent = async (character: Character) => {
        // Handle plugins
        character.plugins = await handlePluginImporting(character.plugins as unknown as string[]);
        elizaLogger.info(character.name, 'loaded plugins:', '[' + character.plugins.map((p: any) => `"${p.npmName}"`).join(', ') + ']');

        // Handle Post Processors plugins
        if (character.postProcessors?.length > 0) {
            elizaLogger.info(character.name, 'loading postProcessors', character.postProcessors);
            character.postProcessors = await handlePluginImporting(character.postProcessors as unknown as string[]);
        }
        // character's post processing
        const processedCharacter = await handlePostCharacterLoaded(character);

        // wrap it so we don't have to inject directClient later
        return startAgent(processedCharacter, directClient);
    };

    directClient.loadCharacterTryPath = loadCharacterTryPath;
    directClient.jsonToCharacter = jsonToCharacter;

    directClient.start(serverPort);

    if (serverPort !== Number.parseInt(settings.SERVER_PORT || "3000")) {
        elizaLogger.warn(`Server started on alternate port ${serverPort}`);
    }

    elizaLogger.info(
        "Run `pnpm start:client` to start the client and visit the outputted URL (http://localhost:5173) to chat with your agents. When running multiple agents, use client with different port `SERVER_PORT=3001 pnpm start:client`"
    );
};

startAgents().catch((error) => {
    elizaLogger.error("Unhandled error in startAgents:", error);
    process.exit(1);
});

// Prevent unhandled exceptions from crashing the process if desired
if (
    process.env.PREVENT_UNHANDLED_EXIT &&
    parseBooleanFromText(process.env.PREVENT_UNHANDLED_EXIT)
) {
    // Handle uncaught exceptions to prevent the process from crashing
    process.on("uncaughtException", (err) => {
        console.error("uncaughtException", err);
    });

    // Handle unhandled rejections to prevent the process from crashing
    process.on("unhandledRejection", (err) => {
        console.error("unhandledRejection", err);
    });
}
