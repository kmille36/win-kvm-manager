## Packages
recharts | Visualization for host statistics (CPU, RAM, Disk usage)
framer-motion | Smooth layout transitions and entry animations
date-fns | Formatting timestamps and uptime durations
clsx | Utility for constructing className strings conditionally
tailwind-merge | Utility for merging Tailwind classes safely

## Notes
Host stats endpoint is read-only at /api/stats/host
VM console uses an iframe pointing to the VM's web_port (default 8006)
Status badges map to: running (green), stopped (gray), installing (blue), error (red)
