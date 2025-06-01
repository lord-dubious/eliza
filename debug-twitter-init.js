#!/usr/bin/env node

// Debug script to test Twitter client initialization
console.log("🔍 Debug: Testing Twitter Client Initialization");

// Check environment variables
console.log("\n📋 Environment Variables:");
const requiredVars = ['TWITTER_USERNAME', 'TWITTER_PASSWORD', 'TWITTER_EMAIL'];
const optionalVars = ['TWITTER_DRY_RUN', 'ENABLE_MEDIA_POSTING', 'MEDIA_FOLDER_PATH'];

requiredVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`  ${varName}: ${value ? '✅ SET' : '❌ NOT SET'}`);
});

optionalVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`  ${varName}: ${value || 'not set'}`);
});

// Test character configuration
console.log("\n🎭 Character Configuration Test:");
try {
    // We can't import TypeScript directly, but we can check the file exists
    const fs = require('fs');
    const path = require('path');
    
    const characterPath = path.join(__dirname, 'agent/src/defaultCharacter.ts');
    if (fs.existsSync(characterPath)) {
        console.log("  ✅ Character file exists");
        
        const content = fs.readFileSync(characterPath, 'utf8');
        
        // Check for key elements
        const checks = [
            { name: 'Twitter plugin import', pattern: /import.*twitterPlugin.*from.*@elizaos\/client-twitter/ },
            { name: 'Plugins array includes twitterPlugin', pattern: /plugins:\s*\[.*twitterPlugin.*\]/ },
            { name: 'Clients array includes twitter', pattern: /clients:\s*\[.*"twitter".*\]/ },
            { name: 'Holly Snow character name', pattern: /name:\s*"Holly Snow"/ }
        ];
        
        checks.forEach(check => {
            const found = check.pattern.test(content);
            console.log(`  ${found ? '✅' : '❌'} ${check.name}`);
        });
        
    } else {
        console.log("  ❌ Character file not found");
    }
} catch (error) {
    console.log("  ❌ Error checking character file:", error.message);
}

// Check if required packages are built
console.log("\n📦 Package Build Status:");
const packages = [
    'packages/core/dist',
    'packages/client-direct/dist', 
    'packages/client-twitter/dist',
    'packages/plugin-bootstrap/dist',
    'packages/adapter-sqlite/dist'
];

packages.forEach(pkgPath => {
    const fs = require('fs');
    const exists = fs.existsSync(pkgPath);
    console.log(`  ${exists ? '✅' : '❌'} ${pkgPath}`);
});

// Check media folder
console.log("\n📁 Media Folder:");
const mediaPath = process.env.MEDIA_FOLDER_PATH || './agent/media';
const fs = require('fs');
if (fs.existsSync(mediaPath)) {
    console.log(`  ✅ Media folder exists: ${mediaPath}`);
    const files = fs.readdirSync(mediaPath);
    console.log(`  📄 Files in media folder: ${files.length}`);
    if (files.length > 0) {
        console.log(`    ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
    }
} else {
    console.log(`  ❌ Media folder not found: ${mediaPath}`);
}

console.log("\n🚀 Next Steps:");
console.log("1. Set required Twitter environment variables in .env file");
console.log("2. Build missing packages: pnpm build");
console.log("3. Create media folder and add some images/videos");
console.log("4. Run: pnpm start");

console.log("\n💡 Tips:");
console.log("- Set TWITTER_DRY_RUN=true for testing");
console.log("- Check logs for 'Twitter client started' message");
console.log("- Look for 'Initializing client: twitter' in debug logs");

