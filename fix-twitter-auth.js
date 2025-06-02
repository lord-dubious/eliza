#!/usr/bin/env node

/**
 * Fix Twitter Authentication Issues
 * This script helps diagnose and fix common Twitter auth problems
 */

import fs from 'fs';
import path from 'path';

console.log('🔧 Twitter Authentication Diagnostic Tool\n');

// Check .env file
function checkEnvFile() {
    console.log('📋 Checking .env configuration...');
    
    if (!fs.existsSync('.env')) {
        console.log('❌ .env file not found!');
        console.log('💡 Create .env file with your Twitter credentials');
        return false;
    }
    
    const envContent = fs.readFileSync('.env', 'utf8');
    const lines = envContent.split('\n');
    
    const requiredVars = ['TWITTER_USERNAME', 'TWITTER_PASSWORD', 'TWITTER_EMAIL'];
    const testValues = ['test_username', 'test_password', 'test@example.com'];
    
    let hasIssues = false;
    
    for (const varName of requiredVars) {
        const line = lines.find(l => l.startsWith(varName + '='));
        if (!line) {
            console.log(`❌ Missing: ${varName}`);
            hasIssues = true;
        } else {
            const value = line.split('=')[1];
            if (testValues.includes(value)) {
                console.log(`⚠️  ${varName}=${value} (test value - update with real credentials)`);
                hasIssues = true;
            } else {
                console.log(`✅ ${varName}=****** (configured)`);
            }
        }
    }
    
    return !hasIssues;
}

// Check character username
function checkCharacterUsername() {
    console.log('\n👤 Checking character username...');
    
    const characterFile = 'agent/src/defaultCharacter.ts';
    if (!fs.existsSync(characterFile)) {
        console.log('❌ Character file not found!');
        return false;
    }
    
    const content = fs.readFileSync(characterFile, 'utf8');
    const usernameMatch = content.match(/username:\s*["']([^"']+)["']/);
    
    if (!usernameMatch) {
        console.log('❌ Username not found in character file');
        return false;
    }
    
    const characterUsername = usernameMatch[1];
    console.log(`📝 Character username: "${characterUsername}"`);
    
    // Check if it matches .env
    if (fs.existsSync('.env')) {
        const envContent = fs.readFileSync('.env', 'utf8');
        const envUsernameMatch = envContent.match(/TWITTER_USERNAME=([^\n\r]+)/);
        
        if (envUsernameMatch) {
            const envUsername = envUsernameMatch[1];
            if (characterUsername === envUsername) {
                console.log('✅ Character username matches TWITTER_USERNAME');
                return true;
            } else {
                console.log(`❌ Mismatch! Character: "${characterUsername}", .env: "${envUsername}"`);
                return false;
            }
        }
    }
    
    return false;
}

// Clear cache
function clearCache() {
    console.log('\n🧹 Clearing Twitter cache...');
    
    const cachePatterns = ['.cache', 'node_modules/.cache', '.twitter-cache'];
    let cleared = 0;
    
    for (const pattern of cachePatterns) {
        if (fs.existsSync(pattern)) {
            try {
                fs.rmSync(pattern, { recursive: true, force: true });
                console.log(`🗑️  Removed: ${pattern}`);
                cleared++;
            } catch (err) {
                console.warn(`⚠️  Could not remove ${pattern}:`, err.message);
            }
        }
    }
    
    if (cleared === 0) {
        console.log('✅ No cache found to clear');
    } else {
        console.log(`✅ Cleared ${cleared} cache directories`);
    }
}

// Main diagnostic
async function runDiagnostic() {
    const envOk = checkEnvFile();
    const usernameOk = checkCharacterUsername();
    
    clearCache();
    
    console.log('\n📊 Summary:');
    console.log(`Environment: ${envOk ? '✅' : '❌'}`);
    console.log(`Username Match: ${usernameOk ? '✅' : '❌'}`);
    
    if (!envOk || !usernameOk) {
        console.log('\n🛠️  Fixes needed:');
        
        if (!envOk) {
            console.log('1. Update .env with real Twitter credentials:');
            console.log('   TWITTER_USERNAME=your_real_username');
            console.log('   TWITTER_PASSWORD=your_real_password');
            console.log('   TWITTER_EMAIL=your_real_email');
        }
        
        if (!usernameOk) {
            console.log('2. Make sure character username matches TWITTER_USERNAME');
        }
        
        console.log('\n3. Restart the agent after making changes');
    } else {
        console.log('\n🎉 Configuration looks good! Try starting the agent again.');
    }
}

runDiagnostic();

