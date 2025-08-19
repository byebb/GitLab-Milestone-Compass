# GitLab Milestone Advanced Filters

A Chrome extension that adds powerful filtering capabilities to GitLab milestone pages with assignee and label filters.

## Features

- **Assignee Filter**: Click assignees to filter issues by person
- **Multi-Label Filter**: Select multiple labels with AND logic to narrow down issues
- **Label Search**: Search through labels to quickly find specific ones
- **Dynamic Counts**: Real-time issue counts update based on active filters
- **Smart Layout**: Compact, responsive design with flexible width distribution
- **Cross-Filtering**: Combine assignee and label filters for precise issue discovery
- **Toggle Controls**: Independent show/hide for assignee and label modules
- **State Persistence**: Remembers filter preferences and module visibility across sessions

## Installation

### Method 1: Load as Unpacked Extension (Developer Mode)

1. **Download the extension files**:

   - Save all files (`manifest.json`, `content.js`, `styles.css`) to a folder
   - Create icons by opening `create_icons.html` in your browser and downloading the generated icons

2. **Enable Developer Mode in Chrome**:

   - Open Chrome and go to `chrome://extensions/`
   - Toggle "Developer mode" in the top right corner

3. **Load the extension**:
   - Click "Load unpacked"
   - Select the folder containing all the extension files
   - The extension should now appear in your extensions list

### Method 2: Create Icons Manually

If you prefer to create icons manually:

1. Create three PNG files with the following dimensions:

   - `icon16.png` (16x16 pixels)
   - `icon48.png` (48x48 pixels)
   - `icon128.png` (128x128 pixels)

2. Use any graphics editor to create simple icons representing "compass"

## Usage

1. **Navigate to a GitLab milestone page** with issues
2. **Toggle filters** using the "Assignees" and "Labels" buttons next to "Close Milestone"
3. **Filter workflow**:
   - **Assignee**: Click any person to filter their issues
   - **Labels**: Click multiple labels to combine with AND logic
   - **Search**: Type in the label search box to find specific labels quickly
   - **Reset**: Use "Reset Labels" or main filter buttons to clear selections

## Quick Reference

### Assignee Filtering

- Click assignee → Shows only their issues
- Flexible width based on name length
- Dynamic counts update with label selections

### Label Filtering

- **Multi-select**: Click multiple labels for AND filtering
- **Search box**: Type to find labels among many options
- **Smart counts**: Labels show how many issues remain with current filters
- **Auto-hide**: Zero-count labels disappear during filtering

### Combined Filtering

- Select assignee + labels for precise issue discovery
- All counts update dynamically across both modules
- Independent reset controls for each module

## Compatibility

- **GitLab Versions**: Works with GitLab.com and self-hosted GitLab instances
- **Browsers**: Chrome, Chromium-based browsers (Edge, Brave, etc.)
- **URLs Supported**:
  - `*/milestones/*` (GitLab.com and self-hosted)
  - Any GitLab instance with standard milestone URL structure

## Technical Details

- **Manifest Version**: 3 (modern Chrome extension standard)
- **Permissions**: Requires `activeTab` and `storage` permissions
- **Content Script**: Automatically injects into milestone pages
- **CSS**: Styled to match GitLab's design language
- **Local Storage**: Persists filter states and module visibility

## Troubleshooting

### Extension not loading?

1. Ensure you're on a GitLab milestone page with issues
2. Refresh page after installing extension
3. Click "Assignees" or "Labels" toggle buttons to show filters

### Missing data?

- **No assignees**: Milestone needs issues with assigned users
- **No labels**: Issues need to have labels attached
- **Zero counts**: Labels/assignees with no matching issues are auto-hidden

### Performance with many labels?

- Use the label search box to quickly find specific labels
- Labels are optimized with max-width constraints and flexible layout

## Development

Key files:

- **`content.js`**: Main filtering logic, DOM manipulation, event handling
- **`styles.css`**: Dark theme styling, responsive layout, flexbox grids
- **`manifest.json`**: URL patterns, permissions, supported GitLab instances
- **`create_icons.html`**: Tool for generating extension icons

After changes: Reload extension in `chrome://extensions/` → Developer mode → Reload

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Privacy

This extension:

- Only works on GitLab milestone pages
- Does not collect or transmit any data
- Only accesses the current tab when on supported URLs
- All processing happens locally in your browser
- Uses local storage for user preferences only

## License

This extension is provided as-is for educational and productivity purposes.
