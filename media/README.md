# Media Folder for Twitter Agent

This folder is used to store images for the Twitter agent's media tweets.

## Adding Images

1. Add your images to this folder
2. Supported formats: JPG, JPEG, PNG, GIF
3. The agent will randomly select images from this folder when posting media tweets

## Testing Media Tweets

To test the media tweet functionality, run:

```bash
pnpm test-media-tweet
```

This will post a test media tweet using a random image from this folder.

## Checking Media Folder

To check if the media folder contains valid images, run:

```bash
pnpm check-media-folder
```

This will list all valid images in the folder.
