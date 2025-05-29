# Twitter Client Setup Guide

## Overview

This guide will help you set up the Twitter client for your Eliza agent with automated media posting capabilities, including AI-powered image and video understanding for contextual captions.

## Features

✅ **Complete Twitter Integration** - Full Twitter/X client with character-aware tweet generation  
✅ **Automated Media Posting** - Posts images/videos from media folder at configurable intervals  
✅ **AI-Powered Media Analysis** - Uses image and video understanding to generate contextual captions  
✅ **Dual Posting Loops** - Separate intervals for regular tweets and media posts  
✅ **Safety Features** - Dry run mode, error handling, rate limiting, media validation  

## Prerequisites

### Required Dependencies

1. **Core Image Understanding** - Built into Eliza core with `IImageDescriptionService`
2. **Video Understanding Plugin** - Install the official video understanding plugin:
   ```bash
   npm install @elizaos/plugin-node
   ```
   This plugin provides:
   - Video processing and analysis capabilities
   - YouTube video download and transcription
   - Enhanced video content understanding
   - Local video file processing
3. **Vision Model Provider** - Configure one of:
   - OpenAI Vision API (recommended)
   - Google Gemini Vision
   - Local Florence model

### Twitter API Access

You'll need a Twitter Developer account with API v2 access:
1. Apply at [developer.twitter.com](https://developer.twitter.com)
2. Create a new app and get your credentials
3. Ensure you have read/write permissions for posting

## Configuration

### 1. Environment Variables

Copy the example environment file and configure your settings:

```bash
cp agent/.env.example agent/.env
```

### 2. Twitter Credentials

Add your Twitter API credentials to `agent/.env`:

```env
# Twitter API Configuration
TWITTER_USERNAME=your_twitter_username
TWITTER_PASSWORD=your_twitter_password
TWITTER_EMAIL=your_twitter_email

# Alternative: Use API keys (more reliable)
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret
```

### 3. Media Posting Configuration

Configure automated media posting:

```env
# Media Posting Settings
ENABLE_MEDIA_POSTING=true
MEDIA_POST_INTERVAL_MIN=120    # Minimum minutes between media posts
MEDIA_POST_INTERVAL_MAX=240    # Maximum minutes between media posts
MEDIA_FOLDER_PATH=./agent/media  # Path to your media files

# Safety Settings
TWITTER_DRY_RUN=true          # Set to false when ready to go live
```

### 4. Vision Model Configuration

Configure your preferred vision model for image analysis:

```env
# For OpenAI Vision (recommended)
OPENAI_API_KEY=your_openai_api_key

# For Google Gemini Vision
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key

# Character configuration (in your character file)
{
  "imageVisionModelProvider": "openai",  // or "google" 
  // ... other character settings
}
```

## Media Setup

### 1. Create Media Folder

Create a folder for your media files:

```bash
mkdir -p agent/media
```

### 2. Add Media Files

Add your images and videos to the media folder. Supported formats:

**Images:**
- `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`

**Videos:**
- `.mp4`, `.mov`, `.avi`

Example structure:
```
agent/media/
├── sunset.jpg
├── city_timelapse.mp4
├── nature_scene.png
└── funny_moment.gif
```

### 3. Media Analysis Features

The system will automatically:

**For Images:**
- Analyze visual content using AI vision models
- Identify subjects, objects, settings, and mood
- Generate character-appropriate captions
- Detect text and notable details

**For Videos:**
- Analyze filename and metadata
- Generate contextual descriptions
- Create engaging captions matching your character's voice
- Support for various video formats

## Testing

### 1. Dry Run Mode

Always test with dry run mode first:

```env
TWITTER_DRY_RUN=true
```

This will:
- Generate tweets without posting
- Analyze media files
- Show what would be posted in logs
- Validate all configurations

### 2. Run the Agent

Start your agent:

```bash
npm run start
```

Watch the logs for:
- ✅ Twitter client initialization
- 🔍 Media analysis results
- 🧪 Dry run tweet previews
- ⏰ Posting schedule confirmations

### 3. Sample Log Output

```
🐦 Twitter client initialized successfully
📁 Found 5 media files in ./agent/media
🔍 Analyzing image: sunset.jpg
📸 Image analysis: A breathtaking sunset over a calm ocean with vibrant orange and pink hues...
🎨 Generating contextual tweet for: sunset.jpg
✨ Generated contextual tweet: The way light dances across water reminds me why I love these quiet moments...
🧪 DRY RUN - Would post media tweet: "The way light dances..." with media: sunset.jpg
⏰ Next media post scheduled in 156 minutes
```

## Going Live

### 1. Disable Dry Run

When you're satisfied with the testing:

```env
TWITTER_DRY_RUN=false
```

### 2. Monitor Performance

Watch for:
- Successful media uploads
- Tweet posting confirmations
- Rate limit compliance
- Error handling

### 3. Adjust Settings

Fine-tune based on performance:
- Adjust posting intervals
- Update media folder contents
- Modify character traits for better captions

## Advanced Configuration

### Custom Vision Prompts

The system uses sophisticated prompts for media analysis that consider:
- Character personality and voice
- Visual content analysis
- Contextual relevance
- Engagement optimization

### Character Integration

Media captions automatically incorporate:
- Character bio and traits
- Communication style
- Personality adjectives
- Posting preferences

### Error Handling

Robust error handling includes:
- Service availability checks
- Fallback analysis methods
- Rate limit management
- Media validation

## Troubleshooting

### Common Issues

**Media Analysis Fails:**
- Check vision model API keys
- Verify image/video file formats
- Ensure sufficient API quotas

**Twitter Posting Fails:**
- Verify API credentials
- Check rate limits
- Ensure proper permissions

**No Media Files Found:**
- Check media folder path
- Verify file permissions
- Ensure supported formats

### Debug Mode

Enable detailed logging:

```env
DEBUG=eliza:*
```

### Support

For issues:
1. Check logs for specific error messages
2. Verify all environment variables
3. Test with dry run mode first
4. Ensure media files are accessible

## Performance Tips

1. **Optimize Media Files:**
   - Keep images under 5MB
   - Use compressed video formats
   - Organize files by content type

2. **Monitor API Usage:**
   - Track vision API calls
   - Monitor Twitter rate limits
   - Adjust posting frequency as needed

3. **Character Tuning:**
   - Refine character traits for better captions
   - Test different media types
   - Adjust posting intervals based on engagement

The Twitter client with media understanding provides a powerful way to create engaging, contextual social media content that truly reflects your character's personality and perspective!
