# ArchLauncher

[English](README.md) | [Русский](README.ru.md)

Лаунчер Minecraft: Java Edition для Windows на Electron и Node.js.

## Скачать

Последний установщик Windows находится на странице [GitHub Releases](https://github.com/arnur-git/ArchLauncher/releases/latest).

## Возможности

- Вход Microsoft для аккаунтов с лицензией Minecraft: Java Edition.
- Вход Ely.by по логину или почте, паролю и, если включена, двухфакторной проверке.
- Офлайн-профиль для локальной одиночной игры.
- Отдельные сборки Vanilla, Forge, NeoForge, Fabric и Quilt.
- Установка Java 25 (Temurin) прямо из лаунчера.
- Поиск и установка модов с Modrinth и CurseForge. Для CurseForge нужен API-ключ.
- Раздельные игровые файлы и настройки сборок, консоль запуска.

## Сборка из исходников

Требуется Node.js 20 или новее.

```powershell
npm install
npm start
```

Сборка установщика Windows:

```powershell
npm run dist
```

## Данные и аккаунты

Настройки лаунчера и игровые сборки хранятся локально в `%APPDATA%\ArchLauncher`.

Лаунчер не сохраняет пароль Ely.by. Токены авторизации хранятся с помощью защищённого хранилища Windows. Офлайн-профиль предназначен для локальной игры и не проходит авторизацию Microsoft. Для входа Microsoft нужна лицензия Minecraft: Java Edition.

ArchLauncher не содержит Minecraft. Используй легально полученную копию игры и соблюдай условия Minecraft и выбранных модлоадеров.

## Устранение сбоев

Если Windows сообщает `0xC0000005`, а лог указывает на Intel Iris Xe/OpenGL, обнови видеодрайвер со [страницы загрузки Intel](https://www.intel.com/content/www/us/en/download/726609/intel-arc-iris-xe-graphics-whql-windows.html), перезагрузи Windows и попробуй снова. Лаунчер покажет эту подсказку при обнаружении такого кода завершения.

## Авторы

- [Arnur](https://github.com/arnur-git) и Codex — авторы
