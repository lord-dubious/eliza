# Testing Media Tweet Functionality

This document explains how to test the media tweet functionality in the Twitter agent.

## Prerequisites

1. Make sure you have images in the `/root/workspace/eliza/media` folder
2. Ensure your Twitter credentials are properly configured in the `.env` file

## Testing Methods

### Method 1: Using the Test Script (Recommended)

The simplest way to test the media tweet functionality is to use the provided test script:

```bash
# Run the test script directly
./test-media-tweet.sh

# Or use the npm script
pnpm test-media-tweet
```

This script will:
1. Import the Twitter client
2. Select a random image from the media folder
3. Post a tweet with the selected image
4. Log the result

### Method 2: Using Environment Variables

You can also test the media tweet functionality by setting the `TEST_MEDIA_TWEET_ON_STARTUP` environment variable to `true` in the `.env` file:

```
# Set to true to post a media tweet on startup for testing
TEST_MEDIA_TWEET_ON_STARTUP=true
```

Then start the agent normally:

```bash
pnpm start
```

### Method 3: Using Command-Line Arguments

You can also use the `--test-media-tweet` command-line argument to test the media tweet functionality:

```bash
pnpm start -- --test-media-tweet
```

## Troubleshooting

If you encounter any issues:

1. Check the logs for error messages
2. Verify that your Twitter credentials are correct
3. Make sure you have images in the media folder
4. Check that the Twitter client is properly initialized

## Media Tweet Implementation

The media tweet functionality is implemented in the `eliza/agent/src/index.ts` file. It uses the global variable `lastTweetWasMedia` to track whether the last tweet contained media, allowing it to alternate between text-only and media tweets.

The `media_tweet` action is registered with the runtime and can be used to post tweets with media. It automatically selects random images from the media folder if no specific image is provided.
