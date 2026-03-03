# Limon POS

Android Point of Sale application with offline-first architecture.

## Requirements

- Android Studio Hedgehog (2023.1.1) or newer
- JDK 17
- Min SDK: 24
- Target SDK: 34

## Setup

1. **Generate Gradle Wrapper** (if gradle-wrapper.jar is missing):
   ```bash
   gradle wrapper --gradle-version 8.2
   ```

2. **Open in Android Studio** and sync Gradle

3. **Build & Run**:
   ```bash
   ./gradlew assembleDebug
   # or Run from Android Studio
   ```

## Demo PINs

| PIN  | Role    | Name    |
|------|---------|---------|
| 1234 | Admin   | Admin   |
| 5678 | Manager | Manager |
| 1111 | Waiter  | Ali     |
| 2222 | Cashier | Ayse    |

## Features

- **Login**: PIN-based authentication (4 digits)
- **Floor Plan**: Table management with Main, Terrace, VIP floors
- **Order Screen**: 3-panel layout (Categories, Products, Cart)
- **Payment**: Cash/Card with change calculation
- **Settings**: Printers, Products, Users (admin only)
- **Offline-First**: All data stored locally in Room, syncs when online

## Architecture

- **MVVM** with Jetpack Compose
- **Room** for local SQLite database
- **Retrofit** for API sync
- **Hilt** for dependency injection

## API Base URL

**Production:** https://the-limon.com/api

**Lokal geliştirme:** Uygulama ayarlarından sunucu adresini değiştirebilirsiniz (örn. `http://192.168.x.x:3002/api/`).
