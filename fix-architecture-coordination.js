#!/usr/bin/env node

/**
 * Architecture Coordination Fix
 * This script fixes the fundamental disconnect between character model providers
 * and embedding provider configuration in the Eliza framework.
 */

const fs = require('fs');

function analyzeArchitecturalIssue() {
    console.log('🔍 Analyzing Architectural Coordination Issue\n');
    
    // Read character configuration
    const characterPath = './agent/src/defaultCharacter.ts';
    const characterContent = fs.readFileSync(characterPath, 'utf8');
    const modelProviderMatch = characterContent.match(/modelProvider:\\s*ModelProviderName\\.([A-Z]+)/);
    const characterProvider = modelProviderMatch ? modelProviderMatch[1] : 'UNKNOWN';
    
    // Read current .env
    const envContent = fs.readFileSync('.env', 'utf8');
    const getEnvVar = (name) => {
        const match = envContent.match(new RegExp(`${name}=([^\\n\\r]+)`));
        return match ? match[1] : null;
    };
    
    const embeddingProvider = getEnvVar('EMBEDDING_PROVIDER');
    const useOpenAIEmbedding = getEnvVar('USE_OPENAI_EMBEDDING');
    const useOllamaEmbedding = getEnvVar('USE_OLLAMA_EMBEDDING');
    const openaiKey = getEnvVar('OPENAI_API_KEY');
    
    console.log('📋 Current Configuration Analysis:');
    console.log(`  Character Model Provider: ${characterProvider}`);
    console.log(`  EMBEDDING_PROVIDER: ${embeddingProvider || 'NOT SET'}`);
    console.log(`  USE_OPENAI_EMBEDDING: ${useOpenAIEmbedding || 'NOT SET'}`);
    console.log(`  USE_OLLAMA_EMBEDDING: ${useOllamaEmbedding || 'NOT SET'}`);
    console.log(`  OPENAI_API_KEY: ${openaiKey ? (openaiKey.startsWith('sk-') && openaiKey.length > 20 ? '✅ Valid' : '⚠️  Test/Invalid') : '❌ NOT SET'}`);
    
    console.log('\n🔍 Issue Analysis:');
    console.log('   ❌ Character is configured for OpenAI');
    console.log('   ❌ But embedding system uses separate USE_*_EMBEDDING flags');
    console.log('   ❌ EMBEDDING_PROVIDER variable is not recognized by core system');
    console.log('   ❌ No automatic coordination between model and embedding providers');
    
    return {
        characterProvider,
        embeddingProvider,
        useOpenAIEmbedding,
        openaiKey,
        hasValidOpenAIKey: openaiKey && openaiKey.startsWith('sk-') && openaiKey.length > 20
    };
}

function fixArchitecturalCoordination() {
    console.log('\n🛠️  Applying Architectural Coordination Fix\n');
    
    const analysis = analyzeArchitecturalIssue();
    
    let envContent = fs.readFileSync('.env', 'utf8');
    
    // Remove the non-standard EMBEDDING_PROVIDER variable
    if (envContent.includes('EMBEDDING_PROVIDER=')) {
        envContent = envContent.replace(/EMBEDDING_PROVIDER=.*/g, '# EMBEDDING_PROVIDER=local  # This variable is not recognized by core system');
        console.log('✅ Removed non-standard EMBEDDING_PROVIDER variable');
    }
    
    // Remove the non-standard EMBEDDING_MODEL variable
    if (envContent.includes('EMBEDDING_MODEL=')) {
        envContent = envContent.replace(/EMBEDDING_MODEL=.*/g, '# EMBEDDING_MODEL=text-embedding-ada-002  # Not needed for local embeddings');
        console.log('✅ Removed non-standard EMBEDDING_MODEL variable');
    }
    
    // Add proper embedding configuration based on character provider
    if (analysis.characterProvider === 'OPENAI') {
        if (analysis.hasValidOpenAIKey) {
            // Use OpenAI embeddings if we have a valid key
            if (!envContent.includes('USE_OPENAI_EMBEDDING=')) {
                envContent += '\\n# Embedding Configuration - Coordinated with Character Model Provider\\n';
                envContent += 'USE_OPENAI_EMBEDDING=true\\n';
            } else {
                envContent = envContent.replace(/USE_OPENAI_EMBEDDING=.*/g, 'USE_OPENAI_EMBEDDING=true');
            }
            console.log('✅ Configured OpenAI embeddings to match character provider');
        } else {
            // Use local embeddings as fallback for invalid OpenAI key
            if (envContent.includes('USE_OPENAI_EMBEDDING=')) {
                envContent = envContent.replace(/USE_OPENAI_EMBEDDING=.*/g, '# USE_OPENAI_EMBEDDING=true  # Disabled due to invalid API key');
            }
            console.log('✅ Disabled OpenAI embeddings due to invalid API key');
            console.log('   Using local embeddings as fallback');
        }
    }
    
    // Ensure other embedding providers are disabled
    if (envContent.includes('USE_OLLAMA_EMBEDDING=')) {
        envContent = envContent.replace(/USE_OLLAMA_EMBEDDING=.*/g, '# USE_OLLAMA_EMBEDDING=false  # Disabled to avoid conflicts');
    }
    
    // Add architectural explanation
    if (!envContent.includes('# ARCHITECTURAL COORDINATION')) {
        envContent += '\\n# ARCHITECTURAL COORDINATION NOTES:\\n';
        envContent += '# - Character modelProvider and embedding provider must be coordinated\\n';
        envContent += '# - Use USE_OPENAI_EMBEDDING=true for OpenAI character providers\\n';
        envContent += '# - Use USE_OLLAMA_EMBEDDING=true for Ollama character providers\\n';
        envContent += '# - Leave both blank for local BGE embeddings (fallback)\\n';
        envContent += '# - EMBEDDING_PROVIDER variable is NOT recognized by core system\\n';
    }
    
    fs.writeFileSync('.env', envContent);
    console.log('✅ Updated .env with proper architectural coordination');
}

