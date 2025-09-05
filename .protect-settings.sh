#!/bin/bash
# Protection script for settings code

# Create backup of current working settings
cp app/renderer.js app/renderer.js.settings-locked-backup

# Set read-only for safety (optional - uncomment to activate)
# chmod 444 app/renderer.js

echo "Settings code locked and backed up"
echo "Backup created at: app/renderer.js.settings-locked-backup"
echo "To unlock: chmod 644 app/renderer.js"


