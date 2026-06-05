#!/bin/bash
cd "/Users/jacklynwarmington/Documents/Claude/Projects/Memberships/den1880-site"

echo "What changed? (press Enter when done):"
read message

git add .
git commit -m "$message"
git push

echo ""
echo "✓ Deployed! Netlify will be live in ~1 minute."
