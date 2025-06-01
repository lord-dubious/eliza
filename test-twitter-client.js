// Simple test to verify Twitter client initialization
import { defaultCharacter } from "./agent/src/defaultCharacter.ts";

console.log("Character configuration:");
console.log("Name:", defaultCharacter.name);
console.log("Username:", defaultCharacter.username);
console.log("Plugins:", defaultCharacter.plugins?.map(p => p.name || p));
console.log("Clients:", defaultCharacter.clients);

// Check if Twitter plugin has clients
if (defaultCharacter.plugins) {
    for (const plugin of defaultCharacter.plugins) {
        console.log(`Plugin: ${plugin.name || 'unnamed'}`);
        if (plugin.clients) {
            console.log(`  - Has ${plugin.clients.length} clients:`, plugin.clients.map(c => c.name));
        } else {
            console.log("  - No clients defined");
        }
    }
}

// Check environment variables
console.log("\nEnvironment variables:");
console.log("TWITTER_USERNAME:", process.env.TWITTER_USERNAME ? "SET" : "NOT SET");
console.log("TWITTER_PASSWORD:", process.env.TWITTER_PASSWORD ? "SET" : "NOT SET");
console.log("TWITTER_EMAIL:", process.env.TWITTER_EMAIL ? "SET" : "NOT SET");
console.log("TWITTER_DRY_RUN:", process.env.TWITTER_DRY_RUN);

