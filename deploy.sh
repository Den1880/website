#!/bin/bash
cd "/Users/jacklynwarmington/Documents/Claude/Projects/Memberships/den1880-site"

echo "What changed? (press Enter when done):"
read message

if [ -z "$message" ]; then
  echo "❌ Please enter a message describing what changed."
  exit 1
fi

git add .
git commit -m "$message"
git push origin HEAD:main

echo ""
echo "✓ Deployed! Netlify will be live in ~1 minute."
