// Utility functions for WhatsApp lead scraping
export function generateLeadId(): string {
  return `l-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

export function formatPhoneNumber(phone: string): string | null {
  if (!phone) return null;
  
  // Extract all numeric characters
  const digits = phone.replace(/\D/g, '');
  
  // Handle Indonesian standard phone number formats
  if (digits.startsWith('08')) {
    return '62' + digits.substring(1);
  }
  if (digits.startsWith('8')) {
    return '62' + digits;
  }
  if (digits.startsWith('62')) {
    return digits;
  }
  if (digits.startsWith('+62')) {
    return digits.substring(1);
  }
  
  // Return valid length numbers only (typically 10-14 digits for Indonesia)
  if (digits.length >= 9 && digits.length <= 15) {
    return digits;
  }
  
  return null;
}

export function buildWhatsappLink(phone: string): string | null {
  const formatted = formatPhoneNumber(phone);
  if (!formatted) return null;
  return `https://wa.me/${formatted}?text=Halo%20kak%2C%20apakah%20ini%20dengan%20admin%3F`;
}

export function calculateConfidenceScore(rating: number | null, hasAddress: boolean): number {
  let score = 0.5; // Base confidence
  
  if (rating && rating > 0) {
    score += (rating / 5) * 0.3; // Up to +0.3 for good rating
  }
  
  if (hasAddress) {
    score += 0.2; // +0.2 if full address is present
  }
  
  return Math.min(Math.max(Number(score.toFixed(2)), 0.0), 1.0);
}

// Escapes single quotes for SQL insertion
export function escapeSql(text: string | null | undefined): string {
  if (text === null || text === undefined) return '';
  return String(text).replace(/'/g, "''").replace(/\\/g, '\\\\');
}
