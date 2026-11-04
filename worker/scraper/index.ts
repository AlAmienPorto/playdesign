import type { Env } from '../index';
import { generateLeadId, formatPhoneNumber, buildWhatsappLink, calculateConfidenceScore, escapeSql } from './utils';

// Target cities in Central Java (Jawa Tengah)
export const CITIES = [
  "Semarang", "Surakarta", "Tegal", "Magelang", "Pekalongan", 
  "Klaten", "Boyolali", "Cilacap", "Pati", "Kudus", "Rembang"
];

// Product/Service specific keywords (Tipe C)
export const KEYWORDS = [
  "katering harian", "konveksi kaos", "pengrajin batik", "bengkel motor",
  "pabrik kerupuk", "toko kelontong", "mebel kayu", "percetakan sablon",
  "laundry kiloan", "jasa las", "distributor sembako", "toko pakan ternak"
];

export interface ScrapedLeadInput {
  name: string;
  company: string;
  location: string;
  category: string;
  fullAddress?: string;
  phone: string;
  rating?: number;
  googleMapsUrl?: string;
  sourceUrl?: string;
  sourceType?: 'gmaps' | 'instagram' | 'website';
  instagram?: string;
}

export async function insertScrapedLeads(
  env: Env, 
  leads: ScrapedLeadInput[]
): Promise<{ success: boolean; inserted: number; errors: string[] }> {
  let inserted = 0;
  const errors: string[] = [];

  for (const item of leads) {
    const rawPhone = item.phone || '';
    const formattedPhone = formatPhoneNumber(rawPhone);
    
    // Ignore leads without a valid phone number
    if (!formattedPhone) {
      continue;
    }

    const waLink = buildWhatsappLink(formattedPhone);
    const leadId = generateLeadId();
    const company = escapeSql(item.company || item.name || 'UMKM Lokal');
    const name = escapeSql(item.name || company);
    const location = escapeSql(item.location || 'Semarang, Jawa Tengah');
    const category = escapeSql(item.category || 'UMKM');
    const fullAddress = escapeSql(item.fullAddress || location);
    const rating = item.rating ? Number(item.rating) : 'NULL';
    const mapsUrl = escapeSql(item.googleMapsUrl || '');
    const sourceUrl = escapeSql(item.sourceUrl || item.googleMapsUrl || '');
    const sourceType = escapeSql(item.sourceType || 'gmaps');
    const instagram = item.instagram ? `'${escapeSql(item.instagram)}'` : 'NULL';
    const confidence = calculateConfidenceScore(item.rating ?? null, Boolean(item.fullAddress));

    // Note: status 'new', score estimated based on confidence, source 'gmaps_scraper'
    const sql = `
      INSERT INTO leads (
        id, workspace_id, name, company, company_name, city, role, email, phone, phone_number, location, 
        status, source, score, value, owner_id, last_activity, tags, 
        next_step, notes, category, full_address, rating, whatsapp_verified, 
        whatsapp_link, google_maps_url, confidence_score, source_url, source_type, instagram,
        created_at, updated_at
      ) VALUES (
        '${leadId}', 
        'playdesign', 
        '${name}', 
        '${company}', 
        '${company}', 
        '${location}', 
        'Owner / Pengelola', 
        '${formattedPhone}@wa.leads', 
        '${formattedPhone}', 
        '${formattedPhone}', 
        '${location}', 
        'new', 
        'gmaps_scraper', 
        ${Math.round(confidence * 100)}, 
        5000000, 
        'ja', 
        'Ditemukan otomatis via GMaps Scraper', 
        '["UMKM", "Jawa Tengah", "${category}"]', 
        'Kirim perkenalan WhatsApp', 
        'Lead UMKM Jawa Tengah tanpa website terdaftar. Memiliki nomor kontak WhatsApp aktif.', 
        '${category}', 
        '${fullAddress}', 
        ${rating}, 
        1, 
        '${waLink}', 
        '${mapsUrl}', 
        ${confidence},
        '${sourceUrl}',
        '${sourceType}',
        ${instagram},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;

    try {
      await env.DB.prepare(sql).run();
      inserted++;
    } catch (err: any) {
      // Ignore unique constraint errors gracefully
      if (err.message && err.message.includes('UNIQUE')) {
        continue;
      }
      errors.push(`Error inserting ${item.company}: ${err.message}`);
    }
  }

  return {
    success: errors.length === 0,
    inserted,
    errors
  };
}
