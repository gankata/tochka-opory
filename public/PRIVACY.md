# Приватность · Privacy

Редакция: 12 ноября 2026 г. · Version: November 12, 2026

## Русский

### Коротко

«Точка опоры» по умолчанию работает на вашем компьютере. Разработчик не получает ваши операции, записи настроения, заметки, пароли или резервные копии. Обязательного облака, рекламной аналитики и внешних трекеров нет.

### Какие данные и где хранятся

В локальном каталоге `data/` сохраняются внесённые вами финансовые записи, настройки, цели, записи настроения, заметки, изображения, сведения об активах, импортированные правила и история изменений. Основная база — `data/tochka-opory.db`; автоматические SQLite-копии — в `data/backups/`. В старых базах и архивах также могут оставаться исторические записи функций, удалённых из новых версий интерфейса.

Локальный пароль хранится только как scrypt-хеш с отдельной солью. Сессионные токены сохраняются в виде SHA-256-хешей. Журналы предназначены для диагностики и могут содержать технические сведения: время, маршрут, статус и текст ошибки.

### Что не зашифровано

Обычная SQLite-база, её резервные копии, полный JSON-экспорт и экспортированные CSV/Markdown/PDF не шифруются приложением. Их сможет прочитать человек или программа, получившие доступ к соответствующим файлам. Отдельный зашифрованный экспорт использует AES-256-GCM; его надёжность также зависит от стойкости и сохранности вашего пароля.

Используйте шифрование диска операционной системы: FileVault на macOS, BitLocker/Device Encryption на Windows или аналогичный механизм. Защитите свою учётную запись ОС и не передавайте файлы данных посторонним.

### Телефон и локальная сеть

В режиме «компьютер и телефон» данные передаются между вашими устройствами по HTTP в локальной сети. Это не TLS-шифрование. Используйте только доверенную домашнюю сеть, не открывайте сервер в интернете и не включайте LAN-режим в гостиничных, транспортных, кафе и других публичных сетях.

### Внешние ресурсы и экспорт

Приложение не отправляет разработчику содержимое ваших записей. Однако переход по внешней ссылке или загрузка добавленного вами внешнего изображения раскрывает соответствующему сайту стандартные сетевые данные, например IP-адрес. Такие сайты имеют собственные правила приватности.

Экспортированные файлы покидают управляемое приложением хранилище. Вы самостоятельно решаете, кому и что отправлять. Перед публикацией проверяйте содержимое и метаданные файлов; для резервных копий выбирайте отдельный защищённый носитель.

### Удаление

Остановите приложение и удалите каталог `data/`, а также созданные отдельно экспорты и копии, если хотите удалить локальные записи. Удаление одной копии не удаляет остальные. Для безвозвратного удаления на носителе используйте штатные механизмы ОС; простое перемещение в корзину может быть недостаточным.

Этот документ описывает фактическую модель хранения проекта и не является заявлением о сертификации или автоматическом соответствии GDPR, 152-ФЗ или иному законодательству. Если вы распространяете изменённую версию или собираете данные других людей, вам могут понадобиться собственные правовые документы и меры защиты.

## English

### Summary

Tochka Opory runs on your computer by default. The developer does not receive your transactions, mood entries, notes, passwords, or backups. There is no mandatory cloud, advertising analytics, or external tracking.

### Data and storage

The local `data/` directory contains the financial records, settings, goals, mood entries, notes, images, asset records, import rules, and change history you create. The main database is `data/tochka-opory.db`; automatic SQLite backups are stored in `data/backups/`. Older databases and archives may also contain historical records for features removed from newer interfaces.

The local password is stored only as a salted scrypt hash. Session tokens are stored as SHA-256 hashes. Diagnostic logs may contain technical details such as timestamps, routes, status codes, and error messages.

### What is not encrypted

The regular SQLite database, SQLite backups, full JSON exports, and exported CSV/Markdown/PDF files are not encrypted by the application. Anyone or any software with access to those files may read them. The separate encrypted export uses AES-256-GCM; its protection also depends on the strength and safekeeping of your password.

Use operating-system disk encryption, such as FileVault on macOS or BitLocker/Device Encryption on Windows. Protect your OS account and do not share data files with untrusted people.

### Phone and local network

In “computer and phone” mode, data travels between your devices over local HTTP, not TLS. Use only a trusted home network. Do not expose the server to the internet or enable LAN mode on hotel, transport, café, or other public networks.

### External resources and exports

The application does not send your entries to the developer. Following an external link or loading an external image you added can disclose standard network information, such as your IP address, to that site. External sites have their own privacy policies.

Exported files leave the storage managed by the application. You decide what to share and with whom. Review file contents and metadata before publishing, and keep backups on a separate protected device.

### Deletion

To delete local records, stop the application and remove `data/` together with any separately created exports and backups. Deleting one copy does not remove the others. Use operating-system facilities for secure disposal where required; moving a file to the trash may not be sufficient.

This document describes the project's storage model. It is not a certification or a claim of automatic compliance with the GDPR, Russian Federal Law No. 152-FZ, or any other law. If you distribute a modified version or collect other people's data, you may need your own legal documents and safeguards.
