# Docker - Sanallaştırma Etkinleştirme

Docker "Virtualization support not detected" hatası için:

---

## 1. Windows özellikleri (PowerShell Yönetici)

**PowerShell'i Yönetici olarak aç** (Başlat → "PowerShell" → Sağ tık → Yönetici olarak çalıştır):

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All -NoRestart
```

## 2. BIOS'ta Virtualization

- Bilgisayarı yeniden başlat
- BIOS'a gir: **Dell** için genelde **F2** (açılışta)
- **Virtualization** / **Intel VT-x** / **AMD-V** ara, **Enabled** yap
- Kaydet ve çık (F10)

## 3. Bilgisayarı yeniden başlat

## 4. Docker Desktop'ı aç

Yeniden başlattıktan sonra Docker Desktop çalışmalı.
