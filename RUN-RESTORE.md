# LimonPOS Sunucu Yeniden Kurulum

`docker compose down -v` sonrası veritabanı silindi. Yeniden kurmak için:

## 1. Sunucuya bağlanın

```bash
ssh root@SUNUCU_IP
```

## 2. Projeyi güncelleyin (Git kullanıyorsanız)

```bash
cd ~/LimonPOS
git pull
```

## 3. Restore scriptini çalıştırın

```bash
cd ~/LimonPOS
chmod +x restore.sh
bash restore.sh
```

## Tek satır (kopyala-yapıştır)

```bash
cd ~/LimonPOS && git pull 2>/dev/null; chmod +x restore.sh && bash restore.sh
```

---

**Not:** Sunucudaki `docker-compose.yml` farklı servis adları kullanıyorsa (örn. `limonpos-backend`), `restore.sh` içindeki `api` kelimesini o servis adıyla değiştirin.
