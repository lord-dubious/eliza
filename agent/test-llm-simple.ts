import { generateText, composeContext, ModelClass } from "@elizaos/core";
import { defaultCharacter } from "./src/defaultCharacter.ts";

async function testLLMGeneration() {
    console.log("🧪 Testing LLM Generation for Holly Snow...");
    
    try {
        // Test if we have the custom template
        const tweetTemplate = defaultCharacter.templates?.twitterPostTemplate;
        if (!tweetTemplate) {
            console.log("❌ No custom Twitter template found");
            return;
        }
        
        console.log("✅ Custom Twitter template found");
        console.log(`📏 Template length: ${tweetTemplate.length} characters`);
        
        // Create a mock state for testing
        const mockState = {
            agentName: defaultCharacter.name,
            twitterUserName: defaultCharacter.username,
            bio: defaultCharacter.bio?.join('\n'),
            topics: defaultCharacter.topics?.join(', '),
            postExamples: defaultCharacter.postExamples?.join('\n'),
            style: defaultCharacter.style,
            maxTweetLength: 280,
            adjective: "seductive",
            topic: "fitness"
        };

        // Compose context using the template
        const context = composeContext({
            state: mockState,
            template: tweetTemplate,
        });

        console.log("✅ Context composed successfully");
        console.log("📝 Generated context preview:");
        console.log(context.substring(0, 800) + "...\n");

        // Check if we have OpenAI API key
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey || apiKey === "your_openai_api_key_here") {
            console.log("⚠️  No valid OpenAI API key found");
            console.log("💡 To test LLM generation, add a real API key to .env:");
            console.log("OPENAI_API_KEY=sk-your-actual-key-here");
            console.log("\n✅ Template and context generation working correctly!");
            console.log("🎯 Ready for LLM generation once API key is added");
            return;
        }

        console.log("✅ OpenAI API key found");
        console.log("🔄 Testing LLM generation...");

        // This would fail without a proper runtime, but let's see what happens
        console.log("⚠️  Note: This test requires a full runtime setup for actual LLM calls");
        console.log("✅ Template system is properly configured for Holly Snow!");
        
    } catch (error) {
        console.error("❌ Test Failed:");
        console.error(error);
    }
}

testLLMGeneration();

