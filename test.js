// Test script for client-twitter with our credentials and proxy
const fs = require('fs');
const path = require('path');

// Path to client-twitter
const CLIENT_TWITTER_PATH = '/root/workspace/client-twitter';

// Load proxy from file
function loadProxy() {
  try {
    const proxyContent = fs.readFileSync('proxies.txt', 'utf8');
    const proxyLines = proxyContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    if (proxyLines.length > 0) {
      return proxyLines[0].trim();
    }
    
    console.error('No proxies found in proxies.txt');
    return null;
  } catch (error) {
    console.error(`Error loading proxy: ${error.message}`);
    return null;
  }
}

async function testClientTwitter() {
  console.log('Starting client-twitter test with proxy');
  console.log(`Using client-twitter from: ${CLIENT_TWITTER_PATH}`);
  
  // Check if the directory exists
  if (!fs.existsSync(CLIENT_TWITTER_PATH)) {
    console.error(`Client-twitter directory not found at: ${CLIENT_TWITTER_PATH}`);
    process.exit(1);
  }
  
  // List the directory contents to help debug
  console.log('Directory contents:');
  try {
    const files = fs.readdirSync(CLIENT_TWITTER_PATH);
    files.forEach(file => {
      console.log(`- ${file}`);
    });
  } catch (e) {
    console.error(`Error listing directory: ${e.message}`);
  }
  
  // Try to load the client-twitter module
  let TwitterClient;
  try {
    // First try to load from the dist directory
    const distPath = path.join(CLIENT_TWITTER_PATH, 'dist');
    if (fs.existsSync(distPath)) {
      console.log(`Loading from dist directory: ${distPath}`);
      TwitterClient = require(path.join(distPath, 'index.js'));
    } else {
      // Try to load from the src directory
      const srcPath = path.join(CLIENT_TWITTER_PATH, 'src');
      if (fs.existsSync(srcPath)) {
        console.log(`Loading from src directory: ${srcPath}`);
        TwitterClient = require(path.join(srcPath, 'index.js'));
      } else {
        // Try to load directly from the root
        console.log(`Loading from root directory: ${CLIENT_TWITTER_PATH}`);
        TwitterClient = require(CLIENT_TWITTER_PATH);
      }
    }
    
    console.log('Successfully loaded client-twitter module');
    console.log('TwitterClient:', typeof TwitterClient);
    
    // If TwitterClient is an object with a default export, use that
    if (typeof TwitterClient === 'object' && TwitterClient.default) {
      console.log('Using default export from TwitterClient');
      TwitterClient = TwitterClient.default;
    }
    
    // If TwitterClient is still not a constructor, try to find it
    if (typeof TwitterClient !== 'function') {
      console.log('TwitterClient is not a constructor, looking for it in the module');
      for (const key in TwitterClient) {
        console.log(`- ${key}: ${typeof TwitterClient[key]}`);
        if (typeof TwitterClient[key] === 'function') {
          console.log(`Using ${key} as TwitterClient`);
          TwitterClient = TwitterClient[key];
          break;
        }
      }
    }
    
    if (typeof TwitterClient !== 'function') {
      console.error('Could not find a constructor in the TwitterClient module');
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error loading client-twitter module: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
  
  // Load proxy
  const proxyUrl = loadProxy();
  if (!proxyUrl) {
    console.error('Failed to load proxy');
    process.exit(1);
  }
  
  console.log(`Using proxy: ${proxyUrl}`);
  
  // Parse proxy URL
  // Format: http://username:password@host:port
  let proxyConfig = {};
  
  if (proxyUrl.includes('@')) {
    const [authPart, serverPart] = proxyUrl.split('@');
    const protocol = authPart.split('://')[0];
    const usernamePassword = authPart.split('://')[1];
    const [username, password] = usernamePassword.split(':');
    
    proxyConfig = {
      host: serverPart.split(':')[0],
      port: parseInt(serverPart.split(':')[1], 10),
      protocol: protocol,
      auth: {
        username: username,
        password: password
      }
    };
  } else {
    const urlParts = new URL(proxyUrl);
    proxyConfig = {
      host: urlParts.hostname,
      port: parseInt(urlParts.port, 10),
      protocol: urlParts.protocol.replace(':', '')
    };
  }
  
  console.log('Proxy configuration:', JSON.stringify(proxyConfig, null, 2));
  
  // Add a random delay before connecting (10-30 seconds)
  const waitTime = Math.floor(Math.random() * 20) + 10;
  console.log(`Waiting ${waitTime} seconds before connecting...`);
  await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
  
  try {
    // Create Twitter client with proxy
    const client = new TwitterClient({
      // Authentication credentials
      username: 'BallardLau50299',
      email: 'zdtalazxyn8399@outlook.com',
      password: 'rx3HXSYlFm7',
      totpSecret: 'FCGDMV2AEU4NDMBG',
      
      // Proxy configuration
      proxy: proxyConfig,
      
      // Additional options
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      timeout: 60000, // 60 seconds
      
      // Disable guest token
      useGuestToken: false
    });
    
    console.log('Client created, attempting to authenticate...');
    
    // Authenticate
    await client.login();
    
    console.log('Authentication successful!');
    
    // Get user info
    const userInfo = await client.getUserInfo();
    console.log('User info:', JSON.stringify(userInfo, null, 2));
    
    // Post a test tweet
    const tweetText = `This is a test tweet with client-twitter and proxy. ${Date.now()}`;
    console.log(`Posting tweet: ${tweetText}`);
    
    const tweet = await client.tweet(tweetText);
    console.log('Tweet posted successfully:', JSON.stringify(tweet, null, 2));
    
    console.log('Test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
testClientTwitter().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
