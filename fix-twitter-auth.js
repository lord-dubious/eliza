#!/usr/bin/env node

/**
 * Twitter Authentication Diagnostic and Fix Tool
 * This script helps diagnose and fix Twitter authentication issues
 */

const fs = require('fs');
const path = require('path');

function checkEnvFile() {
    console.log('🔍 Checking .env configuration...');
    
    if (!fs.existsSync('.env')) {
        console.log('❌ .env file not found!');
        console.log('💡 Create a .env file with your Twitter credentials');
        return { success: false, username: null };
    }
    
    const envContent = fs.readFileSync('.env', 'utf8');
    const getEnvVar = (name) => {
        const match = envContent.match(new RegExp(`${name}=([^\\n\\r]+)`));
        return match ? match[1] : null;
    };
    
    const username = getEnvVar('TWITTER_USERNAME');
    const password = getEnvVar('TWITTER_PASSWORD');
    const email = getEnvVar('TWITTER_EMAIL');
    
    console.log(`📋 Environment Variables:`);
    console.log(`  TWITTER_USERNAME: ${username || 'NOT SET'}`);
    console.log(`  TWITTER_PASSWORD: ${password ? '***' : 'NOT SET'}`);
    console.log(`  TWITTER_EMAIL: ${email ? '***' : 'NOT SET'}`);
    
    if (!username || !password || !email) {
        console.log('❌ Missing required credentials in .env');
        console.log('💡 Add these to your .env file:');
        console.log('TWITTER_USERNAME=your_twitter_username');
        console.log('TWITTER_PASSWORD=your_twitter_password');
        console.log('TWITTER_EMAIL=your_twitter_email');
        return { success: false, username: null };
    }
    
    if (username === 'test_username' || password === 'test_password') {
        console.log('⚠️  Using test credentials - this will fail!');
        console.log('💡 Update .env with real Twitter credentials');
        return { success: false, username };
    }
    
    console.log('✅ Environment variables look good');
    return { success: true, username };
}

function checkCharacterUsername(envUsername) {
    console.log('\\n👤 Checking character username...');
    
    const characterPath = './agent/src/defaultCharacter.ts';
    if (!fs.existsSync(characterPath)) {
        console.log('❌ Character file not found');
        return false;
    }
    
    const characterContent = fs.readFileSync(characterPath, 'utf8');
    // Use the working regex pattern
    const usernameMatch = characterContent.match(/username:\s*["']([^"']*)["']/);
    
    if (!usernameMatch) {
        console.log('❌ Could not find username in character file');
        return false;
    }
    
    const characterUsername = usernameMatch[1];
    console.log(`  Character username: ${characterUsername}`);
    
    if (characterUsername !== envUsername) {
        console.log(`❌ Username mismatch!`);
        console.log(`  Character: ${characterUsername}`);
        console.log(`  .env: ${envUsername}`);
        console.log('💡 Fixing username mismatch...');
        
        // Fix the mismatch by updating character username
        const updatedContent = characterContent.replace(
            /username:\s*["'][^"']*["']/,
            `username: "${envUsername}"`
        );
        
        fs.writeFileSync(characterPath, updatedContent);
        console.log('✅ Fixed username mismatch in character file');
        return true;
    }
    
    console.log('✅ Username matches between character and .env');
    return true;
}

function clearCache() {
    console.log('\\n🧹 Clearing Twitter cache...');
    
    const cacheDir = '.data';
    if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        const twitterFiles = files.filter(f => f.includes('twitter'));
        
        if (twitterFiles.length > 0) {
            console.log(`  Found ${twitterFiles.length} Twitter cache files`);
            twitterFiles.forEach(file => {
                const filePath = path.join(cacheDir, file);
                fs.unlinkSync(filePath);
                console.log(`  Deleted: ${file}`);
            });
            console.log('✅ Twitter cache cleared');
        } else {
            console.log('  No Twitter cache files found');
        }
    } else {
        console.log('  No cache directory found');
    }
}

async function runDiagnostic() {
    console.log('🔧 Twitter Authentication Diagnostic Tool\\n');
    
    const envResult = checkEnvFile();
    const usernameOk = checkCharacterUsername(envResult.username);
    clearCache();
    
    console.log('\\n📊 Summary:');
    console.log(`📋 Environment: ${envResult.success ? '✅' : '❌'}`);
    console.log(`👤 Username Match: ${usernameOk ? '✅' : '❌'}`);
    console.log(`🧹 Cache Status: Clear`);
    
    if (envResult.success && usernameOk) {
        console.log('\\n🚀 Ready to test! Try running the agent now:');
        console.log('cd agent && npm start');
    } else {
        console.log('\\n⚠️  Please fix the issues above before running the agent');
    }
}

runDiagnostic().catch(console.error);

