# SSH Key ile Deploy

Bu rehber GitHub ve Hetzner deploy için SSH key kullanımını açıklar.

## Gereksinimler

1. **SSH key** – `~/.ssh/id_rsa` veya `~/.ssh/id_ed25519`
2. GitHub’da SSH key kayıtlı olmalı
3. Hetzner sunucuda `~/.ssh/authorized_keys` içinde public key olmalı

---

## 1. SSH Key Oluşturma (yoksa)

```powershell
# Ed25519 (önerilen)
ssh-keygen -t ed25519 -C "your@email.com" -f "$env:USERPROFILE\.ssh\id_ed25519" -N '""'

# Veya RSA
ssh-keygen -t rsa -b 4096 -C "your@email.com" -f "$env:USERPROFILE\.ssh\id_rsa" -N '""'
```

Public key: `~/.ssh/id_ed25519.pub` veya `~/.ssh/id_rsa.pub`

---

## 2. GitHub’a SSH Key Ekleme

1. https://github.com/settings/keys
2. **New SSH key**
3. Public key içeriğini yapıştır (id_ed25519.pub veya id_rsa.pub)
4. **Add SSH key**

Bağlantı kontrolü:
```powershell
ssh -T git@github.com
# "Hi USERNAME! You've successfully authenticated"
```

---

## 3. Hetzner Sunucuya SSH Key Ekleme

```powershell
# Windows: ssh-copy-id genelde yok, manuel yap:
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@77.42.70.162 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

İlk kez bağlanırken `StrictHostKeyChecking=no` veya `yes` ile sunucuyu kabul edin.

Bağlantı kontrolü:
```powershell
ssh root@77.42.70.162 "echo OK"
```

---

## 4. Deploy Script Kullanımı

```powershell
# Tam deploy (commit + GitHub push + Hetzner pull + docker build)
.\deploy-ssh.ps1

# Commit atla (zaten commit yaptıysan)
.\deploy-ssh.ps1 -SkipCommit

# Sadece backend yeniden build
.\deploy-ssh.ps1 -BackendOnly
```

---

## 5. SSH Config (Opsiyonel)

`~/.ssh/config` içine ekleyin:

```
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519

Host hetzner
  HostName 77.42.70.162
  User root
  IdentityFile ~/.ssh/id_ed25519
```

Sonra:
```powershell
ssh hetzner "cd /root/LimonPOS && git pull"
```

---

## Hata Çözümü

| Hata | Çözüm |
|------|-------|
| `Permission denied (publickey)` GitHub | SSH key GitHub hesabına eklenmiş mi kontrol et |
| `Permission denied` Hetzner | `ssh-copy-id root@77.42.70.162` veya manuel `authorized_keys` ekle |
| `Host key verification failed` | `ssh -o StrictHostKeyChecking=accept-new root@77.42.70.162` bir kez çalıştır |
