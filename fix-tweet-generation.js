#!/usr/bin/env node

/**
 * Tweet Generation Fix Tool
 * This script fixes the specific embedding issue causing tweet generation to fail
 */

const fs = require('fs');

function fixTweetGenerationIssue() {
    console.log('🔧 Fixing Tweet Generation Issue\n');
    
    console.log('📋 Issue Analysis:');
    console.log('   - Character is configured for OpenAI');
    console.log('   - But system is trying to use Google embeddings');
    console.log('   - This happens when OpenAI key is invalid/test key');
    console.log('');
    
    console.log('🛠️  Applying Fix: Switch to Local Embeddings\n');
    
    // Read current .env
    const envContent = fs.readFileSync('.env', 'utf8');
    
    // Update to use local embeddings (no API key needed)
    let updatedContent = envContent;
    
    // Replace embedding provider
    if (updatedContent.includes('EMBEDDING_PROVIDER=')) {
        updatedContent = updatedContent.replace(/EMBEDDING_PROVIDER=.*/g, 'EMBEDDING_PROVIDER=local');
    } else {
        updatedContent += '\n# Local Embedding Configuration (no API key needed)\n';
        updatedContent += 'EMBEDDING_PROVIDER=local\n';
    }
    
    // Remove embedding model requirement for local
    if (updatedContent.includes('EMBEDDING_MODEL=')) {
        updatedContent = updatedContent.replace(/EMBEDDING_MODEL=.*/g, '# EMBEDDING_MODEL=text-embedding-ada-002  # Not needed for local');
    }
    
    // Add a note about the fix
    if (!updatedContent.includes('# Tweet Generation Fix')) {
        updatedContent += '\n# Tweet Generation Fix - Using local embeddings to avoid API key issues\n';
        updatedContent += '# Upgrade to OpenAI embeddings later by setting a real OPENAI_API_KEY\n';
    }
    
    fs.writeFileSync('.env', updatedContent);
    
    console.log('✅ Applied fixes:');
    console.log('   - Set EMBEDDING_PROVIDER=local');
    console.log('   - Removed embedding model requirement');
    console.log('   - Added explanatory comments');
    console.log('');
    
    console.log('🔄 Next Steps:');
    console.log('   1. Restart your agent: cd agent && npm start');
    console.log('   2. Tweet generation should now work');
    console.log('   3. For better performance, get a real OpenAI API key later');
    console.log('');
    
    console.log('💡 To upgrade to OpenAI embeddings later:');
    console.log('   1. Get API key from https://platform.openai.com/api-keys');
    console.log('   2. Update .env: OPENAI_API_KEY=sk-your-real-key');
    console.log('   3. Update .env: EMBEDDING_PROVIDER=openai');
    console.log('   4. Update .env: EMBEDDING_MODEL=text-embedding-ada-002');
}

function showCurrentConfig() {
    console.log('📋 Current Configuration After Fix:\n');
    
    const envContent = fs.readFileSync('.env', 'utf8');
    const lines = envContent.split('\n');
    
    const relevantLines = lines.filter(line => 
        line.includes('EMBEDDING_') || 
        line.includes('OPENAI_') || 
        line.includes('GOOGLE_') ||
        line.startsWith('# Tweet Generation Fix')
    );
    
    relevantLines.forEach(line => {
        if (line.startsWith('#')) {
            console.log(`💬 ${line}`);
        } else if (line.includes('=')) {
            console.log(`⚙️  ${line}`);
        }
    });
    
    console.log('');
}

// Run the fix
fixTweetGenerationIssue();
showCurrentConfig();

console.log('🎉 Tweet generation should now work!');
console.log('🚀 Restart your agent to test the fix');

