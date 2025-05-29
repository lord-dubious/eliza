# Media Folder

This folder contains media files that the Twitter agent will use for posting.

## Supported Formats

- **Images**: .jpg, .jpeg, .png, .gif, .webp
- **Videos**: .mp4, .mov, .avi (up to 512MB)

## Usage

The Twitter agent will automatically select random media files from this folder to include in tweets at set intervals.

## Configuration

Media posting is controlled by the following environment variables:

- `ENABLE_MEDIA_POSTING`: Enable/disable media posting (default: true)
- `MEDIA_POST_INTERVAL_MIN`: Minimum interval between media posts in minutes (default: 120)
- `MEDIA_POST_INTERVAL_MAX`: Maximum interval between media posts in minutes (default: 240)
- `MEDIA_FOLDER_PATH`: Path to media folder (default: ./agent/media)

## File Organization

You can organize files in subfolders if needed. The agent will recursively search for media files.

