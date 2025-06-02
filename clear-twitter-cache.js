#!/usr/bin/env node

/**
 * Clear Twitter cache to fix authentication issues
 */

import fs from 'fs';
import path from 'path';

const cacheDir = './.cache';
const twitterCachePattern = /twitter/i;

function clearTwitterCache() {
    console.log('🧹 Clearing Twitter cache...');
    
    if (!fs.existsSync(cacheDir)) {
        console.log('✅ No cache directory found - nothing to clear');
        return;
    }
    
    try {
        const files = fs.readdirSync(cacheDir, { recursive: true });
        let cleared = 0;
        
        for (const file of files) {
            if (typeof file === 'string' && twitterCachePattern.test(file)) {
                const filePath = path.join(cacheDir, file);
                try {
                    if (fs.statSync(filePath).isFile()) {
                        fs.unlinkSync(filePath);
                        cleared++;
                        console.log(`🗑️  Removed: ${file}`);
                    }
                } catch (err) {
                    console.warn(`⚠️  Could not remove ${file}:`, err.message);
                }
            }
        }
        
        console.log(`✅ Cleared ${cleared} Twitter cache files`);
        
        // Also clear any cookies files
        const cookiesPattern = /cookies/i;
        for (const file of files) {
            if (typeof file === 'string' && cookiesPattern.test(file)) {
                const filePath = path.join(cacheDir, file);
                try {
                    if (fs.statSync(filePath).isFile()) {
                        fs.unlinkSync(filePath);
                        console.log(`🍪 Removed cookies: ${file}`);
                    }
                } catch (err) {
                    console.warn(`⚠️  Could not remove ${file}:`, err.message);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error clearing cache:', error.message);
    }
}

clearTwitterCache();

