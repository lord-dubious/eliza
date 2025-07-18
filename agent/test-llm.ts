import { AgentRuntime, generateText, composeContext, ModelClass } from "@elizaos/core";
import { defaultCharacter } from "./src/defaultCharacter.ts";

async function testLLMIntegration() {
    console.log("🧪 Testing LLM Integration for Holly Snow...");
    
    try {
        // Create runtime with the character
        const runtime = new AgentRuntime({
            character: defaultCharacter,
            databaseAdapter: null as any, // We don't need DB for this test
            token: "test",
            modelProvider: defaultCharacter.modelProvider,
        });

        console.log("✅ Runtime created successfully");
        console.log(`📝 Model Provider: ${runtime.modelProvider}`);
        console.log(`🤖 Character: ${runtime.character.name}`);

        // Test basic state composition
        const baseState = await runtime.composeState({
            userId: "test-user",
            agentId: runtime.agentId,
            content: { text: "Test message" },
            roomId: "test-room"
        });

        console.log("✅ State composition successful");

        // Test tweet generation with custom template
        const tweetTemplate = runtime.character.templates?.twitterPostTemplate;
        if (tweetTemplate) {
            console.log("✅ Custom Twitter template found");
            
            // Augment state with all required template fields
            const augmentedStateForTweet = {
                ...baseState,
                agentName: runtime.character.name,
                twitterUserName: runtime.character.username,
                bio: Array.isArray(runtime.character.bio) ? runtime.character.bio.join('\n') : runtime.character.bio,
                topics: runtime.character.topics?.join(', ') || '',
                postExamples: runtime.character.postExamples?.join('\n') || '',
                style: runtime.character.style,
                maxTweetLength: 280,
                adjective: "seductive", // Provide test value
                topic: "fitness"        // Provide test value
            };
            
            const context = composeContext({
                state: augmentedStateForTweet, // Use augmented state
                template: tweetTemplate,
            });

            console.log("📝 Generated context for LLM:");
            console.log(context.substring(0, 500) + "...");

            // Test LLM generation
            console.log("🔄 Calling generateText...");
            const response = await generateText({
                runtime: runtime,
                context: context,
                modelClass: ModelClass.SMALL,
            });

            console.log("✅ LLM Response Generated:");
            console.log(`📝 Response: "${response}"`);
            console.log(`📏 Length: ${response.length} characters`);
            
        } else {
            console.log("❌ No custom Twitter template found");
        }

    } catch (error) {
        console.error("❌ LLM Integration Test Failed:");
        console.error(error);
        
        if (error.message?.includes("API key")) {
            console.log("\n💡 SOLUTION: Add a valid OpenAI API key to your .env file:");
            console.log("OPENAI_API_KEY=your_actual_api_key_here");
        }
    }
}

testLLMIntegration();
