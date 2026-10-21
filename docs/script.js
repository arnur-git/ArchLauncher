const copy = {
  ru: {
    navFeatures:'Возможности',navAbout:'О лаунчере',navSource:'Исходный код',eyebrow:'ЛАУНЧЕР ДЛЯ MINECRAFT JAVA',headline:'Твоя следующая<br><em>история начинается здесь.</em>',heroText:'Удобное место для любимых сборок Minecraft: Java Edition. Выбирай версию, загружай моды и запускай игру.',download:'Скачать для Windows',source:'Исходный код',winNote:'Windows 10/11',featuresKicker:'ВСЁ НУЖНОЕ — В ОДНОМ МЕСТЕ',featuresTitle:'Меньше настроек.<br><em>Больше приключений.</em>',featuresLead:'Сборки, вход и установка Java собраны в понятном лаунчере для Windows.',authTitle:'Твой способ входа',authText:'Microsoft, Ely.by или локальный офлайн-профиль для одиночной игры.',versionsTitle:'Сборки без путаницы',versionsText:'Отдельные игровые папки для Vanilla, Forge, NeoForge, Fabric и Quilt.',modsTitle:'Моды рядом',modsText:'Ищи совместимые дополнения в Modrinth и CurseForge прямо в лаунчере.',javaTitle:'Java устанавливается сама',javaText:'Лаунчер подберёт подходящую Java для выбранной версии игры.',javaReady:'JAVA RUNTIME · ГОТОВА К УСТАНОВКЕ',aboutKicker:'ПРОСТО И ОТКРЫТО',aboutTitle:'Твой лаунчер.<br><em>Твои правила.</em>',aboutText:'ArchLauncher создан для удобного запуска Minecraft Java Edition и управления сборками. Исходный код открыт — загляни внутрь, предложи улучшение или собери свою версию.',githubCta:'Смотреть проект на GitHub',statLoaders:'ЗАГРУЗЧИКОВ',statModSources:'КАТАЛОГА МОДОВ',statPrice:'БЕСПЛАТНО',legalNote:'ArchLauncher не содержит Minecraft. Для входа Microsoft нужна лицензия Minecraft: Java Edition. Офлайн-профиль предназначен для одиночной игры.',footerReleases:'Релизы',latest:'Последний релиз',downloadReady:'Скачать для Windows',downloadLatest:'Скачать последнюю версию'
  },
  en: {
    navFeatures:'Features',navAbout:'About',navSource:'Source code',eyebrow:'A LAUNCHER FOR MINECRAFT JAVA',headline:'Your next<br><em>story starts here.</em>',heroText:'A home for your favorite Minecraft: Java Edition setups. Choose a version, find mods, and jump into the game.',download:'Download for Windows',source:'Source code',winNote:'Windows 10/11',featuresKicker:'EVERYTHING YOU NEED, IN ONE PLACE',featuresTitle:'Less setup.<br><em>More adventure.</em>',featuresLead:'Instances, sign-in, and Java installation in one straightforward Windows launcher.',authTitle:'Sign in your way',authText:'Microsoft, Ely.by, or a local offline profile for single-player.',versionsTitle:'Keep instances organized',versionsText:'Separate game folders for Vanilla, Forge, NeoForge, Fabric, and Quilt.',modsTitle:'Mods within reach',modsText:'Find compatible add-ons from Modrinth and CurseForge in the launcher.',javaTitle:'Java, handled for you',javaText:'The launcher picks the right Java runtime for your Minecraft version.',javaReady:'JAVA RUNTIME · READY WHEN NEEDED',aboutKicker:'SIMPLE AND OPEN',aboutTitle:'Your launcher.<br><em>Your way.</em>',aboutText:'ArchLauncher makes it easy to start Minecraft Java Edition and manage your instances. The source is open—take a look, suggest an improvement, or build your own version.',githubCta:'Explore the project on GitHub',statLoaders:'LOADERS',statModSources:'MOD CATALOGS',statPrice:'FREE',legalNote:'ArchLauncher does not include Minecraft. Microsoft sign-in requires a Minecraft: Java Edition license. Offline profiles are for single-player use.',footerReleases:'Releases',latest:'Latest release',downloadReady:'Download for Windows',downloadLatest:'Download latest release'
  }
};

const languageButton = document.querySelector('#language-toggle');
let latestInstallerAvailable = false;
function setLanguage(language) {
  const selected = copy[language] ? language : 'ru';
  document.documentElement.lang = selected;
  document.querySelectorAll('[data-i18n]').forEach(node => {
    const value = copy[selected][node.dataset.i18n];
    if (value) node.innerHTML = value;
  });
  languageButton.textContent = selected === 'ru' ? 'EN' : 'RU';
  if (latestInstallerAvailable) document.querySelector('#download-link [data-i18n="download"]').textContent = copy[selected].downloadLatest;
  localStorage.setItem('archlauncher-language', selected);
}
languageButton.addEventListener('click', () => setLanguage(document.documentElement.lang === 'ru' ? 'en' : 'ru'));
setLanguage(localStorage.getItem('archlauncher-language') || 'ru');

async function loadLatestRelease() {
  try {
    const response = await fetch('https://api.github.com/repos/arnur-git/ArchLauncher/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) return;
    const release = await response.json();
    const installer = release.assets?.find(asset => asset.name.toLowerCase().endsWith('.exe'));
    if (!installer) return;
    latestInstallerAvailable = true;
    document.querySelector('#download-link').href = installer.browser_download_url;
    document.querySelector('#download-link').setAttribute('download', installer.name);
    document.querySelector('#release-version').textContent = release.tag_name;
    document.querySelector('#preview-version').textContent = `Java Edition · ${release.tag_name}`;
    document.querySelector('#download-link [data-i18n="download"]').textContent = copy[document.documentElement.lang].downloadLatest;
  } catch { /* The Releases link remains available if the API cannot be reached. */ }
}
loadLatestRelease();
