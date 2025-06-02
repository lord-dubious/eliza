#!/usr/bin/env node

/**
 * Embedding Issue Diagnostic and Fix Tool
 * This script helps diagnose and fix embedding-related tweet generation issues
 */

const fs = require('fs');

function checkEmbeddingConfiguration() {
    console.log('🔍 Checking embedding configuration...\n');
    
    if (!fs.existsSync('.env')) {
        console.log('❌ .env file not found!');
        return { success: false };
    }
    
    const envContent = fs.readFileSync('.env', 'utf8');
    const getEnvVar = (name) => {
        const match = envContent.match(new RegExp(`${name}=([^\\n\\r]+)`));
        return match ? match[1] : null;
    };
    
    const openaiKey = getEnvVar('OPENAI_API_KEY');
    const googleKey = getEnvVar('GOOGLE_GENERATIVE_AI_API_KEY');
    const embeddingProvider = getEnvVar('EMBEDDING_PROVIDER');
    const embeddingModel = getEnvVar('EMBEDDING_MODEL');
    
    console.log('📋 Current Configuration:');
    console.log(`  OPENAI_API_KEY: ${openaiKey ? (openaiKey.startsWith('sk-') ? '✅ Valid format' : '⚠️  Invalid format') : '❌ NOT SET'}`);
    console.log(`  GOOGLE_GENERATIVE_AI_API_KEY: ${googleKey ? '✅ Set' : '❌ NOT SET'}`);
    console.log(`  EMBEDDING_PROVIDER: ${embeddingProvider || 'NOT SET'}`);
    console.log(`  EMBEDDING_MODEL: ${embeddingModel || 'NOT SET'}`);
    
    // Check character configuration
    const characterPath = './agent/src/defaultCharacter.ts';
    if (fs.existsSync(characterPath)) {
        const characterContent = fs.readFileSync(characterPath, 'utf8');
        const modelProviderMatch = characterContent.match(/modelProvider:\\s*ModelProviderName\\.([A-Z]+)/);
        const characterProvider = modelProviderMatch ? modelProviderMatch[1] : 'UNKNOWN';
        console.log(`  Character Model Provider: ${characterProvider}`);
        
        // Check for mismatch
        if (characterProvider === 'OPENAI' && (!openaiKey || openaiKey === 'your_openai_api_key_here' || openaiKey === 'sk-test-key-replace-with-real-openai-key')) {
            console.log('\n❌ ISSUE FOUND: Character uses OpenAI but API key is missing/invalid');
            console.log('💡 Solutions:');
            console.log('   1. Add a real OpenAI API key to .env');
            console.log('   2. Or switch to Google AI (see below)');
            return { success: false, issue: 'openai_key_missing' };
        }
        
        if (characterProvider === 'GOOGLE' && (!googleKey || googleKey === 'your_google_api_key_here')) {
            console.log('\n❌ ISSUE FOUND: Character uses Google AI but API key is missing/invalid');
            console.log('💡 Solutions:');
            console.log('   1. Add a real Google AI API key to .env');
            console.log('   2. Or switch to OpenAI (see below)');
            return { success: false, issue: 'google_key_missing' };
        }
    }
    
    return { success: true };
}

function provideSolutions() {
    console.log('\n🛠️  SOLUTIONS:\n');
    
    console.log('📝 Option 1: Use OpenAI (Recommended)');
    console.log('   1. Get an API key from https://platform.openai.com/api-keys');
    console.log('   2. Update .env:');
    console.log('      OPENAI_API_KEY=sk-your-real-openai-key-here');
    console.log('      EMBEDDING_PROVIDER=openai');
    console.log('      EMBEDDING_MODEL=text-embedding-ada-002');
    console.log('');
    
    console.log('📝 Option 2: Use Google AI');
    console.log('   1. Get an API key from https://makersuite.google.com/app/apikey');
    console.log('   2. Update .env:');
    console.log('      GOOGLE_GENERATIVE_AI_API_KEY=your-google-api-key-here');
    console.log('      EMBEDDING_PROVIDER=google');
    console.log('   3. Update character to use Google:');
    console.log('      modelProvider: ModelProviderName.GOOGLE');
    console.log('');
    
    console.log('📝 Option 3: Use Local Embeddings (No API key needed)');
    console.log('   1. Update .env:');
    console.log('      EMBEDDING_PROVIDER=local');
    console.log('   2. This uses local embeddings but may be slower');
    console.log('');
}

function createQuickFix() {
    console.log('🚀 Quick Fix: Setting up local embeddings (no API key needed)\n');
    
    const envContent = fs.readFileSync('.env', 'utf8');
    
    // Add local embedding configuration
    let updatedContent = envContent;
    
    if (!envContent.includes('EMBEDDING_PROVIDER=')) {
        updatedContent += '\n# Local Embedding Configuration (no API key needed)\n';
        updatedContent += 'EMBEDDING_PROVIDER=local\n';
    } else {
        updatedContent = updatedContent.replace(/EMBEDDING_PROVIDER=.*/g, 'EMBEDDING_PROVIDER=local');
    }
    
    fs.writeFileSync('.env', updatedContent);
    console.log('✅ Updated .env with local embedding configuration');
    console.log('🔄 Restart your agent to apply changes');
    console.log('');
    console.log('💡 Note: Local embeddings work but are slower than API-based ones');
    console.log('   For better performance, consider getting an OpenAI API key');
}

async function runDiagnostic() {
    console.log('🔧 Embedding Issue Diagnostic Tool\n');
    
    const result = checkEmbeddingConfiguration();
    
    if (!result.success) {
        provideSolutions();
        
        console.log('\n❓ Would you like me to set up local embeddings as a quick fix?');
        console.log('   This will allow tweet generation to work without API keys');
        console.log('   (You can upgrade to API-based embeddings later)');
        console.log('');
        console.log('🔧 Running quick fix...');
        createQuickFix();
    } else {
        console.log('\n✅ Embedding configuration looks good!');
        console.log('🤔 If you are still having issues, try:');
        console.log('   1. Restarting the agent');
        console.log('   2. Checking your API key quotas');
        console.log('   3. Verifying network connectivity');
    }
}

runDiagnostic().catch(console.error);

