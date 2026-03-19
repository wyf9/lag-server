<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://trylag.com/lag_logo_trimmed_dark_mode.png">
  <source media="(prefers-color-scheme: light)" srcset="https://trylag.com/lag_logo_trimmed_light_mode.png">
  <img src="https://trylag.com/lag_logo_trimmed_dark_mode.png" alt="Lag" width="200">
</picture>
# Lag Self-Hosted

Run your own Lag voice communication space. Single container, zero external dependencies - PostgreSQL, voice server, API, and web UI all bundled in one image.

## Quick Start

Pick the script that matches your container runtime:

| Runtime | Script |
|---------|--------|
| [Podman](https://podman.io/) | `scripts/podman.sh` |
| [Docker](https://www.docker.com/) | `scripts/docker.sh` |
| [nerdctl](https://github.com/containerd/nerdctl) (containerd) | `scripts/nerdctl.sh` |

All three scripts are identical in usage — just swap the filename. The examples below use `<runtime>` as a placeholder. Replace it with `podman`, `docker`, or `nerdctl`.

### Pull and run

```bash
./scripts/<runtime>.sh up
```

Open `http://localhost:3000` - enter a nickname and start talking.

### Build from source

```bash
git clone https://github.com/trylag/lag.git
cd lag/self-hosting
./scripts/<runtime>.sh build
```

This builds the image locally and starts it.

### Using Compose

```bash
podman compose up -d
# or
docker compose up -d
```

## Script Commands

| Command | Description |
|---------|-------------|
| `up` | Pull image and start container (default if no command given) |
| `down` | Stop and remove container (data volume kept) |
| `restart` | Stop then start |
| `build` | Build image from source and start |
| `logs` | Tail container logs |
| `status` | Show container status and ports |
| `shell` | Open a bash shell inside the container |
| `backup [file]` | Dump PostgreSQL to a SQL file (defaults to `backup-YYYYMMDD-HHMMSS.sql`) |
| `restore <file>` | Restore database from a SQL dump |
| `nuke` | Remove container **and** data volume — destroys all data |

### Examples

```bash
# Start
./scripts/<runtime>.sh up

# Check if it's running
./scripts/<runtime>.sh status

# View logs
./scripts/<runtime>.sh logs

# Back up your database
./scripts/<runtime>.sh backup my-backup.sql

# Restore from backup
./scripts/<runtime>.sh restore my-backup.sql

# Drop into the container
./scripts/<runtime>.sh shell

# Stop without losing data
./scripts/<runtime>.sh down

# Start it back up
./scripts/<runtime>.sh up

# Wipe everything and start fresh
./scripts/<runtime>.sh nuke
./scripts/<runtime>.sh up
```

### Overrides

Override the image or container name with environment variables:

```bash
LAG_IMAGE=lag LAG_NAME=my-lag ./scripts/<runtime>.sh up
```

| Variable | Default | Description |
|----------|---------|-------------|
| `LAG_IMAGE` | `ghcr.io/trylag/lag:latest` | Container image to use |
| `LAG_NAME` | `lag` | Container name |

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 3000 | TCP | Web UI |
| 7880 | TCP | Voice signaling (HTTP) |
| 7881 | TCP | Voice signaling (TCP) |
| 50000-50200 | UDP | Voice media (RTC) |

## Environment Variables

Pass these to configure your instance:

```bash
SESSION_SECRET=your-secret-here \
EXTERNAL_IP=203.0.113.10 \
LAG_VOICE_KEY=mykey \
LAG_VOICE_SECRET=mysecret \
./scripts/<runtime>.sh up
```

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_SECRET` | Auto-generated | Secret for signing session tokens. Set this to persist sessions across container restarts. |
| `EXTERNAL_IP` | Auto-detected | Public IP for voice connections. Set this if auto-detection fails or you're behind NAT. |
| `LAG_VOICE_KEY` | `devkey` | Voice server API key. Change in production. |
| `LAG_VOICE_SECRET` | `secret` | Voice server API secret. Change in production. |

## Data

PostgreSQL data is stored in the `lag_data` volume. Your rooms, messages, and user sessions persist across container restarts.

```bash
# Backup
./scripts/<runtime>.sh backup

# Restore
./scripts/<runtime>.sh restore backup-20260319-143000.sql
```

## Firewall

For voice to work when accessed from other machines, ensure the following ports are open:

- **TCP 3000** - Web UI
- **TCP 7880-7881** - Voice signaling
- **UDP 50000-50200** - Voice media

## Troubleshooting

**Voice not connecting?**
- Set `EXTERNAL_IP` to your server's public IP
- Ensure UDP ports 50000-50200 are open and forwarded
- Check logs: `./scripts/<runtime>.sh logs`

**Container won't start?**
- Check if ports are already in use: `ss -tlnp | grep -E '3000|7880'`
- Check status: `./scripts/<runtime>.sh status`

**Reset everything:**

```bash
./scripts/<runtime>.sh nuke
./scripts/<runtime>.sh up
```
