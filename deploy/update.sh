#!/bin/bash
# Pull latest code and restart the service
# Run as: sudo bash /opt/sp-slack/deploy/update.sh
set -e
cd /opt/sp-slack
git pull
npm ci --omit=dev
systemctl restart sp-slack
systemctl status sp-slack --no-pager
echo "Updated and restarted."