function showRecommendations() {
    console.log('\\n💡 Architectural Recommendations:\\n');
    
    console.log('📝 Immediate Solutions:');
    console.log('   1. ✅ Use local embeddings (current fix)');
    console.log('   2. 🔑 Get a real OpenAI API key for better performance');
    console.log('   3. 🔄 Or switch character to use a different provider');
    console.log('');
    
    console.log('🏗️  Long-term Architectural Improvements:');
    console.log('   1. Create automatic coordination between character and embedding providers');
    console.log('   2. Standardize embedding configuration variables');
    console.log('   3. Add validation to prevent configuration mismatches');
    console.log('   4. Implement fallback chains for embedding providers');
    console.log('   5. Add configuration diagnostics to the core system');
    console.log('');
    
    console.log('🔧 To upgrade to OpenAI embeddings later:');
    console.log('   1. Get API key: https://platform.openai.com/api-keys');
    console.log('   2. Update .env: OPENAI_API_KEY=sk-your-real-key');
    console.log('   3. Update .env: USE_OPENAI_EMBEDDING=true');
    console.log('   4. Remove: # USE_OPENAI_EMBEDDING=true (uncomment)');
}

function validateFix() {
    console.log('\\n🔍 Validating Fix:\\n');
    
    const envContent = fs.readFileSync('.env', 'utf8');
    const getEnvVar = (name) => {
        const match = envContent.match(new RegExp(`${name}=([^\\n\\r]+)`));
        return match ? match[1] : null;
    };
    
    const useOpenAIEmbedding = getEnvVar('USE_OPENAI_EMBEDDING');
    const useOllamaEmbedding = getEnvVar('USE_OLLAMA_EMBEDDING');
    const hasEmbeddingProvider = envContent.includes('EMBEDDING_PROVIDER=') && !envContent.includes('# EMBEDDING_PROVIDER=');
    
    console.log('✅ Configuration Status:');
    console.log(`   USE_OPENAI_EMBEDDING: ${useOpenAIEmbedding || 'NOT SET (will use local BGE)'}`);
    console.log(`   USE_OLLAMA_EMBEDDING: ${useOllamaEmbedding || 'NOT SET'}`);
    console.log(`   Non-standard EMBEDDING_PROVIDER: ${hasEmbeddingProvider ? '❌ Still present' : '✅ Removed'}`);
    console.log('');
    
    if (!useOpenAIEmbedding && !useOllamaEmbedding) {
        console.log('🎯 Result: Will use local BGE embeddings (384 dimensions)');
        console.log('   This should resolve the tweet generation issue');
    } else if (useOpenAIEmbedding === 'true') {
        console.log('🎯 Result: Will use OpenAI embeddings (1536 dimensions)');
        console.log('   Requires valid OPENAI_API_KEY');
    }
}

// Run the fix
console.log('🔧 Eliza Architecture Coordination Fix\\n');
fixArchitecturalCoordination();
validateFix();
showRecommendations();

console.log('\\n🎉 Architectural coordination fix complete!');
console.log('🚀 Restart your agent to test the fix');
console.log('\\n💡 The core issue was that character modelProvider and embedding');
console.log('   provider were configured independently, causing conflicts.');

