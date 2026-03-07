# Railway’e Giriş Yap + Deploy Gönder

Vercel’e deploy gitti ama **Railway’e gitmedi** çünkü Railway’e giriş yapılmamış. Aşağıdakileri **kendi bilgisayarınızda, terminalde** yapın.

---

## 1. Terminal açın

VS Code’da **Terminal → New Terminal** veya Windows’ta **PowerShell** / **CMD** açın.

---

## 2. Railway’e giriş (bir kez)

Şu komutu yazıp Enter’a basın:

```powershell
railway login
```

- Tarayıcı açılacak.
- **GitHub** veya **Email** ile Railway hesabınıza giriş yapın.
- “Successfully logged in” görünce terminale dönün.

---

## 3. Backend’i Railway’e bağlama (ilk kez)

```powershell
cd c:\Users\Dell\LimonPOS\backend
railway link
```

- Listeden **LimonPOS** projesini seçin (ok tuşu + Enter).
- Sonra **Backend** (veya API) servisini seçin.

---

## 4. Deploy gönder

```powershell
railway up
```

Yükleme bitince Railway’de deploy tetiklenir. Birkaç dakika sonra **https://api.the-limon.com/api/health** adresini açıp kontrol edin.

---

## Özet

| Ne yaptık      | Komut           |
|----------------|-----------------|
| Railway giriş  | `railway login` |
| Backend bağla  | `cd backend` → `railway link` |
| Deploy at      | `railway up`    |

Bunları yaptıktan sonra hem Vercel hem Railway’e deploy gitmiş olur.
