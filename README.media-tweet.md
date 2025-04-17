# Media Tweet Functionality

This document explains how to use the media tweet functionality in the Twitter agent.

## Overview

The Twitter agent can post tweets with media (images) in addition to text-only tweets. It can automatically alternate between text-only and media tweets to create a more engaging Twitter presence.

## Setting Up

1. Add images to the `eliza/media` folder
2. Supported formats: JPG, JPEG, PNG, GIF
3. Configure your Twitter credentials in the `.env` file

## Using Media Tweets

### Automatic Media Tweets

The agent can automatically post media tweets at regular intervals. To enable this:

1. Set `ENABLE_TWITTER_POST_GENERATION=true` in the `.env` file
2. Set `POST_IMMEDIATELY=true` to post a tweet immediately on startup
3. Configure the post interval using `POST_INTERVAL_MIN` and `POST_INTERVAL_MAX`

### Manual Media Tweets

You can manually trigger a media tweet using the `media_tweet` action:

```json
{
  "action": "media_tweet",
  "content": "Check out this image!"
}
```

The agent will automatically select a random image from the media folder.

## Testing Media Tweets

To test the media tweet functionality:

```bash
pnpm test-media-tweet
```

This will post a test media tweet using a random image from the media folder.

## Troubleshooting

If you encounter issues:

1. Run `pnpm check-media-folder` to verify that the media folder contains valid images
2. Check your Twitter credentials in the `.env` file
3. Look for error messages in the logs

For more detailed information, see the [MEDIA_TWEET_TEST.md](./MEDIA_TWEET_TEST.md) file.
