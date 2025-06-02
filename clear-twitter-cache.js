#!/usr/bin/env node

/**
 * Clear Twitter Cache Tool
 * This script clears all Twitter-related cache files
 */

const fs = require('fs');
const path = require('path');

function clearTwitterCache() {
    console.log('🧹 Clearing Twitter cache...\n');
    
    const cacheDir = '.data';
    let totalCleared = 0;
    
    if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        const twitterFiles = files.filter(f => 
            f.includes('twitter') || 
            f.includes('Twitter') ||
            f.includes('cookies') ||
            f.includes('timeline')
        );
        
        if (twitterFiles.length > 0) {
            console.log(`📁 Found ${twitterFiles.length} cache files to clear:`);
            
            twitterFiles.forEach(file => {
                const filePath = path.join(cacheDir, file);
                try {
                    fs.unlinkSync(filePath);
                    console.log(`  ✅ Deleted: ${file}`);
                    totalCleared++;
                } catch (error) {
                    console.log(`  ❌ Failed to delete: ${file} (${error.message})`);
                }
            });
            
            console.log(`\n🎉 Successfully cleared ${totalCleared} cache files`);
        } else {
            console.log('📂 No Twitter cache files found');
        }
    } else {
        console.log('📂 No cache directory found (.data)');
    }
    
    // Also clear any node_modules cache that might be problematic
    const nodeModulesCache = 'node_modules/.cache';
    if (fs.existsSync(nodeModulesCache)) {
        console.log('\n🔄 Clearing node_modules cache...');
        try {
            fs.rmSync(nodeModulesCache, { recursive: true, force: true });
            console.log('✅ Node modules cache cleared');
        } catch (error) {
            console.log(`❌ Failed to clear node_modules cache: ${error.message}`);
        }
    }
    
    console.log('\n✨ Cache clearing complete!');
    console.log('💡 You can now restart the agent with fresh cache');
}

clearTwitterCache();

