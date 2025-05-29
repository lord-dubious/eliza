# Twitter Client Setup with Media Posting

This guide will help you set up the Eliza Twitter client with media posting capabilities.

## Prerequisites

1. A Twitter/X account
2. Node.js and pnpm installed
3. Media files for posting (images/videos)

## Setup Steps

### 1. Install Dependencies

```bash
cd agent
pnpm install
```

### 2. Configure Environment Variables

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your Twitter credentials:

```env
# Required Twitter credentials
TWITTER_USERNAME=your_twitter_username
TWITTER_PASSWORD=your_twitter_password
TWITTER_EMAIL=your_twitter_email

# Optional 2FA (recommended for security)
TWITTER_2FA_SECRET=your_2fa_secret

# Enable media posting
ENABLE_MEDIA_POSTING=true
MEDIA_POST_INTERVAL_MIN=120  # 2 hours minimum
MEDIA_POST_INTERVAL_MAX=240  # 4 hours maximum
MEDIA_FOLDER_PATH=./agent/media

# Regular tweet posting
ENABLE_TWITTER_POST_GENERATION=true
POST_INTERVAL_MIN=90   # 1.5 hours minimum
POST_INTERVAL_MAX=180  # 3 hours maximum
```

### 3. Add Media Files

Place your media files in the `agent/media` folder:

```bash
# Supported formats:
# Images: .jpg, .jpeg, .png, .gif, .webp
# Videos: .mp4, .mov, .avi

cp your_images/* agent/media/
cp your_videos/* agent/media/
```

### 4. Test Configuration (Dry Run)

Before posting to Twitter, test your setup:

```bash
# Enable dry run mode
echo "TWITTER_DRY_RUN=true" >> .env

# Run the agent
pnpm start
```

You should see logs like:
```
📸 Starting media posting loop with interval 120-240 minutes
📅 Next media post scheduled in 156 minutes
🧪 DRY RUN - Would post media tweet: "Your generated tweet" with media: image.jpg
```

### 5. Go Live

When you're ready to start posting:

```bash
# Disable dry run mode
sed -i 's/TWITTER_DRY_RUN=true/TWITTER_DRY_RUN=false/' .env

# Start the agent
pnpm start
```

## Features

### Media Posting
- Automatically posts media tweets at random intervals
- Supports images and videos
- Generates contextual captions based on your character
- Configurable posting frequency

### Regular Tweet Generation
- Posts text-only tweets based on your character
- Separate interval configuration from media posts
- Character-aware content generation

### Safety Features
- Dry run mode for testing
- Configurable rate limiting
- Error handling and logging
- Media file validation

## Configuration Options

### Media Posting Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_MEDIA_POSTING` | `true` | Enable/disable media posting |
| `MEDIA_POST_INTERVAL_MIN` | `120` | Minimum minutes between media posts |
| `MEDIA_POST_INTERVAL_MAX` | `240` | Maximum minutes between media posts |
| `MEDIA_FOLDER_PATH` | `./agent/media` | Path to media files |

### Tweet Generation Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_TWITTER_POST_GENERATION` | `true` | Enable/disable regular tweets |
| `POST_INTERVAL_MIN` | `90` | Minimum minutes between regular tweets |
| `POST_INTERVAL_MAX` | `180` | Maximum minutes between regular tweets |
| `MAX_TWEET_LENGTH` | `280` | Maximum tweet length |

### Safety Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `TWITTER_DRY_RUN` | `false` | Test mode - doesn't actually post |
| `TWITTER_RETRY_LIMIT` | `5` | Number of retry attempts |
| `TWITTER_POLL_INTERVAL` | `120` | Polling interval in seconds |

## Troubleshooting

### Common Issues

1. **Login Failures**
   - Verify credentials in `.env`
   - Check 2FA configuration
   - Ensure no rate limiting

2. **No Media Files Found**
   - Check `MEDIA_FOLDER_PATH` setting
   - Verify file formats are supported
   - Ensure files exist in the media folder

3. **Media Posts Not Working**
   - Check `ENABLE_MEDIA_POSTING=true`
   - Verify media folder permissions
   - Check logs for error messages

### Debug Mode

Enable debug logging:

```bash
DEBUG=eliza:* pnpm start
```

### Logs to Monitor

- `📸 Starting media posting loop` - Media posting enabled
- `📅 Next media post scheduled` - Next post timing
- `🎬 Generating media tweet` - Media tweet generation
- `✅ Posted media tweet` - Successful media post
- `🧪 DRY RUN` - Test mode active

## Security Best Practices

1. **Never commit `.env` files**
2. **Use 2FA when possible**
3. **Start with dry run mode**
4. **Monitor API usage**
5. **Keep credentials secure**
6. **Regular backup of media files**

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review debug logs
3. Verify configuration settings
4. Check media file formats and permissions

