# ArchLauncher

[English](README.md) | [Русский](README.ru.md)

A Minecraft: Java Edition launcher for Windows, built with Electron and Node.js.

## Download

Download the latest Windows installer from [GitHub Releases](https://github.com/arnur-git/ArchLauncher/releases/latest).

## Features

- Microsoft sign-in for accounts that own Minecraft: Java Edition.
- Ely.by sign-in with username or email, password, and optional two-factor code.
- Offline profiles for local single-player worlds.
- Separate Vanilla, Forge, NeoForge, Fabric, and Quilt instances.
- Java 25 (Temurin) installation from the launcher.
- Mod search and installation from Modrinth and CurseForge. CurseForge requires an API key.
- Per-instance game files, settings, and launch console.

## Build from source

Requires Node.js 20 or newer.

```powershell
npm install
npm start
```

Build the Windows installer:

```powershell
npm run dist
```

## Data and accounts

Launcher settings and game instances are stored locally in `%APPDATA%\ArchLauncher`.

The launcher does not save the Ely.by password. Authentication tokens are stored using Windows protected storage. Offline profiles are intended for local play and do not authenticate with Microsoft services. Microsoft sign-in requires a valid Minecraft: Java Edition license.

ArchLauncher does not include Minecraft. You must provide a legally obtained game account and follow the terms of Minecraft and the selected mod loaders.

## Authors

- [Arnur](https://github.com/arnur-git) and Codex — authors
