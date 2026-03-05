## Supabase Kurulum Adımları

1. Supabase projesi oluşturun.
2. SQL Editor'de `supabase/schema.sql` dosyasındaki sorguları çalıştırın.
3. Project Settings > API bölümünden:
   - `Project URL`
   - `anon public key`
   değerlerini alın.
4. Proje kökünde `.env` dosyası oluşturun:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_SUPABASE_STORAGE_BUCKET=villa-photos
```

5. Bağımlılıkları yükleyin:

```bash
npm install
```

6. Uygulamayı başlatın:

```bash
npm run dev
```

## Notlar

- Auth akışı e-posta/şifre ile çalışır.
- Villalar sadece giriş yapan kullanıcının verileri olarak listelenir (RLS policy).
- Fotoğraflar `villa-photos` bucket'ına, kullanıcı ID'si ile başlayan dizin yapısında yüklenir.
