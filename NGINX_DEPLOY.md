# Nginx + Hetzner Deploy Adımları

## 1. Nginx konfigürasyonunu sunucuya kopyala

```bash
# Bu projeden nginx-default.conf dosyasını sunucuya kopyalayın, örn:
scp nginx-default.conf root@SUNUCU_IP:/tmp/default

# Sunucuda:
sudo cp /tmp/default /etc/nginx/sites-available/default
```

## 2. Nginx test ve yeniden başlat

```bash
sudo nginx -t
sudo systemctl restart nginx
```

## 3. Certbot dosyaları

Eğer `/etc/letsencrypt/options-ssl-nginx.conf` veya `/etc/letsencrypt/ssl-dhparams.pem` yoksa:

```bash
sudo certbot install --nginx -d the-limon.com -d api2.the-limon.com
```

veya mevcut cert için:

```bash
sudo certbot certonly --nginx -d the-limon.com -d api2.the-limon.com
```

Sertifika yolu farklıysa (örn. `the-limon.com` klasörü), nginx config'teki `the-limon.com-0001` kısmını buna göre güncelleyin.

## 4. Docker konteynerlarını yeniden başlat

```bash
cd /path/to/LimonPOS
git pull origin main
docker compose down
docker compose build --no-cache frontend
docker compose up -d
```

Frontend `NEXT_PUBLIC_API_URL=https://api2.the-limon.com/api` ile yeniden build edilecektir.

## 5. Kontrol

- **Frontend:** https://the-limon.com
- **API:** https://api2.the-limon.com/api/health
