export function isCoachingProfile(profile?: {
  clinic_name?: string | null;
  doctor_name?: string | null;
  specialization?: string | null;
  business_type?: string | null;
  business_category?: string | null;
  email?: string | null;
} | null): boolean {
  if (!profile) return false;
  if (profile.business_type === "coaching") return true;
  
  const text = [
    profile.clinic_name,
    profile.doctor_name,
    profile.specialization,
    profile.business_category,
    profile.email,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /coaching|institute|academy|classes|tuition|education|school|college|vidyapeeth|tutorials|program of achievement|neet|jee|upsc|foundation|learning|faculty|teacher|student/i.test(
    text
  );
}
