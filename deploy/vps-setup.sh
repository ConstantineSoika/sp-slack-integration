#!/bin/bash
# VPS first-time setup for sp-slack-integration
# Run as: sudo bash vps-setup.sh
set -e

APP_DIR=/opt/sp-slack
DATA_DIR=$APP_DIR/data
SERVICE=sp-slack
GH_REPO="https://github.com/ConstantineSoika/sp-slack-integration.git"

echo "==> Installing Node.js 20 (via NodeSource)..."
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs

echo "==> Node $(node -v) / npm $(npm -v)"

echo "==> Cloning repo to $APP_DIR..."
if [ -d "$APP_DIR" ]; then
  cd $APP_DIR && git pull
else
  git clone $GH_REPO $APP_DIR
fi

echo "==> Installing npm deps..."
cd $APP_DIR
npm ci --omit=dev

echo "==> Creating data dir..."
mkdir -p $DATA_DIR
chown -R $(id -u opc):$(id -g opc) $DATA_DIR

echo "==> Writing .env (if not present)..."
if [ ! -f "$APP_DIR/.env" ]; then
  cp $APP_DIR/.env.example $APP_DIR/.env
  echo ""
  echo "  !! Edit $APP_DIR/.env and fill in your keys, then run:"
  echo "     sudo systemctl restart $SERVICE"
  echo ""
fi

echo "==> Installing systemd service..."
cat > /etc/systemd/system/${SERVICE}.service << 'UNIT'
[Unit]
Description=SP Popups x Slack Integration
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/opt/sp-slack
EnvironmentFile=/opt/sp-slack/.env
ExecStart=/usr/bin/node /opt/sp-slack/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable $SERVICE
systemctl restart $SERVICE

echo "==> Service status:"
systemctl status $SERVICE --no-pager

echo ""
echo "======================================"
echo " SP × Slack is running on port 3000"
echo " Now update Caddy to proxy /slack and"
echo " /webhook to this service (port 3000)"
echo " See deploy/caddy-snippet.txt"
echo "======================================"
