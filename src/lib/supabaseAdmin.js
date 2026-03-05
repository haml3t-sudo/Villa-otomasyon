import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

/**
 * Service-role client — RLS'yi bypass eder.
 * Sadece yönetici tarafından kullanıcı oluşturma işlemleri için kullanılır.
 *
 * ⚠️  GÜVENLİK NOTU (bilinen tradeoff):
 *  VITE_ prefix'li env değişkenleri Vite tarafından frontend bundle'a dahil edilir.
 *  Bu anahtarı tarayıcı DevTools → Network/Sources ile görmek teorik olarak mümkündür.
 *  Bu mimari seçim bilinçli olarak yapılmıştır (küçük, dahili ekip uygulaması).
 *
 *  Daha yüksek güvenlik için:
 *  → Kullanıcı oluşturma işlemini bir Supabase Edge Function'a taşıyın ve
 *    service_role anahtarını yalnızca sunucu ortam değişkeni olarak saklayın.
 *
 *  Bu istemciyi hiçbir zaman genel/anonim kullanıcılara açık bir işlemde kullanmayın.
 */
export const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;
