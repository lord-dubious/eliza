#!/usr/bin/env node

/**
 * Debug Twitter Profile Fetching Issues
 * This script helps debug the rest_id not found error
 */

import { Scraper } from 'agent-twitter-client';
import fs from 'fs';

async function debugTwitterProfile() {
    console.log('🔍 Debugging Twitter Profile Fetching...\n');
    
    // Check .env
    if (!fs.existsSync('.env')) {
        console.log('❌ .env file not found!');
        return;
    }
    
    const envContent = fs.readFileSync('.env', 'utf8');
    const getEnvVar = (name) => {
        const match = envContent.match(new RegExp(`${name}=([^\\n\\r]+)`));
        return match ? match[1] : null;
    };
    
    const username = getEnvVar('TWITTER_USERNAME');
    const password = getEnvVar('TWITTER_PASSWORD');
    const email = getEnvVar('TWITTER_EMAIL');
    
    console.log(`📋 Configuration:`);
    console.log(`Username: ${username}`);
    console.log(`Password: ${password ? '***' : 'NOT SET'}`);
    console.log(`Email: ${email ? '***' : 'NOT SET'}`);
    console.log('');
    
    if (!username || !password || !email) {
        console.log('❌ Missing required credentials in .env');
        return;
    }
    
    if (username === 'test_username' || password === 'test_password') {
        console.log('⚠️  Using test credentials - this will fail!');
        console.log('💡 Update .env with real Twitter credentials');
        return;
    }
    
    // Test Twitter client
    console.log('🐦 Testing Twitter client...');
    const scraper = new Scraper();
    
    try {
        console.log('🔐 Attempting login...');
        await scraper.login(username, password, email);
        
        console.log('✅ Login successful!');
        
        const isLoggedIn = await scraper.isLoggedIn();
        console.log(`🔍 Is logged in: ${isLoggedIn}`);
        
        if (isLoggedIn) {
            console.log('👤 Attempting to fetch profile...');
            try {
                const profile = await scraper.getProfile(username);
                console.log('✅ Profile fetched successfully!');
                console.log('📊 Profile data:');
                console.log(`  - User ID: ${profile.userId}`);
                console.log(`  - Name: ${profile.name}`);
                console.log(`  - Username: ${profile.username}`);
                console.log(`  - Bio: ${profile.biography?.substring(0, 100)}...`);
                console.log(`  - Followers: ${profile.followersCount}`);
                console.log(`  - Following: ${profile.followingCount}`);
            } catch (profileError) {
                console.log('❌ Profile fetch failed!');
                console.log('Error:', profileError.message);
                
                if (profileError.message.includes('rest_id not found')) {
                    console.log('\n🔍 rest_id not found suggests:');
                    console.log('1. Username might not exist on Twitter');
                    console.log('2. Account might be suspended/private');
                    console.log('3. Twitter API rate limiting');
                    console.log('4. Authentication issue');
                    
                    console.log('\n💡 Try these solutions:');
                    console.log('1. Verify the username exists on twitter.com');
                    console.log('2. Try a different username');
                    console.log('3. Wait a few minutes and try again');
                    console.log('4. Check if account is public');
                }
            }
        }
        
    } catch (loginError) {
        console.log('❌ Login failed!');
        console.log('Error:', loginError.message);
        
        console.log('\n💡 Common login issues:');
        console.log('1. Incorrect username/password/email');
        console.log('2. Account locked or suspended');
        console.log('3. 2FA enabled (not supported in this test)');
        console.log('4. Rate limiting from Twitter');
    }
}

debugTwitterProfile().catch(console.error);

